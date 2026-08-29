import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Progress } from './entities/progress.entity';
import { ProgressResponseDto } from './dto/progress-response.dto';

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(Progress)
    private readonly progressRepo: Repository<Progress>,
  ) {}

  async getProgressByUserId(userId: string): Promise<ProgressResponseDto> {
    const progress = await this.progressRepo.findOne({ where: { userId } });

    if (!progress) {
      throw new NotFoundException(
        `Progress not found for user with ID ${userId}`,
      );
    }

    const percentComplete =
      progress.totalPuzzles > 0
        ? parseFloat(((progress.completedPuzzles / progress.totalPuzzles) * 100).toFixed(2))
        : 0;

    return {
      userId: progress.userId,
      completedPuzzles: progress.completedPuzzles,
      totalPuzzles: progress.totalPuzzles,
      percentComplete,
      lastUpdated: progress.lastUpdated,
    };
  }
}
