import { Injectable, Logger, Optional } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

interface PuzzleStats {
  solveCount: number;
  totalSolveTime: number;
  attempts: number;
}

interface UserPuzzleEngagement {
  solveCount: number;
  totalSolveTime: number;
  attempts: number;
  lastSolved?: Date;
}

// Most-solved rankings change very slowly outside of new solves, so we
// cache them with a 5-minute TTL. 0-15s jitter avoids expiration
// thundering herds at 1000 RPS (#107).
const MOST_SOLVED_TTL_SECONDS = 300;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  private puzzleStats = new Map<string, PuzzleStats>();

  private userPuzzleHistory = new Map<
    string,
    Map<string, UserPuzzleEngagement>
  >();

  // Optional so the existing unit-test (which constructs `new AnalyticsService()`)
  // does not have to change. When wired through `AnalyticsModule` (see
  // analytics.module.ts) Redis-backed caching kicks in automatically (#107).
  constructor(@Optional() private readonly cacheService?: CacheService) {}

  /**
   * Best-effort cache invalidation of every `most-solved` key we know
   * about. Limit-specific keys (`:limit:5`, `:limit:10`, ...) age out
   * naturally via TTL. We delete the most-common variants eagerly so
   * users see their solve reflected on the next read instead of after
   * the 5-minute TTL expires (#107).
   */
  private async invalidateMostSolvedCache(): Promise<void> {
    if (!this.cacheService) return;
    const commonLimits = ['all', '5', '10', '20', '25', '50'];
    await this.cacheService.invalidate(
      ...commonLimits.map((l) => `analytics:puzzles:most-solved:limit:${l}`),
    );
  }

  recordPuzzleSolve(userId: string, puzzleId: string, solveTime: number): void {
    this.logger.log(
      `Recording solve: User ${userId}, Puzzle ${puzzleId}, Time ${solveTime}`,
    );

    let currentPuzzleStats = this.puzzleStats.get(puzzleId);
    if (!currentPuzzleStats) {
      currentPuzzleStats = { solveCount: 0, totalSolveTime: 0, attempts: 0 };
    }
    currentPuzzleStats.solveCount++;
    currentPuzzleStats.totalSolveTime += solveTime;
    currentPuzzleStats.attempts++;
    this.puzzleStats.set(puzzleId, currentPuzzleStats);

    let currentUserPuzzles = this.userPuzzleHistory.get(userId);
    if (!currentUserPuzzles) {
      currentUserPuzzles = new Map<string, UserPuzzleEngagement>();
      this.userPuzzleHistory.set(userId, currentUserPuzzles);
    }

    let currentUserPuzzleStats = currentUserPuzzles.get(puzzleId);
    if (!currentUserPuzzleStats) {
      currentUserPuzzleStats = {
        solveCount: 0,
        totalSolveTime: 0,
        attempts: 0,
      };
    }
    currentUserPuzzleStats.solveCount++;
    currentUserPuzzleStats.totalSolveTime += solveTime;
    currentUserPuzzleStats.attempts++;
    currentUserPuzzleStats.lastSolved = new Date();
    currentUserPuzzles.set(puzzleId, currentUserPuzzleStats);

    this.logger.log(
      `Updated puzzle stats for ${puzzleId}: ${JSON.stringify(currentPuzzleStats)}`,
    );
    this.logger.log(
      `Updated user ${userId} puzzle history for ${puzzleId}: ${JSON.stringify(currentUserPuzzleStats)}`,
    );

    // Fire-and-forget — we don't want to block the caller on cache I/O.
    void this.invalidateMostSolvedCache();
  }

  getMostSolvedPuzzles(
    limit?: number,
  ): Promise<Array<{ puzzleId: string; solveCount: number }>> {
    this.logger.log('Fetching most solved puzzles...');
    const compute = async (): Promise<Array<{ puzzleId: string; solveCount: number }>> => {
      const sortedPuzzles = Array.from(this.puzzleStats.entries())
        .map(([puzzleId, stats]) => ({ puzzleId, solveCount: stats.solveCount }))
        .sort((a, b) => b.solveCount - a.solveCount);
      return limit ? sortedPuzzles.slice(0, limit) : sortedPuzzles;
    };

    // Skip the cache for the first call (still-empty stats) so we don't
    // freeze a TTL window over nothing — the next request would otherwise
    // serve stale zeros (#107). After the first recordPuzzleSolve arrives,
    // these calls go through Redis + single-flight as designed.
    if (!this.puzzleStats.size) {
      return compute();
    }

    if (this.cacheService) {
      const key = `analytics:puzzles:most-solved:limit:${limit ?? 'all'}`;
      return this.cacheService.getOrSet(key, MOST_SOLVED_TTL_SECONDS, compute, 15);
    }
    return compute();
  }

  getAverageSolveTime(puzzleId: string): number {
    this.logger.log(`Fetching average solve time for puzzle ${puzzleId}...`);
    const stats = this.puzzleStats.get(puzzleId);
    if (stats && stats.solveCount > 0) {
      return stats.totalSolveTime / stats.solveCount;
    }
    return 0;
  }

  getUserPuzzleStats(userId: string): Map<string, UserPuzzleEngagement> {
    this.logger.log(`Fetching puzzle history for user ${userId}...`);
    return (
      this.userPuzzleHistory.get(userId) ||
      new Map<string, UserPuzzleEngagement>()
    );
  }

  seedData(): void {
    this.logger.log('Seeding initial analytics data...');
    this.recordPuzzleSolve('user1', 'puzzleA', 120);
    this.recordPuzzleSolve('user1', 'puzzleB', 180);
    this.recordPuzzleSolve('user2', 'puzzleA', 150);
    this.recordPuzzleSolve('user1', 'puzzleA', 100);
    this.recordPuzzleSolve('user3', 'puzzleC', 200);
    this.recordPuzzleSolve('user2', 'puzzleB', 220);
    this.recordPuzzleSolve('user3', 'puzzleA', 90);
    this.recordPuzzleSolve('user1', 'puzzleC', 170);
    this.logger.log('Data seeding complete.');
  }
}
