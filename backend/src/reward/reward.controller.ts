import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OwnershipGuard } from '../common/guards/ownership.guard';
import { Ownership } from '../common/decorators/ownership.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RewardService } from './reward.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { ClaimRewardDto } from './dto/claim-reward.dto';
import { Reward } from './entities/reward.entity';
import { RewardClaim } from './entities/reward-claim.entity';

@ApiTags('Rewards')
@Controller('reward')
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new reward' })
  @ApiResponse({
    status: 201,
    description: 'Reward created successfully',
    type: Reward,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid data',
  })
  async createReward(
    @Body() createRewardDto: CreateRewardDto,
  ): Promise<Reward> {
    return await this.rewardService.createReward(createRewardDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all active reward' })
  @ApiResponse({
    status: 200,
    description: 'List of all active reward',
    type: [Reward],
  })
  async getAllRewards(): Promise<Reward[]> {
    return await this.rewardService.getAllRewards();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reward by ID' })
  @ApiParam({ name: 'id', description: 'Reward ID' })
  @ApiResponse({
    status: 200,
    description: 'Reward found',
    type: Reward,
  })
  @ApiResponse({
    status: 404,
    description: 'Reward not found',
  })
  async getRewardById(@Param('id') id: string): Promise<Reward> {
    return await this.rewardService.getRewardById(id);
  }

  @Get('challenge/:challengeId')
  @ApiOperation({ summary: 'Get reward by challenge ID' })
  @ApiParam({ name: 'challengeId', description: 'Challenge ID' })
  @ApiResponse({
    status: 200,
    description: 'Reward found for challenge',
    type: Reward,
  })
  @ApiResponse({
    status: 404,
    description: 'No active reward found for challenge',
  })
  async getRewardByChallengeId(
    @Param('challengeId') challengeId: string,
  ): Promise<Reward> {
    return await this.rewardService.getRewardByChallengeId(challengeId);
  }

  @Post('claim')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Claim a reward for a user',
    description:
      'Allows a user to claim a reward for completing a specific challenge. Prevents duplicate claims.',
  })
  @ApiResponse({
    status: 201,
    description: 'Reward claimed successfully',
    type: RewardClaim,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid data or reward limit reached',
  })
  @ApiResponse({
    status: 404,
    description: 'No active reward found for challenge',
  })
  @ApiResponse({
    status: 409,
    description: 'Reward already claimed',
  })
  async claimReward(
    @Body() claimRewardDto: ClaimRewardDto,
  ): Promise<RewardClaim> {
    return await this.rewardService.claimReward(claimRewardDto);
  }

  @Get('user/:userId/claims')
  @UseGuards(AuthGuard('jwt'), OwnershipGuard)
  @Ownership({ param: 'userId' })
  @ApiOperation({ summary: 'Get all claims for a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'List of user claims',
    type: [RewardClaim],
  })
  async getUserClaims(@Param('userId') userId: string): Promise<RewardClaim[]> {
    return await this.rewardService.getUserClaims(userId);
  }

  @Get('claims/:id')
  @ApiOperation({ summary: 'Get claim by ID' })
  @ApiParam({ name: 'id', description: 'Claim ID' })
  @ApiResponse({
    status: 200,
    description: 'Claim found',
    type: RewardClaim,
  })
  @ApiResponse({
    status: 404,
    description: 'Claim not found',
  })
  async getClaimById(@Param('id') id: string): Promise<RewardClaim> {
    return await this.rewardService.getClaimById(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get reward statistics' })
  @ApiParam({ name: 'id', description: 'Reward ID' })
  @ApiResponse({
    status: 200,
    description: 'Reward statistics',
  })
  @ApiResponse({
    status: 404,
    description: 'Reward not found',
  })
  async getRewardStats(@Param('id') id: string) {
    return await this.rewardService.getRewardStats(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a reward (soft delete)' })
  @ApiParam({ name: 'id', description: 'Reward ID' })
  @ApiResponse({
    status: 204,
    description: 'Reward deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete reward with existing claims',
  })
  @ApiResponse({
    status: 404,
    description: 'Reward not found',
  })
  async deleteReward(@Param('id') id: string): Promise<void> {
    await this.rewardService.deleteReward(id);
  }
}
