import { Test, TestingModule } from '@nestjs/testing';
import { UserRankingService } from './user-ranking.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRank } from './entities/user-ranking.entity';

describe('UserRankingService', () => {
  let service: UserRankingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRankingService,
        { provide: getRepositoryToken(UserRank), useValue: {} },
      ],
    }).compile();

    service = module.get<UserRankingService>(UserRankingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
