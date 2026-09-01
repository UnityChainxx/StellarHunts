import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(() => {
    service = new RateLimiterService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    service.onModuleDestroy();
  });

  it('allows requests up to the limit', () => {
    const ttl = 60;
    const limit = 3;

    expect(service.check('key-a', ttl, limit)).toEqual({
      limited: false,
      retryAfterSeconds: 0,
    });
    expect(service.check('key-a', ttl, limit)).toEqual({
      limited: false,
      retryAfterSeconds: 0,
    });
    expect(service.check('key-a', ttl, limit)).toEqual({
      limited: false,
      retryAfterSeconds: 0,
    });
  });

  it('locks the key out once the limit is hit', () => {
    const ttl = 60;
    const limit = 2;

    service.check('key-a', ttl, limit);
    service.check('key-a', ttl, limit);

    const result = service.check('key-a', ttl, limit);
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('reports a positive retry-after while locked out', () => {
    const ttl = 60;
    const limit = 1;

    service.check('key-a', ttl, limit);
    const result = service.check('key-a', ttl, limit);

    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(60);
  });

  it('resets the window after the TTL expires', () => {
    const ttl = 60;
    const limit = 1;

    service.check('key-a', ttl, limit);
    expect(service.check('key-a', ttl, limit).limited).toBe(true);

    // Advance time past the window; the key must be admitted again.
    jest.advanceTimersByTime(61_000);

    expect(service.check('key-a', ttl, limit)).toEqual({
      limited: false,
      retryAfterSeconds: 0,
    });
  });

  it('keeps separate counters for separate keys', () => {
    const ttl = 60;
    const limit = 1;

    service.check('ip:1.2.3.4', ttl, limit);

    expect(service.check('ip:1.2.3.4', ttl, limit).limited).toBe(true);
    expect(service.check('ip:5.6.7.8', ttl, limit).limited).toBe(false);
  });

  it('exposes the backwards-compatible isRateLimited check', () => {
    const ttl = 60;
    const limit = 1;

    service.check('key-a', ttl, limit);
    expect(service.isRateLimited('key-a', ttl, limit)).toBe(true);
    expect(service.isRateLimited('key-b', ttl, limit)).toBe(false);
  });
});
