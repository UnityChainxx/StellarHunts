import type { WsRateLimitOptions } from '../guards/ws-rate-limit.guard'

const WS_RATE_LIMIT_KEY = 'wsRateLimit'

/**
 * Apply a per-handler WebSocket rate limit.
 *
 * Usage:
 *   @WsRateLimit({ limit: 10, windowMs: 60_000 })
 *   @SubscribeMessage('joinQueue')
 *   handleJoinQueue(@MessageBody() data) { ... }
 */
export const WsRateLimit = (options: WsRateLimitOptions) =>
  (target: object, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (propertyKey && descriptor) {
      Reflect.defineMetadata(WS_RATE_LIMIT_KEY, options, descriptor.value)
    } else {
      Reflect.defineMetadata(WS_RATE_LIMIT_KEY, options, target)
    }
    return descriptor ?? target
  }
