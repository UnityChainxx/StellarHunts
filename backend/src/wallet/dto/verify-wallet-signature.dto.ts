import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyWalletSignatureDto {
  @ApiProperty({
    description: 'Stellar public key (G...) that produced the signature',
    example: 'GDN752Q6GWGMEEDZOL7DACRHE2QMCD55MILMLRPMZDCN2AOKB6WUOH2G',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiProperty({
    description: 'The challenge message that was signed',
    example:
      'stellar-hunts: authenticate: wallet=G..., nonce=..., user=..., domain=..., expires=...',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    description: 'Base64-encoded ed25519 signature of the message bytes',
    example: '8Un3...',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;
}