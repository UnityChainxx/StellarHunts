import { Test, TestingModule } from '@nestjs/testing';
import { UserActivityLogService } from './user-activity-log.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityLog } from './entities/activity-log.entity';

describe('UserActivityLogService', () => {
  let service: UserActivityLogService;
  let repoMock: any;

  beforeEach(async () => {
    repoMock = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve(data)),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserActivityLogService,
        { provide: getRepositoryToken(ActivityLog), useValue: repoMock },
      ],
    }).compile();

    service = module.get<UserActivityLogService>(UserActivityLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cleanupExpiredLogs', () => {
    it('deletes expired activity logs in bounded batches', async () => {
      const selectQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'act-1' }, { id: 'act-2' }])
          .mockResolvedValueOnce([]),
      };
      const deleteQb = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };

      repoMock.createQueryBuilder
        .mockReturnValueOnce(selectQb)
        .mockReturnValueOnce(deleteQb)
        .mockReturnValueOnce(selectQb);

      const result = await service.cleanupExpiredLogs(30, 500, 2);
      expect(result.deletedRows).toBe(2);
      expect(result.batches).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
