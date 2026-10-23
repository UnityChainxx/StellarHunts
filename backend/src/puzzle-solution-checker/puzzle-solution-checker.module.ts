import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Puzzle } from '../puzzle/puzzle.entity';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { PuzzleAnswerAttempt } from './entities/puzzle-answer-attempt.entity';
import { PuzzleSolutionCheckerController } from './puzzle-solution-checker.controller';
import { PuzzleSolutionCheckerService } from './puzzle-solution-checker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Puzzle, PuzzleAnswerAttempt]),
    RateLimiterModule,
  ],
  controllers: [PuzzleSolutionCheckerController],
  providers: [PuzzleSolutionCheckerService],
  exports: [PuzzleSolutionCheckerService],
})
export class PuzzleSolutionCheckerModule {}
