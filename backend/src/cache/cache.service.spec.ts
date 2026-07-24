import { Test, TestingModule } from '@nestjs/testing';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { CacheService } from './cache.service';

/**
 * These tests intentionally avoid a live Redis; we mock the underlying ioredis
 * connection token so the single-flight logic and Redis-error fallthrough can
 * be verified without external services (#107). The same default-name token
 * that `InjectRedis()` resolves to inside the module is provided directly
 * here.
 */
describe('CacheService', () => {
  let service: CacheService;
  let redisMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    redisMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: getRedisConnectionToken('default'),
          useValue: redisMock,
        },
      ],
    }).compile();

    service = moduleRef.get(CacheService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('returns the cached value without invoking the loader when present', async () => {
    const cached = { hello: 'world' };
    redisMock.get.mockResolvedValueOnce(JSON.stringify(cached));

    const loader = jest.fn().mockResolvedValue({ hello: 'fresh' });

    const result = await service.getOrSet('cache:hit', 60, loader);

    expect(result).toEqual(cached);
    expect(loader).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('coalesces concurrent callers into a single loader invocation (#107)', async () => {
    redisMock.get.mockResolvedValue(null);

    let loaderCalls = 0;
    const loader = jest.fn().mockImplementation(async () => {
      loaderCalls += 1;
      // Simulate slow DB.
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { value: 'expensive' };
    });

    const promises = Array.from({ length: 25 }, () =>
      service.getOrSet('cache:coalesce', 60, loader),
    );
    const results = await Promise.all(promises);

    expect(loaderCalls).toBe(1);
    expect(results.every((r) => r && (r as any).value === 'expensive')).toBe(true);
    expect(redisMock.set).toHaveBeenCalledTimes(1);
    // The in-flight map must drain after completion.
    expect(service.inflightCount()).toBe(0);
  });

  it('propagates loader errors to every caller and does not cache the failure', async () => {
    redisMock.get.mockResolvedValue(null);

    const loader = jest.fn().mockRejectedValue(new Error('boom'));

    const promises = Array.from({ length: 5 }, () =>
      service.getOrSet('cache:err', 60, loader).catch((err) => err),
    );
    const results = await Promise.all(promises);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r instanceof Error && (r as Error).message === 'boom')).toBe(true);
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(service.inflightCount()).toBe(0);
  });

  it('falls through to the loader when Redis read fails', async () => {
    redisMock.get.mockRejectedValue(new Error('redis down'));

    const loader = jest.fn().mockResolvedValue({ recovered: true });

    const result = await service.getOrSet('cache:redis-down', 60, loader);

    expect(result).toEqual({ recovered: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('still returns the fresh value when Redis write fails', async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockRejectedValue(new Error('redis write fails'));

    const loader = jest.fn().mockResolvedValue({ ok: 1 });

    const result = await service.getOrSet('cache:write-fail', 60, loader);

    expect(result).toEqual({ ok: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('treats corrupt cache entries as a cache miss', async () => {
    redisMock.get.mockResolvedValue('not-json{{{');

    const loader = jest.fn().mockResolvedValue({ fresh: true });

    const result = await service.getOrSet('cache:corrupt', 60, loader);

    expect(result).toEqual({ fresh: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('invalidate() best-effort deletes keys and tolerates Redis errors', async () => {
    await service.invalidate('a', 'b');
    expect(redisMock.del).toHaveBeenCalledWith('a', 'b');

    redisMock.del.mockRejectedValueOnce(new Error('redis down'));
    await expect(service.invalidate('c')).resolves.toBeUndefined();
  });
});
