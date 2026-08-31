import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Pool } from 'pg';
import { PG_POOL } from './database/postgres.provider';

/**
 * Periodically refreshes `puzzle_stats_mv`, the materialized view that
 * backs the most-solved-puzzles leaderboard. This is the "periodic
 * rollup" called for in the issue: it's the one analytic aggregation
 * expensive enough (full scan across every puzzle) to be worth
 * pre-computing rather than querying live on every request.
 *
 * Uses REFRESH ... CONCURRENTLY so reads against the view are never
 * blocked while it rebuilds. CONCURRENTLY requires the view to already
 * have data and a unique index (both set up in the migration), so
 * onModuleInit does one blocking refresh first as a safety net in case
 * the migration's initial REFRESH didn't run for some reason.
 */
@Injectable()
export class AnalyticsRollupService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsRollupService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.pool.query('REFRESH MATERIALIZED VIEW puzzle_stats_mv');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Initial puzzle_stats_mv refresh failed: ${message}`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async refreshLeaderboard(): Promise<void> {
    try {
      await this.pool.query(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY puzzle_stats_mv',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`puzzle_stats_mv refresh failed: ${message}`);
    }
  }
}
