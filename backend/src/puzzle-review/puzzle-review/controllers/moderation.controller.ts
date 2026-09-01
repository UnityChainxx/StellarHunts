import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AdminGuard } from '../guards/admin.guard';
import { ModerationService } from '../services/moderation.service';
import type {
  ModerationRequest,
  ModerationResponse,
} from '../interfaces/review.interface';
import type { PuzzleReview } from '../entities/puzzle-review.entity';
import { ModerationAction, ModerationReason } from '../entities/review-moderation.entity';

@ApiTags('Review Moderation')
@Controller('moderation')
@UseGuards(AdminGuard)
export class ModerationController {
  private readonly logger = new Logger(ModerationController.name);

  constructor(private readonly moderationService: ModerationService) {}

  @Post('moderate')
  @ApiOperation({
    summary: 'Moderate a review',
    description: 'Apply a moderation action (approve / reject / flag) to a review',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reviewId', 'action', 'moderatorId'],
      properties: {
        reviewId: { type: 'string', format: 'uuid' },
        action: { type: 'string', enum: Object.values(ModerationAction) },
        moderatorId: { type: 'string', format: 'uuid' },
        reason: { type: 'string', enum: Object.values(ModerationReason) },
        notes: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Review moderated successfully' })
  async moderateReview(
    @Body() moderationRequest: ModerationRequest,
  ): Promise<ModerationResponse> {
    this.logger.log(`Moderating review: ${moderationRequest.reviewId}`);
    return this.moderationService.moderateReview(moderationRequest);
  }

  @Post('bulk')
  @ApiOperation({
    summary: 'Bulk moderate reviews',
    description: 'Apply a single moderation action to multiple reviews',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reviewIds', 'action', 'moderatorId'],
      properties: {
        reviewIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        action: { type: 'string', enum: Object.values(ModerationAction) },
        moderatorId: { type: 'string', format: 'uuid' },
        reason: { type: 'string', enum: Object.values(ModerationReason) },
        notes: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Bulk moderation completed' })
  async bulkModerateReviews(
    @Body()
    body: {
      reviewIds: string[];
      action: ModerationAction;
      moderatorId: string;
      reason?: ModerationReason;
      notes?: string;
    },
  ): Promise<ModerationResponse[]> {
    this.logger.log(`Bulk moderating ${body.reviewIds.length} reviews`);
    return this.moderationService.bulkModerateReviews(
      body.reviewIds,
      body.action,
      body.moderatorId,
      body.reason,
      body.notes,
    );
  }

  @Post('auto')
  @ApiOperation({
    summary: 'Run auto-moderation',
    description: 'Apply rule-based auto-moderation to pending reviews',
  })
  @ApiResponse({
    status: 201,
    description: 'Auto-moderation completed',
  })
  async autoModerateReviews(): Promise<{ success: boolean; moderatedCount: number }> {
    const moderatedCount = await this.moderationService.autoModerateReviews();
    return { success: true, moderatedCount };
  }

  @Get('pending')
  @ApiOperation({
    summary: 'Get reviews pending moderation',
    description: 'List reviews waiting for a moderation decision',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({ status: 200, description: 'Pending reviews retrieved' })
  async getPendingReviews(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<{
    reviews: PuzzleReview[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    return this.moderationService.getPendingReviews(page, limit);
  }

  @Get('flagged')
  @ApiOperation({
    summary: 'Get flagged reviews',
    description: 'List reviews that have been flagged by users',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({ status: 200, description: 'Flagged reviews retrieved' })
  async getFlaggedReviews(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<{
    reviews: PuzzleReview[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    return this.moderationService.getFlaggedReviews(page, limit);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get moderation statistics',
    description: 'Aggregate statistics about the moderation queue and history',
  })
  @ApiResponse({ status: 200, description: 'Moderation statistics retrieved' })
  async getModerationStats() {
    return this.moderationService.getModerationStats();
  }

  @Get(':reviewId/history')
  @ApiOperation({
    summary: 'Get moderation history',
    description: 'List all moderation actions applied to a specific review',
  })
  @ApiParam({ name: 'reviewId', description: 'Review ID' })
  @ApiResponse({ status: 200, description: 'Moderation history retrieved' })
  async getModerationHistory(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ) {
    return this.moderationService.getModerationHistory(reviewId);
  }
}
