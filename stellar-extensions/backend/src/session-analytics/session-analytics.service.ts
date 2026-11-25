import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AnalyticsPreferenceDto,
  EndSessionDto,
  PageVisitDto,
  PuzzleAttemptDto,
  StartSessionDto,
} from './dto/session-analytics.dto';
import { SessionAnalyticsPreference } from './entities/session-analytics-preference.entity';
import { SessionPageVisit } from './entities/session-page-visit.entity';
import { SessionPuzzleAttempt } from './entities/session-puzzle-attempt.entity';
import { UserSession } from './entities/user-session.entity';

export interface TrackedResult<T> {
  /** False when the user opted out of analytics — nothing was persisted. */
  tracked: boolean;
  session?: UserSession;
  data?: T;
}

export interface SessionDropOff {
  /** Last page visited before the session ended. */
  page: string | null;
  /** Last puzzle attempted but not completed, when known. */
  puzzleId: string | null;
  reason: 'page' | 'puzzle' | 'none';
}

export interface SessionSummary {
  session: UserSession;
  durationSeconds: number;
  pagesVisited: SessionPageVisit[];
  puzzlesAttempted: SessionPuzzleAttempt[];
  puzzlesCompleted: number;
  dropOffPoint: SessionDropOff;
}

export interface SessionPeriodStats {
  periodStart: Date;
  periodEnd: Date;
  totalSessions: number;
  uniqueUsers: number;
  activeSessions: number;
  completedSessions: number;
  averageDurationSeconds: number | null;
  totalPageViews: number;
  puzzlesAttempted: number;
  puzzlesCompleted: number;
  puzzleCompletionRate: number;
  /** Pages that were the last stop of the most sessions. */
  topDropOffPages: Array<{ path: string; sessions: number }>;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * User session analytics: tracks session start/end, pages visited, puzzle
 * attempts and drop-off points, and aggregates weekly/monthly stats.
 *
 * Privacy: users can opt out via `SessionAnalyticsPreference`; once opted
 * out, no session/page/puzzle rows are written for that user.
 */
@Injectable()
export class SessionAnalyticsService {
  constructor(
    @InjectRepository(UserSession)
    private readonly sessions: Repository<UserSession>,
    @InjectRepository(SessionPageVisit)
    private readonly pageVisits: Repository<SessionPageVisit>,
    @InjectRepository(SessionPuzzleAttempt)
    private readonly puzzleAttempts: Repository<SessionPuzzleAttempt>,
    @InjectRepository(SessionAnalyticsPreference)
    private readonly preferences: Repository<SessionAnalyticsPreference>,
  ) {}

  // ── preferences / opt-out ─────────────────────────────────────────────────

  async getPreference(userId: string): Promise<SessionAnalyticsPreference | null> {
    return this.preferences.findOne({ where: { userId } });
  }

  async isOptedOut(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return false;
    const pref = await this.getPreference(userId);
    return Boolean(pref?.optedOut);
  }

  async setPreference(dto: AnalyticsPreferenceDto) {
    const existing = await this.preferences.findOne({
      where: { userId: dto.userId },
    });
    const pref =
      existing ??
      this.preferences.create({ userId: dto.userId, optedOut: false });
    pref.optedOut = dto.optedOut;
    pref.optedOutAt = dto.optedOut ? new Date() : null;
    return this.preferences.save(pref);
  }

  // ── session lifecycle ─────────────────────────────────────────────────────

  /**
   * Start a session. Idempotent on `sessionKey`: a repeated start returns the
   * existing open session instead of duplicating it. Returns
   * `{ tracked: false }` when the user has opted out.
   */
  async startSession(dto: StartSessionDto): Promise<TrackedResult<UserSession>> {
    if (await this.isOptedOut(dto.userId)) {
      return { tracked: false };
    }

    if (dto.sessionKey) {
      const existing = await this.sessions.findOne({
        where: { sessionKey: dto.sessionKey },
      });
      if (existing && !existing.endedAt) {
        return { tracked: true, session: existing };
      }
    }

    const session = this.sessions.create({
      userId: dto.userId ?? null,
      sessionKey: dto.sessionKey ?? null,
      metadata: dto.metadata ?? null,
      entryPage: dto.entryPage ?? null,
      startedAt: new Date(),
      endedAt: null,
      durationSeconds: null,
      exitPage: null,
    });
    const saved = await this.sessions.save(session);
    return { tracked: true, session: saved };
  }

  /**
   * End a session and compute its duration. Accepts a client timestamp;
   * duration is clamped to >= 0 so clock skew cannot produce negatives.
   */
  async endSession(
    sessionId: string,
    dto: EndSessionDto = {},
  ): Promise<UserSession> {
    const session = await this.findSession(sessionId);
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : new Date();
    if (Number.isNaN(endedAt.getTime())) {
      throw new BadRequestException('endedAt must be a valid ISO date');
    }

    session.endedAt = endedAt;
    if (dto.exitPage) session.exitPage = dto.exitPage;
    session.durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
    );
    return this.sessions.save(session);
  }

  async getSession(sessionId: string): Promise<UserSession> {
    return this.findSession(sessionId);
  }

  async getUserSessions(
    userId: string,
    limit = 50,
  ): Promise<UserSession[]> {
    const rows = await this.sessions.find({ where: { userId } });
    return rows
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, Math.max(1, limit));
  }

  // ── events ────────────────────────────────────────────────────────────────

  async recordPageVisit(
    sessionId: string,
    dto: PageVisitDto,
  ): Promise<TrackedResult<SessionPageVisit>> {
    const session = await this.findSession(sessionId);
    this.assertOpen(session);
    if (await this.isOptedOut(session.userId)) {
      return { tracked: false };
    }

    const visit = this.pageVisits.create({
      sessionId: session.id,
      path: dto.path,
      title: dto.title ?? null,
      durationMs: dto.durationMs ?? null,
      visitedAt: dto.visitedAt ? new Date(dto.visitedAt) : new Date(),
    });
    const saved = await this.pageVisits.save(visit);
    return { tracked: true, session, data: saved };
  }

  async recordPuzzleAttempt(
    sessionId: string,
    dto: PuzzleAttemptDto,
  ): Promise<TrackedResult<SessionPuzzleAttempt>> {
    const session = await this.findSession(sessionId);
    this.assertOpen(session);
    if (await this.isOptedOut(session.userId)) {
      return { tracked: false };
    }

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
    const attempt = this.puzzleAttempts.create({
      sessionId: session.id,
      puzzleId: dto.puzzleId,
      attemptedAt: dto.attemptedAt ? new Date(dto.attemptedAt) : new Date(),
      completedAt,
      abandoned: Boolean(dto.abandoned) && !completedAt,
    });
    const saved = await this.puzzleAttempts.save(attempt);
    return { tracked: true, session, data: saved };
  }

  // ── summaries & aggregates ────────────────────────────────────────────────

  /** Full per-session breakdown including the computed drop-off point. */
  async getSessionSummary(sessionId: string): Promise<SessionSummary> {
    const session = await this.findSession(sessionId);
    const [visits, attempts] = await Promise.all([
      this.pageVisits.find({ where: { sessionId: session.id } }),
      this.puzzleAttempts.find({ where: { sessionId: session.id } }),
    ]);

    visits.sort((a, b) => a.visitedAt.getTime() - b.visitedAt.getTime());
    attempts.sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime());

    const lastVisit = visits[visits.length - 1] ?? null;
    const lastIncomplete = [...attempts]
      .reverse()
      .find((attempt) => !attempt.completedAt) ?? null;

    const dropOffPoint: SessionDropOff = lastIncomplete
      ? {
          page: lastVisit?.path ?? session.exitPage ?? null,
          puzzleId: lastIncomplete.puzzleId,
          reason: 'puzzle',
        }
      : {
          page: lastVisit?.path ?? session.exitPage ?? null,
          puzzleId: null,
          reason: lastVisit || session.exitPage ? 'page' : 'none',
        };

    return {
      session,
      durationSeconds: this.durationOf(session, new Date()),
      pagesVisited: visits,
      puzzlesAttempted: attempts,
      puzzlesCompleted: attempts.filter((a) => a.completedAt !== null).length,
      dropOffPoint,
    };
  }

  /** Aggregate stats for the trailing 7 days. */
  async getWeeklyStats(now: Date = new Date()): Promise<SessionPeriodStats> {
    return this.getPeriodStats(new Date(now.getTime() - WEEK_MS), now);
  }

  /** Aggregate stats for the trailing 30 days. */
  async getMonthlyStats(now: Date = new Date()): Promise<SessionPeriodStats> {
    return this.getPeriodStats(new Date(now.getTime() - MONTH_MS), now);
  }

  async getPeriodStats(
    startDate: Date,
    endDate: Date = new Date(),
  ): Promise<SessionPeriodStats> {
    const sessions = (await this.sessions.find()).filter((session) => {
      const started = session.startedAt.getTime();
      return started >= startDate.getTime() && started <= endDate.getTime();
    });

    const sessionIds = new Set(sessions.map((s) => s.id));
    const [allVisits, allAttempts] = await Promise.all([
      this.pageVisits.find(),
      this.puzzleAttempts.find(),
    ]);
    const visits = allVisits.filter((v) => sessionIds.has(v.sessionId));
    const attempts = allAttempts.filter((a) => sessionIds.has(a.sessionId));

    const completedSessions = sessions.filter((s) => s.endedAt !== null);
    const durations = completedSessions
      .map((s) => s.durationSeconds ?? this.durationOf(s, endDate))
      .filter((d): d is number => d !== null);

    // Drop-off pages: last visit of each session.
    const lastVisitBySession = new Map<string, SessionPageVisit>();
    for (const visit of visits) {
      const current = lastVisitBySession.get(visit.sessionId);
      if (!current || visit.visitedAt.getTime() > current.visitedAt.getTime()) {
        lastVisitBySession.set(visit.sessionId, visit);
      }
    }
    const dropOffCounts = new Map<string, number>();
    for (const visit of lastVisitBySession.values()) {
      dropOffCounts.set(visit.path, (dropOffCounts.get(visit.path) ?? 0) + 1);
    }
    const topDropOffPages = [...dropOffCounts.entries()]
      .map(([path, count]) => ({ path, sessions: count }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    const puzzlesCompleted = attempts.filter((a) => a.completedAt !== null).length;

    return {
      periodStart: startDate,
      periodEnd: endDate,
      totalSessions: sessions.length,
      uniqueUsers: new Set(
        sessions.map((s) => s.userId).filter((id): id is string => Boolean(id)),
      ).size,
      activeSessions: sessions.filter((s) => s.endedAt === null).length,
      completedSessions: completedSessions.length,
      averageDurationSeconds: durations.length
        ? Math.round(
            durations.reduce((sum, d) => sum + d, 0) / durations.length,
          )
        : null,
      totalPageViews: visits.length,
      puzzlesAttempted: attempts.length,
      puzzlesCompleted,
      puzzleCompletionRate:
        attempts.length > 0
          ? Math.round((puzzlesCompleted / attempts.length) * 100)
          : 0,
      topDropOffPages,
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async findSession(sessionId: string): Promise<UserSession> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private assertOpen(session: UserSession): void {
    if (session.endedAt) {
      throw new BadRequestException('Session has already ended');
    }
  }

  /** Duration in seconds; live sessions measure up to `now`. */
  private durationOf(session: UserSession, now: Date): number {
    const end = session.endedAt ?? now;
    return Math.max(
      0,
      Math.floor((end.getTime() - session.startedAt.getTime()) / 1000),
    );
  }
}
