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
    it('filters by userId and action', async () => {
      await service.findAll({ userId: 'user-1', action: 'login' });
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            action: expect.anything(),
          }),
          order: { timestamp: 'DESC' },
        }),
      );
    });

    it('passes date range bounds to Between', async () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-31');
      await service.findAll({ startDate: start, endDate: end });
      const arg = repo.find.mock.calls[0][0];
      expect(arg.where.timestamp).toBeDefined();
      // Between produces a FindOperator — verify the two bounds
      expect(arg.where.timestamp._value).toEqual([start, end]);
    });
  });

  describe('purgeOlderThan', () => {
    it('deletes logs older than the retention window', async () => {
      const qb = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 7 }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const purged = await service.purgeOlderThan(DEFAULT_RETENTION_DAYS);
      expect(purged).toBe(7);
      expect(qb.where).toHaveBeenCalledWith(
        'timestamp < :cutoff',
        expect.objectContaining({ cutoff: expect.any(Date) }),
      );
    });

    it('returns 0 when nothing was purged', async () => {
      const qb = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.purgeOlderThan(30)).resolves.toBe(0);
    });
  });
});
