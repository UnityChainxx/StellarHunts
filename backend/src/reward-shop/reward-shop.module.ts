import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardShop } from './entities/reward-shop.entity';
import { RewardShopService } from './reward-shop.service';
import { RewardShopController } from './reward-shop.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RewardShop])],
  providers: [RewardShopService],
  controllers: [RewardShopController],
  exports: [RewardShopService],
})
export class RewardShopModule {}
