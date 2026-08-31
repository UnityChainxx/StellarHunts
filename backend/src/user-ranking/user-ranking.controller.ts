import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRankingService } from './user-ranking.service';
import { OwnershipGuard } from '../common/guards/ownership.guard';
import { Ownership } from '../common/decorators/ownership.decorator';
import { UserRankDto } from './dto/create-user-ranking.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('User Ranking')
@Controller('users')
export class UserRankingController {
  constructor(private readonly userRankingService: UserRankingService) {}

  @Get(':id/rank')
  @UseGuards(AuthGuard('jwt'), OwnershipGuard)
  @Ownership({ param: 'id' })
  @ApiOperation({ summary: 'Get user rank' })
  @ApiResponse({
    status: 200,
    description: 'Returns user rank data',
    type: UserRankDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserRank(@Param('id') userId: string): Promise<UserRankDto> {
    return this.userRankingService.getUserRank(userId);
  }
}
