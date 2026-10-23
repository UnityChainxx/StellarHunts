import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Challenge } from './entities/challenge.entity';
import { ChallengeCompletion } from './entities/challenge-completion.entity';
import { HintUsage } from './entities/hint-usage.entity';
import { PuzzleSubmission } from './entities/puzzle-submission.entity';
import { User } from './entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Challenge,
      ChallengeCompletion,
      HintUsage,
      PuzzleSubmission,
      User,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class ChallengeModule {}
