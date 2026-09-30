import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { APIKeyGuard } from '../../api-key/api-key.guard';
import type { MilestoneService } from '../services/milestone.service';

/**
 * Identity rules (issue #482):
 * - The `/my` routes resolve the user id from the verified JWT principal
 *   (`req.user.id` via the JwtStrategy validate() hook) — never from a
 *   placeholder or any client-supplied value. Unauthenticated calls are
 *   rejected with 401.
 * - The `/trigger/*` routes are server-to-server endpoints that mint
 *   milestone awards for the user named in the body, so they sit behind
 *   the API key guard (`x-api-key` header) which a browser user cannot
 *   satisfy. They intentionally do NOT accept JWT auth.
 */
@Controller('milestones')
export class MilestoneController {
  constructor(private readonly milestoneService: MilestoneService) {}

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyMilestones(@CurrentUser('id') userId: string) {
    return this.milestoneService.getUserMilestones(userId);
  }

  @Get('my/stats')
  @UseGuards(JwtAuthGuard)
  async getMyMilestoneStats(@CurrentUser('id') userId: string) {
    return this.milestoneService.getUserMilestoneStats(userId);
  }

  @Get('my/next')
  @UseGuards(JwtAuthGuard)
  async getMyNextMilestones(@CurrentUser('id') userId: string) {
    return this.milestoneService.getNextMilestones(userId);
  }

  /**
   * Marks a milestone as viewed for the *calling* user only: the update is
   * scoped by `{ id, userId }` in the assignment service, so one user can
   * never mutate another user's unread state.
   */
  @Post('my/:milestoneId/view')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async markMilestoneAsViewed(
    @CurrentUser('id') userId: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    await this.milestoneService.markMilestoneAsViewed(userId, milestoneId);
    return { success: true };
  }

  // Server-to-server endpoints for external systems to trigger milestone
  // checks. Guarded by API key auth, not JWT (see class docblock).
  @Post('trigger/puzzle-completed')
  @HttpCode(HttpStatus.OK)
  @UseGuards(APIKeyGuard)
  async triggerPuzzleCompleted(
    @Body() body: { userId: string; puzzleData?: any },
  ) {
    return this.milestoneService.onPuzzleCompleted(body.userId, body.puzzleData);
  }

  @Post('trigger/streak-updated')
  @HttpCode(HttpStatus.OK)
  @UseGuards(APIKeyGuard)
  async triggerStreakUpdated(
    @Body() body: { userId: string; currentStreak: number; longestStreak: number },
  ) {
    return this.milestoneService.onStreakUpdated(
      body.userId,
      body.currentStreak,
      body.longestStreak,
    );
  }
}
