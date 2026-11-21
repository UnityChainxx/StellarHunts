import type { WsAuthSocket } from './ws-auth.types';

/**
 * Normalizes the proxy-aware remote address of a socket.
 */
export function resolveClientIp(socket: WsAuthSocket | undefined): string {
  const address = socket?.handshake?.address ?? socket?.client?.remoteAddress;
  if (!address) {
    return 'unknown';
  }
  // IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`) must not be rate limited
  // separately from their plain IPv4 form.
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}

/**
 * Resolves the token presented during the WebSocket handshake.
 *
 * Precedence: Socket.IO `auth.token`, `?token=` query parameter, then
 * `Authorization: Bearer <token>` header. The query-string fallback is what
 * browsers can send because the WebSocket constructor cannot set headers.
 */
export function extractToken(socket: WsAuthSocket | undefined): string | undefined {
  const handshake = socket?.handshake;

  const authToken = handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim().length > 0) {
    return authToken.trim();
  }

  const queryToken = handshake?.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
    return queryToken.trim();
  }

  const header = handshake?.headers?.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    const headerToken = header.slice('bearer '.length).trim();
    return headerToken.length > 0 ? headerToken : undefined;
  }

  return undefined;
}

/** Whether a token is structurally a JWT (three dot-separated segments). */
export function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}
