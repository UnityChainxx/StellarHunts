import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';

// Provide a no-op CacheService so Nest's reflection-based DI can resolve
// the (optional) constructor parameter introduced in #107.
const NOOP_CACHE = {
  getOrSet: async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
    loader(),
  invalidate: async () => undefined,
  inflightCount: () => 0,
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: 'CacheService', useValue: NOOP_CACHE },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
