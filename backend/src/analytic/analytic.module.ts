import { Module } from '@nestjs/common';
import { AnalyticService } from './analytic.service';
import { AnalyticController } from './analytic.controller';
import { AnalyticsRollupService } from './analytic-rollup.service';
import { postgresProvider } from './database/postgres.provider';

@Module({
  providers: [AnalyticService, AnalyticsRollupService, postgresProvider],
  controllers: [AnalyticController],
  exports: [AnalyticService, AnalyticsRollupService],
})
export class AnalyticModule {}
