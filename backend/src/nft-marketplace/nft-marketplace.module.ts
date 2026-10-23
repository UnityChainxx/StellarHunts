import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NftMarketplaceController } from './nft-marketplace.controller';
import { NftMarketplaceService } from './nft-marketplace.service';
import { NftListing } from './entities/nft-listing.entity';
import { NftTradeOffer } from './entities/nft-trade-offer.entity';

/**
 * NFT transfer/trade marketplace (issue #735): replaces the static
 * `nft-marketplace-stub` module with a persistent offer/accept flow backed
 * by escrowed settlement and configurable fees.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NftListing, NftTradeOffer])],
  controllers: [NftMarketplaceController],
  providers: [NftMarketplaceService],
  exports: [NftMarketplaceService],
})
export class NftMarketplaceModule {}
