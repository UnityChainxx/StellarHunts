import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { WalletService, WalletChallenge } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { RateLimit } from '../rate-limiter/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limiter/rate-limit.guard';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('link')
  @UseGuards(RateLimitGuard)
  @RateLimit({ ttl: 900, limit: 10 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Link or upsert a wallet address' })
  async linkWallet(@Body() body: { address: string }): Promise<Wallet> {
    return this.walletService.linkWallet(body.address);
  }

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create a signable wallet challenge',
    description:
      'Returns a message (bound to wallet/user/domain/expiry with a nonce) that the client must sign with its Stellar ed25519 key.',
  })
  @ApiResponse({ status: 200, description: 'Challenge created' })
  async createChallenge(
    @Body() body: WalletChallengeDto,
  ): Promise<WalletChallenge> {
    return this.walletService.createChallenge(
      body.walletAddress,
      body.userId,
      body.domain,
      body.ttlSeconds,
    );
  }

  @Post('verify-signature')
  @UseGuards(RateLimitGuard)
  // Keyed by wallet address too: limits signature brute-forcing on a
  // specific address across IPs, while still throttling anonymous traffic
  // by IP.
  @RateLimit({
    ttl: 60,
    limit: 10,
    keyGenerator: (req) => req.body?.address,
  })
  async verifySignature(
    @Body() body: VerifyWalletSignatureDto,
  ): Promise<{ valid: boolean; error?: string }> {
    return this.walletService.verifySignature(
      body.walletAddress,
      body.signature,
      body.message,
    );
  }

  @Get('verify-signature')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    ttl: 60,
    limit: 10,
    keyGenerator: (req) => {
      const address = req.query?.address;
      return typeof address === 'string' ? address : undefined;
    },
  })
  async verifySignatureGet(
    @Query('address') address: string,
    @Query('signature') signature: string,
    @Query('message') message: string,
  ): Promise<{ valid: boolean; error?: string }> {
    return this.walletService.verifySignature(address, signature, message);
  }
}