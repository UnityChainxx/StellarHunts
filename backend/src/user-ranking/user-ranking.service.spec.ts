import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { UserRankingService } from './user-ranking.service';
import { UserRank } from './entities/user-ranking.entity';

describe('UserRankingService', () => {
  let service: UserRankingService;

  const mockUserRankRepository = {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRankingService,
        {
          provide: getRepositoryToken(UserRank),
          useValue: mockUserRankRepository,
        },
      ],
    }).compile();

    service = module.get<UserRankingService>(UserRankingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateAndUpdateRank', () => {
    it('rejects negative metrics (impossible scores)', async () => {
      await expect(
        service.calculateAndUpdateRank('user-1', { achievements: -1 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.calculateAndUpdateRank('user-1', { activityPoints: -100 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRankRepository.save).not.toHaveBeenCalled();
    });

    it('rejects non-finite and absurd metrics', async () => {
      await expect(
        service.calculateAndUpdateRank('user-1', {
          achievements: Number.NaN,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.calculateAndUpdateRank('user-1', {
          activityPoints: Number.POSITIVE_INFINITY,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists validated metrics and recomputes ranks in a single query', async () => {
      mockUserRankRepository.findOne.mockResolvedValue(null);
      mockUserRankRepository.create.mockReturnValue({
        userId: 'user-1',
        score: 0,
        achievements: 0,
        activityPoints: 0,
      });
      mockUserRankRepository.save.mockResolvedValue({ id: 'rank-1' });
      mockUserRankRepository.findOneOrFail.mockResolvedValue({
        id: 'rank-1',
        userId: 'user-1',
        score: 250,
        achievements: 2,
        activityPoints: 50,
        rank: 1,
      });

      const result = await service.calculateAndUpdateRank('user-1', {
        achievements: 2,
        activityPoints: 50,
      });

      expect(result.score).toBe(250);
      // Rank positions are recomputed with one SQL statement, not an N+1
      // save-all-rows loop.
      expect(mockUserRankRepository.query).toHaveBeenCalledTimes(1);
      expect(mockUserRankRepository.query.mock.calls[0][0]).toContain(
        'ROW_NUMBER()',
      );
    });
  });

  describe('getUserRank', () => {
    it('returns a zeroed rank for unknown users without writing anything', async () => {
      mockUserRankRepository.findOne.mockResolvedValue(null);

      const result = await service.getUserRank('unknown-user');

      expect(result).toEqual({
        userId: 'unknown-user',
        score: 0,
        achievements: 0,
        activityPoints: 0,
        rank: 0,
      });
      expect(mockUserRankRepository.save).not.toHaveBeenCalled();
      expect(mockUserRankRepository.create).not.toHaveBeenCalled();
    });

    it('returns the stored rank for existing users', async () => {
      mockUserRankRepository.findOne.mockResolvedValue({
        userId: 'user-1',
        score: 500,
        achievements: 5,
        activityPoints: 0,
        rank: 3,
      });

      const result = await service.getUserRank('user-1');

      expect(result).toEqual({
        userId: 'user-1',
        score: 500,
        achievements: 5,
        activityPoints: 0,
        rank: 3,
      });
    });
  });
});
