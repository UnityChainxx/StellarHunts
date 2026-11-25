import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzleTag } from './puzzle-tag.entity';
import { PuzzleTaggingService } from './puzzle-tagging.service';
import { PuzzleTaggingController } from './puzzle-tagging.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PuzzleTag])],
  providers: [PuzzleTaggingService],
  controllers: [PuzzleTaggingController],
  exports: [PuzzleTaggingService],
})
export class PuzzleTaggingModule {}
