/**
 * Injection token for the normalized `WsAuthModuleOptions`.
 */
export const WS_AUTH_OPTIONS = Symbol('WS_AUTH_OPTIONS');

/**
 * Injection token for the audit logger used by the WebSocket auth layer.
 */
export const WS_AUTH_AUDIT_LOGGER = Symbol('WS_AUTH_AUDIT_LOGGER');

/** Client -> server event used to rotate the token of an active connection. */
export const WS_AUTH_REFRESH_EVENT = 'ws:auth:refresh';

/** Server -> client event emitted once a refresh succeeds. */
export const WS_AUTH_REFRESHED_EVENT = 'ws:auth:refreshed';

/** Server -> client event emitted right before an expired connection is closed. */
export const WS_AUTH_EXPIRED_EVENT = 'ws:auth:expired';

/** Server -> client event emitted when a handshake is rejected. */
export const WS_AUTH_ERROR_EVENT = 'ws:auth:error';

/** Reasons attached to rejected handshakes and closed connections. */
export type WsAuthDisconnectReason =
  | 'missing-token'
  | 'invalid-token'
  | 'rate-limited'
  | 'session-expired'
  | 'client-disconnected';

/** Defaults applied when the consumer does not override them. */
export const WS_AUTH_DEFAULTS = {
  /** Connection attempts allowed per IP inside one rate-limit window. */
  maxConnectionAttempts: 10,
  /** Length of the per-IP rate-limit window, in milliseconds. */
  rateLimitWindowMs: 60_000,
  /** Grace period between "token expired" notification and the socket close. */
  expiryGraceMs: 250,
} as const;
