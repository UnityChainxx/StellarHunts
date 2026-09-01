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
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 500;
  private running = false;

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.refresh('startup', false);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async refreshLeaderboard(): Promise<void> {
    await this.refresh('scheduled', true);
  }

  async refreshForTesting(
    trigger: string,
    concurrent: boolean,
  ): Promise<void> {
    await this.refresh(trigger, concurrent);
  }

  private async refresh(trigger: string, concurrent: boolean): Promise<void> {
    if (this.running) {
      this.logger.warn(`Skipping ${trigger} rollup: refresh already running`);
      return;
    }

    this.running = true;
    const startedAt = Date.now();
    const statement = concurrent
      ? 'REFRESH MATERIALIZED VIEW CONCURRENTLY puzzle_stats_mv'
      : 'REFRESH MATERIALIZED VIEW puzzle_stats_mv';

    try {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          await this.pool.query(statement);
          this.logger.log(
            `Analytics rollup succeeded trigger=${trigger} attempt=${attempt} durationMs=${Date.now() - startedAt}`,
          );
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Analytics rollup failed trigger=${trigger} attempt=${attempt}/${this.maxRetries} error=${message}`,
          );
          if (attempt === this.maxRetries) throw err;
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)),
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Analytics rollup exhausted retries trigger=${trigger} durationMs=${Date.now() - startedAt} error=${message}`,
      );
    } finally {
      this.running = false;
    }
  }
}
