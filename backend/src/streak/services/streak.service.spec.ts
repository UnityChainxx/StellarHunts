import { BadRequestException } from '@nestjs/common';
import { StreakCalculationService } from './streak-calculation.service';
import { StreakService } from './streak.service';
import { ActivityType } from '../entities/streak-activity.entity';

describe('StreakService', () => {
  const buildQueryBuilder = (overrides: Record<string, jest.Mock> = {}) => {
    const qb: any = {};
    // Chainable query-builder methods are all jest.fn()s returning the same
    // builder so every call in the service's fluent chains can be asserted.
    for (const method of [
      'insert',
      'into',
      'values',
      'orIgnore',
      'select',
      'where',
      'orderBy',
      'addOrderBy',
      'limit',
      'andWhere',
      'update',
      'set',
    ]) {
      qb[method] = jest.fn(() => qb);
    }
    qb.execute = jest.fn().mockResolvedValue({ identifiers: [] });
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getMany = jest.fn().mockResolvedValue([]);
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    Object.assign(qb, overrides);
    return qb;
  };

  const setup = (streak?: any) => {
    const streakQueryBuilder = buildQueryBuilder();
    const activityQueryBuilder = buildQueryBuilder();
    const streakRepository: any = {
      findOne: jest.fn().mockResolvedValue(streak || null),
      createQueryBuilder: jest.fn(() => streakQueryBuilder),
      create: jest.fn(),
      save: jest.fn(),
    };
    const activityRepository: any = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => activityQueryBuilder),
      create: jest.fn(),
      save: jest.fn(),
    };
    const calculationService = new StreakCalculationService();
    const service = new StreakService(
      streakRepository,
      activityRepository,
      calculationService,
    );
    return {
      service,
      streakRepository,
      activityRepository,
      streakQueryBuilder,
      activityQueryBuilder,
    };
  };

  describe('recordActivity', () => {
    it('rejects future-dated activity so the streak cannot be gamed', async () => {
      const { service, activityRepository } = setup();
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await expect(
        service.recordActivity('user-1', {
          activityType: ActivityType.LOGIN,
          activityDate: future,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(activityRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('rejects invalid activity dates', async () => {
      const { service } = setup();

      await expect(
        service.recordActivity('user-1', {
          activityType: ActivityType.LOGIN,
          activityDate: 'not-a-date',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('inserts activity idempotently with an ignore-on-conflict insert', async () => {
      const streak = {
        id: 'streak-1',
        userId: 'user-1',
        currentStreak: 0,
        longestStreak: 0,
        totalActiveDays: 0,
        isActive: true,
      };
      const { service, activityRepository, activityQueryBuilder } = setup(streak);

      await service.recordActivity('user-1', {
        activityType: ActivityType.LOGIN,
      });

      // A retried POST for the same user/type/day must not increment or
      // duplicate — the insert is an ON CONFLICT DO NOTHING operation.
      expect(activityRepository.createQueryBuilder).toHaveBeenCalled();
      expect(activityQueryBuilder.orIgnore).toHaveBeenCalled();
      expect(activityQueryBuilder.execute).toHaveBeenCalledTimes(1);
    });

    it('uses the server date when no activity date is provided', async () => {
      const streak = {
        id: 'streak-1',
        userId: 'user-1',
        currentStreak: 0,
        longestStreak: 0,
        totalActiveDays: 0,
        isActive: true,
      };
      const { service, activityQueryBuilder } = setup(streak);

      await service.recordActivity('user-1', {
        activityType: ActivityType.LOGIN,
      });

      const values = activityQueryBuilder.values.mock.calls[0][0];
      expect(values.userId).toBe('user-1');
      expect(values.activityType).toBe(ActivityType.LOGIN);
      expect(values.activityDate).toBeDefined();
    });

    it('creates the streak row safely when none exists yet', async () => {
      const { service, streakRepository, streakQueryBuilder } = setup(null);
      streakRepository.findOne.mockResolvedValueOnce(null).mockResolvedValue({
        id: 'streak-1',
        userId: 'user-1',
        currentStreak: 0,
        longestStreak: 0,
        totalActiveDays: 0,
        isActive: true,
      });

      await service.recordActivity('user-1', {
        activityType: ActivityType.LOGIN,
      });

      expect(streakRepository.createQueryBuilder).toHaveBeenCalled();
      expect(streakQueryBuilder.orIgnore).toHaveBeenCalled();
    });
  });
});
