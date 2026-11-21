import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  WS_AUTH_AUDIT_LOGGER,
  WS_AUTH_DEFAULTS,
  WS_AUTH_EXPIRED_EVENT,
  WS_AUTH_OPTIONS,
  WS_AUTH_REFRESHED_EVENT,
} from './ws-auth.constants';
import type {
  WsAuditEventType,
  WsAuditLogger,
  WsAuthIdentity,
  WsAuthModuleOptions,
  WsAuthSocket,
  WsSession,
} from './ws-auth.types';
import { isJwt, resolveClientIp } from './ws-auth.utils';

/**
 * Owns the token validation rules and the registry of authenticated sockets.
 *
 * The guard is deliberately thin: all state and all side effects (audit events,
 * expiry timers, notifications) live here so they are unit-testable without a
 * running Socket.IO server.
 */
@Injectable()
export class WsAuthService {
  private readonly sessions = new Map<string, WsSession>();

  constructor(
    private readonly jwtService: JwtService,
    @Inject(WS_AUTH_OPTIONS)
    private readonly options: WsAuthModuleOptions = {},
    @Inject(WS_AUTH_AUDIT_LOGGER)
    private readonly auditLogger?: WsAuditLogger,
  ) {}

  /**
   * Validates a JWT access token, falling back to the configured session-token
   * validator for opaque tokens.
   */
  async validateToken(token: string): Promise<WsAuthIdentity> {
    if (!token || token.trim().length === 0) {
      throw new UnauthorizedException('Missing WebSocket token');
    }

    let jwtError: unknown;
    if (isJwt(token)) {
      try {
        return await this.validateJwt(token);
      } catch (error) {
        jwtError = error;
      }
    }

    if (this.options.sessionValidator) {
      try {
        const identity = await this.options.sessionValidator(token);
        if (identity) {
          return this.normalizeIdentity({ ...identity, tokenType: 'session' });
        }
      } catch {
        // A throwing validator is treated as an invalid token.
      }
    }

    if (jwtError instanceof UnauthorizedException) {
      throw jwtError;
    }
    throw new UnauthorizedException('Invalid or expired WebSocket token');
  }

  /** Registers an authenticated socket and schedules its expiry. */
  register(
    client: WsAuthSocket,
    identity: WsAuthIdentity,
    token: string,
  ): WsSession {
    this.clearSession(client.id);

    const session: WsSession = {
      socketId: client.id,
      identity,
      token,
      expiresAt: identity.expiresAt,
      connectedAt: this.now(),
      ip: resolveClientIp(client),
    };
    session.expiryTimer = this.scheduleExpiry(client, session);
    this.sessions.set(client.id, session);

    this.logEvent('connection.authenticated', client, {
      userId: identity.userId,
    });
    return session;
  }

  /** Returns the active session for a socket, if any. */
  get(socketId: string): WsSession | undefined {
    return this.sessions.get(socketId);
  }

  /** Whether the session's token is past its expiry. */
  isExpired(session: WsSession): boolean {
    return session.expiresAt <= this.now();
  }

  /**
   * Rotates the token of an already-authenticated connection. A rejected
   * refresh keeps the previous session alive until its original expiry.
   */
  async refresh(client: WsAuthSocket, token: string): Promise<WsAuthIdentity> {
    const session = this.sessions.get(client.id);
    if (!session) {
      throw new UnauthorizedException('No active WebSocket session');
    }
    if (this.isExpired(session)) {
      this.expire(client);
      throw new UnauthorizedException('WebSocket session has expired');
    }

    const identity = await this.validateToken(token);
    if (identity.userId !== session.identity.userId) {
      throw new UnauthorizedException(
        'Refreshed token belongs to a different user',
      );
    }

    this.clearTimer(session);
    session.identity = identity;
    session.token = token;
    session.expiresAt = identity.expiresAt;
    session.expiryTimer = this.scheduleExpiry(client, session);

    this.logEvent('connection.refreshed', client, { userId: identity.userId });
    client.emit?.(WS_AUTH_REFRESHED_EVENT, {
      expiresAt: identity.expiresAt,
    });

    return identity;
  }

  /**
   * Gracefully ends an expired connection: notify the client, then close it so
   * buffered frames are flushed before the transport goes away.
   */
  expire(client: WsAuthSocket): void {
    const session = this.sessions.get(client.id);
    if (!session) {
      return;
    }
    this.clearSession(client.id);

    this.logEvent('connection.expired', client, {
      userId: session.identity.userId,
      reason: 'session-expired',
    });
    client.emit?.(WS_AUTH_EXPIRED_EVENT, { reason: 'session-expired' });
    client.disconnect?.(true);
  }

  /** Removes a socket from the registry (client disconnected on its own). */
  unregister(client: WsAuthSocket): void {
    const session = this.sessions.get(client.id);
    if (!session) {
      return;
    }
    this.clearSession(client.id);
    this.logEvent('connection.closed', client, {
      userId: session.identity.userId,
      reason: 'client-disconnected',
    });
  }

  /** Emits a structured audit event through the configured sink. */
  logEvent(
    type: WsAuditEventType,
    client: WsAuthSocket | undefined,
    extra: { userId?: string; reason?: string; retryAfterMs?: number } = {},
  ): void {
    if (!this.auditLogger) {
      return;
    }
    this.auditLogger.log({
      type,
      timestamp: new Date(this.now()).toISOString(),
      socketId: client?.id ?? 'unknown',
      ip: resolveClientIp(client),
      ...extra,
    });
  }

  /** Number of currently tracked connections (metrics / tests). */
  get activeSessionCount(): number {
    return this.sessions.size;
  }

  private async validateJwt(token: string): Promise<WsAuthIdentity> {
    const payload = await this.jwtService.verifyAsync<Record<string, unknown>>(
      token,
      {
        secret: this.options.jwtSecret,
        issuer: this.options.jwtIssuer,
        audience: this.options.jwtAudience,
      },
    );

    const userId =
      typeof payload.sub === 'string'
        ? payload.sub
        : typeof payload.userId === 'string'
          ? payload.userId
          : undefined;
    if (!userId) {
      throw new UnauthorizedException('JWT is missing a subject (sub) claim');
    }

    const expiresAt =
      typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
    if (!expiresAt) {
      throw new UnauthorizedException('JWT is missing an expiry (exp) claim');
    }

    return this.normalizeIdentity({
      userId,
      tokenType: 'jwt',
      expiresAt,
      walletAddress:
        typeof payload.walletAddress === 'string'
          ? payload.walletAddress
          : undefined,
      roles: Array.isArray(payload.roles)
        ? payload.roles.filter((role): role is string => typeof role === 'string')
        : undefined,
    });
  }

  private normalizeIdentity(identity: WsAuthIdentity): WsAuthIdentity {
    if (!identity.userId) {
      throw new UnauthorizedException('Token does not identify a user');
    }
    if (!Number.isFinite(identity.expiresAt)) {
      throw new UnauthorizedException('Token is missing an expiry');
    }
    return identity;
  }

  private scheduleExpiry(
    client: WsAuthSocket,
    session: WsSession,
  ): ReturnType<typeof setTimeout> {
    const delay =
      Math.max(0, session.expiresAt - this.now()) + this.expiryGraceMs();
    const timer = setTimeout(() => this.expire(client), delay);
    // Never keep the process alive only because of an expiry timer.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    return timer;
  }

  private clearSession(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (!session) {
      return;
    }
    this.clearTimer(session);
    this.sessions.delete(socketId);
  }

  private clearTimer(session: WsSession): void {
    if (session.expiryTimer) {
      clearTimeout(session.expiryTimer);
      session.expiryTimer = undefined;
    }
  }

  private expiryGraceMs(): number {
    return this.options.expiryGraceMs ?? WS_AUTH_DEFAULTS.expiryGraceMs;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}
