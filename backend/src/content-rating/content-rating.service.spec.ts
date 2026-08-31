import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { ContentRatingService } from './content-rating.service';
import { ContentRating } from './entities/content-rating.entity';

describe('ContentRatingService', () => {
  let service: ContentRatingService;
  let repoMock: any;

  beforeEach(async () => {
    repoMock = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((r) => Promise.resolve({ id: 'r-1', ...r })),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ avg: '4.5', count: '10' }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRatingService,
        { provide: getRepositoryToken(ContentRating), useValue: repoMock },
      ],
    }).compile();

    service = module.get<ContentRatingService>(ContentRatingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rates content successfully', async () => {
    const res = await service.rateContent('u1', 'c1', 5);
    expect(res.rating).toBe(5);
    expect(repoMock.save).toHaveBeenCalled();
  });

  it('throws ConflictException on duplicate rating', async () => {
    repoMock.save.mockRejectedValue({ code: '23505' });
    await expect(service.rateContent('u1', 'c1', 5)).rejects.toThrow(ConflictException);
  });

  it('gets content rating stats', async () => {
    const stats = await service.getContentRatingStats('c1');
    expect(stats.averageRating).toBe(4.5);
    expect(stats.totalRatings).toBe(10);
  });
});
