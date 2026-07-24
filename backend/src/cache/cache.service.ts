import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

/**
 * CacheService
 * ------------
 * Caches arbitrary JSON-serialisable values in Redis with a TTL. The
 * interesting part is the in-process **single-flight** layer: when N
 * concurrent requests arrive for the same `key`, only one loader
 * invocation runs and the rest await the same promise. This prevents
 * the cache-stampede the API was hitting under read-heavy load (#107).
 *
 * Failure semantics (best-effort cache, reliable data path):
 *   - If Redis READ fails → bypass cache, run loader, do not throw.
 *   - If loader throws → propagate the error to every waiter; do NOT
 *     cache the failure.
 *   - If Redis WRITE fails → log warning, still return the fresh value.
 *   - If Redis is unreachable → each request becomes a direct DB call,
 *     which is the same behaviour as before this PR (#107).
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /**
   * Get a cached value, or compute it via `loader` and store the result.
   *
   * @param key             cache key (use a namespace prefix per feature).
   * @param baseTtlSeconds  TTL before expiration; small randomised jitter
   *                        is added to avoid synchronized stampedes.
   * @param jitterSeconds   additional random TTL on top of `baseTtlSeconds`.
   * @param loader          function that returns the fresh value.
   */
  async getOrSet<T>(
    key: string,
    baseTtlSeconds: number,
    loader: () => Promise<T>,
    jitterSeconds: number = 10,
  ): Promise<T> {
    // 1. Try Redis first.
    let cached: string | null = null;
    try {
      cached = await this.redis.get(key);
    } catch (err) {
      this.logger.warn(
        `Redis READ failed for key "${key}": ${(err as Error).message}. Falling through to loader.`,
      );
    }
    if (cached !== null) {
      try {
        return JSON.parse(cached) as T;
      } catch (err) {
        // Corrupt cache entry — drop it and fall through to the loader.
        this.logger.warn(`Redis returned non-JSON for key "${key}": ${(err as Error).message}.`);
      }
    }

    // 2. Single-flight: piggyback on the in-flight promise if one exists.
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    // 3. We're the chosen loader for this key. Wrap loader() so that:
    //    - errors propagate cleanly to every waiter (#107);
    //    - on success, we write to Redis (best-effort) and then return;
    //    - the key always leaves `inFlight`, success or failure.
    const promise = (async () => {
      try {
        const fresh = await loader();
        try {
          const ttl = baseTtlSeconds + Math.floor(Math.random() * Math.max(1, jitterSeconds));
          await this.redis.set(key, JSON.stringify(fresh), 'EX', ttl);
        } catch (err) {
          this.logger.warn(
            `Redis WRITE failed for key "${key}": ${(err as Error).message}. Returning value without caching.`,
          );
        }
        return fresh;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise as Promise<T>;
  }

  /**
   * Invalidate one or more keys. Currently unused (we rely on TTL-only
   * invalidation for v1) but exposed so future write paths / admin tools
   * can flip caches manually without a hard reload (#107).
   */
  async invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (err) {
      this.logger.warn(`Redis DEL failed: ${(err as Error).message}.`);
    }
  }

  /** Test/observability helper: number of in-flight loaders right now. */
  inflightCount(): number {
    return this.inFlight.size;
  }
}
