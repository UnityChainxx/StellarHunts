import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator'

interface RequestRecord {
  count: number
  resetTime: number
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name)

  /** Per-key request records keyed by `${routeKey}::${clientKey}` */
  private readonly hits = new Map<string, RequestRecord>()

  /** Periodic cleanup timer (10 minute interval) */
  private readonly cleanupInterval: ReturnType<typeof setInterval>

  constructor(private readonly reflector: Reflector) {
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000)
  }

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!options) {
      return true // No rate limit configured — allow the request
    }

    const request = context.switchToHttp().getRequest()
    const clientKey = this.extractClientKey(request)
    const routeKey = this.getRouteKey(context)
    const mapKey = `${routeKey}::${clientKey}`

    const now = Date.now()
    const record = this.hits.get(mapKey)

    if (!record || now > record.resetTime) {
      // First request in window or window expired — start a new window
      this.hits.set(mapKey, {
        count: 1,
        resetTime: now + options.windowMs,
      })
      return true
    }

    if (record.count >= options.limit) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000)
      this.logger.warn(
        `Rate limit exceeded for ${clientKey} on ${routeKey} ` +
          `(${record.count}/${options.limit} in ${options.windowMs / 1000}s)`,
      )
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          error: 'Too Many Requests',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    record.count++
    return true
  }

  /**
   * Extract a client identifier from the request.
   * Uses a custom header (X-Forwarded-For), then falls back to remote IP.
   */
  private extractClientKey(request: Record<string, unknown>): string {
    const headers = request.headers as Record<string, string | string[]> | undefined
    if (headers) {
      const forwarded = headers['x-forwarded-for']
      if (forwarded) {
        return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim()
      }
    }
    return (request.ip as string) || 'unknown'
  }

  /** Build a unique key for the route handler. */
  private getRouteKey(context: ExecutionContext): string {
    const handler = context.getHandler()
    const className = context.getClass()?.name || 'Unknown'
    return `${className}.${handler.name}`
  }

  /** Remove expired entries to prevent unbounded memory growth. */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0
    for (const [key, record] of this.hits) {
      if (now > record.resetTime) {
        this.hits.delete(key)
        cleaned++
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Rate limit cleanup: removed ${cleaned} expired entries`)
    }
  }
}
