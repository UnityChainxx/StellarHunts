import { Module } from '@nestjs/common';
import { AnalyticService } from './analytic.service';
import { AnalyticController } from './analytic.controller';

@Module({
  providers: [AnalyticService],
  controllers: [AnalyticController],
  exports: [AnalyticService],
})
export class AnalyticsModule {}
