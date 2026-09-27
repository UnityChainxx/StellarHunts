import { Injectable, ForbiddenException } from '@nestjs/common';
import type { ReferralCodeService } from './referral-code.service';
import type { ReferralInviteService } from './referral-invite.service';
import type { ReferralBonusService } from './referral-bonus.service';
import type { CreateReferralCodeDto } from '../dto/create-referral-code.dto';
import type { CreateInviteDto } from '../dto/create-invite.dto';
import type { ReferralStatsDto } from '../dto/referral-stats.dto';

@Injectable()
export class ReferralService {
  constructor(
    private readonly referralCodeService: ReferralCodeService,
    private readonly inviteService: ReferralInviteService,
    private readonly bonusService: ReferralBonusService,
  ) {}

  async createReferralCode(userId: string, createDto?: CreateReferralCodeDto) {
    return this.referralCodeService.createReferralCode(userId, createDto);
  }

  async trackReferral(
    userId: string,
    email: string,
    trackDto: { referrerId: string },
  ) {
    return this.inviteService.trackReferral(userId, email, trackDto.referrerId);
  }

  /**
   * An invite is sent on behalf of a referral code, so the caller must own
   * the code referenced by `createDto.referralCode`. Prevents any
   * authenticated user from spending another user's invite quota.
   */
  async sendInvite(userId: string, createDto: CreateInviteDto) {
    const code = await this.referralCodeService.findByCode(
      createDto.referralCode,
    );
    if (code.userId !== userId) {
      throw new ForbiddenException(
        'You can only send invites with your own referral code',
      );
    }

    const invite = await this.inviteService.createInvite(createDto);

    // Here you would integrate with your email service
    // await this.emailService.sendInviteEmail(invite.email, invite.referralCode.code);

    return invite;
  }

  async handleUserRegistration(email: string, userId: string) {
    const invite = await this.inviteService.markAsRegistered(email, userId);

    if (invite) {
      // Automatically complete the invite and allocate bonuses
      const completedInvite = await this.inviteService.markAsCompleted(
        invite.id,
      );
      await this.bonusService.allocateReferralBonus(completedInvite);

      return completedInvite;
    }

    return null;
  }

  async getUserReferralStats(userId: string): Promise<ReferralStatsDto> {
    const referralCodes = await this.referralCodeService.findByUserId(userId);
    const bonusStats = await this.bonusService.getBonusStats(userId);

    const totalInvites = referralCodes.reduce(
      (sum, code) => sum + code.totalInvites,
      0,
    );
    const successfulInvites = referralCodes.reduce(
      (sum, code) => sum + code.successfulInvites,
      0,
    );
    const totalBonusEarned = referralCodes.reduce(
      (sum, code) => sum + Number(code.totalBonusEarned),
      0,
    );

    return {
      totalInvites,
      successfulInvites,
      conversionRate:
        totalInvites > 0 ? (successfulInvites / totalInvites) * 100 : 0,
      totalBonusEarned,
      pendingBonuses: bonusStats.totalPending,
      processedBonuses: bonusStats.totalProcessed,
    };
  }

  async getUserReferralCode(userId: string) {
    const codes = await this.referralCodeService.findByUserId(userId);
    return codes.find((code) => code.isActive) || null;
  }

  async getReferralHistory(userId: string) {
    const referralCodes = await this.referralCodeService.findByUserId(userId);
    const invites = [];

    for (const code of referralCodes) {
      const codeInvites = await this.inviteService.findByReferralCode(code.id);
      invites.push(...codeInvites);
    }

    return invites;
  }

  /**
   * Completing an invite allocates referral bonuses, so only the referrer
   * (owner of the referral code the invite belongs to) may complete it.
   */
  async processCompletedInvite(inviteId: string, requesterId: string) {
    const invite = await this.inviteService.findById(inviteId);
    if (invite.referralCode.userId !== requesterId) {
      throw new ForbiddenException(
        'Only the referrer who sent this invite can complete it',
      );
    }

    const completedInvite = await this.inviteService.markAsCompleted(inviteId);
    return this.bonusService.allocateReferralBonus(completedInvite);
  }

  async cleanupExpiredInvites() {
    await this.inviteService.expireOldInvites();
  }
}
