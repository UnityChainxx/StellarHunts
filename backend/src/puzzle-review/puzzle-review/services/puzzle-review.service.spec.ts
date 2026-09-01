import { BadRequestException } from '@nestjs/common';
import { PuzzleReviewService } from './puzzle-review.service';

function createMockQueryBuilder() {
  const queryBuilder: any = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
  };
  return queryBuilder;
}

describe('PuzzleReviewService (filter/sort allowlists)', () => {
  let service: PuzzleReviewService;
  let repository: any;

  beforeEach(() => {
    repository = {
      createQueryBuilder: jest.fn(),
    };
    service = new PuzzleReviewService(repository);
  });

  it('maps allowlisted sort keys to known database columns', async () => {
    const queryBuilder = createMockQueryBuilder();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.getReviews({ sortBy: 'helpfulCount', sortOrder: 'ASC' });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'review.helpfulCount',
      'ASC',
    );
  });

  it('defaults sorting to createdAt DESC', async () => {
    const queryBuilder = createMockQueryBuilder();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.getReviews({});

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'review.createdAt',
      'DESC',
    );
  });

  it('rejects sort fields outside the allowlist', async () => {
    const queryBuilder = createMockQueryBuilder();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(
      service.getReviews({ sortBy: 'createdAt); DROP TABLE reviews;--' as any }),
    ).rejects.toThrow(BadRequestException);

    expect(queryBuilder.orderBy).not.toHaveBeenCalled();
  });

  it('rejects lowercase or arbitrary sort orders', async () => {
    const queryBuilder = createMockQueryBuilder();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(
      service.getReviews({ sortOrder: 'desc; DROP TABLE reviews;--' as any }),
    ).rejects.toThrow(BadRequestException);

    expect(queryBuilder.orderBy).not.toHaveBeenCalled();
  });

  it('accepts case-insensitive valid sort orders', async () => {
    const queryBuilder = createMockQueryBuilder();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.getReviews({ sortBy: 'rating', sortOrder: 'asc' as any });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith('review.rating', 'ASC');
  });
});
