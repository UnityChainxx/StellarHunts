import { Logger } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Socket } from 'socket.io'

export interface WsRateLimitOptions {
  /** Maximum messages allowed within the time window */
  limit: number
  /** Time window in milliseconds */
  windowMs: number
}

interface WsRequestRecord {
  count: number
  resetTime: number
}

/**
 * Rate-limit guard for WebSocket event handlers.
 *
 * Attach via @UseGuards(WsRateLimitGuard) on the gateway or individual
 * @SubscribeMessage handlers. Configure per-handler limits through the
 * metadata key 'wsRateLimit' set by the @WsRateLimit() decorator.
 *
 * Defaults (when no metadata is present): 60 messages / 60 s.
 */
export class WsRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WsRateLimitGuard.name)
  private readonly hits = new Map<string, WsRequestRecord>()

  constructor() {
    // Periodic cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient()
    const data: unknown = context.switchToWs().getData()
    const handler = context.getHandler()
    const className = context.getClass()?.name || 'Unknown'

    // Read per-handler limit from metadata (set by @WsRateLimit decorator)
    const metaKey = 'wsRateLimit'
    const options: WsRateLimitOptions =
      Reflect.getMetadata(metaKey, handler) ||
      Reflect.getMetadata(metaKey, className, handler.name) || {
        limit: 60,
        windowMs: 60_000,
      }

    const clientId = this.getClientId(client)
    const routeKey = `${className}.${handler.name}`
    const mapKey = `${routeKey}::${clientId}`

    const now = Date.now()
    const record = this.hits.get(mapKey)

    if (!record || now > record.resetTime) {
      this.hits.set(mapKey, { count: 1, resetTime: now + options.windowMs })
      return true
    }

    if (record.count >= options.limit) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000)
      this.logger.warn(
        `WS rate limit exceeded for ${clientId} on ${routeKey} ` +
          `(${record.count}/${options.limit} in ${options.windowMs / 1000}s)`,
      )
      // Emit error event back to the client
      client.emit('error', {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
        retryAfter,
      })
      return false
    }

    record.count++
    return true
  }

  private getClientId(client: Socket): string {
    // Prefer a userId stored during auth handshake, fall back to socket ID
    const data = client.data as Record<string, unknown>
    if (data && typeof data.userId === 'string') {
      return data.userId
    }
    return client.id || 'unknown'
  }

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
      this.logger.debug(`WS rate limit cleanup: removed ${cleaned} expired entries`)
    }
  }
}
