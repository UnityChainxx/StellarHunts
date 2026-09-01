import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { StellarHandlerService } from './providers/stellar-handler.service';
import { ClaimNFTDto } from './dto/claim-nft.dto';

@Injectable()
export class NFTClaimService {
  private readonly logger = new Logger(NFTClaimService.name);
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 2000;
  private readonly operationTimeoutMs = 30_000;

  constructor(private readonly stellarHandler: StellarHandlerService) {}

  async claimNFT(claimNFTDto: ClaimNFTDto): Promise<any> {
    const operationId = `${claimNFTDto.userId}:${claimNFTDto.nftId}`;
    this.logger.log(`Processing NFT claim operation=${operationId}`);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const startedAt = Date.now();
      try {
        const result = await this.withTimeout(
          this.stellarHandler.claimNFT(claimNFTDto),
          this.operationTimeoutMs,
        );
        this.logger.log(
          `NFT claim succeeded operation=${operationId} attempt=${attempt} durationMs=${Date.now() - startedAt}`,
        );
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable = !(error instanceof BadRequestException);
        this.logger.warn(
          `NFT claim failed operation=${operationId} attempt=${attempt}/${this.maxRetries} retryable=${retryable} durationMs=${Date.now() - startedAt} error=${message}`,
        );

        if (!retryable || attempt === this.maxRetries) {
          if (error instanceof BadRequestException) throw error;
          throw new InternalServerErrorException(
            'Failed to claim NFT after maximum retries',
          );
        }

        const delayMs = this.retryDelayMs * 2 ** (attempt - 1);
        this.logger.log(
          `Retrying NFT claim operation=${operationId} in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new InternalServerErrorException('NFT claim failed');
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
