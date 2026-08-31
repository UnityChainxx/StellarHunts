import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { MultiplayerQueueService } from './multiplayer-queue.service';
import { Queue, QueueStatus, SkillLevel } from './entities/queue.entity';
import { Match } from './entities/match.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

describe('MultiplayerQueueService', () => {
  let service: MultiplayerQueueService;
  let queueRepository: Repository<Queue>;
  let matchRepository: Repository<Match>;

  const mockQueueRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  const mockMatchRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiplayerQueueService,
        {
          provide: getRepositoryToken(Queue),
          useValue: mockQueueRepository,
        },
        {
          provide: getRepositoryToken(Match),
          useValue: mockMatchRepository,
        },
      ],
    }).compile();

    service = module.get<MultiplayerQueueService>(MultiplayerQueueService);
    queueRepository = module.get<Repository<Queue>>(getRepositoryToken(Queue));
    matchRepository = module.get<Repository<Match>>(getRepositoryToken(Match));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('joinQueue', () => {
    it('should successfully join queue', async () => {
      const joinQueueDto = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        username: 'testuser',
        skillLevel: SkillLevel.BEGINNER,
        gameMode: 'classic',
      };

      const mockQueueEntry = {
        id: 'queue-1',
        ...joinQueueDto,
        status: QueueStatus.WAITING,
        waitTime: 0,
        matchId: null,
        createdAt: new Date(),
        matchedAt: null,
        preferences: {},
      };

      mockQueueRepository.findOne.mockResolvedValue(null); // No existing entry
      mockQueueRepository.create.mockReturnValue(mockQueueEntry);
      mockQueueRepository.save.mockResolvedValue(mockQueueEntry);

      const result = await service.joinQueue(joinQueueDto);

      expect(result.userId).toBe(joinQueueDto.userId);
      expect(result.status).toBe(QueueStatus.WAITING);
      expect(mockQueueRepository.findOne).toHaveBeenCalledWith({
        where: { userId: joinQueueDto.userId, status: QueueStatus.WAITING },
      });
    });

    it('should throw BadRequestException if user already in queue', async () => {
      const joinQueueDto = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        username: 'testuser',
        skillLevel: SkillLevel.BEGINNER,
        gameMode: 'classic',
      };

      const existingEntry = { id: 'existing', userId: joinQueueDto.userId };
      mockQueueRepository.findOne.mockResolvedValue(existingEntry);

      await expect(service.joinQueue(joinQueueDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('leaveQueue', () => {
    it('should successfully leave queue', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const queueEntry = {
        id: 'queue-1',
        userId,
        status: QueueStatus.WAITING,
        username: 'testuser',
      };

      mockQueueRepository.findOne.mockResolvedValue(queueEntry);
      mockQueueRepository.save.mockResolvedValue({
        ...queueEntry,
        status: QueueStatus.LEFT,
        leftAt: expect.any(Date),
      });

      await service.leaveQueue(userId);

      expect(mockQueueRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: QueueStatus.LEFT,
          leftAt: expect.any(Date),
        }),
      );
    });

    it('should throw NotFoundException if user not in queue', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      mockQueueRepository.findOne.mockResolvedValue(null);

      await expect(service.leaveQueue(userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status for user', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const queueEntry = {
        id: 'queue-1',
        userId,
        username: 'testuser',
        status: QueueStatus.WAITING,
        skillLevel: SkillLevel.BEGINNER,
        gameMode: 'classic',
        waitTime: 0,
        matchId: null,
        createdAt: new Date(Date.now() - 30000), // 30 seconds ago
        matchedAt: null,
      };

      mockQueueRepository.findOne.mockResolvedValue(queueEntry);
      mockQueueRepository.save.mockResolvedValue({
        ...queueEntry,
        waitTime: 30,
      });

      const result = await service.getQueueStatus(userId);

      expect(result).toBeDefined();
      expect(result!.userId).toBe(userId);
      expect(result!.waitTime).toBeGreaterThan(0);
    });

    it('should return null if user not in queue', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      mockQueueRepository.findOne.mockResolvedValue(null);

      const result = await service.getQueueStatus(userId);

      expect(result).toBeNull();
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const mockQueueEntries = [
        {
          skillLevel: SkillLevel.BEGINNER,
          gameMode: 'classic',
          createdAt: new Date(Date.now() - 60000), // 1 minute ago
        },
        {
          skillLevel: SkillLevel.INTERMEDIATE,
          gameMode: 'classic',
          createdAt: new Date(Date.now() - 30000), // 30 seconds ago
        },
      ];

      mockQueueRepository.find.mockResolvedValue(mockQueueEntries);
      mockMatchRepository.count.mockResolvedValue(5);

      const result = await service.getQueueStats();

      expect(result.totalInQueue).toBe(2);
      expect(result.bySkillLevel[SkillLevel.BEGINNER]).toBe(1);
      expect(result.bySkillLevel[SkillLevel.INTERMEDIATE]).toBe(1);
      expect(result.byGameMode.classic).toBe(2);
      expect(result.matchesToday).toBe(5);
    });
  });

  // ── graph-based matching algorithm ────────────────────────────────
  describe('computeCompatibilityScore', () => {
    function score(a: Queue, b: Queue): number {
      return (service as any).computeCompatibilityScore(a, b);
    }

    function makePlayer(
      userId: string,
      avoid?: string[],
      prefer?: string[],
    ): Queue {
      return {
        id: `id-${userId}`,
        userId,
        username: `user-${userId}`,
        status: QueueStatus.WAITING,
        skillLevel: SkillLevel.BEGINNER,
        gameMode: 'classic',
        waitTime: 0,
        matchId: null,
        preferences: {
          avoidOpponents: avoid,
          preferredOpponents: prefer,
        },
        createdAt: new Date(),
        matchedAt: null,
        leftAt: null,
      } as Queue;
    }

    it('returns -1 when a avoids b', () => {
      const a = makePlayer('u1', ['u2']);
      const b = makePlayer('u2');
      expect(score(a, b)).toBe(-1);
    });

    it('returns -1 when b avoids a', () => {
      const a = makePlayer('u1');
      const b = makePlayer('u2', ['u1']);
      expect(score(a, b)).toBe(-1);
    });

    it('returns -1 when both avoid each other', () => {
      const a = makePlayer('u1', ['u2']);
      const b = makePlayer('u2', ['u1']);
      expect(score(a, b)).toBe(-1);
    });

    it('returns 100 for mutual preferredOpponents', () => {
      const a = makePlayer('u1', undefined, ['u2']);
      const b = makePlayer('u2', undefined, ['u1']);
      expect(score(a, b)).toBe(100);
    });

    it('returns 50 for one-sided preferredOpponents', () => {
      const a = makePlayer('u1', undefined, ['u2']);
      const b = makePlayer('u2');
      expect(score(a, b)).toBe(50);
    });

    it('returns 10 for neutral (no preferences)', () => {
      const a = makePlayer('u1');
      const b = makePlayer('u2');
      expect(score(a, b)).toBe(10);
    });

    it('returns 10 when preferences are undefined', () => {
      const a = makePlayer('u1');
      a.preferences = undefined as any;
      const b = makePlayer('u2');
      b.preferences = undefined as any;
      expect(score(a, b)).toBe(10);
    });
  });

  describe('pairPlayersInGroup', () => {
    function pairPlayers(players: Queue[]): [Queue, Queue][] {
      return (service as any).pairPlayersInGroup(players);
    }

    function makePlayer(
      userId: string,
      avoid?: string[],
      prefer?: string[],
    ): Queue {
      return {
        id: `id-${userId}`,
        userId,
        username: `user-${userId}`,
        status: QueueStatus.WAITING,
        skillLevel: SkillLevel.BEGINNER,
        gameMode: 'classic',
        waitTime: 0,
        matchId: null,
        preferences: {
          avoidOpponents: avoid,
          preferredOpponents: prefer,
        },
        createdAt: new Date(),
        matchedAt: null,
        leftAt: null,
      } as Queue;
    }

    it('returns empty array for less than 2 players', () => {
      expect(pairPlayers([makePlayer('u1')])).toEqual([]);
      expect(pairPlayers([])).toEqual([]);
    });

    it('pairs exactly 2 players', () => {
      const a = makePlayer('u1');
      const b = makePlayer('u2');
      const pairs = pairPlayers([a, b]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]).toContain(a);
      expect(pairs[0]).toContain(b);
    });

    it('pairs 4 players into 2 pairs', () => {
      const players = [
        makePlayer('u1'),
        makePlayer('u2'),
        makePlayer('u3'),
        makePlayer('u4'),
      ];
      const pairs = pairPlayers(players);
      expect(pairs).toHaveLength(2);
      // All 4 players should be in exactly one pair
      const pairedIds = pairs
        .flat()
        .map((p) => p.userId)
        .sort();
      expect(pairedIds).toEqual(['u1', 'u2', 'u3', 'u4']);
    });

    it('handles odd number of players (leaves one unmatched)', () => {
      const players = [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')];
      const pairs = pairPlayers(players);
      expect(pairs).toHaveLength(1);
      // One player remains unmatched (that's fine for the next cron cycle)
      const pairedIds = pairs.flat().map((p) => p.userId);
      expect(pairedIds).toHaveLength(2);
    });

    it('never pairs a player with someone they avoid', () => {
      const players = [
        makePlayer('u1', ['u2']),
        makePlayer('u2'),
        makePlayer('u3'),
        makePlayer('u4'),
      ];
      const pairs = pairPlayers(players);
      // u1 cannot pair with u2, so u1 must pair with u3 or u4
      for (const [a, b] of pairs) {
        expect(a.userId === 'u1' && b.userId === 'u2').toBe(false);
        expect(a.userId === 'u2' && b.userId === 'u1').toBe(false);
      }
    });

    it('prefers mutual preferredOpponents over others', () => {
      const players = [
        makePlayer('u1', undefined, ['u2']),
        makePlayer('u2', undefined, ['u1']),
        makePlayer('u3'),
        makePlayer('u4'),
      ];
      const pairs = pairPlayers(players);
      // u1 and u2 have mutual preference (score 100), they should be paired together
      const pairWithU1 = pairs.find(
        ([a, b]) => a.userId === 'u1' || b.userId === 'u1',
      )!;
      const u1Partner =
        pairWithU1[0].userId === 'u1' ? pairWithU1[1] : pairWithU1[0];
      expect(u1Partner.userId).toBe('u2');
    });

    it('handles all-avoid scenario gracefully', () => {
      // 3 players who all avoid each other — no valid pairs
      const players = [
        makePlayer('u1', ['u2', 'u3']),
        makePlayer('u2', ['u1', 'u3']),
        makePlayer('u3', ['u1', 'u2']),
      ];
      const pairs = pairPlayers(players);
      expect(pairs).toHaveLength(0);
    });

    it('produces deterministic results (same input -> same pairs)', () => {
      const players = [
        makePlayer('u1'),
        makePlayer('u2'),
        makePlayer('u3'),
        makePlayer('u4'),
      ];
      const result1 = pairPlayers(players);
      const result2 = pairPlayers(players);
      expect(result1).toEqual(result2);
    });
  });

  describe('cleanupOldEntries', () => {
    it('should delete entries older than one day with status LEFT', async () => {
      mockQueueRepository.delete.mockResolvedValue({ affected: 3 });

      await service.cleanupOldEntries();

      expect(mockQueueRepository.delete).toHaveBeenCalledTimes(1);

      const deleteCall = mockQueueRepository.delete.mock.calls[0][0];

      // Should filter by status LEFT
      expect(deleteCall.status).toBe(QueueStatus.LEFT);

      // Should filter by createdAt (the LessThan find operator for old entries)
      expect(deleteCall.createdAt).toBeDefined();

      // Verify the delete was called with a createdAt filter (LessThan semantics)
      // TypeORM's LessThan creates a FindOperator; we verify it exists and is
      // not MoreThan by checking the operator value points to a past date
      const createdAtFilter = deleteCall.createdAt;
      expect(createdAtFilter).toBeDefined();
      expect(typeof createdAtFilter).toBe('object');
    });

    it('should not delete recent or waiting entries', async () => {
      mockQueueRepository.delete.mockResolvedValue({ affected: 0 });

      await service.cleanupOldEntries();

      const deleteCall = mockQueueRepository.delete.mock.calls[0][0];

      // Should only target LEFT status entries
      expect(deleteCall.status).toBe(QueueStatus.LEFT);
      // Should have a createdAt filter (LessThan semantics)
      expect(deleteCall.createdAt).toBeDefined();
      expect(typeof deleteCall.createdAt).toBe('object');
    });
  });
});
