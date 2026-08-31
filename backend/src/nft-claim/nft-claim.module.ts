import { Module } from '@nestjs/common';
import { NFTClaimController } from './nft-claim.controller';
import { NFTClaimService } from './nft-claim.service';
import { StellarHandlerService } from './providers/stellar-handler.service';

@Module({
  controllers: [NFTClaimController],
  providers: [NFTClaimService, StellarHandlerService],
  exports: [NFTClaimService],
})
export class NFTClaimModule {}
