import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SessionAnalyticsService } from './session-analytics.service';
import { SessionAnalyticsPreference } from './entities/session-analytics-preference.entity';
import { SessionPageVisit } from './entities/session-page-visit.entity';
import { SessionPuzzleAttempt } from './entities/session-puzzle-attempt.entity';
import { UserSession } from './entities/user-session.entity';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

type Where<T> = Partial<Record<keyof T, unknown>>;

interface FindOptions<T> {
  where?: Where<T> | Where<T>[];
  order?: Partial<Record<keyof T, 'ASC' | 'DESC'>>;
}

/** Minimal in-memory stand-in for the TypeORM repositories used here. */
class InMemoryRepository<T extends Record<string, any>> {
  readonly rows: T[] = [];

  constructor(private readonly defaults: Partial<T> = {}) {}

  create(data: Partial<T>): T {
    return { createdAt: new Date(), ...this.defaults, ...data } as unknown as T;
  }

  async save(entity: T): Promise<T> {
    const stored = { ...entity } as T & { id?: string };
    if (!stored.id) stored.id = randomUUID();
    const index = this.rows.findIndex((row) => row.id === stored.id);
    if (index === -1) this.rows.push(stored);
    else this.rows[index] = stored;
    return { ...stored };
  }

  async findOne(options: FindOptions<T> = {}): Promise<T | null> {
    const row = this.rows.find((candidate) =>
      this.matches(candidate, options.where),
    );
    return row ? { ...row } : null;
  }

  async find(options: FindOptions<T> = {}): Promise<T[]> {
    let rows = this.rows.filter((row) => this.matches(row, options.where));
    const [field, direction] = Object.entries(options.order ?? {})[0] ?? [];
    if (field && direction) {
      rows = [...rows].sort((a, b) => {
        const left = a[field] instanceof Date ? a[field].getTime() : a[field];
        const right = b[field] instanceof Date ? b[field].getTime() : b[field];
        const order = left === right ? 0 : left > right ? 1 : -1;
        return direction === 'DESC' ? -order : order;
      });
    }
    return rows.map((row) => ({ ...row }));
  }

  private matches(row: T, where?: Where<T> | Where<T>[]): boolean {
    if (!where) return true;
    const clauses = Array.isArray(where) ? where : [where];
    return clauses.some((clause) =>
      Object.entries(clause).every(([field, value]) => row[field] === value),
    );
  }
}

function createService() {
  const sessions = new InMemoryRepository<UserSession>({
    endedAt: null,
    durationSeconds: null,
  });
  const pageVisits = new InMemoryRepository<SessionPageVisit>();
  const puzzleAttempts = new InMemoryRepository<SessionPuzzleAttempt>({
    completedAt: null,
    abandoned: false,
  });
  const preferences = new InMemoryRepository<SessionAnalyticsPreference>({
    optedOut: false,
    optedOutAt: null,
  });

  const service = new SessionAnalyticsService(
    sessions as never,
    pageVisits as never,
    puzzleAttempts as never,
    preferences as never,
  );

  return { service, sessions, pageVisits, puzzleAttempts, preferences };
}

const USER = '9b1d2f3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const PUZZLE = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('SessionAnalyticsService', () => {
  describe('session lifecycle', () => {
    it('starts a session with timestamps and returns it tracked', async () => {
      const { service, sessions } = createService();

      const result = await service.startSession({ userId: USER });

      expect(result.tracked).toBe(true);
      expect(result.session?.userId).toBe(USER);
      expect(result.session?.startedAt).toBeInstanceOf(Date);
      expect(result.session?.endedAt).toBeNull();
      expect(sessions.rows).toHaveLength(1);
    });

    it('is idempotent on sessionKey — repeated starts reuse the open session', async () => {
      const { service, sessions } = createService();

      const first = await service.startSession({ userId: USER, sessionKey: 'k1' });
      const second = await service.startSession({ userId: USER, sessionKey: 'k1' });

      expect(second.session?.id).toBe(first.session?.id);
      expect(sessions.rows).toHaveLength(1);
    });

    it('ends a session and computes its duration', async () => {
      const { service, sessions } = createService();
      const { session } = (await service.startSession({ userId: USER })) as {
        session: UserSession;
      };
      // Repositories return copies — patch the stored row directly.
      sessions.rows.find((row) => row.id === session.id)!.startedAt = new Date(
        Date.now() - 90_000,
      );

      const ended = await service.endSession(session.id, {
        endedAt: new Date().toISOString(),
      });

      expect(ended.endedAt).toBeInstanceOf(Date);
      expect(ended.durationSeconds).toBeGreaterThanOrEqual(89);
    });

    it('rejects ending an unknown session', async () => {
      const { service } = createService();
      await expect(service.endSession(randomUUID())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('page and puzzle tracking', () => {
    it('records page visits in order', async () => {
      const { service } = createService();
      const { session } = (await service.startSession({ userId: USER })) as {
        session: UserSession;
      };

      const t0 = Date.now();
      await service.recordPageVisit(session.id, {
        path: '/puzzles',
        visitedAt: new Date(t0).toISOString(),
      });
      await service.recordPageVisit(session.id, {
        path: '/puzzles/abc',
        visitedAt: new Date(t0 + 1000).toISOString(),
      });

      const summary = await service.getSessionSummary(session.id);
      expect(summary.pagesVisited.map((v) => v.path)).toEqual([
        '/puzzles',
        '/puzzles/abc',
      ]);
    });

    it('records puzzle attempts with completion state', async () => {
      const { service } = createService();
      const { session } = (await service.startSession({ userId: USER })) as {
        session: UserSession;
      };

      await service.recordPuzzleAttempt(session.id, {
        puzzleId: PUZZLE,
        completedAt: new Date().toISOString(),
      });
      await service.recordPuzzleAttempt(session.id, {
        puzzleId: randomUUID(),
        abandoned: true,
      });

      const summary = await service.getSessionSummary(session.id);
      expect(summary.puzzlesAttempted).toHaveLength(2);
      expect(summary.puzzlesCompleted).toBe(1);
    });

    it('rejects events for ended sessions', async () => {
      const { service } = createService();
      const { session } = (await service.startSession({ userId: USER })) as {
        session: UserSession;
      };
      await service.endSession(session.id);

      await expect(
        service.recordPageVisit(session.id, { path: '/x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('drop-off detection', () => {
    it('identifies the last page and unfinished puzzle as the drop-off point', async () => {
      const { service } = createService();
      const { session } = (await service.startSession({ userId: USER })) as {
        session: UserSession;
      };

      await service.recordPageVisit(session.id, { path: '/puzzles' });
      await service.recordPuzzleAttempt(session.id, { puzzleId: PUZZLE });
      await service.recordPageVisit(session.id, { path: `/puzzles/${PUZZLE}` });
      await service.endSession(session.id, { exitPage: `/puzzles/${PUZZLE}` });

      const summary = await service.getSessionSummary(session.id);
      expect(summary.dropOffPoint).toEqual({
        page: `/puzzles/${PUZZLE}`,
        puzzleId: PUZZLE,
        reason: 'puzzle',
      });
    });

    it('falls back to the last visited page when no puzzle was attempted', async () => {
      const { service } = createService();
      const { session } = (await service.startSession({ userId: USER })) as {
        session: UserSession;
      };
      await service.recordPageVisit(session.id, { path: '/leaderboard' });

      const summary = await service.getSessionSummary(session.id);
      expect(summary.dropOffPoint).toEqual({
        page: '/leaderboard',
        puzzleId: null,
        reason: 'page',
      });
    });
  });

  describe('weekly and monthly aggregates', () => {
    it('aggregates session counts, durations and drop-off pages', async () => {
      const { service, sessions } = createService();
      const now = new Date();

      for (const path of ['/puzzles', '/puzzles', '/shop']) {
        const { session } = (await service.startSession({ userId: USER })) as {
          session: UserSession;
        };
        sessions.rows.find((row) => row.id === session.id)!.startedAt =
          new Date(now.getTime() - 60_000);
        await service.recordPageVisit(session.id, { path });
        await service.endSession(session.id);
      }

      const weekly = await service.getWeeklyStats(now);
      const monthly = await service.getMonthlyStats(now);

      for (const stats of [weekly, monthly]) {
        expect(stats.totalSessions).toBe(3);
        expect(stats.uniqueUsers).toBe(1);
        expect(stats.completedSessions).toBe(3);
        expect(stats.totalPageViews).toBe(3);
        expect(stats.averageDurationSeconds).not.toBeNull();
        expect(stats.topDropOffPages[0]).toEqual({ path: '/puzzles', sessions: 2 });
      }
    });

    it('excludes sessions outside the period', async () => {
      const { service, sessions } = createService();
      const now = new Date();

      const { session: recent } = (await service.startSession({ userId: USER })) as {
        session: UserSession;
      };
      sessions.rows.find((row) => row.id === recent.id)!.startedAt = new Date(
        now.getTime() - 24 * 60 * 60 * 1000,
      );

      sessions.rows.push({
        ...recent,
        id: randomUUID(),
        startedAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
      } as UserSession);

      const weekly = await service.getWeeklyStats(now);
      const monthly = await service.getMonthlyStats(now);
      expect(weekly.totalSessions).toBe(1);
      expect(monthly.totalSessions).toBe(1);
    });
  });

  describe('privacy opt-out', () => {
    it('does not persist sessions for opted-out users', async () => {
      const { service, sessions } = createService();
      await service.setPreference({ userId: USER, optedOut: true });

      const result = await service.startSession({ userId: USER });

      expect(result.tracked).toBe(false);
      expect(result.session).toBeUndefined();
      expect(sessions.rows).toHaveLength(0);
    });

    it('drops page and puzzle events for opted-out users', async () => {
      const { service, pageVisits, puzzleAttempts } = createService();
      const { session } = (await service.startSession({ userId: USER })) as {
        session: UserSession;
      };

      await service.setPreference({ userId: USER, optedOut: true });

      const visit = await service.recordPageVisit(session.id, { path: '/x' });
      const attempt = await service.recordPuzzleAttempt(session.id, {
        puzzleId: PUZZLE,
      });

      expect(visit.tracked).toBe(false);
      expect(attempt.tracked).toBe(false);
      expect(pageVisits.rows).toHaveLength(0);
      expect(puzzleAttempts.rows).toHaveLength(0);
    });

    it('resumes tracking when the user opts back in', async () => {
      const { service } = createService();
      await service.setPreference({ userId: USER, optedOut: true });
      await service.setPreference({ userId: USER, optedOut: false });

      const result = await service.startSession({ userId: USER });
      expect(result.tracked).toBe(true);
      expect(result.session).toBeDefined();
    });
  });
});
