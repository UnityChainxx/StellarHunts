import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../admin/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/guards/roles.guard';
import { AdminRole } from '../admin/admin-role.enum';
import { ROLES_KEY } from '../admin/roles.decorator';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let serviceMock: {
    findAll: jest.Mock;
    purgeOlderThan: jest.Mock;
  };

  beforeEach(async () => {
    serviceMock = {
      findAll: jest.fn().mockResolvedValue([]),
      purgeOlderThan: jest.fn().mockResolvedValue(3),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [{ provide: AuditLogService, useValue: serviceMock }],
    }).compile();

    controller = module.get<AuditLogController>(AuditLogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('access control', () => {
    it('requires admin JWT authentication at the controller level', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AuditLogController);
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    });

    it('restricts all audit-log routes to admin roles', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AuditLogController);
      expect(roles).toEqual([AdminRole.ADMIN, AdminRole.SUPERADMIN]);
    });
  });

  describe('getAuditLogs', () => {
    it('delegates to the service with parsed date filters and actor mapping', async () => {
      await controller.getAuditLogs({
        userId: 'user-1',
        action: 'login',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-31T00:00:00.000Z',
      });
      expect(serviceMock.findAll).toHaveBeenCalledWith({
        userId: 'user-1',
        actor: 'user-1',
        action: 'login',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-31T00:00:00.000Z'),
      });
    });

    it('delegates with target filters and pagination parameters', async () => {
      await controller.getAuditLogs({
        actor: 'admin-1',
        targetType: 'review',
        targetId: 'rev-123',
        page: 2,
        limit: 10,
      });
      expect(serviceMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'admin-1',
          targetType: 'review',
          targetId: 'rev-123',
          page: 2,
          limit: 10,
        }),
      );
    });

    it('leaves dates undefined when not provided', async () => {
      await controller.getAuditLogs({});
      expect(serviceMock.findAll).toHaveBeenCalledWith({
        actor: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });
  });

  describe('getModerationAuditHistory', () => {
    it('resolves audit history for a review moderation target', async () => {
      serviceMock.findByTarget = jest.fn().mockResolvedValue([{ id: 'log-1' }]);
      const res = await controller.getModerationAuditHistory('review-999');
      expect(serviceMock.findByTarget).toHaveBeenCalledWith('review', 'review-999');
      expect(res).toEqual([{ id: 'log-1' }]);
    });
  });

  describe('purgeOlderThan', () => {
    it('purges records older than the requested retention window', async () => {
      const result = await controller.purgeOlderThan(90);
      expect(serviceMock.purgeOlderThan).toHaveBeenCalledWith(90);
      expect(result).toEqual({ purged: 3, retentionDays: 90 });
    });
  });
});
