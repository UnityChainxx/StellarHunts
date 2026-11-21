import type { WsAuthDisconnectReason } from './ws-auth.constants';

/**
 * Authenticated principal attached to a WebSocket connection.
 */
export interface WsAuthIdentity {
  /** Stable user identifier (JWT `sub` / session record owner). */
  userId: string;
  /** How the token was resolved. */
  tokenType: 'jwt' | 'session';
  /** Absolute expiry of the presented token, in epoch milliseconds. */
  expiresAt: number;
  /** Optional wallet address linked to the user. */
  walletAddress?: string;
  /** Optional role list, useful for gateway-level authorization. */
  roles?: string[];
}

/**
 * Shape returned by a custom session-token validator.
 */
export type WsSessionIdentityInput = Omit<WsAuthIdentity, 'tokenType'>;

/**
 * Resolves an opaque session token (for example a value stored in Redis or the
 * `session` module) into an identity. Returning `null` rejects the connection.
 */
export type WsSessionTokenValidator = (
  token: string,
) => Promise<WsSessionIdentityInput | null> | WsSessionIdentityInput | null;

/**
 * Minimal handshake shape shared by Socket.IO and ws clients.
 */
export interface WsAuthHandshake {
  auth?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  address?: string;
}

/**
 * Minimal socket contract consumed by the guard. Keeping it structural avoids a
 * hard dependency on a concrete Socket.IO `Socket` type.
 */
export interface WsAuthSocket {
  id: string;
  handshake?: WsAuthHandshake;
  data?: Record<string, unknown>;
  client?: { remoteAddress?: string };
  emit?: (event: string, payload?: unknown) => unknown;
  disconnect?: (close?: boolean) => unknown;
}

/**
 * Server-side view of one authenticated connection.
 */
export interface WsSession {
  socketId: string;
  identity: WsAuthIdentity;
  token: string;
  expiresAt: number;
  connectedAt: number;
  ip: string;
  expiryTimer?: ReturnType<typeof setTimeout>;
}

/** Audit event kinds emitted by the connection lifecycle. */
export type WsAuditEventType =
  | 'connection.attempt'
  | 'connection.authenticated'
  | 'connection.rejected'
  | 'connection.rate_limited'
  | 'connection.refreshed'
  | 'connection.expired'
  | 'connection.closed';

/** Structured audit record, safe to serialize into the existing log pipeline. */
export interface WsAuditEvent {
  type: WsAuditEventType;
  timestamp: string;
  socketId: string;
  ip: string;
  userId?: string;
  reason?: string;
  retryAfterMs?: number;
}

/** Sink for audit events. Swap for the Nest logger / OpenTelemetry in production. */
export interface WsAuditLogger {
  log(event: WsAuditEvent): void;
}

/** Configuration accepted by `WsAuthModule.forRoot()`. */
export interface WsAuthModuleOptions {
  /** Secret used to verify JWT access tokens. */
  jwtSecret?: string;
  /** Optional expected `iss` claim. */
  jwtIssuer?: string;
  /** Optional expected `aud` claim. */
  jwtAudience?: string;
  /** Fallback validator for opaque session tokens. */
  sessionValidator?: WsSessionTokenValidator;
  /** Connection attempts allowed per IP inside one window. */
  maxConnectionAttempts?: number;
  /** Rate-limit window length, in milliseconds. */
  rateLimitWindowMs?: number;
  /** Delay between the expiry notification and the socket close. */
  expiryGraceMs?: number;
  /** Override the audit sink (defaults to JSON lines on stdout). */
  auditLogger?: WsAuditLogger;
  /** Clock override, mainly for deterministic tests. */
  now?: () => number;
}

/** Payload accepted by the `ws:auth:refresh` message handler. */
export interface WsAuthRefreshPayload {
  token?: string;
}

/** Acknowledgment returned to the client after a refresh attempt. */
export interface WsAuthRefreshAck {
  ok: boolean;
  expiresAt?: number;
  error?: string;
}

/** Result of a rate-limit check. */
export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export type { WsAuthDisconnectReason };
