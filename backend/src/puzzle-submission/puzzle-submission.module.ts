import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzleSubmission } from './puzzle-submission.entity';
import { PuzzleSubmissionService } from '../puzzle-submission/puzzle-submission.service';
import { PuzzleSubmissionController } from './puzzle-submission.controller';
import { Puzzle } from '../puzzle/puzzle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PuzzleSubmission, Puzzle])],
  controllers: [PuzzleSubmissionController],
  providers: [PuzzleSubmissionService],
})
export class PuzzleSubmissionModule {}
