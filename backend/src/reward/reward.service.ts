import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Reward, RewardType } from './entities/reward.entity';
import { RewardClaim } from './entities/reward-claim.entity';
import { CreateRewardDto } from './dto/create-reward.dto';
import { ClaimRewardDto } from './dto/claim-reward.dto';
import { validateRewardMetadata } from './schemas/reward-metadata.schema';
import { isUniqueViolation } from '../common/security/unique-violation';

@Injectable()
export class RewardService {
  constructor(
    @InjectRepository(Reward)
    private readonly rewardRepository: Repository<Reward>,
    @InjectRepository(RewardClaim)
    private readonly rewardClaimRepository: Repository<RewardClaim>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a new reward
   */
  async createReward(createRewardDto: CreateRewardDto): Promise<Reward> {
    // Validate metadata against the Zod schema when provided
    if (createRewardDto.metadata) {
      createRewardDto.metadata = validateRewardMetadata(
        createRewardDto.metadata,
      );
    }

    const reward = this.rewardRepository.create({
      ...createRewardDto,
      currentClaims: 0,
    });

    return await this.rewardRepository.save(reward);
  }

  /**
   * Get all reward
   */
  async getAllRewards(): Promise<Reward[]> {
    return await this.rewardRepository.find({
      where: { isActive: true },
      relations: ['claims'],
    });
  }

  /**
   * Get reward by ID
   */
  async getRewardById(id: string): Promise<Reward> {
    const reward = await this.rewardRepository.findOne({
      where: { id },
      relations: ['claims'],
    });

    if (!reward) {
      throw new NotFoundException(`Reward with ID ${id} not found`);
    }

    return reward;
  }

  /**
   * Get reward by challenge ID
   */
  async getRewardByChallengeId(challengeId: string): Promise<Reward> {
    const reward = await this.rewardRepository.findOne({
      where: { challengeId, isActive: true },
      relations: ['claims'],
    });

    if (!reward) {
      throw new NotFoundException(
        `No active reward found for challenge ${challengeId}`,
      );
    }

    return reward;
  }

  /**
   * Check if user has already claimed a reward for a given challenge
   */
  async hasUserClaimedReward(
    userId: string,
    challengeId: string,
  ): Promise<boolean> {
    const existingClaim = await this.rewardClaimRepository.findOne({
      where: { userId, challengeId },
    });

    return !!existingClaim;
  }

  /**
   * Claim a reward for a user.
   *
   * The claim row and the reward's claim counter are written inside a single
   * DB transaction (issue #302): if either write fails, both roll back so the
   * ledger never shows a claim without its counter update (or vice versa). The
   * counter uses an atomic increment rather than a read-modify-write, so two
   * concurrent claims cannot lose an update.
   */
  async claimReward(claimRewardDto: ClaimRewardDto): Promise<RewardClaim> {
    const { userId, challengeId } = claimRewardDto;

    return this.dataSource.transaction(async (manager) => {
      const claims = manager.getRepository(RewardClaim);
      const rewards = manager.getRepository(Reward);

      // Check if user has already claimed this reward
      const existingClaim = await claims.findOne({
        where: { userId, challengeId },
      });
      if (existingClaim) {
        throw new ConflictException('Reward already claimed');
      }

      // Get the reward for this challenge
      const reward = await rewards.findOne({
        where: { challengeId, isActive: true },
        relations: ['claims'],
      });
      if (!reward) {
        throw new NotFoundException(
          `No active reward found for challenge ${challengeId}`,
        );
      }

      // Check if reward is still available (max claims limit)
      if (reward.maxClaims !== null && reward.currentClaims >= reward.maxClaims) {
        throw new BadRequestException('Reward claim limit reached');
      }

      // Create the claim. The (userId, rewardId) unique index is the source of
      // truth for duplicate submissions: if two requests race past the check
      // above, the loser hits the constraint and gets a clean Conflict response
      // instead of an opaque 500 (issue #364).
      const claim = claims.create({
        userId,
        rewardId: reward.id,
        challengeId,
        status: 'claimed',
      });
      let savedClaim: RewardClaim;
      try {
        savedClaim = await claims.save(claim);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('Reward already claimed');
        }
        throw error;
      }

      // Atomic counter increment (issue #302)
      await rewards.increment({ id: reward.id }, 'currentClaims', 1);

      return savedClaim;
    });
  }

  /**
   * Get all claims for a user
   */
  async getUserClaims(userId: string): Promise<RewardClaim[]> {
    return await this.rewardClaimRepository.find({
      where: { userId },
      relations: ['reward'],
      order: { claimDate: 'DESC' },
    });
  }

  /**
   * Get claim by ID
   */
  async getClaimById(id: string): Promise<RewardClaim> {
    const claim = await this.rewardClaimRepository.findOne({
      where: { id },
      relations: ['reward'],
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    return claim;
  }

  /**
   * Update claim status
   */
  async updateClaimStatus(id: string, status: string): Promise<RewardClaim> {
    const claim = await this.getClaimById(id);

    claim.status = status;
    return await this.rewardClaimRepository.save(claim);
  }

  /**
   * Get reward statistics
   */
  async getRewardStats(rewardId: string) {
    const reward = await this.getRewardById(rewardId);
    const totalClaims = await this.rewardClaimRepository.count({
      where: { rewardId },
    });

    return {
      reward,
      totalClaims,
      availableClaims: reward.maxClaims ? reward.maxClaims - totalClaims : null,
      isAvailable: reward.maxClaims ? totalClaims < reward.maxClaims : true,
    };
  }

  /**
   * Delete a reward (soft delete by setting isActive to false)
   */
  async deleteReward(id: string): Promise<void> {
    const reward = await this.getRewardById(id);

    // Check if there are any existing claims
    const existingClaims = await this.rewardClaimRepository.count({
      where: { rewardId: id },
    });

    if (existingClaims > 0) {
      throw new BadRequestException(
        'Cannot delete reward with existing claims',
      );
    }

    await this.rewardRepository.update(id, { isActive: false });
  }
}
