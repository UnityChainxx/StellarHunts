import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ClaimNFTDto } from '../dto/claim-nft.dto';
import { assertSafeHttpUrl } from '../../common/security/safe-url';

/** Approved Stellar RPC host suffixes (issue #318). */
const APPROVED_RPC_HOST_SUFFIXES = ['.stellar.org'];
/** Explicit allowances for local development against a local Soroban RPC. */
const DEV_RPC_HOSTS = ['localhost', '127.0.0.1', '::1'];

/**
 * Talks to the Stellar / Soroban blockchain on behalf of the backend.
 *
 * - In `mock` mode (env `STELLAR_MODE=mock`) it returns a synthetic success
 *   response so the rest of the system can be exercised offline.
 * - In `live` mode it would build a Soroban `invokeHostFunction` operation
 *   via `@stellar/stellar-sdk`, sign with the configured custodian key, and
 *   submit to the public network (testnet or pubnet depending on config).
 *
 * The current implementation runs in mock mode by default; real Soroban
 * transaction plumbing will replace the comment block below.
 */
@Injectable()
export class StellarHandlerService {
  private readonly logger = new Logger(StellarHandlerService.name);
  private readonly isMockMode: boolean;

  constructor() {
    this.isMockMode = process.env.STELLAR_MODE === 'mock';
    this.validateRpcUrl();
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
  private validateRpcUrl(): void {
    const rpcUrl = process.env.SOROBAN_RPC_URL;
    if (!rpcUrl) {
      return;
    }

    try {
      assertSafeHttpUrl(rpcUrl, 'SOROBAN_RPC_URL');
      const hostname = new URL(rpcUrl).hostname.toLowerCase();
      const approved = APPROVED_RPC_HOST_SUFFIXES.some((suffix) =>
        hostname.endsWith(suffix),
      );
      const isDevAllowance = DEV_RPC_HOSTS.includes(hostname);
      if (!approved && !isDevAllowance) {
        throw new Error(
          `host "${hostname}" is not an approved Stellar RPC endpoint`,
        );
      }
    } catch (error) {
      if (!this.isMockMode) {
        throw new Error(`Invalid SOROBAN_RPC_URL: ${error.message}`);
      }
      this.logger.warn(
        `Invalid SOROBAN_RPC_URL ignored in mock mode: ${error.message}`,
      );
    }
  }

  async claimNFT(claimNFTDto: ClaimNFTDto): Promise<any> {
    if (this.isMockMode) {
      return this.mockClaimNFT(claimNFTDto);
    } else {
      return this.realClaimNFT(claimNFTDto);
    }
  }

  private async mockClaimNFT(claimNFTDto: ClaimNFTDto): Promise<any> {
    this.logger.log(
      `Mock NFT claim for user: ${claimNFTDto.userId}, NFT: ${claimNFTDto.nftId}`,
    );
    return {
      status: 'success',
      transactionId: `mock_tx_${Math.random().toString(36).substring(7)}`,
      userId: claimNFTDto.userId,
      nftId: claimNFTDto.nftId,
    };
  }

  private async realClaimNFT(claimNFTDto: ClaimNFTDto): Promise<any> {
    this.logger.log(
      `Real NFT claim for user: ${claimNFTDto.userId}, NFT: ${claimNFTDto.nftId}`,
    );
    // TODO: Wire up `@stellar/stellar-sdk` here. Sketch:
    //   const server = new StellarSdk.SorobanRpc.Server(process.env.SOROBAN_RPC_URL);
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
        'Network error connecting to Stellar',
      );
    } else {
      throw new InternalServerErrorException('Contract execution failed');
    }
  }
}
