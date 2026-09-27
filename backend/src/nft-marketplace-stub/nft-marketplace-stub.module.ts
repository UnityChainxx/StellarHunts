import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NftItem } from './entities/nft-item.entity';
import { NftMarketplaceStubService } from './nft-marketplace-stub.service';
import { NftMarketplaceStubController } from './nft-marketplace-stub.controller';

@Module({
  imports: [TypeOrmModule.forFeature([NftItem])],
  controllers: [NftMarketplaceStubController],
  providers: [NftMarketplaceStubService],
})
export class NftMarketplaceStubModule {}
