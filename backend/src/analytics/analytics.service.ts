import { Injectable, Logger } from '@nestjs/common';

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

export interface UserPuzzleHistoryEntry {
  puzzleId: string;
  solveCount: number;
  totalSolveTime: number;
  attempts: number;
  lastSolved?: Date;
}

export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedUserPuzzleHistory {
  data: UserPuzzleHistoryEntry[];
  meta: PaginationMetadata;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  private puzzleStats = new Map<string, PuzzleStats>();

  private userPuzzleHistory = new Map<
    string,
    Map<string, UserPuzzleEngagement>
  >();

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
  }

  getMostSolvedPuzzles(
    limit?: number,
  ): Array<{ puzzleId: string; solveCount: number }> {
    this.logger.log('Fetching most solved puzzles...');
    const sortedPuzzles = Array.from(this.puzzleStats.entries())
      .map(([puzzleId, stats]) => ({ puzzleId, solveCount: stats.solveCount }))
      .sort((a, b) => b.solveCount - a.solveCount);
    return limit ? sortedPuzzles.slice(0, limit) : sortedPuzzles;
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

  getUserPuzzleStatsPage(
    userId: string,
    page: number = DEFAULT_PAGE,
    limit: number = DEFAULT_LIMIT,
  ): PaginatedUserPuzzleHistory {
    this.logger.log(
      `Fetching paginated puzzle history for user ${userId} (page=${page}, limit=${limit})...`,
    );

    const normalizedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const normalizedPage = Math.max(page, 1);

    const userHistory =
      this.userPuzzleHistory.get(userId) ||
      new Map<string, UserPuzzleEngagement>();

    const allEntries: UserPuzzleHistoryEntry[] = Array.from(
      userHistory.entries(),
    ).map(([puzzleId, stats]) => ({
      puzzleId,
      solveCount: stats.solveCount,
      totalSolveTime: stats.totalSolveTime,
      attempts: stats.attempts,
      lastSolved: stats.lastSolved,
    }));

    // Newest activity first; fall back to puzzleId for deterministic ordering.
    allEntries.sort((a, b) => {
      const aTime = a.lastSolved ? a.lastSolved.getTime() : 0;
      const bTime = b.lastSolved ? b.lastSolved.getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.puzzleId.localeCompare(b.puzzleId);
    });

    const total = allEntries.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / normalizedLimit);
    const startIdx = (normalizedPage - 1) * normalizedLimit;
    const data = allEntries.slice(startIdx, startIdx + normalizedLimit);

    return {
      data,
      meta: {
        total,
        page: normalizedPage,
        limit: normalizedLimit,
        totalPages,
      },
    };
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
