import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardController } from './reward.controller';
import { RewardService } from './reward.service';
import { Reward } from './entities/reward.entity';
import { RewardClaim } from './entities/reward-claim.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Reward, RewardClaim])],
  controllers: [RewardController],
  providers: [RewardService],
  exports: [RewardService],
})
export class RewardsModule {}
