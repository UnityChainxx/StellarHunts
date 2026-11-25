import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AnalyticsPreferenceDto,
  EndSessionDto,
  PageVisitDto,
  PuzzleAttemptDto,
  SessionStatsQueryDto,
  StartSessionDto,
} from './dto/session-analytics.dto';
import { SessionAnalyticsService } from './session-analytics.service';

@ApiTags('Session Analytics')
@Controller('analytics')
export class SessionAnalyticsController {
  constructor(private readonly analytics: SessionAnalyticsService) {}

  @Post('sessions/start')
  @ApiOperation({ summary: 'Start (or re-attach to) a tracked session' })
  start(@Body() dto: StartSessionDto) {
    return this.analytics.startSession(dto);
  }

  @Post('sessions/:id/end')
  @ApiOperation({ summary: 'End a session and finalize its duration' })
  end(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EndSessionDto,
  ) {
    return this.analytics.endSession(id, dto);
  }

  @Post('sessions/:id/pages')
  @ApiOperation({ summary: 'Record a page visit inside a session' })
  pageVisit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PageVisitDto,
  ) {
    return this.analytics.recordPageVisit(id, dto);
  }

  @Post('sessions/:id/puzzles')
  @ApiOperation({ summary: 'Record a puzzle attempt inside a session' })
  puzzleAttempt(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PuzzleAttemptDto,
  ) {
    return this.analytics.recordPuzzleAttempt(id, dto);
  }

  @Get('sessions/:id')
  @ApiOperation({
    summary: 'Session summary: duration, pages, puzzles, drop-off point',
  })
  summary(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.analytics.getSessionSummary(id);
  }

  @Get('sessions/user/:userId')
  @ApiOperation({ summary: 'List recent sessions for a user' })
  userSessions(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.getUserSessions(userId, limit ? Number(limit) : 50);
  }

  @Get('stats/weekly')
  @ApiOperation({ summary: 'Aggregate session stats for the last 7 days' })
  weekly(@Query() _query: SessionStatsQueryDto) {
    return this.analytics.getWeeklyStats();
  }

  @Get('stats/monthly')
  @ApiOperation({ summary: 'Aggregate session stats for the last 30 days' })
  monthly(@Query() _query: SessionStatsQueryDto) {
    return this.analytics.getMonthlyStats();
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Set the analytics opt-out preference for a user' })
  setPreference(@Body() dto: AnalyticsPreferenceDto) {
    return this.analytics.setPreference(dto);
  }

  @Get('preferences/:userId')
  @ApiOperation({ summary: 'Read the analytics opt-out preference for a user' })
  getPreference(@Param('userId') userId: string) {
    return this.analytics.getPreference(userId);
  }
}
