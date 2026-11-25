import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GameSeasonService } from './game-season.service';
import { GameSeason, SeasonStatus } from './entities/game-season.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('GameSeasonService', () => {
  let service: GameSeasonService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameSeasonService,
        { provide: getRepositoryToken(GameSeason), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get<GameSeasonService>(GameSeasonService);
    repo = module.get(getRepositoryToken(GameSeason));
  });

  it('should create a new season', async () => {
    const dto = {
      name: 'Season 1',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-03-31'),
      rewardPool: 1000,
    };
    const season = { id: 1, ...dto, status: SeasonStatus.UPCOMING };
    repo.create.mockReturnValue(season);
    repo.save.mockResolvedValue(season);
    const result = await service.createSeason(dto);
    expect(result.name).toBe('Season 1');
  });

  it('should throw if endDate is before startDate', async () => {
    await expect(service.createSeason({
      name: 'Bad',
      startDate: new Date('2025-03-01'),
      endDate: new Date('2025-01-01'),
      rewardPool: 100,
    })).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException for unknown season', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.getSeasonById(999)).rejects.toThrow(NotFoundException);
  });

  it('should start an upcoming season', async () => {
    const season = { id: 1, status: SeasonStatus.UPCOMING };
    repo.findOne.mockResolvedValue(season);
    repo.save.mockResolvedValue({ ...season, status: SeasonStatus.ACTIVE });
    const result = await service.startSeason(1);
    expect(result.status).toBe(SeasonStatus.ACTIVE);
  });

  it('should not start an already active season', async () => {
    const season = { id: 1, status: SeasonStatus.ACTIVE };
    repo.findOne.mockResolvedValue(season);
    await expect(service.startSeason(1)).rejects.toThrow(BadRequestException);
  });
});
