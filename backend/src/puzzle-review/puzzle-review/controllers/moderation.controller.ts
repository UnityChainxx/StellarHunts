import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../admin/guards/jwt-auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { ModerationService } from '../services/moderation.service';
import { ModerationAction, ModerationReason } from '../entities/review-moderation.entity';
import type { ModerationResponse } from '../interfaces/review.interface';

interface ModerationBody {
  reason?: ModerationReason;
  notes?: string;
}

/**
 * Review moderation endpoints (flag, unflag, delete, approve, reject).
 *
 * Every mutation requires an authenticated admin (`JwtAuthGuard`) with an
 * admin role (`AdminGuard`) and writes an immutable audit record via
 * AuditLogService in ModerationService.
 */
@ApiTags('Review Moderation')
@Controller('moderation/reviews')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  private moderatorId(request: Request): string {
    const user = request.user as { id?: string } | undefined;
    return user?.id ?? 'unknown';
  }

  @Post(':id/flag')
  @ApiOperation({ summary: 'Flag a review for review by moderators' })
  flag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModerationBody,
    @Req() request: Request,
  ): Promise<ModerationResponse> {
    return this.moderationService.moderateReview({
      reviewId: id,
      action: ModerationAction.FLAG,
      reason: body.reason,
      notes: body.notes,
      moderatorId: this.moderatorId(request),
    });
  }

  @Post(':id/unflag')
  @ApiOperation({ summary: 'Unflag a review and return it to approved status' })
  unflag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModerationBody,
    @Req() request: Request,
  ): Promise<ModerationResponse> {
    return this.moderationService.moderateReview({
      reviewId: id,
      action: ModerationAction.UNFLAG,
      reason: body.reason,
      notes: body.notes,
      moderatorId: this.moderatorId(request),
    });
  }

  @Post(':id/delete')
  @ApiOperation({ summary: 'Delete a review via moderation' })
  deleteReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModerationBody,
    @Req() request: Request,
  ): Promise<ModerationResponse> {
    return this.moderationService.moderateReview({
      reviewId: id,
      action: ModerationAction.DELETE,
      reason: body.reason,
      notes: body.notes,
      moderatorId: this.moderatorId(request),
    });
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending or flagged review' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModerationBody,
    @Req() request: Request,
  ): Promise<ModerationResponse> {
    return this.moderationService.moderateReview({
      reviewId: id,
      action: ModerationAction.APPROVE,
      reason: body.reason,
      notes: body.notes,
      moderatorId: this.moderatorId(request),
    });
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a review' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModerationBody,
    @Req() request: Request,
  ): Promise<ModerationResponse> {
    return this.moderationService.moderateReview({
      reviewId: id,
      action: ModerationAction.REJECT,
      reason: body.reason,
      notes: body.notes,
      moderatorId: this.moderatorId(request),
    });
  }

  @Get('pending')
  @ApiOperation({ summary: 'List reviews pending moderation' })
  getPending(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.moderationService.getPendingReviews(page, limit);
  }

  @Get('flagged')
  @ApiOperation({ summary: 'List flagged reviews' })
  getFlagged(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.moderationService.getFlaggedReviews(page, limit);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get moderation statistics' })
  getStats() {
    return this.moderationService.getModerationStats();
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get moderation history for a review' })
  getHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.moderationService.getModerationHistory(id);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk-moderate reviews' })
  bulk(
    @Body()
    body: {
      reviewIds: string[];
      action: ModerationAction;
      reason?: ModerationReason;
      notes?: string;
    },
    @Req() request: Request,
  ): Promise<ModerationResponse[]> {
    return this.moderationService.bulkModerateReviews(
      body.reviewIds,
      body.action,
      this.moderatorId(request),
      body.reason,
      body.notes,
    );
  }
}
