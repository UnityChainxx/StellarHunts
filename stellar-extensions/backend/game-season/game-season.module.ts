import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSeason } from './entities/game-season.entity';
import { GameSeasonService } from './game-season.service';
import { GameSeasonController } from './game-season.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GameSeason])],
  providers: [GameSeasonService],
  controllers: [GameSeasonController],
  exports: [GameSeasonService],
})
export class GameSeasonModule {}
