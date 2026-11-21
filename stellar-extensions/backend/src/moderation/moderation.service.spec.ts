import 'reflect-metadata';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ModerationService } from './moderation.service';
import {
  ModerationAction,
  ModerationPriority,
  ModerationStatus,
} from './entities/moderation-queue-item.entity';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

type Where<T> = Partial<Record<keyof T, unknown>>;

interface FindOptions<T> {
  where?: Where<T> | Where<T>[];
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
    return this.rows
      .filter((row) => this.matches(row, options.where))
      .map((row) => ({ ...row }));
  }

  private matches(row: T, where?: Where<T> | Where<T>[]): boolean {
    if (!where) return true;
    const clauses = Array.isArray(where) ? where : [where];
    return clauses.some((clause) =>
      Object.entries(clause).every(([field, value]) => row[field] === value),
    );
  }
}

const PUZZLE_A = '11111111-1111-4111-8111-111111111111';
const PUZZLE_B = '22222222-2222-4222-8222-222222222222';
const PUZZLE_C = '33333333-3333-4333-8333-333333333333';
const MODERATOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_MODERATOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BASE = new Date('2026-11-21T12:00:00.000Z');

const cleanPuzzle = (puzzleId: string, title = 'A normal puzzle') => ({
  puzzleId,
  title,
  description: 'Solve the storage layout challenge in this Soroban contract.',
});

describe('ModerationService', () => {
  let service: ModerationService;
  let queue: InMemoryRepository<any>;
  let checks: InMemoryRepository<any>;
  let decisions: InMemoryRepository<any>;

  beforeEach(() => {
    queue = new InMemoryRepository<any>({
      status: ModerationStatus.PENDING,
      assignedModeratorId: null,
      assignedAt: null,
      decidedAt: null,
      decisionReason: null,
      reviewDurationMinutes: null,
    });
    checks = new InMemoryRepository<any>();
    decisions = new InMemoryRepository<any>();
    service = new ModerationService(
      queue as any,
      checks as any,
      decisions as any,
    );
  });

  it('passes clean submissions through both automated checks', () => {
    const results = service.runAutomatedChecks(
      'Storage tricks',
      'Find the bug in this friendly Soroban contract.',
    );

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(results.every((result) => result.score === 0)).toBe(true);
  });

  it('flags profanity, including simple leetspeak evasions', () => {
    const results = service.runAutomatedChecks(
      'Why this is sh1t',
      'This puzzle is bullsh!t and the author is an @sshole.',
    );
    const profanity = results.find((result) => result.check === 'profanity');

    expect(profanity?.passed).toBe(false);
    expect(profanity?.score).toBeGreaterThanOrEqual(0.5);
    expect(profanity?.findings).toEqual(
      expect.arrayContaining(['profanity:shit', 'profanity:asshole']),
    );
  });

  it('flags spam signals such as links, shouting and spam phrases', () => {
    const results = service.runAutomatedChecks(
      'FREE MONEY PUZZLE!!!!!!',
      'click here to buy now https://a.example https://b.example https://c.example',
    );
    const spam = results.find((result) => result.check === 'spam');

    expect(spam?.passed).toBe(false);
    expect(spam?.findings).toEqual(
      expect.arrayContaining([
        'too many links (3)',
        'excessive repeated characters',
        'spam phrases: click here, buy now, free money',
      ]),
    );
  });

  it('logs checks per puzzle and escalates priority on risky content', async () => {
    const item = await service.submit(
      {
        ...cleanPuzzle(PUZZLE_A, 'FREE MONEY PUZZLE!!!!!!'),
        description: 'click here https://a.example https://b.example https://c.example',
        priority: ModerationPriority.LOW,
      },
      'submitter-1',
      BASE,
    );

    expect(item.priority).toBe(ModerationPriority.URGENT);
    expect(item.automatedRiskScore).toBeGreaterThanOrEqual(0.7);
    expect(item.slaDeadline.toISOString()).toBe(
      new Date(BASE.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    );

    const logs = await service.getChecks(PUZZLE_A);
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.checkType).sort()).toEqual([
      'profanity',
      'spam',
    ]);

    // Automated checks never downgrade a moderator's requested priority.
    const low = await service.submit(
      { ...cleanPuzzle(PUZZLE_B), priority: ModerationPriority.LOW },
      'submitter-1',
      BASE,
    );
    expect(low.priority).toBe(ModerationPriority.LOW);
  });

  it('rejects a second submission for the same puzzle', async () => {
    await service.submit(cleanPuzzle(PUZZLE_A), 'submitter-1', BASE);

    await expect(
      service.submit(cleanPuzzle(PUZZLE_A), 'submitter-2', BASE),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a changes-requested puzzle be revised and resubmitted', async () => {
    const item = await service.submit(cleanPuzzle(PUZZLE_A), 'submitter', BASE);
    await service.review(item.id, MODERATOR, {
      action: ModerationAction.REQUEST_CHANGES,
      reason: 'Add a clearer hint',
    }, BASE);

    const resubmitted = await service.submit(
      {
        ...cleanPuzzle(PUZZLE_A, 'A clearer puzzle'),
        priority: ModerationPriority.HIGH,
      },
      'submitter',
      BASE,
    );

    expect(resubmitted.id).toBe(item.id);
    expect(resubmitted).toMatchObject({
      status: ModerationStatus.PENDING,
      priority: ModerationPriority.HIGH,
      title: 'A clearer puzzle',
      decidedAt: null,
      assignedModeratorId: null,
    });
    // The earlier decision is retained in the audit history.
    expect(await service.getDecisionHistory(item.id)).toHaveLength(1);

    // An approved puzzle stays closed to resubmission.
    await service.review(item.id, MODERATOR, {
      action: ModerationAction.APPROVE,
    }, BASE);
    await expect(
      service.submit(cleanPuzzle(PUZZLE_A), 'submitter', BASE),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('orders the queue by priority then age, and filters it', async () => {
    const low = await service.submit(
      { ...cleanPuzzle(PUZZLE_A), priority: ModerationPriority.LOW },
      'submitter',
      BASE,
    );
    const normal = await service.submit(
      cleanPuzzle(PUZZLE_B),
      'submitter',
      BASE,
    );
    const high = await service.submit(
      { ...cleanPuzzle(PUZZLE_C), priority: ModerationPriority.HIGH },
      'submitter',
      BASE,
    );

    const ordered = await service.listQueue({}, BASE);
    expect(ordered.map((item) => item.id)).toEqual([high.id, normal.id, low.id]);
    expect(ordered.every((item) => item.slaBreached === false)).toBe(true);

    expect(
      await service.listQueue({ priority: ModerationPriority.LOW }, BASE),
    ).toHaveLength(1);
    expect(
      await service.listQueue({ status: ModerationStatus.APPROVED }, BASE),
    ).toHaveLength(0);
  });

  it('assigns a moderator and moves the item into review', async () => {
    const item = await service.submit(cleanPuzzle(PUZZLE_A), 'submitter', BASE);

    const assigned = await service.assign(
      item.id,
      { moderatorId: MODERATOR },
      BASE,
    );
    expect(assigned.status).toBe(ModerationStatus.IN_REVIEW);
    expect(assigned.assignedModeratorId).toBe(MODERATOR);
    expect(assigned.assignedAt).toEqual(BASE);

    await expect(
      service.assign(randomUUID(), { moderatorId: MODERATOR }, BASE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records an approve decision with review duration and history', async () => {
    const item = await service.submit(cleanPuzzle(PUZZLE_A), 'submitter', BASE);
    // Pretend the puzzle was submitted 90 minutes earlier.
    const row = queue.rows.find((candidate) => candidate.id === item.id);
    row.createdAt = new Date(BASE.getTime() - 90 * 60 * 1000);

    const { item: reviewed, decision } = await service.review(
      item.id,
      MODERATOR,
      { action: ModerationAction.APPROVE },
      BASE,
    );

    expect(reviewed.status).toBe(ModerationStatus.APPROVED);
    expect(reviewed.decidedAt).toEqual(BASE);
    expect(reviewed.reviewDurationMinutes).toBe(90);
    expect(reviewed.assignedModeratorId).toBe(MODERATOR);
    expect(decision).toMatchObject({
      puzzleId: PUZZLE_A,
      moderatorId: MODERATOR,
      action: ModerationAction.APPROVE,
      fromStatus: ModerationStatus.PENDING,
      toStatus: ModerationStatus.APPROVED,
    });

    expect(await service.getDecisionHistory(item.id)).toHaveLength(1);
    await expect(
      service.review(item.id, MODERATOR, { action: ModerationAction.APPROVE }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.assign(item.id, { moderatorId: MODERATOR }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reason for reject and request-changes decisions', async () => {
    const rejectItem = await service.submit(
      cleanPuzzle(PUZZLE_A),
      'submitter',
      BASE,
    );
    await expect(
      service.review(rejectItem.id, MODERATOR, {
        action: ModerationAction.REJECT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.review(rejectItem.id, MODERATOR, {
        action: ModerationAction.REQUEST_CHANGES,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const { item } = await service.review(rejectItem.id, MODERATOR, {
      action: ModerationAction.REQUEST_CHANGES,
      reason: '  Please clarify the hint.  ',
    });
    expect(item.status).toBe(ModerationStatus.CHANGES_REQUESTED);
    expect(item.decisionReason).toBe('Please clarify the hint.');
  });

  it('only lets the assigned moderator decide', async () => {
    const item = await service.submit(cleanPuzzle(PUZZLE_A), 'submitter', BASE);
    await service.assign(item.id, { moderatorId: MODERATOR }, BASE);

    await expect(
      service.review(item.id, OTHER_MODERATOR, {
        action: ModerationAction.APPROVE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports SLA breaches, due-soon items and review averages', async () => {
    const breached = await service.submit(
      { ...cleanPuzzle(PUZZLE_A), priority: ModerationPriority.URGENT },
      'submitter',
      BASE,
    );
    const dueSoon = await service.submit(
      { ...cleanPuzzle(PUZZLE_B), priority: ModerationPriority.HIGH },
      'submitter',
      BASE,
    );
    const approved = await service.submit(
      { ...cleanPuzzle(PUZZLE_C), priority: ModerationPriority.NORMAL },
      'submitter',
      BASE,
    );
    await service.review(approved.id, MODERATOR, {
      action: ModerationAction.APPROVE,
    }, BASE);
    queue.rows.find((row) => row.id === approved.id).reviewDurationMinutes = 30;

    // Urgent item is overdue; the high-priority item is due within an hour.
    queue.rows.find((row) => row.id === breached.id).slaDeadline = new Date(
      BASE.getTime() - 60 * 60 * 1000,
    );
    queue.rows.find((row) => row.id === dueSoon.id).slaDeadline = new Date(
      BASE.getTime() + 60 * 60 * 1000,
    );

    const report = await service.getSlaReport(BASE);
    expect(report).toMatchObject({
      total: 3,
      pending: 2,
      inReview: 0,
      breachedSla: 1,
      dueSoon: 1,
      averageReviewMinutes: 30,
      byPriority: {
        [ModerationPriority.LOW]: 0,
        [ModerationPriority.NORMAL]: 0,
        [ModerationPriority.HIGH]: 1,
        [ModerationPriority.URGENT]: 1,
      },
    });
  });
});
