import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { WS_AUTH_ERROR_EVENT } from './ws-auth.constants';
import { WsAuthService } from './ws-auth.service';
import { WsConnectionRateLimiter } from './ws-connection-rate-limiter';
import type { WsAuthSocket } from './ws-auth.types';
import { extractToken, resolveClientIp } from './ws-auth.utils';

/**
 * Authenticates WebSocket clients.
 *
 * The guard is idempotent: applied at gateway level it runs for the handshake
 * *and* for every message, so an already-authenticated socket takes a cheap
 * registry lookup and never re-enters the token/rate-limit path.
 */
@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(
    private readonly auth: WsAuthService,
    private readonly rateLimiter: WsConnectionRateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'ws') {
      return false;
    }

    const client = context.switchToWs().getClient<WsAuthSocket>();
    if (!client?.id) {
      return false;
    }

    const existing = this.auth.get(client.id);
    if (existing) {
      if (this.auth.isExpired(existing)) {
        this.auth.expire(client);
        return false;
      }
      return true;
    }

    return this.authenticateHandshake(client);
  }

  private async authenticateHandshake(client: WsAuthSocket): Promise<boolean> {
    this.auth.logEvent('connection.attempt', client);

    const ip = resolveClientIp(client);
    const decision = this.rateLimiter.consume(ip);
    if (!decision.allowed) {
      this.auth.logEvent('connection.rate_limited', client, {
        reason: 'rate-limited',
        retryAfterMs: decision.retryAfterMs,
      });
      this.close(client, 'rate-limited');
      return false;
    }

    const token = extractToken(client);
    if (!token) {
      this.reject(client, 'missing-token');
      return false;
    }

    try {
      const identity = await this.auth.validateToken(token);
      this.auth.register(client, identity, token);
      client.data = {
        ...(client.data ?? {}),
        wsAuth: { identity, token, expiresAt: identity.expiresAt },
        user: identity,
      };
      return true;
    } catch {
      this.reject(client, 'invalid-token');
      return false;
    }
  }

  private reject(
    client: WsAuthSocket,
    reason: 'missing-token' | 'invalid-token',
  ): void {
    this.auth.logEvent('connection.rejected', client, { reason });
    this.close(client, reason);
  }

  private close(
    client: WsAuthSocket,
    reason: 'missing-token' | 'invalid-token' | 'rate-limited',
  ): void {
    client.emit?.(WS_AUTH_ERROR_EVENT, { reason });
    client.disconnect?.(true);
  }
}
