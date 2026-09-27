import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { ReferralCodeService } from './referral-code.service';
import { ReferralInviteService } from './referral-invite.service';
import { ReferralBonusService } from './referral-bonus.service';
import type { ReferralCode } from '../entities/referral-code.entity';
import type { ReferralInvite } from '../entities/referral-invite.entity';

describe('ReferralService authorization', () => {
  let service: ReferralService;
  let codeService: {
    findByCode: jest.Mock;
    findByUserId: jest.Mock;
  };
  let inviteService: {
    createInvite: jest.Mock;
    findById: jest.Mock;
    markAsCompleted: jest.Mock;
    markAsRegistered: jest.Mock;
    findByReferralCode: jest.Mock;
  };
  let bonusService: {
    allocateReferralBonus: jest.Mock;
    getBonusStats: jest.Mock;
  };

  const OWNER_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_ID = '33333333-3333-4333-8333-333333333333';

  const ownedCode = {
    id: 'code-1',
    code: 'ABCD1234',
    userId: OWNER_ID,
  } as ReferralCode;

  const inviteForOwnedCode = {
    id: 'invite-1',
    referralCodeId: 'code-1',
    referralCode: ownedCode,
  } as unknown as ReferralInvite;

  beforeEach(async () => {
    codeService = {
      findByCode: jest.fn().mockResolvedValue(ownedCode),
      findByUserId: jest.fn().mockResolvedValue([ownedCode]),
    };
    inviteService = {
      createInvite: jest.fn().mockResolvedValue({ id: 'invite-1' }),
      findById: jest.fn().mockResolvedValue(inviteForOwnedCode),
      markAsCompleted: jest.fn().mockResolvedValue(inviteForOwnedCode),
      markAsRegistered: jest.fn().mockResolvedValue(null),
      findByReferralCode: jest.fn().mockResolvedValue([]),
    };
    bonusService = {
      allocateReferralBonus: jest.fn().mockResolvedValue([]),
      getBonusStats: jest.fn().mockResolvedValue({
        totalPending: 0,
        totalProcessed: 0,
      }),
    };

    service = new ReferralService(
      codeService as any,
      inviteService as any,
      bonusService as any,
    );
  });

  describe('sendInvite', () => {
    it('allows sending an invite with the caller’s own referral code', async () => {
      const dto = { email: 'friend@example.com', referralCode: 'ABCD1234' };
      await service.sendInvite(OWNER_ID, dto);
      expect(inviteService.createInvite).toHaveBeenCalledWith(dto);
    });

    it('rejects sending an invite with someone else’s referral code', async () => {
      codeService.findByCode.mockResolvedValue({
        ...ownedCode,
        userId: OTHER_ID,
      });

      await expect(
        service.sendInvite(OWNER_ID, {
          email: 'friend@example.com',
          referralCode: 'ABCD1234',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(inviteService.createInvite).not.toHaveBeenCalled();
    });
  });

  describe('processCompletedInvite', () => {
    it('lets the referrer complete their own invite and allocates bonuses', async () => {
      await service.processCompletedInvite('invite-1', OWNER_ID);
      expect(inviteService.findById).toHaveBeenCalledWith('invite-1');
      expect(bonusService.allocateReferralBonus).toHaveBeenCalledWith(
        inviteForOwnedCode,
      );
    });

    it('rejects completion by a user who does not own the referral code', async () => {
      await expect(
        service.processCompletedInvite('invite-1', OTHER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(inviteService.markAsCompleted).not.toHaveBeenCalled();
      expect(bonusService.allocateReferralBonus).not.toHaveBeenCalled();
    });

    it('propagates NotFound when the invite does not exist', async () => {
      inviteService.findById.mockRejectedValue(
        new NotFoundException('Invite not found'),
      );

      await expect(
        service.processCompletedInvite('missing', OWNER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleUserRegistration', () => {
    it('returns null when no pending invite matches the email', async () => {
      const result = await service.handleUserRegistration(
        'unknown@example.com',
        OWNER_ID,
      );
      expect(result).toBeNull();
      expect(bonusService.allocateReferralBonus).not.toHaveBeenCalled();
    });
  });

  describe('trackReferral', () => {
    it('delegates to inviteService.trackReferral with authenticated user id and email', async () => {
      (inviteService as any).trackReferral = jest.fn().mockResolvedValue({
        success: true,
        isNew: true,
        invite: { id: 'inv-1' },
      });

      const res = await service.trackReferral(OTHER_ID, 'other@example.com', {
        referrerId: 'ABCD1234',
      });
      expect((inviteService as any).trackReferral).toHaveBeenCalledWith(
        OTHER_ID,
        'other@example.com',
        'ABCD1234',
      );
      expect(res.success).toBe(true);
    });
  });
});
