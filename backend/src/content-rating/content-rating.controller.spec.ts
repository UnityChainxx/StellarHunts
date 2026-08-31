import { Test, TestingModule } from '@nestjs/testing';
import { ContentRatingController } from './content-rating.controller';
import { ContentRatingService } from './content-rating.service';

describe('ContentRatingController', () => {
  let controller: ContentRatingController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      rateContent: jest.fn().mockResolvedValue({ id: 'r1', rating: 5 }),
      getContentRatingStats: jest.fn().mockResolvedValue({ contentId: 'c1', averageRating: 4.5, totalRatings: 10 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentRatingController],
      providers: [{ provide: ContentRatingService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ContentRatingController>(ContentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('rates content', async () => {
    const res = await controller.rateContent({ userId: 'u1', contentId: 'c1', rating: 5 } as any);
    expect(res.rating).toBe(5);
    expect(serviceMock.rateContent).toHaveBeenCalledWith('u1', 'c1', 5);
  });

  it('gets stats', async () => {
    const res = await controller.getStats('c1');
    expect(res.averageRating).toBe(4.5);
    expect(serviceMock.getContentRatingStats).toHaveBeenCalledWith('c1');
  });
});
