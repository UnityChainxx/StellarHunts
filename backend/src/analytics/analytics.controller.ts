import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import type { PaginatedUserPuzzleHistory } from './analytics.service';

class RecordSolveDto {
  userId: string;
  puzzleId: string;
  solveTime: number;
}

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {
    this.analyticsService.seedData();
  }

  @Post('record-solve')
  @HttpCode(HttpStatus.NO_CONTENT)
  recordSolve(@Body() body: RecordSolveDto): void {
    this.logger.log(`Received record-solve request: ${JSON.stringify(body)}`);
    const { userId, puzzleId, solveTime } = body;
    this.analyticsService.recordPuzzleSolve(userId, puzzleId, solveTime);
  }

  @Get('puzzles/most-solved')
  getMostSolvedPuzzles(): Array<{ puzzleId: string; solveCount: number }> {
    this.logger.log('Handling request for most solved puzzles.');
    return this.analyticsService.getMostSolvedPuzzles();
  }

  @Get('puzzles/:puzzleId/average-solve-time')
  getAverageSolveTime(@Param('puzzleId') puzzleId: string): {
    puzzleId: string;
    averageSolveTime: number;
  } {
    this.logger.log(
      `Handling request for average solve time for puzzle ${puzzleId}.`,
    );
    const averageSolveTime =
      this.analyticsService.getAverageSolveTime(puzzleId);
    return { puzzleId, averageSolveTime };
  }

  @Get('users/:userId/history')
  getUserPuzzleHistory(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): PaginatedUserPuzzleHistory {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    this.logger.log(
      `Handling paginated request for user ${userId} puzzle history (page=${parsedPage}, limit=${parsedLimit}).`,
    );
    return this.analyticsService.getUserPuzzleStatsPage(
      userId,
      parsedPage > 0 ? parsedPage : 1,
      parsedLimit > 0 ? parsedLimit : 20,
    );
  }
}
