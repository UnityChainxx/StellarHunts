import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { User } from '../../auth/entities/user.entity';
import type { ReferralService } from '../services/referral.service';
import type { CreateReferralCodeDto } from '../dto/create-referral-code.dto';
import type { CreateInviteDto } from '../dto/create-invite.dto';
import type { TrackReferralDto } from '../dto/track-referral.dto';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /**
   * Every route in this controller is scoped to the *authenticated* user.
   * The user id always comes from the verified JWT (`req.user.id` via the
   * JwtStrategy validate() hook, which loads the user from the database) —
   * never from the request body, params, or any client-supplied value.
   */
  @Post('codes')
  @HttpCode(HttpStatus.CREATED)
  async createReferralCode(
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateReferralCodeDto,
  ) {
    return this.referralService.createReferralCode(userId, createDto);
  }

  @Post('track')
  @HttpCode(HttpStatus.OK)
  async trackReferral(
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
    @Body() trackDto: TrackReferralDto,
  ) {
    return this.referralService.trackReferral(userId, email, trackDto);
  }

  @Get('codes/my')
  async getMyReferralCode(@CurrentUser('id') userId: string) {
    return this.referralService.getUserReferralCode(userId);
  }

  @Post('invites')
  @HttpCode(HttpStatus.CREATED)
  async sendInvite(
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateInviteDto,
  ) {
    return this.referralService.sendInvite(userId, createDto);
  }

  @Get('stats')
  async getMyStats(@CurrentUser('id') userId: string) {
    return this.referralService.getUserReferralStats(userId);
  }

  @Get('history')
  async getReferralHistory(@CurrentUser('id') userId: string) {
    return this.referralService.getReferralHistory(userId);
  }

  /**
   * Completing an invite grants referral bonuses, so only the referrer
   * (owner of the referral code the invite belongs to) may complete it.
   */
  @Post('invites/:id/complete')
  @HttpCode(HttpStatus.OK)
  async completeInvite(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) inviteId: string,
  ) {
    return this.referralService.processCompletedInvite(inviteId, userId);
  }

  /**
   * The authenticated caller registers against a pending invite matched by
   * email. The userId attached to the invite is taken from the JWT, so a
   * caller can never attach referrals to an arbitrary account.
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async handleRegistration(
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
  ) {
    return this.referralService.handleUserRegistration(email, userId);
  }
}
