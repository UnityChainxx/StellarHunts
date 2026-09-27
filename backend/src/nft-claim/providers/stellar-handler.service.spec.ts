import { StellarHandlerService } from './stellar-handler.service';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

/**
 * Tests for the live-mode claim path (issue #486).
 *
 * The `@stellar/stellar-sdk` module is mocked wholesale: this repo's jest
 * setup cannot execute the SDK's CJS build (its ESM-only transitive
 * dependencies break `Runtime.createScriptFromCode` — the same failure the
 * existing `wallet.service.spec.ts` hits on main), and the flow under test
 * is the provider's orchestration, not the SDK internals. The mock records
 * the exact ScVal arguments handed to the contract call so the mint
 * operation's shape is still verified.
 */

const TX_HASH = 'a'.repeat(64);
const CONTRACT_ID = 'CCPL2QZAFMDQ7BQTGQVYUZCLWVI5WBZP3DGGCCHU7YHDABHB7WWCBA5T';

const callMock = jest.fn();
const signMock = jest.fn();
const getAccountMock = jest.fn();
const sendTransactionMock = jest.fn();
const getTransactionMock = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  class FakeContract {
    call(method: string, ...args: unknown[]) {
      callMock(method, ...args);
      return { method, args };
    }
  }
  class FakeTransactionBuilder {
    private op: unknown;
    addOperation(op: unknown) {
      this.op = op;
      return this;
    }
    setTimeout() {
      return this;
    }
    build() {
      return {
        operations: [this.op],
        sign: signMock,
      };
    }
  }
  return {
    Contract: FakeContract,
    TransactionBuilder: FakeTransactionBuilder,
    Keypair: {
      fromSecret: (secret: string) => {
        if (secret !== 'SCTVTESTCUSTODIANSECRETKEYAAAAAAAAAAAAAAAAAAAAAAAA') {
          throw new Error('invalid secret');
        }
        return {
          publicKey: () => 'G' + 'A'.repeat(55),
          secret: () => secret,
        };
      },
      fromPublicKey: (pk: string) => {
        if (!/^G[A-Z2-7]{55}$/.test(pk)) {
          throw new Error('invalid public key');
        }
        return { publicKey: () => pk };
      },
    },
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
    },
    nativeToScVal: (val: unknown, opts: { type: string }) => ({ val, type: opts?.type }),
    rpc: {
      Server: class {
        getAccount = getAccountMock;
        sendTransaction = sendTransactionMock;
        getTransaction = getTransactionMock;
        constructor(url: string) {
          if (!url) throw new Error('missing url');
        }
      },
      Api: {
        GetTransactionStatus: {
          SUCCESS: 'SUCCESS',
          NOT_FOUND: 'NOT_FOUND',
          FAILED: 'FAILED',
        },
      },
    },
  };
});

const GetTransactionStatus = {
  SUCCESS: 'SUCCESS',
  NOT_FOUND: 'NOT_FOUND',
  FAILED: 'FAILED',
} as const;

const custodianPk = 'G' + 'A'.repeat(55);
const recipientPk = 'G' + 'B'.repeat(55);

const dto = (userId = recipientPk, nftId = 'nft-easy') => ({
  userId,
  nftId,
});

const submitted = (overrides: Record<string, unknown> = {}) => ({
  status: 'PENDING',
  hash: TX_HASH,
  latestLedger: 100,
  latestLedgerCloseTime: 1,
  ...overrides,
});

const confirmed = (overrides: Record<string, unknown> = {}) => ({
  status: GetTransactionStatus.SUCCESS,
  ledger: 101,
  createdAt: 1700000000,
  ...overrides,
});

describe('StellarHandlerService live mode (issue #486)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.STELLAR_MODE = 'live';
    process.env.NODE_ENV = 'test';
    process.env.SOROBAN_RPC_URL = 'https://rpc.stellar.org';
    process.env.SOROBAN_NFT_CONTRACT_ID = CONTRACT_ID;
    process.env.STELLAR_CUSTODIAN_SECRET_KEY =
      'SCTVTESTCUSTODIANSECRETKEYAAAAAAAAAAAAAAAAAAAAAAAA';
    delete process.env.STELLAR_NETWORK_PASSPHRASE;
    delete process.env.SOROBAN_TX_FEE_STROOPS;
    // Shrink the confirmation window so tests exercise the polling loop
    // without waiting for the real 2s/60s cadence.
    process.env.SOROBAN_CONFIRM_POLL_INTERVAL_MS = '1';
    process.env.SOROBAN_CONFIRM_TIMEOUT_MS = '150';

    getAccountMock.mockReset().mockResolvedValue({
      accountId: custodianPk,
      sequenceNumber: '123',
      incrementSequenceNumber: jest.fn(),
    });
    sendTransactionMock.mockReset().mockResolvedValue(submitted());
    getTransactionMock.mockReset();
    callMock.mockClear();
    signMock.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('submits a real mint_level_badge invocation and reports confirmed only after ledger confirmation', async () => {
    getTransactionMock.mockResolvedValue(confirmed());
    const service = new StellarHandlerService();

    const result = await service.claimNFT(dto());

    expect(result.status).toBe('confirmed');
    expect(result.transactionId).toBe(TX_HASH);
    expect(result.recipient).toBe(recipientPk);
    expect(result.level).toBe('easy');
    expect(result.ledger).toBe(101);
    expect(result.createdAt).toBe(1700000000);

    // The invocation targets mint_level_badge on the configured NFT
    // contract with (minter=custodian, recipient, level=1).
    expect(callMock).toHaveBeenCalledWith(
      'mint_level_badge',
      expect.objectContaining({ type: 'address' }),
      expect.objectContaining({ type: 'address' }),
      expect.objectContaining({ type: 'u32', val: 1 }),
    );
    // The transaction was signed by the custodian.
    expect(signMock).toHaveBeenCalledTimes(1);
    // Exactly one submission, then confirmation polling.
    expect(sendTransactionMock).toHaveBeenCalledTimes(1);
    expect(getTransactionMock).toHaveBeenCalled();
  });

  it('reports pending when confirmation does not arrive in time, carrying the hash', async () => {
    getTransactionMock.mockResolvedValue({
      status: GetTransactionStatus.NOT_FOUND,
    });
    const service = new StellarHandlerService();

    const result = await service.claimNFT(dto());

    expect(result.status).toBe('pending');
    expect(result.transactionId).toBe(TX_HASH);
    expect(sendTransactionMock).toHaveBeenCalledTimes(1);
    // Polled repeatedly until the deadline, without throwing.
    expect(getTransactionMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('classifies an on-chain contract failure as a permanent error', async () => {
    getTransactionMock.mockResolvedValue({
      status: GetTransactionStatus.FAILED,
      ledger: 101,
      createdAt: 1700000000,
      resultXdr: {},
    });
    const service = new StellarHandlerService();

    await expect(service.claimNFT(dto())).rejects.toThrow(
      /mint_level_badge failed on-chain/,
    );
    // A contract failure is a BadRequestException (non-retryable upstream).
    await expect(
      (async () => {
        getTransactionMock.mockResolvedValue({
          status: GetTransactionStatus.FAILED,
          ledger: 101,
          createdAt: 1700000000,
          resultXdr: {},
        });
        return service.claimNFT(dto());
      })(),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('classifies host rejection at submission (sendTransaction ERROR) as permanent', async () => {
    sendTransactionMock.mockResolvedValue(
      submitted({ status: 'ERROR', errorResult: 'tx malformed' }),
    );
    const service = new StellarHandlerService();

    await expect(service.claimNFT(dto())).rejects.toThrow(
      /Soroban transaction rejected/,
    );
    expect(getTransactionMock).not.toHaveBeenCalled();
  });

  it('classifies RPC transport errors as transient (retryable)', async () => {
    getAccountMock.mockRejectedValue(new Error('socket hang up'));
    const service = new StellarHandlerService();

    await expect(service.claimNFT(dto())).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(sendTransactionMock).not.toHaveBeenCalled();
  });

  it('classifies TRY_AGAIN_LATER as transient (retryable)', async () => {
    sendTransactionMock.mockResolvedValue(
      submitted({ status: 'TRY_AGAIN_LATER' }),
    );
    const service = new StellarHandlerService();

    await expect(service.claimNFT(dto())).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('rejects unknown levels and non-account recipients before any submission', async () => {
    const service = new StellarHandlerService();

    await expect(
      service.claimNFT(dto(recipientPk, 'gold-badge')),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.claimNFT(dto('not-a-stellar-account', 'easy')),
    ).rejects.toBeInstanceOf(BadRequestException);

    // No transaction was ever built or sent.
    expect(getAccountMock).not.toHaveBeenCalled();
    expect(sendTransactionMock).not.toHaveBeenCalled();
  });

  it('encodes every level name to its contract enum value', async () => {
    getTransactionMock.mockResolvedValue(confirmed());
    const service = new StellarHandlerService();

    for (const [nftId, code] of [
      ['easy', 1],
      ['medium', 2],
      ['hard', 3],
      ['master', 4],
    ] as const) {
      callMock.mockClear();
      const res = await service.claimNFT(dto(recipientPk, `badge-${nftId}`));
      expect(res.status).toBe('confirmed');
      expect(callMock).toHaveBeenCalledWith(
        'mint_level_badge',
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ type: 'u32', val: code }),
      );
    }
  });

  it('fails fast with a 500 when live configuration is missing', async () => {
    delete process.env.SOROBAN_RPC_URL;
    const service = new StellarHandlerService();

    await expect(service.claimNFT(dto())).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('fails fast with a 500 when the custodian key is missing or invalid', async () => {
    delete process.env.STELLAR_CUSTODIAN_SECRET_KEY;
    const service = new StellarHandlerService();
    await expect(service.claimNFT(dto())).rejects.toThrow(
      /STELLAR_CUSTODIAN_SECRET_KEY is not configured/,
    );

    process.env.STELLAR_CUSTODIAN_SECRET_KEY = 'not-a-secret';
    await expect(service.claimNFT(dto())).rejects.toThrow(
      /not a valid Stellar secret key/,
    );
  });

  it('still returns a synthetic success in mock mode', async () => {
    process.env.STELLAR_MODE = 'mock';
    const service = new StellarHandlerService();

    const result = await service.claimNFT(dto('user123', 'nft456'));
    expect(result.status).toBe('confirmed');
    expect(result.transactionId).toMatch(/^mock_tx_/);
    expect(sendTransactionMock).not.toHaveBeenCalled();
  });
});

describe('StellarHandlerService SSRF validation for SOROBAN_RPC_URL (issue #485)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.STELLAR_MODE = 'live';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows an approved https Stellar endpoint on the live claim path', () => {
    process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
    const service = new StellarHandlerService();

    expect((service as any).validateRpcUrl()).toBe(
      'https://soroban-testnet.stellar.org',
    );
  });

  it('rejects a non-https URL on the live claim path', async () => {
    process.env.SOROBAN_RPC_URL = 'http://soroban-testnet.stellar.org';
    const service = new StellarHandlerService();

    await expect(
      service.claimNFT({ userId: 'u1', nftId: 'nft-1' }),
    ).rejects.toThrow(
      'Invalid SOROBAN_RPC_URL: protocol "http:" is not allowed, must be https:',
    );
  });

  it('rejects a disallowed host on the live claim path', async () => {
    process.env.SOROBAN_RPC_URL = 'https://attacker-rpc.example.com';
    const service = new StellarHandlerService();

    await expect(
      service.claimNFT({ userId: 'u1', nftId: 'nft-1' }),
    ).rejects.toThrow(
      'Invalid SOROBAN_RPC_URL: host "attacker-rpc.example.com" is not an approved Stellar RPC endpoint',
    );
  });

  it('allows local-dev host in non-production environments', () => {
    process.env.NODE_ENV = 'development';
    process.env.SOROBAN_RPC_URL = 'http://localhost:8000';
    const service = new StellarHandlerService();

    expect((service as any).validateRpcUrl()).toBe('http://localhost:8000');
  });

  it('rejects local-dev allowances when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SOROBAN_RPC_URL = 'http://localhost:8000';
    const service = new StellarHandlerService();

    await expect(
      service.claimNFT({ userId: 'u1', nftId: 'nft-1' }),
    ).rejects.toThrow(/Invalid SOROBAN_RPC_URL/);
  });
});
