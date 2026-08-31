import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { WalletService, WalletChallenge } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { WalletChallengeDto } from './dto/wallet-challenge.dto';
import { VerifyWalletSignatureDto } from './dto/verify-wallet-signature.dto';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('link')
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a wallet signature with replay protection',
    description:
      'Verifies an ed25519 signature over a signed challenge. The nonce is consumed on success so the signature cannot be replayed.',
  })
  @ApiResponse({ status: 200, description: 'Verification result' })
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
  @ApiOperation({ summary: 'Verify a wallet signature (query params)' })
  async verifySignatureGet(
    @Query('address') address: string,
    @Query('signature') signature: string,
    @Query('message') message: string,
  ): Promise<{ valid: boolean; error?: string }> {
    return this.walletService.verifySignature(address, signature, message);
  }
}