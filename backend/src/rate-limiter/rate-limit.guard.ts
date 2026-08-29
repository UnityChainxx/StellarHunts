import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimiterService } from './rate-limiter.service';
import type { RateLimitConfig } from './rate-limit.interface';

export const RATE_LIMIT_KEY = 'rate-limit';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rateLimiterService: RateLimiterService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.reflector.getAllAndOverride<RateLimitConfig>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!config) return true;

    const request = context.switchToHttp().getRequest();
    const key = this.buildKey(request, config, context);
    const result = this.rateLimiterService.check(key, config.ttl, config.limit);

    if (result.limited) {
      const response = context.switchToHttp().getResponse();
      const resetAt =
        Math.floor(Date.now() / 1000) + result.retryAfterSeconds;

      response?.setHeader?.('Retry-After', String(result.retryAfterSeconds));
      response?.setHeader?.('X-RateLimit-Limit', String(config.limit));
      response?.setHeader?.('X-RateLimit-Remaining', '0');
      response?.setHeader?.('X-RateLimit-Reset', String(resetAt));

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfterSeconds: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private buildKey(
    request: any,
    config: RateLimitConfig,
    context: ExecutionContext,
  ): string {
    const scope = context.getHandler().name;

    const customKey = config.keyGenerator?.(request);
    if (customKey) {
      return `rate:${customKey}:${scope}`;
    }

    const userId = request.user?.id;
    if (userId) {
      return `rate:user:${userId}:${scope}`;
    }

    return `rate:ip:${this.getClientIp(request)}:${scope}`;
  }

  private getClientIp(request: any): string {
    const forwarded = request.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.connection?.remoteAddress || 'unknown';
  }
}
