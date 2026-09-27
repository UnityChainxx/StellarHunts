import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzleComment } from './entities/puzzle-comment.entity';
import { PuzzleCommentService } from './puzzle-comment.service';
import { PuzzleCommentController } from './puzzle-comment.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PuzzleComment])],
  providers: [PuzzleCommentService],
  controllers: [PuzzleCommentController],
  exports: [PuzzleCommentService],
})
export class PuzzleCommentModule {}
