import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import type { Redis } from 'ioredis';

const DEFAULT_PING_TIMEOUT_MS = 1500;

/**
 * Health indicator for the shared Redis client (wired through CacheModule).
 * The client is configured with `lazyConnect`, so `ping()` both establishes
 * the connection and verifies the server is responsive.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@InjectRedis() private readonly redis: Redis) {
    super();
  }

  async pingCheck(
    key: string,
    timeoutMs: number = DEFAULT_PING_TIMEOUT_MS,
  ): Promise<HealthIndicatorResult> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const response = await Promise.race([
        this.redis.ping(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Redis ping timed out')),
            timeoutMs,
          );
        }),
      ]);
      clearTimeout(timer);

      if (response !== 'PONG') {
        throw new Error(`Unexpected Redis ping response: ${response}`);
      }

      return this.getStatus(key, true);
    } catch (error) {
      clearTimeout(timer);
      throw new HealthCheckError(
        'Redis ping failed',
        this.getStatus(key, false, {
          message: (error as Error).message,
        }),
      );
    }
  }
}
