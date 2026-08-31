import {
  Controller,
  Get,
  Param,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AchievementService } from './achievement.service';
import { PlayerAchievementDto } from './dto/player-achievement.dto';

@ApiTags('Achievements')
@Controller('achievement')
export class AchievementController {
  constructor(private readonly achievementService: AchievementService) {}

  @Get(':playerId')
  @ApiOperation({
    summary: 'Get player achievement',
    description: 'Retrieve all achievement earned by a specific player',
  })
  @ApiParam({
    name: 'playerId',
    description: 'UUID of the player',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of achievement earned by the player',
    type: [PlayerAchievementDto],
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid player ID format',
  })
  async getPlayerAchievements(
    @Param('playerId', ParseUUIDPipe) playerId: string,
  ): Promise<PlayerAchievementDto[]> {
    const playerAchievements =
      await this.achievementService.getPlayerAchievements(playerId);

    return playerAchievements.map((pa) => ({
      id: pa.id,
      achievementId: pa.achievement.id,
      title: pa.achievement.title,
      description: pa.achievement.description,
      iconUrl: pa.achievement.iconUrl,
      earnedAt: pa.earnedAt,
    }));
  }
}
