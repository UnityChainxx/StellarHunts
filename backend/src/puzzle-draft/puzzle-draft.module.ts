import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DraftPuzzle } from './entities/draft-puzzle.entity';
import { DraftPuzzleService } from './draft-puzzle.service';
import { DraftPuzzleController } from './draft-puzzle.controller';
import { RolesGuard } from '../common/gaurds/roles.gaurds';

@Module({
  imports: [TypeOrmModule.forFeature([DraftPuzzle]), AuthModule],
  controllers: [DraftPuzzleController],
  providers: [DraftPuzzleService, RolesGuard],
  exports: [],
})
export class PuzzleDraftModule {}
