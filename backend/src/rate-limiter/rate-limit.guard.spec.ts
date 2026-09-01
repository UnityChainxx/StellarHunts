import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard, RATE_LIMIT_KEY } from './rate-limit.guard';
import { RateLimiterService } from './rate-limiter.service';

function buildContext(overrides: {
  request?: any;
  handlerName?: string;
  className?: string;
} = {}): ExecutionContext {
  const request = overrides.request || {};
  return {
    getHandler: () => ({ name: overrides.handlerName || 'handler' }),
    getClass: () => ({ name: overrides.className || 'Controller' }),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => request.__response,
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  let reflector: Reflector;
  let service: RateLimiterService;
  let guard: RateLimitGuard;

  beforeEach(() => {
    reflector = new Reflector();
    service = new RateLimiterService();
    guard = new RateLimitGuard(reflector, service);
  });

  it('passes when no rate limit metadata is present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = buildContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes requests within the limit', () => {
    const config = { ttl: 60, limit: 5 };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(config);

    const context = buildContext({
      request: {
        ip: '1.2.3.4',
        headers: {},
        __response: { setHeader: jest.fn() },
      },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws 429 with retry metadata and sets Retry-After when limited', () => {
    const config = { ttl: 60, limit: 1 };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(config);

    const setHeader = jest.fn();
    const request = {
      ip: '1.2.3.4',
      headers: {},
      __response: { setHeader },
    };
    const context = buildContext({ request });

    guard.canActivate(context); // consumes the only allowed request

    try {
      guard.canActivate(context);
      throw new Error('expected guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const exception = error as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = exception.getResponse() as any;
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
      expect(body.message).toContain('Too many requests');
    }

    expect(setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.any(String),
    );
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '1');
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    expect(setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Reset',
      expect.any(String),
    );
  });

  it('keys by user id when the request is authenticated', () => {
    const config = { ttl: 60, limit: 5 };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(config);

    const checkSpy = jest.spyOn(service, 'check');
    const context = buildContext({
      request: {
        ip: '1.2.3.4',
        user: { id: 'user-42' },
        headers: {},
      },
    });

    guard.canActivate(context);

    expect(checkSpy).toHaveBeenCalledWith(
      'rate:user:user-42:handler',
      60,
      5,
    );
  });

  it('keys by client IP for anonymous traffic, honoring x-forwarded-for', () => {
    const config = { ttl: 60, limit: 5 };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(config);

    const checkSpy = jest.spyOn(service, 'check');
    const context = buildContext({
      request: {
        ip: '203.0.113.9',
        headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' },
      },
    });

    guard.canActivate(context);

    expect(checkSpy).toHaveBeenCalledWith(
      'rate:ip:198.51.100.7:handler',
      60,
      5,
    );
  });

  it('uses the custom key generator when provided (account-aware)', () => {
    const config = {
      ttl: 900,
      limit: 10,
      keyGenerator: (req: any) => req.body?.email,
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(config);

    const checkSpy = jest.spyOn(service, 'check');
    const context = buildContext({
      request: {
        ip: '1.2.3.4',
        body: { email: 'attacker@example.com' },
        headers: {},
      },
    });

    guard.canActivate(context);

    expect(checkSpy).toHaveBeenCalledWith(
      'rate:attacker@example.com:handler',
      900,
      10,
    );
  });

  it('isolates limits per client IP', () => {
    const config = { ttl: 60, limit: 1 };
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(config);

    const first = buildContext({
      request: { ip: '1.2.3.4', headers: {}, __response: { setHeader: jest.fn() } },
    });
    const second = buildContext({
      request: { ip: '5.6.7.8', headers: {}, __response: { setHeader: jest.fn() } },
    });

    guard.canActivate(first); // exhausts 1.2.3.4

    expect(guard.canActivate(second)).toBe(true);
    expect(() => guard.canActivate(first)).toThrow(HttpException);
  });
});
