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
  OnModuleInit,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticService } from './analytic.service';
import { OwnershipGuard } from '../common/guards/ownership.guard';
import { Ownership } from '../common/decorators/ownership.decorator';
import type { PaginatedUserPuzzleHistory } from './analytic.service';

class RecordSolveDto {
  userId: string;
  puzzleId: string;
  solveTime: number;
}

@Controller('analytic')
export class AnalyticController implements OnModuleInit {
  private readonly logger = new Logger(AnalyticController.name);

  constructor(private readonly analyticService: AnalyticService) {}

  async onModuleInit(): Promise<void> {
    // seedData now writes to Postgres, so it's async — await it so the
    // module isn't reported ready before the fixture rows exist, and
    // catch so a seeding failure (e.g. DB not migrated yet) doesn't
    // crash app boot.
    try {
      await this.analyticService.seedData();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Analytics seedData failed: ${message}`);
    }
  }

  @Post('record-solve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordSolve(@Body() body: RecordSolveDto): Promise<void> {
    this.logger.log(`Received record-solve request: ${JSON.stringify(body)}`);
    const { userId, puzzleId, solveTime } = body;
    await this.analyticService.recordPuzzleSolveAsync(
      userId,
      puzzleId,
      solveTime,
    );
  }

  @Get('puzzles/most-solved')
  async getMostSolvedPuzzles(): Promise<
    Array<{ puzzleId: string; solveCount: number }>
  > {
    this.logger.log('Handling request for most solved puzzles.');
    return this.analyticService.getMostSolvedPuzzlesAsync();
  }

  @Get('puzzles/:puzzleId/average-solve-time')
  async getAverageSolveTime(
    @Param('puzzleId') puzzleId: string,
  ): Promise<{ puzzleId: string; averageSolveTime: number }> {
    this.logger.log(
      `Handling request for average solve time for puzzle ${puzzleId}.`,
    );
    const averageSolveTime =
      await this.analyticService.getAverageSolveTimeAsync(puzzleId);
    return { puzzleId, averageSolveTime };
  }

  @Get('users/:userId/history')
  @UseGuards(AuthGuard('jwt'), OwnershipGuard)
  @Ownership({ param: 'userId' })
  async getUserPuzzleHistory(
    @Param('userId') userId: string,
  ): Promise<Record<string, any>> {
    this.logger.log(`Handling request for user ${userId} puzzle history.`);
    const userHistoryMap =
      await this.analyticService.getUserPuzzleStatsAsync(userId);

    const userHistoryObject: Record<string, any> = {};
    userHistoryMap.forEach((value, key) => {
      userHistoryObject[key] = value;
    });
    return userHistoryObject;
  }

  @Get('users/:userId/history/paginated')
  @UseGuards(AuthGuard('jwt'), OwnershipGuard)
  @Ownership({ param: 'userId' })
  async getUserPuzzleHistoryPaginated(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedUserPuzzleHistory> {
    this.logger.log(
      `Handling paginated history request for user ${userId} (page=${page}, limit=${limit}).`,
    );
    return this.analyticService.getUserPuzzleHistoryPaginated(
      userId,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }
}
