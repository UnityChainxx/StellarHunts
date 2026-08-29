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
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { RateLimit } from '../rate-limiter/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limiter/rate-limit.guard';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('link')
  @UseGuards(RateLimitGuard)
  @RateLimit({ ttl: 900, limit: 10 })
  @HttpCode(HttpStatus.CREATED)
  async linkWallet(@Body() body: { address: string }): Promise<Wallet> {
    return this.walletService.linkWallet(body.address);
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
    @Body() body: { address: string; signature: string; message: string },
  ): Promise<{ valid: boolean }> {
    const valid = await this.walletService.verifySignature(
      body.address,
      body.signature,
      body.message,
    );
    return { valid };
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
  ): Promise<{ valid: boolean }> {
    const valid = await this.walletService.verifySignature(
      address,
      signature,
      message,
    );
    return { valid };
  }
}
