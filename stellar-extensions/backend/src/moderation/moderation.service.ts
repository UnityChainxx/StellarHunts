import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AssignModeratorDto } from './dto/assign-moderator.dto';
import { QueryModerationQueueDto } from './dto/query-moderation-queue.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { SubmitPuzzleDto } from './dto/submit-puzzle.dto';
import { ModerationCheckLog } from './entities/moderation-check-log.entity';
import { ModerationDecision } from './entities/moderation-decision.entity';
import {
  ModerationAction,
  ModerationPriority,
  ModerationQueueItem,
  ModerationStatus,
  PRIORITY_WEIGHT,
  SLA_HOURS,
} from './entities/moderation-queue-item.entity';

export interface AutomatedCheckResult {
  check: 'profanity' | 'spam';
  passed: boolean;
  /** Risk score from 0 (clean) to 1 (very likely abusive). */
  score: number;
  findings: string[];
}

export interface ModerationQueueView {
  id: string;
  puzzleId: string;
  submittedBy: string;
  title: string;
  status: ModerationStatus;
  priority: ModerationPriority;
  automatedRiskScore: number;
  assignedModeratorId: string | null;
  assignedAt: Date | null;
  slaDeadline: Date;
  decidedAt: Date | null;
  createdAt: Date;
  slaBreached: boolean;
  minutesUntilSla: number;
  minutesWaiting: number;
}

export interface SlaReport {
  total: number;
  pending: number;
  inReview: number;
  breachedSla: number;
  dueSoon: number;
  averageReviewMinutes: number | null;
  longestWaitingMinutes: number;
  byPriority: Record<ModerationPriority, number>;
}

export interface ModerationDecisionResult {
  item: ModerationQueueItem;
  decision: ModerationDecision;
}

const PROFANITY = [
  'asshole',
  'bastard',
  'bitch',
  'bullshit',
  'damn',
  'fuck',
  'shit',
  'slut',
  'whore',
];

const SPAM_PHRASES = [
  'click here',
  'buy now',
  'free money',
  'earn crypto fast',
  'subscribe to my',
  'work from home',
];

const LEETSPEAK: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

const DECISION_STATUS: Record<ModerationAction, ModerationStatus> = {
  [ModerationAction.APPROVE]: ModerationStatus.APPROVED,
  [ModerationAction.REJECT]: ModerationStatus.REJECTED,
  [ModerationAction.REQUEST_CHANGES]: ModerationStatus.CHANGES_REQUESTED,
};

const DECIDED_STATUSES = new Set<ModerationStatus>([
  ModerationStatus.APPROVED,
  ModerationStatus.REJECTED,
  ModerationStatus.CHANGES_REQUESTED,
]);

/** Decisions that let the submitter revise and re-enter the queue. */
const RESUBMITTABLE_STATUSES = new Set<ModerationStatus>([
  ModerationStatus.REJECTED,
  ModerationStatus.CHANGES_REQUESTED,
]);

const MINUTE_MS = 60_000;
const DUE_SOON_MS = 2 * 60 * MINUTE_MS;

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(ModerationQueueItem)
    private readonly queue: Repository<ModerationQueueItem>,
    @InjectRepository(ModerationCheckLog)
    private readonly checkLogs: Repository<ModerationCheckLog>,
    @InjectRepository(ModerationDecision)
    private readonly decisions: Repository<ModerationDecision>,
  ) {}

  // ── automated checks ───────────────────────────────────────────────────────

  /**
   * Run every automated check against the submitted text. Exposed separately
   * so moderators can preview results and tests can exercise the heuristics.
   */
  runAutomatedChecks(title: string, description: string): AutomatedCheckResult[] {
    const text = `${title}\n${description}`;
    return [this.checkProfanity(text), this.checkSpam(text)];
  }

  private checkProfanity(text: string): AutomatedCheckResult {
    const normalized = text
      .toLowerCase()
      .replace(/[013457@$]/g, (character) => LEETSPEAK[character] ?? character);
    const words = new Set(normalized.match(/[a-z]+/g) ?? []);
    const flagged = PROFANITY.filter((word) => words.has(word));

    return {
      check: 'profanity',
      passed: flagged.length === 0,
      score: flagged.length ? Math.min(1, 0.5 + 0.25 * (flagged.length - 1)) : 0,
      findings: flagged.map((word) => `profanity:${word}`),
    };
  }

  private checkSpam(text: string): AutomatedCheckResult {
    const findings: string[] = [];
    let score = 0;

    const links = (text.match(/https?:\/\/|www\./gi) ?? []).length;
    if (links > 2) {
      findings.push(`too many links (${links})`);
      score += 0.4;
    } else if (links === 2) {
      score += 0.15;
    }

    if (/(.)\1{5,}/.test(text)) {
      findings.push('excessive repeated characters');
      score += 0.3;
    }

    const letters = text.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 20) {
      const capitals = text.replace(/[^A-Z]/g, '').length;
      if (capitals / letters.length > 0.7) {
        findings.push('shouting (mostly uppercase)');
        score += 0.3;
      }
    }

    const lower = text.toLowerCase();
    const phrases = SPAM_PHRASES.filter((phrase) => lower.includes(phrase));
    if (phrases.length) {
      findings.push(`spam phrases: ${phrases.join(', ')}`);
      score += 0.5;
    }

    return {
      check: 'spam',
      passed: findings.length === 0,
      score: Math.min(1, score),
      findings,
    };
  }

  // ── queue ──────────────────────────────────────────────────────────────────

  async submit(
    dto: SubmitPuzzleDto,
    submittedBy: string,
    now: Date = new Date(),
  ): Promise<ModerationQueueItem> {
    const existing = await this.queue.findOne({
      where: { puzzleId: dto.puzzleId },
    });
    if (existing && !RESUBMITTABLE_STATUSES.has(existing.status)) {
      throw new ConflictException(
        'This puzzle has already been submitted for moderation',
      );
    }

    const checks = this.runAutomatedChecks(dto.title, dto.description);
    const riskScore = Math.max(...checks.map((check) => check.score));
    const priority = this.derivePriority(dto.priority, riskScore);

    // A rejected / changes-requested puzzle re-enters the queue as a fresh
    // review cycle, keeping the previous decisions in the audit history.
    const item =
      existing ?? this.queue.create({ puzzleId: dto.puzzleId, submittedBy });

    Object.assign(item, {
      submittedBy,
      title: dto.title,
      description: dto.description,
      status: ModerationStatus.PENDING,
      priority,
      automatedRiskScore: riskScore,
      assignedModeratorId: null,
      assignedAt: null,
      slaDeadline: this.deadlineFor(priority, now),
      decidedAt: null,
      decisionReason: null,
      reviewDurationMinutes: null,
    });
    const saved = await this.queue.save(item);

    // Persist the automated checks per puzzle for auditing.
    for (const check of checks) {
      await this.checkLogs.save(
        this.checkLogs.create({
          queueItemId: saved.id,
          puzzleId: saved.puzzleId,
          checkType: check.check,
          passed: check.passed,
          score: check.score,
          findings: check.findings,
        }),
      );
    }

    return saved;
  }

  async listQueue(
    query: QueryModerationQueueDto = {},
    now: Date = new Date(),
  ): Promise<ModerationQueueView[]> {
    const where: FindOptionsWhere<ModerationQueueItem> = {};
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.moderatorId) where.assignedModeratorId = query.moderatorId;

    const items = await this.queue.find({ where });
    return items
      .sort(
        (a, b) =>
          PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((item) => this.toView(item, now));
  }

  async assign(
    itemId: string,
    dto: AssignModeratorDto,
    now: Date = new Date(),
  ): Promise<ModerationQueueItem> {
    const item = await this.findItem(itemId);
    if (DECIDED_STATUSES.has(item.status)) {
      throw new BadRequestException('This puzzle has already been decided');
    }

    item.assignedModeratorId = dto.moderatorId;
    if (!item.assignedAt) item.assignedAt = now;
    if (item.status === ModerationStatus.PENDING) {
      item.status = ModerationStatus.IN_REVIEW;
    }
    return this.queue.save(item);
  }

  async review(
    itemId: string,
    moderatorId: string,
    dto: ReviewDecisionDto,
    now: Date = new Date(),
  ): Promise<ModerationDecisionResult> {
    const item = await this.findItem(itemId);

    if (DECIDED_STATUSES.has(item.status)) {
      throw new ConflictException('This puzzle has already been decided');
    }
    if (item.assignedModeratorId && item.assignedModeratorId !== moderatorId) {
      throw new ForbiddenException(
        'This puzzle is assigned to another moderator',
      );
    }
    if (
      dto.action !== ModerationAction.APPROVE &&
      !dto.reason?.trim()
    ) {
      throw new BadRequestException(
        'A reason is required when rejecting or requesting changes',
      );
    }

    const fromStatus = item.status;
    const toStatus = DECISION_STATUS[dto.action];
    const reviewDurationMinutes = Math.max(
      0,
      Math.round((now.getTime() - item.createdAt.getTime()) / MINUTE_MS),
    );

    item.status = toStatus;
    item.decidedAt = now;
    item.decisionReason = dto.reason?.trim() || null;
    item.reviewDurationMinutes = reviewDurationMinutes;
    if (!item.assignedModeratorId) {
      item.assignedModeratorId = moderatorId;
      item.assignedAt = now;
    }

    const saved = await this.queue.save(item);
    const decision = await this.decisions.save(
      this.decisions.create({
        queueItemId: saved.id,
        puzzleId: saved.puzzleId,
        moderatorId,
        action: dto.action,
        fromStatus,
        toStatus,
        reason: dto.reason?.trim() || null,
        reviewDurationMinutes,
      }),
    );

    return { item: saved, decision };
  }

  // ── lookups & reporting ────────────────────────────────────────────────────

  async getChecks(puzzleId: string): Promise<ModerationCheckLog[]> {
    const logs = await this.checkLogs.find({ where: { puzzleId } });
    return logs.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async getDecisionHistory(itemId: string): Promise<ModerationDecision[]> {
    const history = await this.decisions.find({ where: { queueItemId: itemId } });
    return history.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async getSlaReport(now: Date = new Date()): Promise<SlaReport> {
    const items = await this.queue.find();
    const pending = items.filter(
      (item) =>
        item.status === ModerationStatus.PENDING ||
        item.status === ModerationStatus.IN_REVIEW,
    );

    const reviewTimes = items
      .map((item) => item.reviewDurationMinutes)
      .filter((minutes): minutes is number => minutes !== null);

    const byPriority: Record<ModerationPriority, number> = {
      [ModerationPriority.LOW]: 0,
      [ModerationPriority.NORMAL]: 0,
      [ModerationPriority.HIGH]: 0,
      [ModerationPriority.URGENT]: 0,
    };
    pending.forEach((item) => {
      byPriority[item.priority] += 1;
    });

    const breachedSla = pending.filter(
      (item) => item.slaDeadline.getTime() < now.getTime(),
    ).length;
    const dueSoon = pending.filter((item) => {
      const remaining = item.slaDeadline.getTime() - now.getTime();
      return remaining >= 0 && remaining <= DUE_SOON_MS;
    }).length;

    return {
      total: items.length,
      pending: items.filter((item) => item.status === ModerationStatus.PENDING)
        .length,
      inReview: items.filter(
        (item) => item.status === ModerationStatus.IN_REVIEW,
      ).length,
      breachedSla,
      dueSoon,
      averageReviewMinutes: reviewTimes.length
        ? Math.round(
            reviewTimes.reduce((sum, minutes) => sum + minutes, 0) /
              reviewTimes.length,
          )
        : null,
      longestWaitingMinutes: pending.length
        ? Math.max(
            ...pending.map((item) =>
              Math.max(
                0,
                Math.round((now.getTime() - item.createdAt.getTime()) / MINUTE_MS),
              ),
            ),
          )
        : 0,
      byPriority,
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async findItem(itemId: string): Promise<ModerationQueueItem> {
    const item = await this.queue.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Moderation queue item not found');
    return item;
  }

  private derivePriority(
    requested: ModerationPriority | undefined,
    riskScore: number,
  ): ModerationPriority {
    const base = requested ?? ModerationPriority.NORMAL;
    const escalated =
      riskScore >= 0.7
        ? ModerationPriority.URGENT
        : riskScore >= 0.4
          ? ModerationPriority.HIGH
          : base;

    // Automated checks may raise the priority but never lower a moderator's.
    return PRIORITY_WEIGHT[escalated] > PRIORITY_WEIGHT[base] ? escalated : base;
  }

  private deadlineFor(priority: ModerationPriority, now: Date): Date {
    return new Date(now.getTime() + SLA_HOURS[priority] * 60 * MINUTE_MS);
  }

  private toView(item: ModerationQueueItem, now: Date): ModerationQueueView {
    const remaining = item.slaDeadline.getTime() - now.getTime();
    return {
      id: item.id,
      puzzleId: item.puzzleId,
      submittedBy: item.submittedBy,
      title: item.title,
      status: item.status,
      priority: item.priority,
      automatedRiskScore: item.automatedRiskScore,
      assignedModeratorId: item.assignedModeratorId,
      assignedAt: item.assignedAt,
      slaDeadline: item.slaDeadline,
      decidedAt: item.decidedAt,
      createdAt: item.createdAt,
      slaBreached: remaining < 0,
      minutesUntilSla: Math.round(remaining / MINUTE_MS),
      minutesWaiting: Math.max(
        0,
        Math.round((now.getTime() - item.createdAt.getTime()) / MINUTE_MS),
      ),
    };
  }
}
