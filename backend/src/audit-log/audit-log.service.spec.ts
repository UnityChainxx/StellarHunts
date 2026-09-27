import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService, DEFAULT_RETENTION_DAYS } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((log) => Promise.resolve({ id: 'log-1', ...log })),
      find: jest.fn(() => Promise.resolve([])),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createLog', () => {
    it('persists a new append-only log entry', async () => {
      const log = await service.createLog('user-1', 'puzzle.submitted', {
        puzzleId: 'p-1',
      });
      expect(repo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        action: 'puzzle.submitted',
        meta: { puzzleId: 'p-1' },
      });
      expect(log.id).toBe('log-1');
    });
  });

  describe('findAll', () => {
    it('filters by userId and action and returns paginated result with deterministic ordering', async () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'log-1', userId: 'user-1' }], 1]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({ userId: 'user-1', action: 'login', page: 1, limit: 10 });
      expect(repo.createQueryBuilder).toHaveBeenCalledWith('log');
      expect(qb.andWhere).toHaveBeenCalledWith('log.userId = :actor', { actor: 'user-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('log.action ILIKE :action', { action: '%login%' });
      expect(qb.orderBy).toHaveBeenCalledWith('log.timestamp', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('log.id', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        data: [{ id: 'log-1', userId: 'user-1' }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('filters by targetType and targetId', async () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'log-rev-1' }], 1]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({ targetType: 'review', targetId: 'rev-100' });
      expect(qb.andWhere).toHaveBeenCalledWith("(log.meta->>'targetType' = :targetType)", { targetType: 'review' });
      expect(qb.andWhere).toHaveBeenCalledWith(
        "(log.meta->>'targetId' = :targetId OR log.meta->>'reviewId' = :targetId)",
        { targetId: 'rev-100' },
      );
      expect(result.data).toHaveLength(1);
    });

    it('filters by date range', async () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const start = new Date('2026-01-01');
      const end = new Date('2026-01-31');
      await service.findAll({ startDate: start, endDate: end });
      expect(qb.andWhere).toHaveBeenCalledWith('log.timestamp BETWEEN :startDate AND :endDate', {
        startDate: start,
        endDate: end,
      });
    });
  });

  describe('findByTarget', () => {
    it('resolves audit records for a target', async () => {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'log-target-1' }], 1]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const logs = await service.findByTarget('review', 'review-123');
      expect(logs).toEqual([{ id: 'log-target-1' }]);
    });
  });

  describe('purgeOlderThan / cleanupExpiredLogs', () => {
    it('deletes expired logs in bounded batches', async () => {
      const selectQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'log-1' }, { id: 'log-2' }])
          .mockResolvedValueOnce([]),
      };
      const deleteQb = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };

      repo.createQueryBuilder
        .mockReturnValueOnce(selectQb)
        .mockReturnValueOnce(deleteQb)
        .mockReturnValueOnce(selectQb);

      const result = await service.cleanupExpiredLogs(DEFAULT_RETENTION_DAYS, 500, 2);
      expect(result.deletedRows).toBe(2);
      expect(result.batches).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 when nothing was purged', async () => {
      const selectQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      repo.createQueryBuilder.mockReturnValue(selectQb);

      await expect(service.purgeOlderThan(30)).resolves.toBe(0);
    });
  });
});
