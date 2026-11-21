/**
 * Unit tests for the reward service (#975).
 *
 * The suite drives the real `RewardService`, `PrizePoolService`,
 * `SeasonalScheduleService` and `TimetrialService` against in-memory
 * repositories and a stub transaction manager, so it runs in CI without a
 * database. Covered areas:
 *
 *  - basic reward distribution and reward accounting
 *  - seasonal reward multipliers and halvings
 *  - prize pool distribution to the top N finishers
 *  - insufficient / locked / missing prize pools
 *  - duplicate claim prevention (pre-check, dedupe retry, unique-index race)
 *  - time-trial rewards and their duplicate prevention
 *  - reward caps and the remaining reward-service surface
 */

import 'reflect-metadata';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { RewardService } from '../../../backend/src/reward/reward.service';
import { Reward, RewardType } from '../../../backend/src/reward/entities/reward.entity';
import { RewardClaim } from '../../../backend/src/reward/entities/reward-claim.entity';
import { PrizePoolService } from '../../../backend/src/reward/prize-pool.service';
import { PrizePool } from '../../../backend/src/reward/entities/prize-pool.entity';
import {
  PrizePoolPayout,
  PrizePoolPayoutAction,
} from '../../../backend/src/reward/entities/prize-pool-payout.entity';
import { SeasonalScheduleService } from '../../../backend/src/reward/seasonal-schedule.service';
import { TimetrialService } from '../../../backend/src/time-trial/providers/timetrial.service';
import { TimeTrial } from '../../../backend/src/time-trial/time-trial.entity';

type Where<T> = Partial<Record<keyof T, unknown>>;

interface FindOptions<T> {
  where?: Where<T> | Where<T>[];
  relations?: string[];
  order?: Partial<Record<keyof T, 'ASC' | 'DESC'>>;
  take?: number;
}

/**
 * Minimal in-memory stand-in for the TypeORM repository surface used by the
 * reward, prize-pool and time-trial services.
 */
class InMemoryRepository<T extends Record<string, any>> {
  readonly rows: T[] = [];

  /** Attach related rows the way TypeORM's `relations` option would. */
  hydrate?: (row: T) => T;

  constructor(private readonly defaults: Partial<T> = {}) {}

  create(data: Partial<T>): T {
    return { ...this.defaults, ...data } as unknown as T;
  }

  async save(entity: T): Promise<T> {
    const stored = { ...entity } as T & { id?: string };
    if (!stored.id) stored.id = randomUUID();
    if (!stored.createdAt) stored.createdAt = new Date();
    const index = this.rows.findIndex((row) => row.id === stored.id);
    if (index === -1) this.rows.push(stored);
    else this.rows[index] = stored;
    return { ...stored };
  }

  async findOne(options: FindOptions<T> = {}): Promise<T | null> {
    const row = this.rows.find((candidate) =>
      this.matches(candidate, options.where),
    );
    return row ? this.present(row) : null;
  }

  async find(options: FindOptions<T> = {}): Promise<T[]> {
    let rows = this.rows
      .filter((row) => this.matches(row, options.where))
      .map((row) => this.present(row));

    const [field, direction] = Object.entries(options.order ?? {})[0] ?? [];
    if (field && direction) {
      rows = rows.sort((a, b) => {
        const left = a[field] instanceof Date ? a[field].getTime() : a[field];
        const right = b[field] instanceof Date ? b[field].getTime() : b[field];
        const order = left === right ? 0 : left > right ? 1 : -1;
        return direction === 'DESC' ? -order : order;
      });
    }
    if (options.take !== undefined) rows = rows.slice(0, options.take);
    return rows;
  }

  async count(options: FindOptions<T> = {}): Promise<number> {
    return this.rows.filter((row) => this.matches(row, options.where)).length;
  }

  async update(
    criteria: string | Where<T>,
    patch: Partial<T>,
  ): Promise<void> {
    this.rows
      .filter((row) =>
        typeof criteria === 'string'
          ? row.id === criteria
          : this.matches(row, criteria),
      )
      .forEach((row) => Object.assign(row, patch));
  }

  async increment(
    criteria: Where<T>,
    field: keyof T & string,
    amount: number,
  ): Promise<void> {
    this.rows
      .filter((row) => this.matches(row, criteria))
      .forEach((row) => {
        row[field] = (row[field] ?? 0) + amount;
      });
  }

  private present(row: T): T {
    const copy = { ...row };
    return this.hydrate ? this.hydrate(copy) : copy;
  }

  private matches(row: T, where?: Where<T> | Where<T>[]): boolean {
    if (!where) return true;
    const clauses = Array.isArray(where) ? where : [where];
    return clauses.some((clause) =>
      Object.entries(clause).every(([field, value]) => row[field] === value),
    );
  }
}

function makeDataSource(
  rewards: InMemoryRepository<any>,
  claims: InMemoryRepository<any>,
) {
  return {
    transaction: jest.fn(async (callback: any) =>
      callback({
        getRepository: (entity: unknown) =>
          entity === Reward ? rewards : claims,
      }),
    ),
  } as any;
}

function makePrizeDataSource(
  pools: InMemoryRepository<any>,
  payouts: InMemoryRepository<any>,
) {
  return {
    transaction: jest.fn(async (callback: any) =>
      callback({
        getRepository: (entity: unknown) =>
          entity === PrizePool ? pools : payouts,
      }),
    ),
  } as any;
}

const CHALLENGE = 'challenge-reward-001';

describe('RewardService', () => {
  let service: RewardService;
  let rewards: InMemoryRepository<any>;
  let claims: InMemoryRepository<any>;

  beforeEach(() => {
    rewards = new InMemoryRepository<any>({
      isActive: true,
      currentClaims: 0,
      maxClaims: null,
    });
    claims = new InMemoryRepository<any>({
      status: 'claimed',
      transactionHash: null,
      dedupeKey: null,
      claimDate: new Date(),
    });
    service = new RewardService(
      rewards as any,
      claims as any,
      makeDataSource(rewards, claims),
    );
  });

  async function createReward(overrides: Record<string, any> = {}) {
    return service.createReward({
      name: 'First solve badge',
      description: 'Awarded for solving the first puzzle',
      type: RewardType.TOKEN,
      challengeId: CHALLENGE,
      ...overrides,
    });
  }

  // ── basic distribution ────────────────────────────────────────────────────

  it('distributes a reward and records the claim on the reward', async () => {
    const reward = await createReward({ maxClaims: 10 });
    expect(reward).toMatchObject({
      challengeId: CHALLENGE,
      currentClaims: 0,
      isActive: true,
    });

    const claim = await service.claimReward({
      userId: 'user-1',
      challengeId: CHALLENGE,
      transactionHash: 'tx-1',
    });

    expect(claim).toMatchObject({
      userId: 'user-1',
      rewardId: reward.id,
      challengeId: CHALLENGE,
      status: 'claimed',
      transactionHash: 'tx-1',
      dedupeKey: null,
    });
    expect(rewards.rows[0].currentClaims).toBe(1);
    expect(await service.hasUserClaimedReward('user-1', CHALLENGE)).toBe(true);
    expect(await service.hasUserClaimedReward('user-2', CHALLENGE)).toBe(false);
  });

  it('lets different users claim the same capped reward until the cap is hit', async () => {
    const reward = await createReward({ maxClaims: 2 });

    await service.claimReward({ userId: 'user-1', challengeId: CHALLENGE });
    await service.claimReward({ userId: 'user-2', challengeId: CHALLENGE });

    const stats = await service.getRewardStats(reward.id);
    expect(stats).toMatchObject({
      totalClaims: 2,
      availableClaims: 0,
      isAvailable: false,
    });

    await expect(
      service.claimReward({ userId: 'user-3', challengeId: CHALLENGE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports unlimited availability when maxClaims is null', async () => {
    const reward = await createReward();
    await service.claimReward({ userId: 'user-1', challengeId: CHALLENGE });

    const stats = await service.getRewardStats(reward.id);
    expect(stats.availableClaims).toBeNull();
    expect(stats.isAvailable).toBe(true);
  });

  // ── duplicate prevention ──────────────────────────────────────────────────

  it('prevents a user from claiming the same challenge twice', async () => {
    await createReward();
    await service.claimReward({ userId: 'user-1', challengeId: CHALLENGE });

    await expect(
      service.claimReward({ userId: 'user-1', challengeId: CHALLENGE }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rewards.rows[0].currentClaims).toBe(1);
  });

  it('returns the existing claim on an idempotent transaction retry', async () => {
    await createReward();

    const first = await service.issueReward({
      userId: 'user-1',
      challengeId: CHALLENGE,
      eventId: 'evt-42',
    });
    const retry = await service.issueReward({
      userId: 'user-1',
      challengeId: CHALLENGE,
      eventId: 'evt-42',
    });

    expect(retry.id).toBe(first.id);
    expect(first.dedupeKey).toBe('user-1:evt-42');
    expect(claims.rows).toHaveLength(1);
    expect(rewards.rows[0].currentClaims).toBe(1);
  });

  it('resolves a concurrent duplicate that hits the unique index', async () => {
    await createReward();
    const duplicateError = new QueryFailedError('INSERT INTO reward_claims', [], {
      code: '23505',
    } as any);
    claims.save = jest.fn().mockRejectedValueOnce(duplicateError);

    await expect(
      service.claimReward({ userId: 'user-1', challengeId: CHALLENGE }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rewards.rows[0].currentClaims).toBe(0);
  });

  it('rethrows unexpected persistence errors instead of masking them', async () => {
    await createReward();
    const failure = new Error('connection lost');
    claims.save = jest.fn().mockRejectedValueOnce(failure);

    await expect(
      service.claimReward({ userId: 'user-1', challengeId: CHALLENGE }),
    ).rejects.toBe(failure);
  });

  it('returns the existing claim when a dedupe race hits the unique index', async () => {
    await createReward();
    const existing = {
      id: 'claim-existing',
      userId: 'user-1',
      challengeId: CHALLENGE,
      dedupeKey: 'user-1:evt-7',
      status: 'claimed',
    };

    let dedupeLookups = 0;
    // The pre-check misses the concurrent insert; the post-error lookup finds it.
    claims.findOne = jest.fn(async (options: any) => {
      if (options.where?.dedupeKey) {
        dedupeLookups += 1;
        return dedupeLookups === 1 ? null : { ...existing };
      }
      return null;
    });
    claims.save = jest.fn().mockRejectedValueOnce(
      new QueryFailedError('INSERT INTO reward_claims', [], {
        code: '23505',
      } as any),
    );

    const result = await service.claimReward({
      userId: 'user-1',
      challengeId: CHALLENGE,
      eventId: 'evt-7',
    });

    expect(result.id).toBe(existing.id);
  });

  // ── time-trial rewards ────────────────────────────────────────────────────

  it('awards a time-trial reward once per completed trial', async () => {
    const trials = new InMemoryRepository<TimeTrial>({
      completed: false,
      endTime: null,
    });
    const timeTrial = new TimetrialService(trials as any);

    const trial = await timeTrial.startTrial('user-1', 'puzzle-tt-1');
    const completed = await timeTrial.submitTrial(trial.id);
    expect(completed.completed).toBe(true);

    await createReward({ challengeId: `time-trial:${completed.puzzleId}` });
    const claim = await service.claimReward({
      userId: 'user-1',
      challengeId: `time-trial:${completed.puzzleId}`,
      transactionHash: 'tx-tt-1',
    });
    expect(claim).toMatchObject({ userId: 'user-1', status: 'claimed' });

    // A duplicate submission for the same trial cannot double-pay the reward.
    await expect(
      service.claimReward({
        userId: 'user-1',
        challengeId: `time-trial:${completed.puzzleId}`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a time-trial submission that exceeds the time limit', async () => {
    const trials = new InMemoryRepository<TimeTrial>({
      completed: false,
      endTime: null,
    });
    const timeTrial = new TimetrialService(trials as any);
    const trial = await timeTrial.startTrial('user-1', 'puzzle-tt-2');
    trials.rows.find((row) => row.id === trial.id)!.startTime = new Date(
      Date.now() - 10 * 60 * 1000,
    );

    await expect(timeTrial.submitTrial(trial.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ── reward service surface ────────────────────────────────────────────────

  it('validates metadata and rejects unsafe payloads', async () => {
    const reward = await createReward({ metadata: { rarity: 'rare' } });
    expect(reward.metadata).toMatchObject({ rarity: 'rare' });

    await expect(
      createReward({
        metadata: { imageUrl: 'http://127.0.0.1/internal.png' },
      }),
    ).rejects.toThrow();
  });

  it('looks up rewards and reports missing ones', async () => {
    const reward = await createReward();
    expect(await service.getAllRewards()).toHaveLength(1);
    expect((await service.getRewardById(reward.id)).id).toBe(reward.id);
    expect((await service.getRewardByChallengeId(CHALLENGE)).id).toBe(
      reward.id,
    );

    await expect(service.getRewardById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.getRewardByChallengeId('missing'),
    ).rejects.toBeInstanceOf(NotFoundException);

    rewards.rows[0].isActive = false;
    await expect(
      service.getRewardByChallengeId(CHALLENGE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails to claim a challenge with no active reward', async () => {
    await expect(
      service.claimReward({ userId: 'user-1', challengeId: 'unknown' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists a user’s claims and updates claim status', async () => {
    await createReward();
    const claim = await service.claimReward({
      userId: 'user-1',
      challengeId: CHALLENGE,
    });

    const mine = await service.getUserClaims('user-1');
    expect(mine).toHaveLength(1);
    expect((await service.getClaimById(claim.id)).id).toBe(claim.id);

    const updated = await service.updateClaimStatus(claim.id, 'settled');
    expect(updated.status).toBe('settled');

    await expect(service.getClaimById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('soft deletes a reward only when it has no claims', async () => {
    const reward = await createReward();
    await service.deleteReward(reward.id);
    expect(rewards.rows[0].isActive).toBe(false);

    const claimed = await createReward({ challengeId: 'challenge-2' });
    await service.claimReward({ userId: 'user-1', challengeId: 'challenge-2' });
    await expect(service.deleteReward(claimed.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

// ── seasonal multipliers ────────────────────────────────────────────────────

describe('SeasonalScheduleService', () => {
  const makeService = (scheduleJson?: string) =>
    new SeasonalScheduleService({
      get: (key: string) =>
        key === 'SEASONAL_SCHEDULE_JSON' ? scheduleJson : undefined,
    } as any);

  it('applies each default season multiplier', () => {
    const seasonal = makeService();

    expect(seasonal.getCurrentMultiplier(new Date('2024-03-01T00:00:00Z'))).toBe(2);
    expect(seasonal.getCurrentMultiplier(new Date('2024-08-01T00:00:00Z'))).toBe(
      1.5,
    );
    expect(seasonal.getCurrentMultiplier(new Date('2025-03-01T00:00:00Z'))).toBe(1);
    expect(seasonal.getCurrentMultiplier(new Date('2025-09-01T00:00:00Z'))).toBe(
      0.75,
    );
  });

  it('defaults to 1× outside any configured season', () => {
    const seasonal = makeService();
    expect(seasonal.getCurrentMultiplier(new Date('2023-01-01T00:00:00Z'))).toBe(
      1,
    );
  });

  it('reports the active season and the next halving', () => {
    const seasonal = makeService();
    const info = seasonal.getActiveSeasonInfo(
      new Date('2024-03-01T00:00:00Z'),
    );

    expect(info.season?.name).toBe('Genesis Season');
    expect(info.multiplier).toBe(2);
    expect(info.nextHalvingDate?.toISOString()).toBe(
      '2024-07-01T00:00:00.000Z',
    );
    expect(info.nextHalvingMultiplier).toBe(1.5);
    expect(info.announcement).toContain('Genesis Season');

    expect(
      seasonal.getNextHalvingDate(new Date('2024-08-01T00:00:00Z'))?.toISOString(),
    ).toBe('2025-01-01T00:00:00.000Z');
  });

  it('returns no halving when none is scheduled', () => {
    const seasonal = makeService();
    expect(
      seasonal.getNextHalvingDate(new Date('2025-09-01T00:00:00Z')),
    ).toBeNull();
  });

  it('uses a custom schedule and falls back on malformed config', () => {
    const seasonal = makeService(
      JSON.stringify([
        {
          name: 'Launch',
          startAt: '2026-01-01T00:00:00Z',
          endAt: null,
          multiplier: 3,
        },
      ]),
    );
    expect(seasonal.getFullSchedule()).toHaveLength(1);
    expect(seasonal.getCurrentMultiplier(new Date('2026-02-01T00:00:00Z'))).toBe(
      3,
    );

    const broken = makeService('{not-json');
    expect(broken.getCurrentMultiplier(new Date('2024-03-01T00:00:00Z'))).toBe(2);
  });
});

// ── prize pools ─────────────────────────────────────────────────────────────

describe('PrizePoolService', () => {
  let service: PrizePoolService;
  let pools: InMemoryRepository<any>;
  let payouts: InMemoryRepository<any>;

  beforeEach(() => {
    pools = new InMemoryRepository<PrizePool>({
      balance: '0',
      totalFunded: '0',
      totalDistributed: '0',
      distributionRules: null,
      isDistributed: false,
      displayName: null,
    });
    payouts = new InMemoryRepository<PrizePoolPayout>({
      recipientAddress: null,
      place: null,
      txHash: null,
      meta: null,
      action: PrizePoolPayoutAction.FUND,
    });
    service = new PrizePoolService(
      pools as any,
      payouts as any,
      makePrizeDataSource(pools, payouts),
    );
  });

  const topThree = [
    { address: 'GAAA', place: 1 },
    { address: 'GBBB', place: 2 },
    { address: 'GCCC', place: 3 },
  ];

  it('distributes the default 50/30/20 split to the top N', async () => {
    await service.fundPool('1000', 'season-1', { txHash: 'fund-tx' });

    const result = await service.distributePool('season-1', topThree);

    expect(result.payouts.map((payout) => Number(payout.amount))).toEqual([
      500, 300, 200,
    ]);
    expect(result.totalDistributed).toBe('1000.0000000');
    expect(pools.rows[0]).toMatchObject({
      balance: '0.0000000',
      totalDistributed: '1000.0000000',
      isDistributed: true,
    });

    const distributeRows = payouts.rows.filter(
      (row) => row.action === PrizePoolPayoutAction.DISTRIBUTE,
    );
    expect(distributeRows).toHaveLength(3);
    expect(distributeRows.map((row) => row.recipientAddress)).toEqual([
      'GAAA',
      'GBBB',
      'GCCC',
    ]);
  });

  it('respects custom distribution rules', async () => {
    await service.fundPool('1000', 'season-custom');
    await service.setDistributionRules('season-custom', {
      places: [0.6, 0.4],
    });

    const result = await service.distributePool('season-custom', [
      { address: 'GAAA', place: 1 },
      { address: 'GBBB', place: 2 },
    ]);

    expect(result.payouts.map((payout) => Number(payout.amount))).toEqual([
      600, 400,
    ]);
  });

  it('pays only as many finishers as there are shares', async () => {
    await service.fundPool('1000', 'season-top-n');

    const result = await service.distributePool(
      'season-top-n',
      [...topThree, { address: 'GDDD', place: 4 }],
    );

    expect(result.payouts).toHaveLength(3);
    expect(result.payouts.map((payout) => payout.address)).not.toContain('GDDD');
  });

  it('leaves the remainder in the pool when there are fewer winners', async () => {
    await service.fundPool('1000', 'season-one-winner');

    const result = await service.distributePool('season-one-winner', [
      { address: 'GAAA', place: 1 },
    ]);

    expect(Number(result.payouts[0].amount)).toBe(500);
    expect(pools.rows[0].balance).toBe('500.0000000');
  });

  // ── insufficient / unavailable pools ──────────────────────────────────────

  it('rejects distribution from a pool with no balance', async () => {
    await expect(
      service.distributePool('never-funded', topThree),
    ).rejects.toBeInstanceOf(NotFoundException);

    await service.fundPool('0.0000001', 'dust');
    pools.rows[0].balance = '0';
    await expect(service.distributePool('dust', topThree)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects distribution with no finishers', async () => {
    await service.fundPool('100', 'no-winners');
    await expect(
      service.distributePool('no-winners', []),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('locks a distributed pool against re-distribution and funding', async () => {
    await service.fundPool('100', 'locked');
    await service.distributePool('locked', topThree);

    await expect(
      service.distributePool('locked', topThree),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.fundPool('100', 'locked'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setDistributionRules('locked', { places: [1] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid funding amounts', async () => {
    for (const amount of ['0', '-10', 'not-a-number']) {
      await expect(
        service.fundPool(amount, 'invalid-amount'),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('requires an existing pool for rules and status', async () => {
    await expect(
      service.setDistributionRules('missing', { places: [1] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getPoolStatus('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reports pool status with the full payout audit trail', async () => {
    pools.hydrate = (pool) => ({
      ...pool,
      payouts: payouts.rows
        .filter((payout) => payout.prizePoolId === pool.id)
        .map((payout) => ({ ...payout })),
    });

    await service.fundPool('250', 'audit');
    await service.distributePool('audit', [
      { address: 'GAAA', place: 1 },
    ]);

    const status = await service.getPoolStatus('audit');
    expect(status).toMatchObject({
      season: 'audit',
      totalFunded: '250.0000000',
      totalDistributed: '125.0000000',
      isDistributed: true,
    });
    expect(status.payouts).toHaveLength(2); // one FUND + one DISTRIBUTE
    expect(await service.listPools()).toHaveLength(1);
  });
});
