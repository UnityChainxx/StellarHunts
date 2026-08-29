import type { Request } from 'express';

export interface RateLimitConfig {
  /** Window size in seconds. */
  ttl: number;
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /**
   * Optional per-request key override (e.g. the account email or wallet
   * address being targeted). This makes throttling survive IP rotation
   * for account-level brute-force protection. Falls back to the
   * user/IP-based key when omitted or when the generator returns nothing.
   */
  keyGenerator?: (request: Request) => string | undefined;
}
