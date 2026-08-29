import { Test, TestingModule } from '@nestjs/testing';
import { AchievementController } from './achievement.controller';
import { AchievementService } from './achievement.service';

describe('AchievementsController', () => {
  let controller: AchievementController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      getPlayerAchievements: jest.fn().mockResolvedValue([
        {
          id: 'pa-1',
          earnedAt: new Date(),
          achievement: {
            id: 'ach-1',
            title: 'Speed Demon',
            description: 'Fast solve',
            iconUrl: 'icon.png',
          },
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AchievementController],
      providers: [{ provide: AchievementService, useValue: serviceMock }],
    }).compile();

    controller = module.get<AchievementController>(AchievementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns mapped player achievements', async () => {
    const res = await controller.getPlayerAchievements('123e4567-e89b-12d3-a456-426614174000');
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe('Speed Demon');
    expect(serviceMock.getPlayerAchievements).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
  });
});
