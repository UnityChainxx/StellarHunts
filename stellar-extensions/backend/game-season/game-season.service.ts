import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { GameSeason, SeasonStatus } from './entities/game-season.entity';
import { CreateSeasonDto } from './dto/create-season.dto';

@Injectable()
export class GameSeasonService {
  constructor(
    @InjectRepository(GameSeason)
    private seasonRepository: Repository<GameSeason>,
  ) {}

  async createSeason(dto: CreateSeasonDto): Promise<GameSeason> {
    if (dto.endDate <= dto.startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }
    const season = this.seasonRepository.create(dto);
    return this.seasonRepository.save(season);
  }

  async getActiveSeason(): Promise<GameSeason | null> {
    const now = new Date();
    return this.seasonRepository.findOne({
      where: {
        status: SeasonStatus.ACTIVE,
        startDate: LessThanOrEqual(now),
        endDate: MoreThanOrEqual(now),
      },
    });
  }

  async getAllSeasons(): Promise<GameSeason[]> {
    return this.seasonRepository.find({ order: { startDate: 'DESC' } });
  }

  async getSeasonById(id: number): Promise<GameSeason> {
    const season = await this.seasonRepository.findOne({ where: { id } });
    if (!season) throw new NotFoundException(`Season #${id} not found`);
    return season;
  }

  async startSeason(id: number): Promise<GameSeason> {
    const season = await this.getSeasonById(id);
    if (season.status !== SeasonStatus.UPCOMING) {
      throw new BadRequestException('Only upcoming seasons can be started');
    }
    season.status = SeasonStatus.ACTIVE;
    return this.seasonRepository.save(season);
  }

  async endSeason(id: number): Promise<GameSeason> {
    const season = await this.getSeasonById(id);
    if (season.status !== SeasonStatus.ACTIVE) {
      throw new BadRequestException('Only active seasons can be ended');
    }
    season.status = SeasonStatus.ENDED;
    return this.seasonRepository.save(season);
  }

  async getLeaderboardForSeason(_seasonId: number): Promise<Array<{ rank: number; userId: string; xp: number }>> {
    // Returns placeholder leaderboard — real implementation joins with user progress table
    return [];
  }

  async allocateRewardPool(id: number, amount: number): Promise<GameSeason> {
    const season = await this.getSeasonById(id);
    season.rewardPool = amount;
    return this.seasonRepository.save(season);
  }
}
