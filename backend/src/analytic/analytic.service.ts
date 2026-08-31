import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database/postgres.provider';

export interface UserPuzzleEngagement {
  solveCount: number;
  totalSolveTime: number;
  attempts: number;
  lastSolved?: Date;
}

export interface PaginatedUserPuzzleHistory {
  items: Record<string, UserPuzzleEngagement>;
  total: number;
  page: number;
  limit: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * All analytic state now lives in the `analytic_events` Postgres table
 * (see migrations/1706400000000-create-analytic-events.sql). There is
 * no in-memory Map anymore: every replica reads and writes the same
 * table, so restarts and multi-replica deployments produce consistent
 * totals.
 *
 * The one aggregation expensive enough to warrant a rollup — the global
 * "most solved puzzles" leaderboard — is served from `puzzle_stats_mv`,
 * a materialized view refreshed on a schedule by AnalyticsRollupService.
 * Everything else (single puzzle average, single user history) is
 * scoped by an indexed column and cheap enough to aggregate live, so
 * those stay always-current rather than lagging a rollup interval.
 */
@Injectable()
export class AnalyticService {
  private readonly logger = new Logger(AnalyticService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async recordPuzzleSolveAsync(
    userId: string,
    puzzleId: string,
    solveTime: number,
  ): Promise<void> {
    this.logger.log(
      `Recording solve: User ${userId}, Puzzle ${puzzleId}, Time ${solveTime}`,
    );
    await this.pool.query(
      `INSERT INTO analytic_events (user_id, puzzle_id, solve_time)
       VALUES ($1, $2, $3)`,
      [userId, puzzleId, solveTime],
    );
  }

  /**
   * Leaderboard read, served from the materialized view. May lag live
   * writes by up to the rollup interval (see AnalyticsRollupService) —
   * that trade-off is what makes scanning every puzzle cheap.
   */
  async getMostSolvedPuzzlesAsync(
    limit?: number,
    offset?: number,
  ): Promise<Array<{ puzzleId: string; solveCount: number }>> {
    this.logger.log('Fetching most solved puzzles...');
    const sql = limit
      ? `SELECT puzzle_id, solve_count FROM puzzle_stats_mv
         ORDER BY solve_count DESC LIMIT $1 OFFSET $2`
      : offset
        ? `SELECT puzzle_id, solve_count FROM puzzle_stats_mv
           ORDER BY solve_count DESC OFFSET $1`
        : `SELECT puzzle_id, solve_count FROM puzzle_stats_mv
           ORDER BY solve_count DESC`;
    const params = limit ? [limit, offset ?? 0] : offset ? [offset] : [];
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => ({
      puzzleId: r.puzzle_id as string,
      solveCount: Number(r.solve_count),
    }));
  }

  /**
   * Live aggregate scoped to one puzzle_id (idx_analytic_events_puzzle_id).
   * Always current — cheap enough that a rollup isn't worth the staleness.
   */
  async getAverageSolveTimeAsync(puzzleId: string): Promise<number> {
    this.logger.log(`Fetching average solve time for puzzle ${puzzleId}...`);
    const { rows } = await this.pool.query<{
      solve_count: string;
      total_solve_time: string;
    }>(
      `SELECT COUNT(*) AS solve_count,
              COALESCE(SUM(solve_time), 0) AS total_solve_time
       FROM analytic_events
       WHERE puzzle_id = $1`,
      [puzzleId],
    );
    const solveCount = Number(rows[0]?.solve_count ?? 0);
    const totalSolveTime = Number(rows[0]?.total_solve_time ?? 0);
    return solveCount > 0 ? totalSolveTime / solveCount : 0;
  }

  /**
   * Live aggregate scoped to one user_id (idx_analytic_events_user_puzzle).
   * Returns the full unpaginated history — use
   * getUserPuzzleHistoryPaginated for large histories.
   */
  async getUserPuzzleStatsAsync(
    userId: string,
  ): Promise<Map<string, UserPuzzleEngagement>> {
    this.logger.log(`Fetching puzzle history for user ${userId}...`);
    const { rows } = await this.pool.query(
      `SELECT puzzle_id,
              COUNT(*) AS solve_count,
              COUNT(*) AS attempts,
              COALESCE(SUM(solve_time), 0) AS total_solve_time,
              MAX(solved_at) AS last_solved
       FROM analytic_events
       WHERE user_id = $1
       GROUP BY puzzle_id`,
      [userId],
    );
    const result = new Map<string, UserPuzzleEngagement>();
    for (const row of rows) {
      result.set(row.puzzle_id, {
        solveCount: Number(row.solve_count),
        totalSolveTime: Number(row.total_solve_time),
        attempts: Number(row.attempts),
        lastSolved: row.last_solved ? new Date(row.last_solved) : undefined,
      });
    }
    return result;
  }

  /**
   * Paginated user history, most recently solved first. Pagination is
   * done in SQL (LIMIT/OFFSET) rather than in memory, so it stays cheap
   * as a user's puzzle count grows.
   */
  async getUserPuzzleHistoryPaginated(
    userId: string,
    page: number = DEFAULT_PAGE,
    limit: number = DEFAULT_LIMIT,
  ): Promise<PaginatedUserPuzzleHistory> {
    const safePage =
      Number.isFinite(page) && page > 0 ? Math.floor(page) : DEFAULT_PAGE;
    const safeLimit =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), MAX_LIMIT)
        : DEFAULT_LIMIT;
    const offset = (safePage - 1) * safeLimit;

    const [pageResult, countResult] = await Promise.all([
      this.pool.query(
        `SELECT puzzle_id,
                COUNT(*) AS solve_count,
                COUNT(*) AS attempts,
                COALESCE(SUM(solve_time), 0) AS total_solve_time,
                MAX(solved_at) AS last_solved
         FROM analytic_events
         WHERE user_id = $1
         GROUP BY puzzle_id
         ORDER BY MAX(solved_at) DESC NULLS LAST
         LIMIT $2 OFFSET $3`,
        [userId, safeLimit, offset],
      ),
      this.pool.query(
        `SELECT COUNT(DISTINCT puzzle_id) AS total
         FROM analytic_events
         WHERE user_id = $1`,
        [userId],
      ),
    ]);

    const items: Record<string, UserPuzzleEngagement> = {};
    for (const row of pageResult.rows) {
      items[row.puzzle_id] = {
        solveCount: Number(row.solve_count),
        totalSolveTime: Number(row.total_solve_time),
        attempts: Number(row.attempts),
        lastSolved: row.last_solved ? new Date(row.last_solved) : undefined,
      };
    }

    return {
      items,
      total: Number(countResult.rows[0]?.total ?? 0),
      page: safePage,
      limit: safeLimit,
    };
  }

  /**
   * Dev/test fixture data. Inserts through the real write path (rather
   * than poking a Map directly) so seeded rows behave identically to
   * production writes. Now async since it goes through Postgres.
   */
  async seedData(): Promise<void> {
    this.logger.log('Seeding initial analytic data...');
    const seed: Array<[string, string, number]> = [
      ['user1', 'puzzleA', 120],
      ['user1', 'puzzleB', 180],
      ['user2', 'puzzleA', 150],
      ['user1', 'puzzleA', 100],
      ['user3', 'puzzleC', 200],
      ['user2', 'puzzleB', 220],
      ['user3', 'puzzleA', 90],
      ['user1', 'puzzleC', 170],
    ];
    for (const [userId, puzzleId, solveTime] of seed) {
      await this.recordPuzzleSolveAsync(userId, puzzleId, solveTime);
    }
    this.logger.log('Data seeding complete.');
  }
}
