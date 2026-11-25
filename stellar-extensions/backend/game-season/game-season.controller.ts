import { Controller, Get, Post, Param, Body, ParseIntPipe, Patch } from '@nestjs/common';
import { GameSeasonService } from './game-season.service';
import { CreateSeasonDto } from './dto/create-season.dto';

@Controller('game-seasons')
export class GameSeasonController {
  constructor(private readonly service: GameSeasonService) {}

  @Post()
  create(@Body() dto: CreateSeasonDto) {
    return this.service.createSeason(dto);
  }

  @Get()
  findAll() {
    return this.service.getAllSeasons();
  }

  @Get('active')
  getActive() {
    return this.service.getActiveSeason();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.getSeasonById(id);
  }

  @Post(':id/start')
  startSeason(@Param('id', ParseIntPipe) id: number) {
    return this.service.startSeason(id);
  }

  @Post(':id/end')
  endSeason(@Param('id', ParseIntPipe) id: number) {
    return this.service.endSeason(id);
  }

  @Get(':id/leaderboard')
  leaderboard(@Param('id', ParseIntPipe) id: number) {
    return this.service.getLeaderboardForSeason(id);
  }

  @Patch(':id/reward-pool')
  allocateRewardPool(@Param('id', ParseIntPipe) id: number, @Body() body: { amount: number }) {
    return this.service.allocateRewardPool(id, body.amount);
  }
}
