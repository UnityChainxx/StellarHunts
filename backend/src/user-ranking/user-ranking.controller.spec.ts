import { Test, TestingModule } from '@nestjs/testing';
import { UserRankingController } from './user-ranking.controller';
import { UserRankingService } from './user-ranking.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRank } from './entities/user-ranking.entity';

describe('UserRankingController', () => {
  let controller: UserRankingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserRankingController],
      providers: [
        UserRankingService,
        { provide: getRepositoryToken(UserRank), useValue: {} },
      ],
    }).compile();

    controller = module.get<UserRankingController>(UserRankingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
