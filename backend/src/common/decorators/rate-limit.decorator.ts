import { SetMetadata } from '@nestjs/common'

export const RATE_LIMIT_KEY = 'rateLimit'

export interface RateLimitOptions {
  /** Maximum number of requests allowed within the time window */
  limit: number
  /** Time window in milliseconds */
  windowMs: number
  /** Optional key function to extract the client identifier (defaults to IP) */
  keyPrefix?: string
}

/**
 * Apply a rate limit to a route handler.
 *
 * Usage:
 *   @RateLimit({ limit: 5, windowMs: 60_000 })
 *   @Post('join')
 *   async joinQueue() { ... }
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options)
