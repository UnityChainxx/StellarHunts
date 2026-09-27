import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { StellarHandlerService } from './providers/stellar-handler.service';
import { ClaimNFTDto } from './dto/claim-nft.dto';
import { NftClaimResult } from './providers/stellar-handler.service';

@Injectable()
export class NFTClaimService {
  private readonly logger = new Logger(NFTClaimService.name);
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 2000;
  /**
   * Upper bound for one provider attempt. Must comfortably exceed the
   * provider's own submit + confirmation deadline (60s) so a healthy but
   * slow confirmation is not cut off and misread as a transient failure
   * (issue #486).
   */
  private readonly operationTimeoutMs = 90_000;

  constructor(private readonly stellarHandler: StellarHandlerService) {}

  async claimNFT(claimNFTDto: ClaimNFTDto): Promise<NftClaimResult> {
    const operationId = `${claimNFTDto.userId}:${claimNFTDto.nftId}`;
    this.logger.log(`Processing NFT claim operation=${operationId}`);

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const startedAt = Date.now();
      try {
        const result = await this.withTimeout(
          this.stellarHandler.claimNFT(claimNFTDto),
          this.operationTimeoutMs,
        );

        if (result?.status === 'pending') {
          // Submitted but not yet confirmed. This is NOT a failure: the
          // transaction is in flight and resubmitting it here would only
          // race the ledger (double-mint risk for non-deterministic
          // signers). Surface the hash so callers can poll for
          // confirmation (issue #486).
          this.logger.log(
            `NFT claim pending confirmation operation=${operationId} tx=${result.transactionId} attempt=${attempt} durationMs=${Date.now() - startedAt}`,
          );
          return result;
        }

        this.logger.log(
          `NFT claim succeeded operation=${operationId} attempt=${attempt} durationMs=${Date.now() - startedAt}`,
        );
        return result;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const retryable = !(error instanceof BadRequestException);
        this.logger.warn(
          `NFT claim failed operation=${operationId} attempt=${attempt}/${this.maxRetries} retryable=${retryable} durationMs=${Date.now() - startedAt} error=${message}`,
        );

        if (!retryable || attempt === this.maxRetries) {
          if (error instanceof BadRequestException) throw error;
          throw new InternalServerErrorException(
            `Failed to claim NFT after maximum retries: ${message}`,
          );
        }

        const delayMs = this.retryDelayMs * 2 ** (attempt - 1);
        this.logger.log(
          `Retrying NFT claim operation=${operationId} in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // Unreachable: the loop either returns or throws.
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new InternalServerErrorException(`NFT claim failed: ${message}`);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new InternalServerErrorException('NFT claim timed out')),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
