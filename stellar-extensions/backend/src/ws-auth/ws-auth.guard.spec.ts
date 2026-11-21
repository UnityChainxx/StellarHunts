import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { WS_AUTH_ERROR_EVENT } from './ws-auth.constants';
import { WsAuthGuard } from './ws-auth.guard';
import { WsAuthService } from './ws-auth.service';
import { WsConnectionRateLimiter } from './ws-connection-rate-limiter';
import {
  createAuditCollector,
  createJwtService,
  createSocket,
  createWsContext,
  signTestToken,
  TEST_SECRET,
} from './testing/ws-auth.test-utils';
import type { WsAuthModuleOptions, WsAuthSocket } from './ws-auth.types';

// Tokens are signed with the real clock, so the controllable clock used by the
// guard must start from "now" to keep expiry math consistent.
const FIXED_NOW = Date.now();

function createGuard(
  options: WsAuthModuleOptions = {},
): {
  guard: WsAuthGuard;
  service: WsAuthService;
  limiter: WsConnectionRateLimiter;
  events: ReturnType<typeof createAuditCollector>['events'];
  now: () => number;
} {
  let clock = FIXED_NOW;
  const now = () => clock;
  const { events, logger } = createAuditCollector();
  const service = new WsAuthService(
    createJwtService(options.jwtSecret ?? TEST_SECRET),
    { jwtSecret: TEST_SECRET, now, ...options },
    logger,
  );
  const limiter = new WsConnectionRateLimiter(
    options.maxConnectionAttempts ?? 10,
    options.rateLimitWindowMs ?? 60_000,
    now,
  );
  return {
    guard: new WsAuthGuard(service, limiter),
    service,
    limiter,
    events,
    now: () => clock,
  };
}

describe('WsAuthGuard', () => {
  describe('handshake authentication', () => {
    it('accepts a valid JWT and attaches the identity to the socket', async () => {
      const { guard, service, events } = createGuard();
      const token = await signTestToken({ sub: 'user-42' });
      const socket = createSocket({ handshake: { address: '203.0.113.5', auth: { token } } });

      const allowed = await guard.canActivate(createWsContext(socket));

      expect(allowed).toBe(true);
      expect(service.get(socket.id)?.identity.userId).toBe('user-42');
      expect((socket.data?.user as { userId: string }).userId).toBe('user-42');
      expect(events.map((event) => event.type)).toEqual([
        'connection.attempt',
        'connection.authenticated',
      ]);
    });

    it('accepts a token sent through the query string', async () => {
      const { guard } = createGuard();
      const token = await signTestToken();
      const socket = createSocket({
        handshake: { address: '203.0.113.5', query: { token } },
      });

      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        true,
      );
    });

    it('accepts a token sent through the Authorization header', async () => {
      const { guard } = createGuard();
      const token = await signTestToken();
      const socket = createSocket({
        handshake: {
          address: '203.0.113.5',
          headers: { authorization: `Bearer ${token}` },
        },
      });

      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        true,
      );
    });

    it('rejects and disconnects a connection without a token', async () => {
      const { guard, events } = createGuard();
      const socket = createSocket({ handshake: { address: '203.0.113.5' } });

      const allowed = await guard.canActivate(createWsContext(socket));

      expect(allowed).toBe(false);
      expect(socket.emit).toHaveBeenCalledWith(WS_AUTH_ERROR_EVENT, {
        reason: 'missing-token',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(events[events.length - 1]).toMatchObject({
        type: 'connection.rejected',
        reason: 'missing-token',
      });
    });

    it('rejects a malformed token', async () => {
      const { guard } = createGuard();
      const socket = createSocket({
        handshake: { address: '203.0.113.5', auth: { token: 'not-a-token' } },
      });

      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        false,
      );
      expect(socket.emit).toHaveBeenCalledWith(WS_AUTH_ERROR_EVENT, {
        reason: 'invalid-token',
      });
    });

    it('rejects an expired JWT', async () => {
      const { guard, service } = createGuard();
      const token = await signTestToken({ sub: 'user-1' }, { expiresIn: -10 });
      const socket = createSocket({ handshake: { auth: { token } } });

      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        false,
      );
      expect(service.activeSessionCount).toBe(0);
    });

    it('accepts an opaque session token through the session validator', async () => {
      const { guard, service } = createGuard({
        sessionValidator: (token) =>
          token === 'session-token'
            ? { userId: 'session-user', expiresAt: FIXED_NOW + 60_000 }
            : null,
      });
      const socket = createSocket({
        handshake: { auth: { token: 'session-token' } },
      });

      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        true,
      );
      expect(service.get(socket.id)?.identity).toMatchObject({
        userId: 'session-user',
        tokenType: 'session',
      });
    });

    it('rejects when the session validator throws', async () => {
      const { guard } = createGuard({
        sessionValidator: () => {
          throw new Error('session store unavailable');
        },
      });
      const socket = createSocket({
        handshake: { auth: { token: 'opaque-token' } },
      });

      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        false,
      );
    });

    it('returns false for non-WebSocket contexts', async () => {
      const { guard } = createGuard();
      const httpContext = {
        getType: () => 'http',
        switchToWs: () => ({ getClient: () => createSocket() }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(httpContext)).resolves.toBe(false);
    });
  });

  describe('rate limiting', () => {
    it('rejects further attempts from the same IP once the limit is reached', async () => {
      const { guard, events } = createGuard({ maxConnectionAttempts: 2 });
      const token = await signTestToken();

      const attempt = (id: string, address: string) =>
        guard.canActivate(
          createWsContext(
            createSocket({ id, handshake: { address, auth: { token } } }),
          ),
        );

      await expect(attempt('a', '198.51.100.7')).resolves.toBe(true);
      await expect(attempt('b', '198.51.100.7')).resolves.toBe(true);

      const blocked = createSocket({
        id: 'c',
        handshake: { address: '198.51.100.7', auth: { token } },
      });
      await expect(guard.canActivate(createWsContext(blocked))).resolves.toBe(
        false,
      );
      expect(blocked.emit).toHaveBeenCalledWith(WS_AUTH_ERROR_EVENT, {
        reason: 'rate-limited',
      });
      expect(blocked.disconnect).toHaveBeenCalledWith(true);
      expect(events[events.length - 1]).toMatchObject({
        type: 'connection.rate_limited',
        reason: 'rate-limited',
      });

      // A different IP is unaffected.
      await expect(attempt('d', '198.51.100.8')).resolves.toBe(true);
    });

    it('does not consume the rate limit for messages on an authenticated socket', async () => {
      const { guard, limiter } = createGuard({ maxConnectionAttempts: 2 });
      const token = await signTestToken();
      const socket = createSocket({
        handshake: { address: '203.0.113.5', auth: { token } },
      });
      const consume = jest.spyOn(limiter, 'consume');

      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        true,
      );
      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        true,
      );
      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        true,
      );

      expect(consume).toHaveBeenCalledTimes(1);
    });
  });

  describe('session lifecycle', () => {
    it('rejects and closes a socket whose token expired mid-connection', async () => {
      let clock = FIXED_NOW;
      const { events, logger } = createAuditCollector();
      const service = new WsAuthService(
        createJwtService(),
        { jwtSecret: TEST_SECRET, now: () => clock },
        logger,
      );
      const guard = new WsAuthGuard(
        service,
        new WsConnectionRateLimiter(10, 60_000, () => clock),
      );

      const token = await signTestToken({ sub: 'user-1' }, { expiresIn: '60s' });
      const socket = createSocket({
        handshake: { address: '203.0.113.5', auth: { token } },
      });
      await guard.canActivate(createWsContext(socket));

      clock += 59_000;
      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        true,
      );

      clock += 2_000;
      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        false,
      );
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(service.activeSessionCount).toBe(0);
      expect(events[events.length - 1]?.type).toBe('connection.expired');
    });

    it('rejects a socket that has no id', async () => {
      const { guard } = createGuard();
      const socket = { ...createSocket(), id: undefined } as unknown as WsAuthSocket;

      await expect(guard.canActivate(createWsContext(socket))).resolves.toBe(
        false,
      );
    });
  });
});
