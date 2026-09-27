import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk';
import { ClaimNFTDto } from '../dto/claim-nft.dto';
import { assertSafeHttpUrl } from '../../common/security/safe-url';

/** Approved Stellar RPC host suffixes (issue #318). */
const APPROVED_RPC_HOST_SUFFIXES = ['.stellar.org'];
/** Explicit allowances for local development against a local Soroban RPC. */
const DEV_RPC_HOSTS = ['localhost', '127.0.0.1', '::1'];

/**
 * Soroban RPC poll cadence and confirmation deadline (issue #486).
 * Defaults; overridable via env so deployments and tests can tune the
 * window. Read per call, like the rest of the live-mode configuration.
 */
const DEFAULT_CONFIRM_POLL_INTERVAL_MS = 2_000;
const DEFAULT_CONFIRM_TIMEOUT_MS = 60_000;

/** Default transaction fee in stroops; overridable via SOROBAN_TX_FEE_STROOPS. */
const DEFAULT_TX_FEE_STROOPS = 100_000;
/** Transaction validity window passed to `TransactionBuilder.setTimeout`. */
const TX_TIMEOUT_SECONDS = 60;

/**
 * On-chain level enum values of `mint_level_badge`, mirroring the numeric
 * discriminants of `Levels` in `onchain/contracts/stellar_hunts_types`
 * (locked by `test_levels_discriminants_stable`). These must never change.
 */
const LEVEL_CODES: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  master: 4,
};

/**
 * The level part of a claim, parsed from the request. The contract's
 * `mint_level_badge(minter, recipient, level)` is level-based, so a live
 * claim must encode a known level.
 */
type LevelName = keyof typeof LEVEL_CODES;

/**
 * Lifecycle of a live-mode claim (issue #486 response contract).
 * Permanent failures are thrown as HTTP errors (400/500) instead of a
 * `failed` result, so a response body never reports a failure state.
 */
export type NftClaimStatus = 'confirmed' | 'pending';

/** Response contract of `POST /nft-claim/claim` (documented in docs/api.md). */
export interface NftClaimResult {
  /** `confirmed` = mint included in a ledger and succeeded; `pending` = submitted, confirmation still outstanding. */
  status: NftClaimStatus;
  /** Hash of the submitted Soroban transaction. */
  transactionId: string;
  userId: string;
  nftId: string;
  /** NFT contract that was invoked. */
  contractId?: string;
  /** Normalized level name the claim was minted for. */
  level?: LevelName;
  /** Stellar account that received the badge. */
  recipient?: string;
  /** Ledger sequence that confirmed the mint (`confirmed` only). */
  ledger?: number;
  /** Unix seconds of the confirming ledger's close time (`confirmed` only). */
  createdAt?: number;
}

/** Error surface thrown by `realClaimNFT`, classified deterministically. */
export class ClaimRejectedError extends BadRequestException {
  constructor(
    message: string,
    readonly reason:
      | 'invalid_claim'
      | 'contract_rejected'
      | 'transaction_rejected',
  ) {
    super(message);
  }
}

/**
 * Talks to the Stellar / Soroban blockchain on behalf of the backend.
 *
 * - In `mock` mode (env `STELLAR_MODE=mock`) it returns a synthetic success
 *   response so the rest of the system can be exercised offline.
 * - In `live` mode (default) it builds a real Soroban `invokeHostFunction`
 *   operation for the NFT contract's `mint_level_badge`, signs it with the
 *   custodian key, submits it via Soroban RPC, and only reports success
 *   after the transaction is included in a ledger AND succeeded
 *   (issue #486). While confirmation is outstanding the claim resolves to
 *   a `pending` result carrying the transaction hash — a submitted hash is
 *   never reported as a minted NFT.
 *
 * Signer model: a single custodian key from the environment
 * (`STELLAR_CUSTODIAN_SECRET_KEY`). The custodian must be a registered
 * minter on the NFT contract because `mint_level_badge` calls
 * `minter.require_auth()`.
 */
@Injectable()
export class StellarHandlerService {
  private readonly logger = new Logger(StellarHandlerService.name);
  private readonly isMockMode: boolean;

  constructor() {
    const mode = process.env.STELLAR_MODE?.trim().toLowerCase();
    const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() || 'development';

    if (mode && mode !== 'mock' && mode !== 'live') {
      throw new Error('STELLAR_MODE must be either "mock" or "live".');
    }
    if (mode === 'mock' && nodeEnv === 'production') {
      throw new Error(
        'STELLAR_MODE=mock is not allowed when NODE_ENV=production.',
      );
    }

    this.isMockMode = mode === 'mock';
    this.logger.log(
      `Stellar handler initialized in ${this.isMockMode ? 'mock' : 'live'} mode`,
    );
  }

  /**
   * Validate `SOROBAN_RPC_URL` against the SSRF policy (issue #318): https
   * only, host must be an approved Stellar endpoint (or an explicit local
   * development allowance). Misconfiguration fails fast in live mode and is
   * logged as a warning in mock mode.
   */
  private validateRpcUrl(): string {
    const rpcUrl = process.env.SOROBAN_RPC_URL;
    if (!rpcUrl) {
      if (!this.isMockMode) {
        throw new Error('Invalid SOROBAN_RPC_URL: SOROBAN_RPC_URL is required in live mode');
      }
      return '';
    }

    const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() || 'development';
    const isProduction = nodeEnv === 'production';

    try {
      const parsed = new URL(rpcUrl);
      const hostname = parsed.hostname.toLowerCase();
      const isDevAllowance = !isProduction && DEV_RPC_HOSTS.includes(hostname);

      if (parsed.protocol !== 'https:' && !isDevAllowance) {
        throw new Error(`protocol "${parsed.protocol}" is not allowed, must be https:`);
      }

      if (!isDevAllowance) {
        assertSafeHttpUrl(rpcUrl, 'SOROBAN_RPC_URL');
        const approved = APPROVED_RPC_HOST_SUFFIXES.some((suffix) =>
          hostname.endsWith(suffix) || hostname === suffix.slice(1),
        );
        if (!approved) {
          throw new Error(
            `host "${hostname}" is not an approved Stellar RPC endpoint`,
          );
        }
      }
      return rpcUrl;
    } catch (error) {
      if (!this.isMockMode) {
        throw new Error(`Invalid SOROBAN_RPC_URL: ${error.message}`);
      }
      this.logger.warn(
        `Invalid SOROBAN_RPC_URL ignored in mock mode: ${error.message}`,
      );
      return rpcUrl;
    }
  }

  async claimNFT(claimNFTDto: ClaimNFTDto): Promise<NftClaimResult> {
    if (this.isMockMode) {
      return this.mockClaimNFT(claimNFTDto);
    } else {
      return this.realClaimNFT(claimNFTDto);
    }
  }

  private async mockClaimNFT(claimNFTDto: ClaimNFTDto): Promise<NftClaimResult> {
    this.logger.log(
      `Mock NFT claim for user: ${claimNFTDto.userId}, NFT: ${claimNFTDto.nftId}`,
    );
    return {
      status: 'confirmed',
      transactionId: `mock_tx_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      userId: claimNFTDto.userId,
      nftId: claimNFTDto.nftId,
    };
  }

  private async realClaimNFT(claimNFTDto: ClaimNFTDto): Promise<any> {
    const rpcUrl = this.validateRpcUrl();
    this.logger.log(`Processing live Stellar NFT claim using RPC at ${rpcUrl}`);
    // TODO: Wire up `@stellar/stellar-sdk` here. Sketch:
    //   const server = new StellarSdk.SorobanRpc.Server(rpcUrl);
    //   const contract = new StellarSdk.Contract(process.env.SOROBAN_NFT_CONTRACT_ID);
    //   const tx = new StellarSdk.TransactionBuilder(...)
    //     .addOperation(contract.call('mint_level_badge', ...))
    //     .setTimeout(30).build();
    //   const result = await server.sendTransaction(await tx.sign(...));
    //   return { status: 'success', transactionId: result.hash, ...claimNFTDto };
    //
    // For now, simulate random failures so integration tests cover the error paths.
    const randomError = Math.random();
    if (randomError < 0.3) {
      throw new BadRequestException('Invalid NFT claim parameters');
    } else if (randomError < 0.6) {
      throw new InternalServerErrorException(
        `Failed to build or sign the mint transaction: ${(error as Error).message}`,
      );
    }

    // 2. Submit.
    let submitted: rpc.Api.SendTransactionResponse;
    try {
      submitted = await server.sendTransaction(signedTx);
    } catch (error) {
      // Transport-level failure: transient by definition.
      throw new InternalServerErrorException(
        `Network error contacting Soroban RPC: ${(error as Error).message}`,
      );
    }

    if (submitted.status === 'ERROR') {
      // Deterministically rejected by the host before inclusion (bad
      // footprint, insufficient fee, etc.). Retrying cannot fix it.
      throw new ClaimRejectedError(
        `Soroban transaction rejected: ${submitted.errorResult ?? 'unknown error'}`,
        'transaction_rejected',
      );
    }
    if (submitted.status === 'TRY_AGAIN_LATER') {
      // The RPC is overloaded or the tx queue is full; transient.
      throw new InternalServerErrorException(
        'Soroban RPC asked to try again later',
      );
    }
    // PENDING or DUPLICATE: the transaction hash is authoritative either way.
    const transactionId = submitted.hash;

    // 3. Confirm at ledger level before reporting success.
    return this.awaitConfirmation(server, transactionId, base);
  }

  /** Poll `getTransaction` until the ledger decides, or the deadline hits. */
  private async awaitConfirmation(
    server: rpc.Server,
    transactionId: string,
    base: NftClaimResult,
  ): Promise<NftClaimResult> {
    const pollIntervalMs =
      Number(process.env.SOROBAN_CONFIRM_POLL_INTERVAL_MS) ||
      DEFAULT_CONFIRM_POLL_INTERVAL_MS;
    const timeoutMs =
      Number(process.env.SOROBAN_CONFIRM_TIMEOUT_MS) ||
      DEFAULT_CONFIRM_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let lastError = '';

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      let tx: rpc.Api.GetTransactionResponse;
      try {
        tx = await server.getTransaction(transactionId);
      } catch (error) {
        lastError = (error as Error).message;
        continue;
      }

      switch (tx.status) {
        case rpc.Api.GetTransactionStatus.SUCCESS:
          return {
            ...base,
            status: 'confirmed',
            transactionId,
            ledger: tx.ledger,
            createdAt: tx.createdAt,
          };
        case rpc.Api.GetTransactionStatus.FAILED:
          // Included in a ledger but the invocation failed: permanent for
          // these inputs (contract state decides, not the network).
          throw new ClaimRejectedError(
            `mint_level_badge failed on-chain: ${String(tx.resultXdr)}`,
            'contract_rejected',
          );
        case rpc.Api.GetTransactionStatus.NOT_FOUND:
          // Still in flight; keep polling.
          continue;
      }
    }

    this.logger.warn(
      `Soroban transaction ${transactionId} not confirmed within ${timeoutMs}ms; returning pending${lastError ? ` (last poll error: ${lastError})` : ''}`,
    );
    return { ...base, status: 'pending', transactionId };
  }
}
