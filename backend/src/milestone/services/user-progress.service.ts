import { Injectable } from '@nestjs/common';
import type { Repository, EntityManager } from 'typeorm';
import { UserProgress } from '../entities/user-progress.entity';
import { MilestoneCategory } from '../entities/milestone-template.entity';
import type { ProgressUpdateDto } from '../dto/milestone-achievement.dto';
import { isUniqueViolation } from '../../common/security/unique-violation';

@Injectable()
export class UserProgressService {
  constructor(private readonly progressRepository: Repository<UserProgress>) {}

  /**
   * Update (or create) a progress row. Pass an `EntityManager` when the update
   * is part of a larger progression transaction (issue #302) so it commits
   * atomically with milestone assignment.
   */
  async updateProgress(
    userId: string,
    updateDto: ProgressUpdateDto,
    manager?: EntityManager,
  ): Promise<UserProgress> {
    const repo = manager?.getRepository(UserProgress) ?? this.progressRepository;

    let progress = await repo.findOne({
      where: {
        userId,
        category: updateDto.category,
        progressKey: updateDto.progressKey,
      },
    });

    if (!progress) {
      progress = repo.create({
        userId,
        category: updateDto.category,
        progressKey: updateDto.progressKey,
        currentValue: 0,
        totalValue: 0,
      });
      try {
        progress = await repo.save(progress);
      } catch (error) {
        if (isUniqueViolation(error)) {
          // A concurrent request created this row first — re-read it instead
          // of inserting a duplicate (issue #302).
          progress = await repo.findOneOrFail({
            where: {
              userId,
              category: updateDto.category,
              progressKey: updateDto.progressKey,
            },
          });
        } else {
          throw error;
        }
      }
    }

    // Update values
    if (updateDto.newValue !== undefined) {
      progress.currentValue = updateDto.newValue;
      progress.totalValue = Math.max(progress.totalValue, updateDto.newValue);
      progress.lastUpdated = new Date();
      progress.metadata = updateDto.metadata
        ? JSON.stringify(updateDto.metadata)
        : progress.metadata;
      return repo.save(progress);
    }

    if (updateDto.incrementValue !== undefined) {
      // Atomic increment (UPDATE ... SET currentValue = currentValue + n)
      // instead of a read-modify-write, so concurrent completions cannot
      // lose updates (issue #302).
      await repo.increment(
        { id: progress.id },
        'currentValue',
        updateDto.incrementValue,
      );
      await repo.increment(
        { id: progress.id },
        'totalValue',
        updateDto.incrementValue,
      );
      return repo.findOneOrFail({ where: { id: progress.id } });
    }

    return progress;
  }

  async getProgress(
    userId: string,
    category: MilestoneCategory,
    progressKey: string,
    manager?: EntityManager,
  ): Promise<UserProgress | null> {
    const repo = manager?.getRepository(UserProgress) ?? this.progressRepository;
    return repo.findOne({
      where: { userId, category, progressKey },
    });
  }

  async getUserProgress(userId: string): Promise<UserProgress[]> {
    return this.progressRepository.find({
      where: { userId },
      order: { category: 'ASC', progressKey: 'ASC' },
    });
  }

  async getProgressByCategory(
    userId: string,
    category: MilestoneCategory,
  ): Promise<UserProgress[]> {
    return this.progressRepository.find({
      where: { userId, category },
      order: { progressKey: 'ASC' },
    });
  }

  // Convenience methods for common progress updates
  async incrementPuzzleCount(
    userId: string,
    metadata?: any,
    manager?: EntityManager,
  ): Promise<UserProgress> {
    return this.updateProgress(
      userId,
      {
        category: MilestoneCategory.PUZZLE,
        progressKey: 'puzzles_completed',
        incrementValue: 1,
        metadata,
      },
      manager,
    );
  }

  async updateCurrentStreak(
    userId: string,
    streakValue: number,
    manager?: EntityManager,
  ): Promise<UserProgress> {
    return this.updateProgress(
      userId,
      {
        category: MilestoneCategory.STREAK,
        progressKey: 'current_streak',
        newValue: streakValue,
      },
      manager,
    );
  }

  async updateLongestStreak(
    userId: string,
    streakValue: number,
    manager?: EntityManager,
  ): Promise<UserProgress> {
    const currentLongest = await this.getProgress(
      userId,
      MilestoneCategory.STREAK,
      'longest_streak',
      manager,
    );
    if (!currentLongest || streakValue > currentLongest.currentValue) {
      return this.updateProgress(
        userId,
        {
          category: MilestoneCategory.STREAK,
          progressKey: 'longest_streak',
          newValue: streakValue,
        },
        manager,
      );
    }
    return currentLongest;
  }

  async recordCustomProgress(
    userId: string,
    category: MilestoneCategory,
    progressKey: string,
    value: number,
    metadata?: any,
    manager?: EntityManager,
  ): Promise<UserProgress> {
    return this.updateProgress(
      userId,
      {
        category,
        progressKey,
        newValue: value,
        metadata,
      },
      manager,
    );
  }
}
