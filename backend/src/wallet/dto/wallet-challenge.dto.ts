import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class WalletChallengeDto {
  @ApiProperty({
    description: 'Stellar public key (G...) that will sign the challenge',
    example: 'GDN752Q6GWGMEEDZOL7DACRHE2QMCD55MILMLRPMZDCN2AOKB6WUOH2G',
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @ApiPropertyOptional({
    description:
      'User id the challenge is bound to. When provided, the signature only verifies for this user.',
    example: 'f7e7e2f1-8a3f-4cbb-9e9d-4f2c1a1b2c3d',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Domain the challenge is bound to (defaults to app origin)',
    example: 'stellar-hunts.app',
  })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({
    description: 'Challenge lifetime in seconds (default 300 = 5 minutes)',
    example: 300,
  })
  @IsOptional()
  ttlSeconds?: number;
}