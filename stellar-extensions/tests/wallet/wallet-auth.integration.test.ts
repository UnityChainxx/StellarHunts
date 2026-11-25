/**
 * Integration tests for Stellar wallet signature authentication (#976).
 *
 * The suite wires the real backend wallet services (`WalletService` and
 * `WalletAuthService`) together with in-memory repositories and real ed25519
 * keypairs, so the challenge/signature/session flow is exercised end to end
 * without a database, a Nest application, or a live Stellar network.
 *
 * Covered:
 *   - challenge generation and validation
 *   - signature verification (valid and invalid)
 *   - replay attack prevention (single-use nonces)
 *   - session token creation, expiry and activity refresh
 *   - wallet disconnection (session and wallet-wide revocation)
 */

import "reflect-metadata";

import {
  generateKeyPairSync,
  randomUUID,
  sign as signEd25519,
} from "crypto";

import {
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";

// These Nest packages are ESM-only in this dependency set. The services only
// use their decorator/type surface, so they are stubbed for the test run.
jest.mock("@nestjs/typeorm", () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock("@nestjs/schedule", () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_3AM: "0 3 * * *" },
}));
jest.mock("@nestjs/jwt", () => ({ JwtService: class JwtService {} }));
jest.mock("@nestjs/config", () => ({ ConfigService: class ConfigService {} }));

import jwt from "jsonwebtoken";

import { encodeAccountAddress } from "../../../backend/src/wallet/stellar-account";
import {
  WALLET_TOKEN_TYPE,
  WalletAuthService,
} from "../../../backend/src/wallet/wallet-auth.service";
import { WalletService } from "../../../backend/src/wallet/wallet.service";

const JWT_SECRET = "stellar-extensions-wallet-test-secret";
const DOMAIN = "stellar-hunts.app";
const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60;

type Row = Record<string, any>;

/* -------------------------------------------------------------------------- */
/* In-memory TypeORM replacements                                             */
/* -------------------------------------------------------------------------- */

/**
 * Matches a row against the subset of TypeORM `FindOptionsWhere` used by the
 * wallet services: plain equality plus `IsNull`/`LessThan` operators.
 */
function matchesWhere(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, expected]) => {
    if (expected && typeof expected === "object" && "type" in expected) {
      if (expected.type === "isNull") {
        return row[field] === null || row[field] === undefined;
      }
      if (expected.type === "lessThan") {
        return (
          new Date(row[field]).getTime() < new Date(expected.value).getTime()
        );
      }
    }
    return row[field] === expected;
  });
}

class InMemorySessionRepository {
  rows: Row[] = [];

  create(data: Partial<Row>): Row {
    return {
      id: randomUUID(),
      userId: null,
      revokedAt: null,
      lastSeenAt: null,
      createdAt: new Date(),
      ...data,
    };
  }

  async save(entity: Row): Promise<Row> {
    const stored = { ...entity };
    if (!stored.id) stored.id = randomUUID();
    const index = this.rows.findIndex((row) => row.id === stored.id);
    if (index === -1) this.rows.push(stored);
    else this.rows[index] = stored;
    return { ...stored };
  }

  async findOne(options: { where?: Row } = {}): Promise<Row | null> {
    const row = this.rows.find((candidate) =>
      matchesWhere(candidate, options.where),
    );
    return row ? { ...row } : null;
  }

  async update(criteria: string | Row, patch: Partial<Row>) {
    const rows =
      typeof criteria === "string"
        ? this.rows.filter((row) => row.id === criteria)
        : this.rows.filter((row) => matchesWhere(row, criteria));

    for (const row of rows) Object.assign(row, patch);
    return { affected: rows.length };
  }

  createQueryBuilder() {
    const repository = this;
    let cutoff: Date = new Date(0);

    const builder = {
      delete() {
        return builder;
      },
      where(sql: string, parameters: { cutoff: Date }) {
        if (sql !== '"expiresAt" < :cutoff') {
          throw new Error(`Unsupported delete condition: ${sql}`);
        }
        cutoff = parameters.cutoff;
        return builder;
      },
      async execute() {
        const before = repository.rows.length;
        repository.rows = repository.rows.filter(
          (row) => new Date(row.expiresAt).getTime() >= cutoff.getTime(),
        );
        return { affected: before - repository.rows.length };
      },
    };

    return builder;
  }
}

class InMemoryChallengeRepository {
  rows: Row[] = [];

  create(data: Partial<Row>): Row {
    return {
      id: randomUUID(),
      consumedAt: null,
      createdAt: new Date(),
      ...data,
    };
  }

  async save(entity: Row): Promise<Row> {
    const stored = { ...entity };
    if (!stored.id) stored.id = randomUUID();
    const index = this.rows.findIndex((row) => row.id === stored.id);
    if (index === -1) this.rows.push(stored);
    else this.rows[index] = stored;
    return { ...stored };
  }

  async findOne(options: { where?: Row } = {}): Promise<Row | null> {
    const row = this.rows.find((candidate) =>
      matchesWhere(candidate, options.where),
    );
    return row ? { ...row } : null;
  }

  async update(criteria: Row, patch: Partial<Row>) {
    const rows = this.rows.filter((row) => matchesWhere(row, criteria));
    for (const row of rows) Object.assign(row, patch);
    return { affected: rows.length };
  }

  async delete(criteria: Row = {}) {
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (row) => !matchesWhere(row, criteria),
    );
    return { affected: before - this.rows.length };
  }
}

class InMemoryWalletRepository {
  rows: Row[] = [];

  create(data: Partial<Row>): Row {
    return { id: randomUUID(), createdAt: new Date(), ...data };
  }

  async save(entity: Row): Promise<Row> {
    const stored = { ...entity };
    if (!stored.id) stored.id = randomUUID();
    this.rows.push(stored);
    return { ...stored };
  }

  async findOne(options: { where?: Row } = {}): Promise<Row | null> {
    const row = this.rows.find((candidate) =>
      matchesWhere(candidate, options.where),
    );
    return row ? { ...row } : null;
  }
}

class InMemoryUserRepository {
  rows: Row[] = [];

  async findOne(options: { where?: Row } = {}): Promise<Row | null> {
    const row = this.rows.find((candidate) =>
      matchesWhere(candidate, options.where),
    );
    return row ? { ...row } : null;
  }

  async save(user: Row): Promise<Row> {
    const index = this.rows.findIndex((row) => row.id === user.id);
    if (index === -1) this.rows.push({ ...user });
    else this.rows[index] = { ...user };
    return { ...user };
  }
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function createKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPublicKey = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32);

  return {
    address: encodeAccountAddress(rawPublicKey),
    sign: (message: string) =>
      signEd25519(null, Buffer.from(message, "utf8"), privateKey).toString(
        "base64",
      ),
  };
}

type Stack = ReturnType<typeof createStack>;

function createStack() {
  const challengeRepository = new InMemoryChallengeRepository();
  const sessionRepository = new InMemorySessionRepository();
  const walletRepository = new InMemoryWalletRepository();
  const userRepository = new InMemoryUserRepository();

  const configValues: Record<string, string | undefined> = {
    WALLET_AUTH_DOMAIN: DOMAIN,
    WALLET_CHALLENGE_TTL_SECONDS: "300",
    WALLET_SESSION_EXPIRES_IN: "24h",
  };
  const configService = {
    get: (key: string) => configValues[key],
  };

  const jwtService = {
    sign: jest.fn((payload: Row, options: Row = {}) =>
      jwt.sign(payload, JWT_SECRET, { algorithm: "HS256", ...options }),
    ),
    verifyAsync: jest.fn(
      async (token: string) => jwt.verify(token, JWT_SECRET) as Row,
    ),
  };

  const authService = new WalletAuthService(
    sessionRepository as any,
    jwtService as any,
    configService as any,
  );
  const walletService = new WalletService(
    challengeRepository as any,
    walletRepository as any,
    userRepository as any,
    authService,
    configService as any,
  );

  return {
    challengeRepository,
    sessionRepository,
    walletRepository,
    userRepository,
    configValues,
    configService,
    jwtService,
    authService,
    walletService,
  };
}

const decodeToken = (token: string) => jwt.decode(token) as Row;

describe("wallet authentication", () => {
  let keypair: ReturnType<typeof createKeypair>;
  let WALLET: string;
  let OTHER_WALLET: string;
  let stack: Stack;

  const createChallenge = (ttlSeconds?: number) =>
    stack.walletService.createChallenge(WALLET, ttlSeconds);

  beforeEach(() => {
    keypair = createKeypair();
    WALLET = keypair.address;
    OTHER_WALLET = createKeypair().address;
    stack = createStack();
  });

  /* ---------------------------------------------------------------------- */
  /* Challenge generation and validation                                    */
  /* ---------------------------------------------------------------------- */

  describe("challenge generation and validation", () => {
    it("issues a challenge bound to the wallet, domain and expiry", async () => {
      const challenge = await createChallenge();

      expect(challenge.nonce).toMatch(/^[a-f0-9]{64}$/);
      expect(challenge.domain).toBe(DOMAIN);
      expect(challenge.message).toBe(
        [
          "stellar-hunts: authenticate",
          `wallet=${WALLET}`,
          `nonce=${challenge.nonce}`,
          `domain=${DOMAIN}`,
          `expires=${challenge.expiresAt.toISOString()}`,
        ].join("\n"),
      );
      expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(stack.challengeRepository.rows).toHaveLength(1);
      expect(stack.challengeRepository.rows[0]).toMatchObject({
        walletAddress: WALLET,
        nonce: challenge.nonce,
        domain: DOMAIN,
        consumedAt: null,
      });
    });

    it("never reuses a nonce between challenges", async () => {
      const first = await createChallenge();
      const second = await createChallenge();

      expect(first.nonce).not.toBe(second.nonce);
      expect(stack.challengeRepository.rows).toHaveLength(2);
    });

    it.each([
      ["an Ethereum-style address", "0x1234567890abcdef"],
      ["a muxed address", "MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB2M6Q"],
      ["a contract address", "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4"],
      ["a corrupted account address", `${"G"}${"A".repeat(55)}`],
    ])("rejects %s", async (_label, address) => {
      await expect(
        stack.walletService.createChallenge(address),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stack.challengeRepository.rows).toHaveLength(0);
    });

    it("uses the configured default lifetime", async () => {
      const challenge = await createChallenge();
      const ttlSeconds = Math.round(
        (challenge.expiresAt.getTime() - Date.now()) / 1000,
      );

      expect(ttlSeconds).toBeGreaterThanOrEqual(298);
      expect(ttlSeconds).toBeLessThanOrEqual(300);
    });

    it("clamps the requested lifetime to 30-900 seconds", async () => {
      const short = await createChallenge(1);
      const long = await createChallenge(99_999);

      expect(
        Math.round((short.expiresAt.getTime() - Date.now()) / 1000),
      ).toBeGreaterThanOrEqual(29);
      expect(
        Math.round((long.expiresAt.getTime() - Date.now()) / 1000),
      ).toBeLessThanOrEqual(900);
    });

    it("falls back to the default domain when it is not configured", async () => {
      delete stack.configValues.WALLET_AUTH_DOMAIN;

      const challenge = await createChallenge();

      expect(challenge.domain).toBe("stellar-hunts.app");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Signature verification                                                 */
  /* ---------------------------------------------------------------------- */

  describe("signature verification", () => {
    async function storedChallenge() {
      const challenge = await createChallenge();
      return {
        challenge,
        stored: stack.challengeRepository.rows[0],
      };
    }

    it("accepts a correctly signed challenge and consumes it", async () => {
      const { challenge } = await storedChallenge();

      const verified = await stack.walletService.verifySignature(
        WALLET,
        challenge.nonce,
        keypair.sign(challenge.message),
      );

      expect(verified.walletAddress).toBe(WALLET);
      expect(stack.challengeRepository.rows[0].consumedAt).toBeInstanceOf(Date);
      expect(stack.walletRepository.rows).toEqual([
        expect.objectContaining({ address: WALLET }),
      ]);
    });

    it("does not duplicate the wallet registry entry on repeated logins", async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { challenge } = await storedChallenge();
        await stack.walletService.verifySignature(
          WALLET,
          challenge.nonce,
          keypair.sign(challenge.message),
        );
      }

      expect(stack.walletRepository.rows).toHaveLength(1);
    });

    it("rejects a signature produced by a different key", async () => {
      const { challenge, stored } = await storedChallenge();

      await expect(
        stack.walletService.verifySignature(
          WALLET,
          challenge.nonce,
          createKeypair().sign(challenge.message),
        ),
      ).rejects.toThrow("Invalid wallet signature");
      expect(stored.consumedAt).toBeNull();
    });

    it("rejects a signature over a different message", async () => {
      const { challenge, stored } = await storedChallenge();

      await expect(
        stack.walletService.verifySignature(
          WALLET,
          challenge.nonce,
          keypair.sign(`${challenge.message}\ntampered=true`),
        ),
      ).rejects.toThrow("Invalid wallet signature");
      expect(stored.consumedAt).toBeNull();
    });

    it("rejects a malformed signature without consuming the nonce", async () => {
      const { challenge, stored } = await storedChallenge();

      await expect(
        stack.walletService.verifySignature(
          WALLET,
          challenge.nonce,
          "not-a-valid-base64-signature",
        ),
      ).rejects.toThrow("Invalid wallet signature");
      expect(stored.consumedAt).toBeNull();
    });

    it("rejects an unknown nonce", async () => {
      await expect(
        stack.walletService.verifySignature(
          WALLET,
          "f".repeat(64),
          keypair.sign("anything"),
        ),
      ).rejects.toThrow("Unknown wallet challenge");
    });

    it("rejects a challenge issued for a different wallet", async () => {
      const { challenge } = await storedChallenge();

      await expect(
        stack.walletService.verifySignature(
          OTHER_WALLET,
          challenge.nonce,
          keypair.sign(challenge.message),
        ),
      ).rejects.toThrow("Unknown wallet challenge");
    });

    it("rejects an expired challenge even with a valid signature", async () => {
      const { challenge, stored } = await storedChallenge();
      stored.expiresAt = new Date(Date.now() - 1_000);

      await expect(
        stack.walletService.verifySignature(
          WALLET,
          challenge.nonce,
          keypair.sign(challenge.message),
        ),
      ).rejects.toThrow("Challenge has expired");
    });

    it("rejects a challenge bound to an unexpected domain", async () => {
      const { challenge, stored } = await storedChallenge();
      stored.domain = "evil.example.com";

      await expect(
        stack.walletService.verifySignature(
          WALLET,
          challenge.nonce,
          keypair.sign(challenge.message),
        ),
      ).rejects.toThrow("unexpected domain");
    });

    it("records the wallet even if the registry write fails", async () => {
      const { challenge } = await storedChallenge();
      jest
        .spyOn(stack.walletRepository, "save")
        .mockRejectedValueOnce(new Error("registry unavailable"));

      await expect(
        stack.walletService.verifySignature(
          WALLET,
          challenge.nonce,
          keypair.sign(challenge.message),
        ),
      ).resolves.toMatchObject({ walletAddress: WALLET });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Replay attack prevention                                               */
  /* ---------------------------------------------------------------------- */

  describe("replay attack prevention", () => {
    it("rejects a nonce that was already consumed", async () => {
      const challenge = await createChallenge();
      const signature = keypair.sign(challenge.message);

      await stack.walletService.verifySignature(
        WALLET,
        challenge.nonce,
        signature,
      );

      await expect(
        stack.walletService.verifySignature(
          WALLET,
          challenge.nonce,
          signature,
        ),
      ).rejects.toThrow("Challenge already used");
    });

    it("fails when a concurrent request consumes the nonce first", async () => {
      const challenge = await createChallenge();
      // Simulate the compare-and-set losing the race: the row was still
      // unconsumed when it was read, but the conditional UPDATE matched none.
      jest
        .spyOn(stack.challengeRepository, "update")
        .mockResolvedValueOnce({ affected: 0 });

      await expect(
        stack.walletService.verifySignature(
          WALLET,
          challenge.nonce,
          keypair.sign(challenge.message),
        ),
      ).rejects.toThrow("Challenge already used");
      expect(stack.walletRepository.rows).toHaveLength(0);
    });

    it("leaves fresh sessions usable after a replayed attempt is rejected", async () => {
      const replayed = await createChallenge();
      const signature = keypair.sign(replayed.message);
      await stack.walletService.verifySignature(
        WALLET,
        replayed.nonce,
        signature,
      );
      await expect(
        stack.walletService.verifySignature(
          WALLET,
          replayed.nonce,
          signature,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const session = await stack.walletService.issueWalletSession(WALLET);

      await expect(
        stack.authService.validateSession(session.accessToken),
      ).resolves.toMatchObject({ walletAddress: WALLET });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Session management                                                     */
  /* ---------------------------------------------------------------------- */

  describe("session token creation", () => {
    it("issues a wallet-session token and persists the matching record", async () => {
      const issued = await stack.walletService.issueWalletSession(WALLET);
      const payload = decodeToken(issued.accessToken);

      expect(issued.expiresIn).toBe(DEFAULT_SESSION_TTL_SECONDS);
      expect(payload).toMatchObject({
        sub: WALLET,
        sid: issued.session.id,
        jti: issued.session.jti,
        type: WALLET_TOKEN_TYPE,
      });
      expect(payload.exp - payload.iat).toBe(DEFAULT_SESSION_TTL_SECONDS);
      expect(payload.uid).toBeUndefined();

      expect(issued.session).toMatchObject({
        walletAddress: WALLET,
        userId: null,
        revokedAt: null,
      });
      expect(issued.session.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(stack.sessionRepository.rows).toHaveLength(1);
    });

    it("carries the linked account id when the wallet belongs to a user", async () => {
      const issued = await stack.authService.issueSession(WALLET, "user-42");
      const payload = decodeToken(issued.accessToken);

      expect(payload.uid).toBe("user-42");
      expect(issued.session.userId).toBe("user-42");
    });

    it("validates an active session and refreshes lastSeenAt", async () => {
      const issued = await stack.authService.issueSession(WALLET, "user-42");
      const before = stack.sessionRepository.rows[0].lastSeenAt;

      const context = await stack.authService.validateSession(
        issued.accessToken,
      );

      expect(context.walletAddress).toBe(WALLET);
      expect(context.userId).toBe("user-42");
      expect(context.session.id).toBe(issued.session.id);
      expect(before).toBeNull();
      expect(stack.sessionRepository.rows[0].lastSeenAt).toBeInstanceOf(Date);
    });
  });

  describe("session expiry and refresh", () => {
    it("honours the configured session lifetime", () => {
      stack.configValues.WALLET_SESSION_EXPIRES_IN = "15m";

      expect(stack.authService.getSessionTtlSeconds()).toBe(15 * 60);
    });

    it.each([
      ["a numeric value", "3600", 3600],
      ["an invalid value", "not-a-duration", DEFAULT_SESSION_TTL_SECONDS],
      ["an unset value", undefined, DEFAULT_SESSION_TTL_SECONDS],
    ])("parses %s", (_label, value, expected) => {
      if (value === undefined) delete stack.configValues.WALLET_SESSION_EXPIRES_IN;
      else stack.configValues.WALLET_SESSION_EXPIRES_IN = value;

      expect(stack.authService.getSessionTtlSeconds()).toBe(expected);
    });

    it("rejects an expired JWT", async () => {
      const token = stack.jwtService.sign(
        {
          sub: WALLET,
          sid: "session-id",
          jti: "jti-1",
          type: WALLET_TOKEN_TYPE,
        },
        { expiresIn: -10 },
      );

      await expect(
        stack.authService.validateSession(token),
      ).rejects.toThrow("Invalid or expired wallet session");
    });

    it("rejects an expired session even when the JWT still verifies", async () => {
      const issued = await stack.authService.issueSession(WALLET);
      stack.sessionRepository.rows[0].expiresAt = new Date(Date.now() - 1_000);

      await expect(
        stack.authService.validateSession(issued.accessToken),
      ).rejects.toThrow("Wallet session has expired");
    });

    it("accepts a re-issued session after the previous one expired", async () => {
      const first = await stack.authService.issueSession(WALLET);
      stack.sessionRepository.rows[0].expiresAt = new Date(Date.now() - 1_000);

      const second = await stack.authService.issueSession(WALLET);

      expect(second.session.jti).not.toBe(first.session.jti);
      await expect(
        stack.authService.validateSession(second.accessToken),
      ).resolves.toMatchObject({ walletAddress: WALLET });
    });

    it("rejects a token whose session record is missing", async () => {
      const issued = await stack.authService.issueSession(WALLET);
      stack.sessionRepository.rows = [];

      await expect(
        stack.authService.validateSession(issued.accessToken),
      ).rejects.toThrow("Wallet session not found");
    });

    it("rejects an account access token presented as a wallet session", async () => {
      const token = stack.jwtService.sign({
        sub: WALLET,
        jti: "jti-1",
        type: "access",
      });

      await expect(
        stack.authService.validateSession(token),
      ).rejects.toThrow("Invalid wallet session");
    });

    it("rejects a wallet token without a session id", async () => {
      const token = stack.jwtService.sign({
        sub: WALLET,
        type: WALLET_TOKEN_TYPE,
      });

      await expect(
        stack.authService.validateSession(token),
      ).rejects.toThrow("Invalid wallet session");
    });

    it("rejects a wallet token without a subject", async () => {
      const token = stack.jwtService.sign({
        jti: "jti-1",
        type: WALLET_TOKEN_TYPE,
      });

      await expect(
        stack.authService.validateSession(token),
      ).rejects.toThrow("Invalid wallet session");
    });

    it("rejects a token whose wallet does not match its session", async () => {
      const issued = await stack.authService.issueSession(WALLET);
      stack.sessionRepository.rows[0].walletAddress = OTHER_WALLET;

      await expect(
        stack.authService.validateSession(issued.accessToken),
      ).rejects.toThrow("does not match the token");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Wallet disconnection                                                   */
  /* ---------------------------------------------------------------------- */

  describe("wallet disconnection", () => {
    it("revokes the session on logout so its token stops working", async () => {
      const issued = await stack.authService.issueSession(WALLET);

      await stack.authService.revokeSession(issued.session.id);

      expect(stack.sessionRepository.rows[0].revokedAt).toBeInstanceOf(Date);
      await expect(
        stack.authService.validateSession(issued.accessToken),
      ).rejects.toThrow("Wallet session has been revoked");
    });

    it("treats repeated revocation as idempotent", async () => {
      const issued = await stack.authService.issueSession(WALLET);

      await stack.authService.revokeSession(issued.session.id);
      await expect(
        stack.authService.revokeSession(issued.session.id),
      ).resolves.toBeUndefined();

      expect(
        stack.sessionRepository.rows.filter((row) => row.revokedAt),
      ).toHaveLength(1);
    });

    it("revokes every active session for the disconnected wallet", async () => {
      const first = await stack.authService.issueSession(WALLET);
      const second = await stack.authService.issueSession(WALLET);
      const other = await stack.authService.issueSession(OTHER_WALLET);
      await stack.authService.revokeSession(other.session.id);

      await stack.authService.revokeWalletSessions(WALLET);

      const forWallet = stack.sessionRepository.rows.filter(
        (row) => row.walletAddress === WALLET,
      );
      expect(forWallet.every((row) => row.revokedAt instanceof Date)).toBe(true);
      await expect(
        stack.authService.validateSession(first.accessToken),
      ).rejects.toThrow("revoked");
      await expect(
        stack.authService.validateSession(second.accessToken),
      ).rejects.toThrow("revoked");
      // Re-linking the wallet issues a fresh, usable session.
      const relinked = await stack.authService.issueSession(WALLET);
      await expect(
        stack.authService.validateSession(relinked.accessToken),
      ).resolves.toMatchObject({ walletAddress: WALLET });
    });

    it("prunes only sessions that expired before the cutoff", async () => {
      const old = await stack.authService.issueSession(WALLET);
      const recent = await stack.authService.issueSession(WALLET);
      stack.sessionRepository.rows.find(
        (row) => row.id === old.session.id,
      )!.expiresAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      stack.sessionRepository.rows.find(
        (row) => row.id === recent.session.id,
      )!.expiresAt = new Date(Date.now() - 60 * 60 * 1000);

      await expect(
        stack.authService.pruneExpiredSessions(7),
      ).resolves.toBe(1);
      expect(stack.sessionRepository.rows.map((row) => row.id)).toEqual([
        recent.session.id,
      ]);
    });

    it("returns 0 instead of failing authentication when pruning errors", async () => {
      jest
        .spyOn(stack.sessionRepository, "createQueryBuilder")
        .mockImplementationOnce(() => {
          throw new Error("database unavailable");
        });

      await expect(
        stack.authService.pruneExpiredSessions(),
      ).resolves.toBe(0);
    });

    it("reports zero when the prune query returns no affected count", async () => {
      jest
        .spyOn(stack.sessionRepository, "createQueryBuilder")
        .mockImplementationOnce((): any => ({
          delete() {
            return this;
          },
          where() {
            return this;
          },
          async execute() {
            return {};
          },
        }));

      await expect(
        stack.authService.pruneExpiredSessions(),
      ).resolves.toBe(0);
    });

    it("survives a non-Error prune failure", async () => {
      jest
        .spyOn(stack.sessionRepository, "createQueryBuilder")
        .mockImplementationOnce(() => {
          // eslint-disable-next-line no-throw-literal
          throw "connection reset";
        });

      await expect(
        stack.authService.pruneExpiredSessions(),
      ).resolves.toBe(0);
    });
  });
});
