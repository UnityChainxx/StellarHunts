import * as fc from 'fast-check';
import { AnalyticService } from './analytic.service';

/**
 * Property-based tests for AnalyticService.
 *
 * Instead of hand-picked sample inputs, these tests exercise the aggregation
 * logic with thousands of randomly generated solve records, then verify that
 * mathematical invariants hold regardless of the specific values.
 *
 * Because AnalyticService accepts an optional ConfigService (no Redis when
 * omitted), we instantiate it directly without NestJS DI inside each property
 * run — this keeps the test fast and avoids state bleed between iterations.
 */

// ---------------------------------------------------------------------------
// Arbitraries (random-value generators)
// ---------------------------------------------------------------------------

/** A single solve event submitted to the service. */
const solveRecordArb = fc.record({
  userId: fc.uuid(),
  puzzleId: fc.uuid(),
  solveTime: fc.integer({ min: 1, max: 7200 }), // 1 s … 2 h
});

/** A batch of solves — the core random input to our properties. */
const solveBatchArb = fc.array(solveRecordArb, { minLength: 0, maxLength: 50 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a pristine service for each property invocation. */
function freshService(): AnalyticService {
  return new AnalyticService();
}

/** Count solves per puzzle across a record batch. */
function countByPuzzle(
  records: ReadonlyArray<{ puzzleId: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    counts.set(r.puzzleId, (counts.get(r.puzzleId) ?? 0) + 1);
  }
  return counts;
}

/** Sum solveTime per puzzle across a record batch. */
function sumTimeByPuzzle(
  records: ReadonlyArray<{ puzzleId: string; solveTime: number }>,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const r of records) {
    sums.set(r.puzzleId, (sums.get(r.puzzleId) ?? 0) + r.solveTime);
  }
  return sums;
}

/** Count solves per (user, puzzle) pair. */
function countByUserAndPuzzle(
  records: ReadonlyArray<{ userId: string; puzzleId: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = `${r.userId}::${r.puzzleId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Sum solveTime per (user, puzzle) pair. */
function sumTimeByUserAndPuzzle(
  records: ReadonlyArray<{
    userId: string;
    puzzleId: string;
    solveTime: number;
  }>,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const r of records) {
    const key = `${r.userId}::${r.puzzleId}`;
    sums.set(key, (sums.get(key) ?? 0) + r.solveTime);
  }
  return sums;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('AnalyticService — property-based', () => {
  // ── Aggregation: solveCount ──────────────────────────────────────────
  it('solveCount equals the number of records per puzzle', async () => {
    await fc.assert(
      fc.asyncProperty(solveBatchArb, async (records) => {
        const svc = freshService();
        for (const r of records) {
          await svc.recordPuzzleSolveAsync(r.userId, r.puzzleId, r.solveTime);
        }
        const expected = countByPuzzle(records);
        const solved = await svc.getMostSolvedPuzzlesAsync();

        expect(solved.length).toBe(expected.size);
        for (const { puzzleId, solveCount } of solved) {
          expect(solveCount).toBe(expected.get(puzzleId)!);
        }
      }),
    );
  });

  // ── Aggregation: solveCount via sync API ────────────────────────────
  it('sync recordPuzzleSolve agrees with async variant on solveCount', async () => {
    await fc.assert(
      fc.asyncProperty(solveBatchArb, async (records) => {
        const svc = freshService();
        for (const r of records) {
          svc.recordPuzzleSolve(r.userId, r.puzzleId, r.solveTime);
        }
        const expected = countByPuzzle(records);
        const solved = await svc.getMostSolvedPuzzlesAsync();

        expect(solved.length).toBe(expected.size);
        for (const { puzzleId, solveCount } of solved) {
          expect(solveCount).toBe(expected.get(puzzleId)!);
        }
      }),
    );
  });

  // ── Aggregation: totalSolveTime ─────────────────────────────────────
  it('totalSolveTime equals the sum of solveTime per puzzle', async () => {
    await fc.assert(
      fc.asyncProperty(solveBatchArb, async (records) => {
        const svc = freshService();
        for (const r of records) {
          await svc.recordPuzzleSolveAsync(r.userId, r.puzzleId, r.solveTime);
        }
        const expectedSums = sumTimeByPuzzle(records);

        // Verify average solve time implies correct total
        for (const [puzzleId, totalTime] of expectedSums) {
          const count = countByPuzzle(records).get(puzzleId)!;
          const avg = await svc.getAverageSolveTimeAsync(puzzleId);
          expect(avg).toBe(count > 0 ? totalTime / count : 0);
        }
      }),
    );
  });

  // ── Unknown puzzle returns 0 average ─────────────────────────────────
  it('average solve time for an unknown puzzle is 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // puzzle id that was never recorded
        fc.array(solveRecordArb, { maxLength: 10 }),
        async (unknownId, records) => {
          const svc = freshService();
          for (const r of records) {
            await svc.recordPuzzleSolveAsync(r.userId, r.puzzleId, r.solveTime);
          }
          await expect(svc.getAverageSolveTimeAsync(unknownId)).resolves.toBe(
            0,
          );
        },
      ),
    );
  });

  // ── Ordering invariant ──────────────────────────────────────────────
  it('getMostSolvedPuzzles returns results sorted descending by solveCount', async () => {
    await fc.assert(
      fc.asyncProperty(solveBatchArb, async (records) => {
        const svc = freshService();
        for (const r of records) {
          await svc.recordPuzzleSolveAsync(r.userId, r.puzzleId, r.solveTime);
        }
        const solved = await svc.getMostSolvedPuzzlesAsync();
        for (let i = 1; i < solved.length; i++) {
          expect(solved[i - 1].solveCount).toBeGreaterThanOrEqual(
            solved[i].solveCount,
          );
        }
      }),
    );
  });

  // ── Limit invariant ─────────────────────────────────────────────────
  it('getMostSolvedPuzzles with limit returns at most that many entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        solveBatchArb,
        fc.integer({ min: 0, max: 20 }),
        async (records, limit) => {
          const svc = freshService();
          for (const r of records) {
            await svc.recordPuzzleSolveAsync(r.userId, r.puzzleId, r.solveTime);
          }
          const solved = await svc.getMostSolvedPuzzlesAsync(limit);
          expect(solved.length).toBeLessThanOrEqual(limit);
          expect(solved.length).toBeLessThanOrEqual(
            countByPuzzle(records).size,
          );
        },
      ),
    );
  });

  // ── User-level engagement mirrors puzzle-level aggregates ───────────
  it('user puzzle stats reflect per-user aggregates', async () => {
    await fc.assert(
      fc.asyncProperty(solveBatchArb, async (records) => {
        const svc = freshService();
        for (const r of records) {
          await svc.recordPuzzleSolveAsync(r.userId, r.puzzleId, r.solveTime);
        }

        const userPuzzleCounts = countByUserAndPuzzle(records);
        const userPuzzleSums = sumTimeByUserAndPuzzle(records);

        // Check every unique user
        const userIds = [...new Set(records.map((r) => r.userId))];
        for (const uid of userIds) {
          const history = await svc.getUserPuzzleStatsAsync(uid);
          for (const [puzzleId, engagement] of history) {
            const key = `${uid}::${puzzleId}`;
            expect(engagement.solveCount).toBe(userPuzzleCounts.get(key)!);
            expect(engagement.totalSolveTime).toBe(userPuzzleSums.get(key)!);
            expect(engagement.attempts).toBe(engagement.solveCount); // attempts === solveCount in this service
            if (engagement.solveCount > 0) {
              expect(engagement.lastSolved).toBeInstanceOf(Date);
            }
          }
        }
      }),
    );
  });

  // ── Empty records produce empty results ────────────────────────────
  it('no recordings yields empty puzzle list and zero averages', async () => {
    const svc = freshService();
    const solved = await svc.getMostSolvedPuzzlesAsync();
    expect(solved).toEqual([]);
    await expect(svc.getAverageSolveTimeAsync('any')).resolves.toBe(0);
    const userStats = await svc.getUserPuzzleStatsAsync('nobody');
    expect(userStats.size).toBe(0);
  });

  // ── Aggregation is additive (prefix property) ───────────────────────
  it('aggregation after concatenating two batches equals the sum of their parts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(solveRecordArb, { maxLength: 20 }),
        fc.array(solveRecordArb, { maxLength: 20 }),
        async (batchA, batchB) => {
          const combined = [...batchA, ...batchB];

          // Service that receives both batches
          const svcCombined = freshService();
          for (const r of combined) {
            await svc.recordPuzzleSolveAsync(r.userId, r.puzzleId, r.solveTime);
          }
          const solvedCombined = await svcCombined.getMostSolvedPuzzlesAsync();

          // Expected counts
          const expected = countByPuzzle(combined);
          expect(solvedCombined.length).toBe(expected.size);
          for (const { puzzleId, solveCount } of solvedCombined) {
            expect(solveCount).toBe(expected.get(puzzleId)!);
          }
        },
      ),
    );
  });

  // ── No side-effects from read operations ────────────────────────────
  it('read operations do not mutate recorded state', async () => {
    const svc = freshService();
    // Record a known solve
    await svc.recordPuzzleSolveAsync('user-read-test', 'puzzle-read-test', 100);

    const before = await svc.getMostSolvedPuzzlesAsync();

    // Perform several reads
    for (let i = 0; i < 5; i++) {
      await svc.getMostSolvedPuzzlesAsync();
      await svc.getAverageSolveTimeAsync('puzzle-read-test');
      await svc.getUserPuzzleStatsAsync('user-read-test');
    }

    const after = await svc.getMostSolvedPuzzlesAsync();
    expect(after).toEqual(before);
  });
});
