import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardShop } from './entities/reward-shop.entity';
import { RewardShopService } from './reward-shop.service';
import { RewardShopController } from './reward-shop.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [TypeOrmModule.forFeature([RewardShop]), AuditLogModule],
  providers: [RewardShopService],
  controllers: [RewardShopController],
  exports: [RewardShopService],
})
export class RewardShopModule {}
