import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

interface RateLimitEntry {
  count: number;
  expiresAt: number;
}

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimiterService implements OnModuleInit, OnModuleDestroy {
  private requestsMap = new Map<string, RateLimitEntry>();
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  onModuleInit() {
    this.evictionTimer = setInterval(() => this.evictExpired(), 30_000);
  }

  onModuleDestroy() {
    if (this.evictionTimer) clearInterval(this.evictionTimer);
  }

  /**
   * Checks whether `key` has exceeded its limit within the TTL window.
   *
   * The window is a fixed window: the first request in a window opens it,
   * and every request until `ttl` seconds elapse counts toward `limit`.
   * Once the limit is hit the key is locked out until the window expires —
   * no further requests are admitted, and `retryAfterSeconds` reports how
   * long the caller must wait before trying again.
   */
  check(key: string, ttl: number, limit: number): RateLimitResult {
    const now = Date.now();
    const entry = this.requestsMap.get(key);

    if (!entry || now > entry.expiresAt) {
      this.requestsMap.set(key, { count: 1, expiresAt: now + ttl * 1000 });
      return { limited: false, retryAfterSeconds: 0 };
    }

    if (entry.count >= limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.expiresAt - now) / 1000),
      );
      return { limited: true, retryAfterSeconds };
    }

    entry.count += 1;
    this.requestsMap.set(key, entry);
    return { limited: false, retryAfterSeconds: 0 };
  }

  /** Backwards-compatible boolean check (kept for existing callers). */
  isRateLimited(key: string, ttl: number, limit: number): boolean {
    return this.check(key, ttl, limit).limited;
  }

  private evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this.requestsMap) {
      if (now > entry.expiresAt) {
        this.requestsMap.delete(key);
      }
    }
  }
}
