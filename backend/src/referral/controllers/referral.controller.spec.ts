import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ReferralController } from './referral.controller';
import { ReferralService } from '../services/referral.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('ReferralController', () => {
  let controller: ReferralController;
  let serviceMock: {
    createReferralCode: jest.Mock;
    getUserReferralCode: jest.Mock;
    sendInvite: jest.Mock;
    getUserReferralStats: jest.Mock;
    getReferralHistory: jest.Mock;
    processCompletedInvite: jest.Mock;
    handleUserRegistration: jest.Mock;
  };

  const USER_ID = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    serviceMock = {
      createReferralCode: jest.fn().mockResolvedValue({ id: 'code-1' }),
      getUserReferralCode: jest.fn().mockResolvedValue({ id: 'code-1' }),
      sendInvite: jest.fn().mockResolvedValue({ id: 'invite-1' }),
      getUserReferralStats: jest.fn().mockResolvedValue({ totalInvites: 0 }),
      getReferralHistory: jest.fn().mockResolvedValue([]),
      processCompletedInvite: jest.fn().mockResolvedValue({ id: 'invite-1' }),
      handleUserRegistration: jest.fn().mockResolvedValue({ id: 'invite-1' }),
      trackReferral: jest.fn().mockResolvedValue({ success: true, isNew: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReferralController],
      providers: [{ provide: ReferralService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ReferralController>(ReferralController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('access control', () => {
    it('requires JWT authentication at the controller level', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, ReferralController);
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('identity resolution', () => {
    it('uses the authenticated user id, never a placeholder or client input', async () => {
      await controller.createReferralCode(USER_ID, {});
      expect(serviceMock.createReferralCode).toHaveBeenCalledWith(
        USER_ID,
        {},
      );
      expect(serviceMock.createReferralCode).not.toHaveBeenCalledWith(
        'user-id-placeholder',
        expect.anything(),
      );
    });

    it('scopes stats and history reads to the authenticated user', async () => {
      await controller.getMyStats();
      await controller.getReferralHistory();
      expect(serviceMock.getUserReferralStats).toHaveBeenCalledWith(USER_ID);
      expect(serviceMock.getReferralHistory).toHaveBeenCalledWith(USER_ID);
    });

    it('resolves register identity from the authenticated user, ignoring any client-supplied id', async () => {
      await controller.handleRegistration(USER_ID, 'player@example.com');
      expect(serviceMock.handleUserRegistration).toHaveBeenCalledWith(
        'player@example.com',
        USER_ID,
      );
    });
  });

  describe('sendInvite', () => {
    it('passes the authenticated user id to the service for the ownership check', async () => {
      const dto = {
        email: 'friend@example.com',
        referralCode: 'ABCD1234',
      };
      await controller.sendInvite(USER_ID, dto);
      expect(serviceMock.sendInvite).toHaveBeenCalledWith(USER_ID, dto);
    });
  });

  describe('completeInvite', () => {
    it('passes the authenticated user id so the service can verify ownership', async () => {
      await controller.completeInvite(USER_ID, '22222222-2222-4222-8222-222222222222');
      expect(serviceMock.processCompletedInvite).toHaveBeenCalledWith(
        '22222222-2222-4222-8222-222222222222',
        USER_ID,
      );
    });
  });

  describe('trackReferral', () => {
    it('resolves invited user identity from the authenticated user, ignoring client-supplied id', async () => {
      const dto = { referrerId: 'REF12345', newUserId: 'spoofed-id' };
      await controller.trackReferral(USER_ID, 'user@example.com', dto);
      expect(serviceMock.trackReferral).toHaveBeenCalledWith(
        USER_ID,
        'user@example.com',
        dto,
      );
    });
  });
});
