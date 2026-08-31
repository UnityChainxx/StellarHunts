import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { MultiplayerQueueService } from './multiplayer-queue.service';
import { Queue, QueueStatus, SkillLevel } from './entities/queue.entity';
import { Match, MatchStatus } from './entities/match.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockRepos() {
  return {
    queueRepository: {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    matchRepository: {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    },
    dataSource: {
      transaction: jest.fn(),
    } as unknown as DataSource,
  };
}

function makePlayer(overrides: Partial<Queue> = {}): Queue {
  return {
    id: `q-${Math.random().toString(36).slice(2, 8)}`,
    userId: `u-${Math.random().toString(36).slice(2, 8)}`,
    username: `player-${Math.random().toString(36).slice(2, 6)}`,
    status: QueueStatus.WAITING,
    skillLevel: SkillLevel.BEGINNER,
    gameMode: 'classic',
    waitTime: 0,
    matchId: null,
    preferences: {},
    createdAt: new Date(),
    matchedAt: null,
    leftAt: null,
    ...overrides,
  } as Queue;
}

function makeJoinDto(overrides: Record<string, unknown> = {}) {
  return {
    userId: `u-${Math.random().toString(36).slice(2, 8)}`,
    username: `player-${Math.random().toString(36).slice(2, 6)}`,
    skillLevel: SkillLevel.BEGINNER,
    gameMode: 'classic',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MultiplayerQueueService — concurrency tests', () => {
  let service: MultiplayerQueueService;
  let mocks: ReturnType<typeof createMockRepos>;

  beforeEach(async () => {
    mocks = createMockRepos();

    // dataSource.transaction runs the callback inline (no real DB)
    (mocks.dataSource.transaction as any).mockImplementation(
      async (cb: any) => {
        const manager = {
          create: mocks.matchRepository.create,
          save: mocks.matchRepository.save,
        };
        return cb(manager);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiplayerQueueService,
        { provide: getRepositoryToken(Queue), useValue: mocks.queueRepository },
        { provide: getRepositoryToken(Match), useValue: mocks.matchRepository },
        { provide: DataSource, useValue: mocks.dataSource },
      ],
    }).compile();

    service = module.get<MultiplayerQueueService>(MultiplayerQueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════
  // DUPLICATE JOINS
  // ═══════════════════════════════════════════════════════════════════
  describe('duplicate joins', () => {
    it('rejects a second join from the same user while WAITING', async () => {
      const userId = 'u-dup-1';
      const existing = makePlayer({ userId, status: QueueStatus.WAITING });
      mocks.queueRepository.findOne.mockResolvedValue(existing);

      await expect(
        service.joinQueue(makeJoinDto({ userId })),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows re-join after the user has LEFT the queue', async () => {
      const userId = 'u-rejoin-1';
      // First findOne: no WAITING entry (user previously LEFT)
      mocks.queueRepository.findOne.mockResolvedValue(null);
      const newEntry = makePlayer({ userId, status: QueueStatus.WAITING });
      mocks.queueRepository.create.mockReturnValue(newEntry);
      mocks.queueRepository.save.mockResolvedValue(newEntry);

      const result = await service.joinQueue(makeJoinDto({ userId }));
      expect(result.userId).toBe(userId);
      expect(result.status).toBe(QueueStatus.WAITING);
    });

    it('allows re-join after the user was MATCHED', async () => {
      const userId = 'u-rejoin-2';
      // findOne for WAITING returns null (user is MATCHED, not WAITING)
      mocks.queueRepository.findOne.mockResolvedValue(null);
      const newEntry = makePlayer({ userId, status: QueueStatus.WAITING });
      mocks.queueRepository.create.mockReturnValue(newEntry);
      mocks.queueRepository.save.mockResolvedValue(newEntry);

      const result = await service.joinQueue(makeJoinDto({ userId }));
      expect(result.userId).toBe(userId);
    });

    it('concurrent join attempts both see the same state (first-writer wins)', async () => {
      const userId = 'u-concurrent-join';
      let callCount = 0;

      // Simulate: first call returns null (no entry), second call returns the entry
      mocks.queueRepository.findOne
        .mockImplementationOnce(() => Promise.resolve(null)) // first join attempt
        .mockImplementationOnce(() =>
          Promise.resolve(
            makePlayer({ userId, status: QueueStatus.WAITING }),
          ),
        ); // second join attempt

      const entry = makePlayer({ userId, status: QueueStatus.WAITING });
      mocks.queueRepository.create.mockReturnValue(entry);
      mocks.queueRepository.save.mockResolvedValue(entry);

      const join1 = service.joinQueue(makeJoinDto({ userId }));
      const join2 = service.joinQueue(makeJoinDto({ userId }));

      const results = await Promise.allSettled([join1, join2]);

      // Exactly one should succeed, one should be rejected
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      if (rejected[0].status === 'rejected') {
        expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // LEAVE / JOIN RACES
  // ═══════════════════════════════════════════════════════════════════
  describe('leave / join races', () => {
    it('leaveQueue sets status to LEFT and records leftAt', async () => {
      const userId = 'u-leave-1';
      const entry = makePlayer({ userId, status: QueueStatus.WAITING });
      mocks.queueRepository.findOne.mockResolvedValue(entry);
      mocks.queueRepository.save.mockResolvedValue({
        ...entry,
        status: QueueStatus.LEFT,
        leftAt: new Date(),
      });

      await service.leaveQueue(userId);

      expect(mocks.queueRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: QueueStatus.LEFT,
          leftAt: expect.any(Date),
        }),
      );
    });

    it('leaveQueue throws NotFoundException when user is not in queue', async () => {
      mocks.queueRepository.findOne.mockResolvedValue(null);
      await expect(
        service.leaveQueue('u-no-such-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('leave after already being LEFT throws NotFoundException', async () => {
      const userId = 'u-double-leave';
      // User already left; findOne for WAITING returns null
      mocks.queueRepository.findOne.mockResolvedValue(null);

      await expect(service.leaveQueue(userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rapid leave-then-rejoin creates a fresh entry', async () => {
      const userId = 'u-rapid-rl';
      const existing = makePlayer({ userId, status: QueueStatus.WAITING });

      // leaveQueue
      mocks.queueRepository.findOne.mockResolvedValue(existing);
      mocks.queueRepository.save.mockResolvedValueOnce({
        ...existing,
        status: QueueStatus.LEFT,
      });
      await service.leaveQueue(userId);

      // rejoin — findOne for WAITING returns null
      mocks.queueRepository.findOne.mockResolvedValueOnce(null);
      const newEntry = makePlayer({ userId, status: QueueStatus.WAITING });
      mocks.queueRepository.create.mockReturnValue(newEntry);
      mocks.queueRepository.save.mockResolvedValueOnce(newEntry);

      const result = await service.joinQueue(makeJoinDto({ userId }));
      expect(result.userId).toBe(userId);
      expect(result.status).toBe(QueueStatus.WAITING);
    });

    it('leaveQueue during matchmaking does not corrupt match creation', async () => {
      // This tests that leaveQueue correctly marks LEFT even if a match
      // was about to happen. The leave sets status=LEFT so processMatchmaking
      // (which queries WHERE status=WAITING) won't pick this user up.
      const userId = 'u-leave-during-match';
      const entry = makePlayer({ userId, status: QueueStatus.WAITING });
      mocks.queueRepository.findOne.mockResolvedValue(entry);
      mocks.queueRepository.save.mockResolvedValue({
        ...entry,
        status: QueueStatus.LEFT,
        leftAt: new Date(),
      });

      await service.leaveQueue(userId);

      // Verify the save was called with LEFT status
      const saveCall = mocks.queueRepository.save.mock.calls[0][0];
      expect(saveCall.status).toBe(QueueStatus.LEFT);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STALE QUEUE ENTRIES
  // ═══════════════════════════════════════════════════════════════════
  describe('stale queue entries', () => {
    it('cleanupOldEntries targets only LEFT entries older than 1 day', async () => {
      mocks.queueRepository.delete.mockResolvedValue({ affected: 5 });

      await service.cleanupOldEntries();

      expect(mocks.queueRepository.delete).toHaveBeenCalledTimes(1);
      const deleteArg = mocks.queueRepository.delete.mock.calls[0][0];
      expect(deleteArg.status).toBe(QueueStatus.LEFT);
      expect(deleteArg.createdAt).toBeDefined();
      // The createdAt should be a LessThan operator (past date)
      expect(typeof deleteArg.createdAt).toBe('object');
    });

    it('cleanupOldEntries does not touch WAITING or MATCHED entries', async () => {
      mocks.queueRepository.delete.mockResolvedValue({ affected: 0 });

      await service.cleanupOldEntries();

      const deleteArg = mocks.queueRepository.delete.mock.calls[0][0];
      // Only LEFT entries are deleted
      expect(deleteArg.status).toBe(QueueStatus.LEFT);
    });

    it('getQueueStatus returns null for stale entries that have LEFT', async () => {
      const userId = 'u-stale';
      // User has LEFT — findOne for WAITING returns null
      mocks.queueRepository.findOne.mockResolvedValue(null);

      const result = await service.getQueueStatus(userId);
      expect(result).toBeNull();
    });

    it('getQueueStatus computes wait time correctly for long-waiting entries', async () => {
      const userId = 'u-long-wait';
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const entry = makePlayer({
        userId,
        status: QueueStatus.WAITING,
        createdAt: fiveMinAgo,
        waitTime: 0,
      });
      mocks.queueRepository.findOne.mockResolvedValue(entry);
      mocks.queueRepository.save.mockResolvedValue({ ...entry, waitTime: 300 });

      const result = await service.getQueueStatus(userId);
      expect(result).toBeDefined();
      expect(result!.waitTime).toBe(300);
    });

    it('stale entry with status LEFT is excluded from matchmaking scan', async () => {
      const stalePlayer = makePlayer({
        userId: 'u-stale-1',
        status: QueueStatus.LEFT,
      });
      // processMatchmaking only finds WAITING players
      mocks.queueRepository.find.mockResolvedValue([]);

      await service.processMatchmaking();

      expect(mocks.queueRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: QueueStatus.WAITING },
        }),
      );
    });

    it('getQueueStats only counts WAITING entries', async () => {
      // All entries are LEFT, so totalInQueue should be 0
      mocks.queueRepository.find.mockResolvedValue([]);
      mocks.matchRepository.count.mockResolvedValue(0);

      const stats = await service.getQueueStats();
      expect(stats.totalInQueue).toBe(0);
      expect(stats.matchesToday).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // MATCHMAKING RETRIES
  // ═══════════════════════════════════════════════════════════════════
  describe('matchmaking retries', () => {
    it('processMatchmaking returns early with fewer than 2 players', async () => {
      mocks.queueRepository.find.mockResolvedValue([makePlayer()]);

      await service.processMatchmaking();

      // No matches should be created
      expect(mocks.matchRepository.create).not.toHaveBeenCalled();
    });

    it('processMatchmaking returns early with 0 players', async () => {
      mocks.queueRepository.find.mockResolvedValue([]);

      await service.processMatchmaking();
      expect(mocks.matchRepository.create).not.toHaveBeenCalled();
    });

    it('processMatchmaking creates a match for 2 compatible players', async () => {
      const p1 = makePlayer({ userId: 'u1', username: 'alice' });
      const p2 = makePlayer({ userId: 'u2', username: 'bob' });
      mocks.queueRepository.find.mockResolvedValue([p1, p2]);

      const matchResult = {
        id: 'match-1',
        playerIds: ['u1', 'u2'],
        playerUsernames: ['alice', 'bob'],
        gameMode: 'classic',
        skillLevel: SkillLevel.BEGINNER,
        averageWaitTime: 0,
        createdAt: new Date(),
        status: MatchStatus.PENDING,
      };
      mocks.matchRepository.create.mockReturnValue(matchResult);
      mocks.matchRepository.save.mockResolvedValue(matchResult);

      await service.processMatchmaking();

      expect(mocks.matchRepository.create).toHaveBeenCalledTimes(1);
      expect(mocks.matchRepository.save).toHaveBeenCalled();
    });

    it('processMatchmaking handles match creation failure gracefully', async () => {
      const p1 = makePlayer({ userId: 'u1' });
      const p2 = makePlayer({ userId: 'u2' });
      mocks.queueRepository.find.mockResolvedValue([p1, p2]);

      // Transaction throws
      mocks.dataSource.transaction = jest
        .fn()
        .mockRejectedValue(new Error('DB timeout')) as any;

      // Should not throw (processMatchmaking catches errors internally)
      await expect(service.processMatchmaking()).resolves.toBeUndefined();
    });

    it('repeated processMatchmaking calls do not re-match already MATCHED players', async () => {
      // First call: 2 players waiting
      const p1 = makePlayer({ userId: 'u1' });
      const p2 = makePlayer({ userId: 'u2' });
      mocks.queueRepository.find.mockResolvedValue([p1, p2]);

      const matchResult = {
        id: 'match-1',
        playerIds: ['u1', 'u2'],
        playerUsernames: ['p1', 'p2'],
        gameMode: 'classic',
        skillLevel: SkillLevel.BEGINNER,
        averageWaitTime: 0,
        createdAt: new Date(),
        status: MatchStatus.PENDING,
      };
      mocks.matchRepository.create.mockReturnValue(matchResult);
      mocks.matchRepository.save.mockResolvedValue(matchResult);

      await service.processMatchmaking();

      // Second call: no WAITING players left
      mocks.queueRepository.find.mockResolvedValue([]);
      mocks.matchRepository.create.mockClear();

      await service.processMatchmaking();

      expect(mocks.matchRepository.create).not.toHaveBeenCalled();
    });

    it('joinQueue triggers matchmaking attempt', async () => {
      const userId = 'u-trigger-match';
      mocks.queueRepository.findOne.mockResolvedValue(null); // not in queue
      const entry = makePlayer({ userId });
      mocks.queueRepository.create.mockReturnValue(entry);
      mocks.queueRepository.save.mockResolvedValue(entry);

      // Mock the matchmaking query to return 2 players for immediate match
      const p2 = makePlayer({ userId: 'u-other' });
      mocks.queueRepository.find.mockResolvedValue([entry, p2]);

      const matchResult = {
        id: 'match-auto',
        playerIds: [userId, 'u-other'],
        playerUsernames: ['p1', 'p2'],
        gameMode: 'classic',
        skillLevel: SkillLevel.BEGINNER,
        averageWaitTime: 0,
        createdAt: new Date(),
        status: MatchStatus.PENDING,
      };
      mocks.matchRepository.create.mockReturnValue(matchResult);
      mocks.matchRepository.save.mockResolvedValue(matchResult);

      const result = await service.joinQueue(makeJoinDto({ userId }));
      expect(result.userId).toBe(userId);
      // processMatchmaking was called internally by joinQueue
      expect(mocks.queueRepository.find).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PROCESS RESTARTS
  // ═══════════════════════════════════════════════════════════════════
  describe('process restarts', () => {
    it('after restart, existing WAITING entries are still visible', async () => {
      const survivingEntries = [
        makePlayer({ userId: 'u-survive-1', status: QueueStatus.WAITING }),
        makePlayer({ userId: 'u-survive-2', status: QueueStatus.WAITING }),
      ];
      mocks.queueRepository.find.mockResolvedValue(survivingEntries);

      const stats = await service.getQueueStats();
      expect(stats.totalInQueue).toBe(2);
    });

    it('after restart, LEFT entries are cleaned up', async () => {
      mocks.queueRepository.delete.mockResolvedValue({ affected: 3 });

      await service.cleanupOldEntries();

      expect(mocks.queueRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({ status: QueueStatus.LEFT }),
      );
    });

    it('after restart, processMatchmaking resumes with waiting players', async () => {
      const p1 = makePlayer({ userId: 'u-restart-1' });
      const p2 = makePlayer({ userId: 'u-restart-2' });
      mocks.queueRepository.find.mockResolvedValue([p1, p2]);

      const matchResult = {
        id: 'match-restart',
        playerIds: [p1.userId, p2.userId],
        playerUsernames: [p1.username, p2.username],
        gameMode: 'classic',
        skillLevel: SkillLevel.BEGINNER,
        averageWaitTime: 0,
        createdAt: new Date(),
        status: MatchStatus.PENDING,
      };
      mocks.matchRepository.create.mockReturnValue(matchResult);
      mocks.matchRepository.save.mockResolvedValue(matchResult);

      await service.processMatchmaking();

      expect(mocks.matchRepository.create).toHaveBeenCalledTimes(1);
    });

    it('getQueueList returns all WAITING entries after restart', async () => {
      const entries = [
        makePlayer({ userId: 'u-a', createdAt: new Date('2025-01-01') }),
        makePlayer({ userId: 'u-b', createdAt: new Date('2025-01-02') }),
      ];
      mocks.queueRepository.find.mockResolvedValue(entries);
      mocks.queueRepository.save.mockResolvedValue(entries);

      const list = await service.getQueueList();
      expect(list).toHaveLength(2);
      // Should be ordered by createdAt ASC
      expect(list[0].userId).toBe('u-a');
      expect(list[1].userId).toBe('u-b');
    });

    it('getMatch returns match details for an existing match', async () => {
      const match = {
        id: 'match-xyz',
        playerIds: ['u1', 'u2'],
        playerUsernames: ['alice', 'bob'],
        status: MatchStatus.ACTIVE,
        gameMode: 'classic',
        skillLevel: SkillLevel.INTERMEDIATE,
        averageWaitTime: 45,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
      };
      mocks.matchRepository.findOne.mockResolvedValue(match);

      const result = await service.getMatch('match-xyz');
      expect(result.matchId).toBe('match-xyz');
      expect(result.playerIds).toEqual(['u1', 'u2']);
      expect(result.status).toBe(MatchStatus.ACTIVE);
    });

    it('getMatch throws NotFoundException for non-existent match', async () => {
      mocks.matchRepository.findOne.mockResolvedValue(null);
      await expect(service.getMatch('no-such-match')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // EDGE CASES — empty queues, mismatched game modes
  // ═══════════════════════════════════════════════════════════════════
  describe('edge cases', () => {
    it('processMatchmaking does not match players with different game modes', async () => {
      const p1 = makePlayer({ gameMode: 'classic', userId: 'u1' });
      const p2 = makePlayer({ gameMode: 'blitz', userId: 'u2' });
      mocks.queueRepository.find.mockResolvedValue([p1, p2]);

      await service.processMatchmaking();

      // Players are in different groups (classic vs blitz), so no match
      expect(mocks.matchRepository.create).not.toHaveBeenCalled();
    });

    it('processMatchmaking does not match players with avoidOpponents conflict', async () => {
      const p1 = makePlayer({
        userId: 'u1',
        preferences: { avoidOpponents: ['u2'] },
      });
      const p2 = makePlayer({ userId: 'u2' });
      mocks.queueRepository.find.mockResolvedValue([p1, p2]);

      await service.processMatchmaking();

      // pairPlayersInGroup should skip this pair
      expect(mocks.matchRepository.create).not.toHaveBeenCalled();
    });

    it('getQueueStats returns zero stats for empty queue', async () => {
      mocks.queueRepository.find.mockResolvedValue([]);
      mocks.matchRepository.count.mockResolvedValue(0);

      const stats = await service.getQueueStats();
      expect(stats.totalInQueue).toBe(0);
      expect(stats.averageWaitTime).toBe(0);
      expect(stats.longestWaitTime).toBe(0);
      expect(stats.matchesToday).toBe(0);
    });

    it('getQueueStats groups by skill level correctly', async () => {
      const entries = [
        makePlayer({ skillLevel: SkillLevel.BEGINNER, gameMode: 'classic' }),
        makePlayer({ skillLevel: SkillLevel.BEGINNER, gameMode: 'classic' }),
        makePlayer({ skillLevel: SkillLevel.EXPERT, gameMode: 'blitz' }),
      ];
      mocks.queueRepository.find.mockResolvedValue(entries);
      mocks.matchRepository.count.mockResolvedValue(0);

      const stats = await service.getQueueStats();
      expect(stats.totalInQueue).toBe(3);
      expect(stats.bySkillLevel[SkillLevel.BEGINNER]).toBe(2);
      expect(stats.bySkillLevel[SkillLevel.EXPERT]).toBe(1);
      expect(stats.byGameMode['classic']).toBe(2);
      expect(stats.byGameMode['blitz']).toBe(1);
    });
  });
});
