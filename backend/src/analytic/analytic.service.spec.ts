import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticService } from './analytic.service';
import { PG_POOL } from './database/postgres.provider';

// Provide a no-op CacheService so Nest's reflection-based DI can resolve
// the (optional) constructor parameter introduced in #107.
const NOOP_CACHE = {
  getOrSet: async (
    _key: string,
    _ttl: number,
    loader: () => Promise<unknown>,
  ) => loader(),
  invalidate: async () => undefined,
  inflightCount: () => 0,
};

describe('AnalyticService', () => {
  let service: AnalyticService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticService,
        { provide: 'CacheService', useValue: NOOP_CACHE },
        { provide: PG_POOL, useValue: undefined },
      ],
    }).compile();

    service = module.get<AnalyticService>(AnalyticService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('in-memory fallback (no REDIS_URL)', () => {
    it('records solves to the in-memory mirror and aggregates correctly', async () => {
      await service.recordPuzzleSolveAsync('u1', 'pA', 100);
      await service.recordPuzzleSolveAsync('u1', 'pA', 200);
      await service.recordPuzzleSolveAsync('u2', 'pB', 50);

      const sorted = await service.getMostSolvedPuzzlesAsync();
      expect(sorted).toEqual([
        { puzzleId: 'pA', solveCount: 2 },
        { puzzleId: 'pB', solveCount: 1 },
      ]);

      await expect(service.getAverageSolveTimeAsync('pA')).resolves.toBe(150);
      await expect(service.getAverageSolveTimeAsync('pB')).resolves.toBe(50);
      await expect(service.getAverageSolveTimeAsync('unknown')).resolves.toBe(
        0,
      );

      const u1History = await service.getUserPuzzleStatsAsync('u1');
      expect(u1History.get('pA')).toMatchObject({
        solveCount: 2,
        totalSolveTime: 300,
        attempts: 2,
      });
      expect(u1History.get('pA')?.lastSolved).toBeInstanceOf(Date);
    });

    it('records every solve exactly once (no double-increment in mirror)', async () => {
      await service.recordPuzzleSolveAsync('u1', 'pA', 100);
      await service.recordPuzzleSolve('u1', 'pA', 100);
      const sorted = await service.getMostSolvedPuzzlesAsync();
      expect(sorted).toEqual([{ puzzleId: 'pA', solveCount: 2 }]);
    });

    it('purges expired events in bounded batches while preserving recent events', async () => {
      // Inject events: one recent, two older than 90 days
      const now = Date.now();
      const oldDate = new Date(now - 95 * 24 * 60 * 60 * 1000);
      const recentDate = new Date(now - 10 * 24 * 60 * 60 * 1000);

      (service as any).memoryEvents.push(
        { userId: 'uOld1', puzzleId: 'pOld', solveTime: 50, solvedAt: oldDate },
        { userId: 'uOld2', puzzleId: 'pOld', solveTime: 60, solvedAt: oldDate },
        { userId: 'uRecent', puzzleId: 'pRecent', solveTime: 70, solvedAt: recentDate },
      );

      const result = await service.cleanupExpiredEvents(90, 500, 2);
      expect(result.deletedRows).toBe(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Recent event remains intact
      const recentStats = await service.getUserPuzzleStatsAsync('uRecent');
      expect(recentStats.has('pRecent')).toBe(true);

      // Old events were purged
      const oldStats = await service.getUserPuzzleStatsAsync('uOld1');
      expect(oldStats.has('pOld')).toBe(false);
    });
  });

  describe('Postgres bounded batch deletion', () => {
    it('executes bounded batch query with FOR UPDATE SKIP LOCKED', async () => {
      const mockPool = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rowCount: 5, rows: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] })
          .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      };

      const pgService = new AnalyticService(mockPool as any);
      const result = await pgService.cleanupExpiredEvents(90, 5, 2);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        expect.any(Array),
      );
      expect(result.deletedRows).toBe(5);
      expect(result.batches).toBe(1);
    });
  });
});
