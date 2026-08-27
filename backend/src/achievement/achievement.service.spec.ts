import { Test, TestingModule } from '@nestjs/testing';
import { AchievementService } from './achievement.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Achievement } from './entities/achievement.entity';
import { PlayerAchievement } from './entities/player-achievement.entity';

describe('AchievementsService', () => {
  let service: AchievementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementService,
        { provide: getRepositoryToken(Achievement), useValue: {} },
        { provide: getRepositoryToken(PlayerAchievement), useValue: {} },
      ],
    }).compile();

    service = module.get<AchievementService>(AchievementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
