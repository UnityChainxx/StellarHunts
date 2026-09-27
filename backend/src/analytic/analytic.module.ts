import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Analytics } from './entities/analytic.entity';
import { AnalyticService } from './analytic.service';
import { AnalyticController } from './analytic.controller';
import { AnalyticsRollupService } from './analytic-rollup.service';
import { postgresProvider } from './database/postgres.provider';

@Module({
  imports: [TypeOrmModule.forFeature([Analytics])],
  providers: [AnalyticService, AnalyticsRollupService, postgresProvider],
  controllers: [AnalyticController],
  exports: [AnalyticService, AnalyticsRollupService],
})
export class AnalyticModule {}
