import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class RateLimiterService implements OnModuleInit, OnModuleDestroy {
  private requestsMap = new Map<string, { count: number; expiresAt: number }>();
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  onModuleInit() {
    this.evictionTimer = setInterval(() => this.evictExpired(), 30_000);
  }

  onModuleDestroy() {
    if (this.evictionTimer) clearInterval(this.evictionTimer);
  }

  isRateLimited(key: string, ttl: number, limit: number): boolean {
    const now = Date.now();
    const entry = this.requestsMap.get(key);

    if (!entry || now > entry.expiresAt) {
      this.requestsMap.set(key, { count: 1, expiresAt: now + ttl * 1000 });
      return false;
    }

    if (entry.count >= limit) return true;

    entry.count += 1;
    this.requestsMap.set(key, entry);
    return false;
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
