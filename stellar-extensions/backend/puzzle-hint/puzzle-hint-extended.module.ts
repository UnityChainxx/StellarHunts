import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzleHintUsage } from './entities/puzzle-hint-usage.entity';
import { PuzzleHintExtendedService } from './puzzle-hint-extended.service';
import { PuzzleHintExtendedController } from './puzzle-hint-extended.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PuzzleHintUsage])],
  providers: [PuzzleHintExtendedService],
  controllers: [PuzzleHintExtendedController],
  exports: [PuzzleHintExtendedService],
})
export class PuzzleHintExtendedModule {}
