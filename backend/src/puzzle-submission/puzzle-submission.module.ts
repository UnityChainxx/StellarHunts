import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzleSubmission } from './puzzle-submission.entity';
import { PuzzleSubmissionService } from './puzzle-submission.service';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { PuzzleSubmissionController } from './puzzle-submission.controller';
import { Puzzle } from '../puzzle/puzzle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PuzzleSubmission]), RateLimiterModule.forRoot()],
  providers: [PuzzleSubmissionService],
  controllers: [PuzzleSubmissionController],
  providers: [PuzzleSubmissionService],
})
export class PuzzleSubmissionModule {}
