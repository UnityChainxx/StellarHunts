import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../../backend/src/admin/guards/jwt-auth.guard';
import { AssignModeratorDto } from './dto/assign-moderator.dto';
import { QueryModerationQueueDto } from './dto/query-moderation-queue.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { SubmitPuzzleDto } from './dto/submit-puzzle.dto';
import { ModerationService } from './moderation.service';

@ApiTags('Puzzle Moderation')
@Controller('moderation/queue')
@UseGuards(JwtAuthGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a puzzle to the moderation queue' })
  submit(@Req() request: Request, @Body() dto: SubmitPuzzleDto) {
    return this.moderation.submit(dto, this.actorId(request));
  }

  @Get()
  @ApiOperation({ summary: 'List queue items by status, priority or moderator' })
  list(@Query() query: QueryModerationQueueDto) {
    return this.moderation.listQueue(query);
  }

  @Get('sla')
  @ApiOperation({ summary: 'Review-time SLA report' })
  sla() {
    return this.moderation.getSlaReport();
  }

  @Get('puzzles/:puzzleId/checks')
  @ApiOperation({ summary: 'Automated check log for a puzzle' })
  checks(@Param('puzzleId', new ParseUUIDPipe()) puzzleId: string) {
    return this.moderation.getChecks(puzzleId);
  }

  @Get(':itemId/history')
  @ApiOperation({ summary: 'Moderator decision history for a queue item' })
  history(@Param('itemId', new ParseUUIDPipe()) itemId: string) {
    return this.moderation.getDecisionHistory(itemId);
  }

  @Patch(':itemId/assign')
  @ApiOperation({ summary: 'Assign a moderator to a puzzle' })
  assign(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: AssignModeratorDto,
  ) {
    return this.moderation.assign(itemId, dto);
  }

  @Post(':itemId/decision')
  @ApiOperation({ summary: 'Approve, reject or request changes' })
  review(
    @Req() request: Request,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.moderation.review(itemId, this.actorId(request), dto);
  }

  private actorId(request: Request): string {
    const user = request.user as { id?: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Authentication is required');
    return user.id;
  }
}
