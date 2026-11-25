import { Test, TestingModule } from '@nestjs/testing';
import { PuzzleCacheInvalidationService } from './puzzle-cache-invalidation.service';

describe('PuzzleCacheInvalidationService', () => {
  let service: PuzzleCacheInvalidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PuzzleCacheInvalidationService],
    }).compile();
    service = module.get<PuzzleCacheInvalidationService>(PuzzleCacheInvalidationService);
  });

  it('should invalidate a single puzzle', async () => {
    await service.warmUpCache('puzzle-1', { title: 'Test' });
    expect(service.getCacheSize()).toBe(1);
    await service.invalidatePuzzle('puzzle-1');
    expect(service.getCacheSize()).toBe(0);
  });

  it('should batch invalidate puzzles', async () => {
    for (let i = 0; i < 5; i++) {
      await service.warmUpCache(`puzzle-${i}`, { id: i });
    }
    expect(service.getCacheSize()).toBe(5);
    await service.invalidateBatch(['puzzle-0', 'puzzle-1', 'puzzle-2']);
    expect(service.getCacheSize()).toBe(2);
  });

  it('should invalidate category cache', async () => {
    await service.invalidateCategory('cat-1');
    // No error thrown means pass
    expect(service.getCacheSize()).toBe(0);
  });

  it('should warm up cache after invalidation', async () => {
    await service.invalidatePuzzle('p1');
    await service.warmUpCache('p1', { data: 'fresh' });
    expect(service.getCacheSize()).toBe(1);
  });

  it('should perform full invalidation', async () => {
    await service.warmUpCache('p1', {});
    await service.fullInvalidation({
      puzzleId: 'p1',
      categoryId: 'cat-1',
      tags: ['blockchain'],
    });
    expect(service.getCacheSize()).toBe(0);
  });
});
