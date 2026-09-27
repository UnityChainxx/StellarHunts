import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReferralInviteService } from './referral-invite.service';
import { InviteStatus } from '../entities/referral-invite.entity';

describe('ReferralInviteService.trackReferral (issue #498)', () => {
  let service: ReferralInviteService;
  let mockInviteRepo: any;
  let mockCodeService: any;

  const REFERRER_ID = '11111111-1111-4111-8111-111111111111';
  const NEW_USER_ID = '22222222-2222-4222-8222-222222222222';
  const REFERRAL_CODE_ID = 'code-uuid-1';

  const mockReferralCode = {
    id: REFERRAL_CODE_ID,
    code: 'REF12345',
    userId: REFERRER_ID,
    isActive: true,
  };

  beforeEach(() => {
    mockInviteRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 'invite-uuid-1' })),
      save: jest.fn(async (invite) => invite),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    mockCodeService = {
      findByCode: jest.fn().mockResolvedValue(mockReferralCode),
      findByUserId: jest.fn().mockResolvedValue([mockReferralCode]),
      updateStats: jest.fn().mockResolvedValue(undefined),
    };

    service = new ReferralInviteService(mockInviteRepo, mockCodeService);
  });

  it('creates exactly one invite record for a new referral pair', async () => {
    mockInviteRepo.findOne.mockResolvedValue(null);

    const result = await service.trackReferral(
      NEW_USER_ID,
      'newuser@example.com',
      'REF12345',
    );

    expect(result.success).toBe(true);
    expect(result.isNew).toBe(true);
    expect(mockInviteRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referralCodeId: REFERRAL_CODE_ID,
        invitedUserId: NEW_USER_ID,
        email: 'newuser@example.com',
        status: InviteStatus.REGISTERED,
      }),
    );
    expect(mockInviteRepo.save).toHaveBeenCalledTimes(1);
    expect(mockCodeService.updateStats).toHaveBeenCalledWith(
      REFERRAL_CODE_ID,
      { invites: 1 },
    );
  });

  it('asserts that an idempotent repeat call does not create a second invite', async () => {
    const existingInvite = {
      id: 'existing-invite-1',
      referralCodeId: REFERRAL_CODE_ID,
      invitedUserId: NEW_USER_ID,
      email: 'newuser@example.com',
      status: InviteStatus.REGISTERED,
    };

    // First call: invite already exists in DB
    mockInviteRepo.findOne.mockResolvedValue(existingInvite);

    const result = await service.trackReferral(
      NEW_USER_ID,
      'newuser@example.com',
      'REF12345',
    );

    expect(result.success).toBe(true);
    expect(result.isNew).toBe(false);
    expect(result.invite.id).toBe('existing-invite-1');
    // Crucial: create was NOT called, no second invite was created
    expect(mockInviteRepo.create).not.toHaveBeenCalled();
    expect(mockCodeService.updateStats).not.toHaveBeenCalled();
  });

  it('rejects self-referrals', async () => {
    await expect(
      service.trackReferral(REFERRER_ID, 'owner@example.com', 'REF12345'),
    ).rejects.toThrow(BadRequestException);

    expect(mockInviteRepo.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when referral code does not exist', async () => {
    mockCodeService.findByCode.mockRejectedValue(new Error('Not found'));
    mockCodeService.findByUserId.mockResolvedValue([]);

    await expect(
      service.trackReferral(NEW_USER_ID, 'new@example.com', 'INVALID_CODE'),
    ).rejects.toThrow(NotFoundException);
  });
});
