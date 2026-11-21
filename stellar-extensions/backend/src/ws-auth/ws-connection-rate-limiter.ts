import { Injectable } from '@nestjs/common';
import { WS_AUTH_DEFAULTS } from './ws-auth.constants';
import type { RateLimitDecision } from './ws-auth.types';

/**
 * In-memory sliding-window limiter for WebSocket handshake attempts, keyed per
 * IP address. A single node owns the map; deployments with multiple instances
 * should front the socket tier with a shared limiter at the edge.
 */
@Injectable()
export class WsConnectionRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts: number = WS_AUTH_DEFAULTS.maxConnectionAttempts,
    private readonly windowMs: number = WS_AUTH_DEFAULTS.rateLimitWindowMs,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Records one connection attempt for `key` and reports whether it is allowed.
   * Denied attempts are still recorded so a client cannot burst through the
   * limit by reconnecting.
   */
  consume(key: string): RateLimitDecision {
    const currentTime = this.now();
    const windowStart = currentTime - this.windowMs;
    const timestamps = (this.attempts.get(key) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );

    if (timestamps.length >= this.maxAttempts) {
      const oldest = timestamps[0] ?? currentTime;
      this.attempts.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, oldest + this.windowMs - currentTime),
      };
    }

    timestamps.push(currentTime);
    this.attempts.set(key, timestamps);

    return {
      allowed: true,
      remaining: Math.max(0, this.maxAttempts - timestamps.length),
      retryAfterMs: 0,
    };
  }

  /** Clears the counters for one key, or all keys when omitted. */
  reset(key?: string): void {
    if (key === undefined) {
      this.attempts.clear();
      return;
    }
    this.attempts.delete(key);
  }
}
