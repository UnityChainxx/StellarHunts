import { Module } from '@nestjs/common';
import { PuzzleCacheInvalidationService } from './puzzle-cache-invalidation.service';

@Module({
  providers: [PuzzleCacheInvalidationService],
  exports: [PuzzleCacheInvalidationService],
})
export class PuzzleCacheInvalidationModule {}
