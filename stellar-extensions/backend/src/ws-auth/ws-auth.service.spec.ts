import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import {
  WS_AUTH_EXPIRED_EVENT,
  WS_AUTH_REFRESHED_EVENT,
} from './ws-auth.constants';
import {
  createAuditCollector,
  createJwtService,
  createService,
  createSocket,
  signTestToken,
  TEST_SECRET,
} from './testing/ws-auth.test-utils';
import { WsAuthService } from './ws-auth.service';

// Tokens are signed with the real clock, so the controllable clock used by the
// service must start from "now" to keep expiry math consistent.
const FIXED_NOW = Date.now();

describe('WsAuthService', () => {
  describe('validateToken', () => {
    it('maps JWT claims onto the identity', async () => {
      const { service } = createService();
      const token = await signTestToken({
        sub: 'user-7',
        walletAddress: 'GDWALLET',
        roles: ['player', 42, 'admin'],
      });

      const identity = await service.validateToken(token);

      expect(identity).toMatchObject({
        userId: 'user-7',
        tokenType: 'jwt',
        walletAddress: 'GDWALLET',
        roles: ['player', 'admin'],
      });
      expect(identity.expiresAt).toBeGreaterThan(FIXED_NOW);
    });

    it('rejects a JWT signed with another secret', async () => {
      const { service } = createService();
      const token = await signTestToken({ sub: 'user-7' }, { secret: 'other-secret' });

      await expect(service.validateToken(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a JWT without a subject claim', async () => {
      const { service } = createService();
      const token = await signTestToken({ userId: undefined });

      await expect(service.validateToken(token)).rejects.toThrow(
        /subject \(sub\) claim/,
      );
    });

    it('rejects an empty token', async () => {
      const { service } = createService();

      await expect(service.validateToken('  ')).rejects.toThrow(
        /Missing WebSocket token/,
      );
    });

    it('falls back to the session validator when the JWT is rejected', async () => {
      const { service } = createService({
        sessionValidator: async (token) =>
          token === 'valid-session'
            ? { userId: 'session-user', expiresAt: FIXED_NOW + 1_000 }
            : null,
      });

      await expect(service.validateToken('valid-session')).resolves.toMatchObject(
        { userId: 'session-user', tokenType: 'session' },
      );
      await expect(service.validateToken('unknown')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('register / unregister', () => {
    it('tracks the socket until it disconnects', async () => {
      const { service, events } = createService({ now: () => FIXED_NOW });
      const token = await signTestToken();
      const identity = await service.validateToken(token);
      const socket = createSocket();

      service.register(socket, identity, token);
      expect(service.activeSessionCount).toBe(1);
      expect(service.get(socket.id)?.ip).toBe('203.0.113.5');

      service.unregister(socket);
      expect(service.activeSessionCount).toBe(0);
      expect(events[events.length - 1]).toMatchObject({
        type: 'connection.closed',
        reason: 'client-disconnected',
      });

      // Unregistering twice is a no-op.
      service.unregister(socket);
      expect(events.filter((event) => event.type === 'connection.closed')).toHaveLength(1);
    });

    it('replaces an existing session when the same socket re-registers', async () => {
      const { service } = createService({ now: () => FIXED_NOW });
      const token = await signTestToken();
      const identity = await service.validateToken(token);
      const socket = createSocket();

      service.register(socket, identity, token);
      service.register(socket, identity, token);

      expect(service.activeSessionCount).toBe(1);
    });
  });

  describe('token refresh', () => {
    it('rotates the token and emits a refreshed notification', async () => {
      let clock = FIXED_NOW;
      const { events, logger } = createAuditCollector();
      const service = new WsAuthService(
        createJwtService(),
        { jwtSecret: TEST_SECRET, now: () => clock },
        logger,
      );
      const socket = createSocket();

      const firstToken = await signTestToken({ sub: 'user-1' }, { expiresIn: '60s' });
      service.register(socket, await service.validateToken(firstToken), firstToken);

      clock += 30_000;
      const refreshedToken = await signTestToken(
        { sub: 'user-1' },
        { expiresIn: '300s' },
      );
      const identity = await service.refresh(socket, refreshedToken);

      expect(service.get(socket.id)?.token).toBe(refreshedToken);
      expect(identity.expiresAt).toBeGreaterThan(tokenExpiry(firstToken));
      expect(socket.emit).toHaveBeenCalledWith(WS_AUTH_REFRESHED_EVENT, {
        expiresAt: identity.expiresAt,
      });
      expect(events[events.length - 1]?.type).toBe('connection.refreshed');
    });

    it('refuses a refresh with a token for another user and keeps the session', async () => {
      const { service } = createService({ now: () => FIXED_NOW });
      const token = await signTestToken({ sub: 'user-1' }, { expiresIn: '60s' });
      const socket = createSocket();
      service.register(socket, await service.validateToken(token), token);

      const otherToken = await signTestToken(
        { sub: 'user-2' },
        { expiresIn: '60s' },
      );

      await expect(service.refresh(socket, otherToken)).rejects.toThrow(
        /different user/,
      );
      expect(service.get(socket.id)?.token).toBe(token);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('refuses a refresh when there is no active session', async () => {
      const { service } = createService();
      const token = await signTestToken();

      await expect(
        service.refresh(createSocket(), token),
      ).rejects.toThrow(/No active WebSocket session/);
    });

    it('expires the connection when refreshing after expiry', async () => {
      let clock = FIXED_NOW;
      const { logger } = createAuditCollector();
      const service = new WsAuthService(
        createJwtService(),
        { jwtSecret: TEST_SECRET, now: () => clock },
        logger,
      );
      const token = await signTestToken({ sub: 'user-1' }, { expiresIn: '60s' });
      const socket = createSocket();
      service.register(socket, await service.validateToken(token), token);

      clock += 61_000;
      await expect(service.refresh(socket, token)).rejects.toThrow(/expired/);

      expect(socket.emit).toHaveBeenCalledWith(WS_AUTH_EXPIRED_EVENT, {
        reason: 'session-expired',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(service.activeSessionCount).toBe(0);
    });
  });

  describe('expiry handling', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('gracefully disconnects the socket when the token expires', async () => {
      const token = await signTestToken({ sub: 'user-1' }, { expiresIn: '60s' });
      jest.useFakeTimers();
      jest.setSystemTime(tokenExpiry(token) - 60_000);
      const { service, events } = createService({ expiryGraceMs: 50 });
      const socket = createSocket();

      service.register(socket, await service.validateToken(token), token);

      jest.advanceTimersByTime(60_000);
      expect(socket.disconnect).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(socket.emit).toHaveBeenCalledWith(WS_AUTH_EXPIRED_EVENT, {
        reason: 'session-expired',
      });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(service.activeSessionCount).toBe(0);
      expect(events[events.length - 1]).toMatchObject({
        type: 'connection.expired',
        userId: 'user-1',
      });
    });

    it('does not fire the expiry timer after a manual unregister', async () => {
      const token = await signTestToken({ sub: 'user-1' }, { expiresIn: '60s' });
      jest.useFakeTimers();
      jest.setSystemTime(tokenExpiry(token) - 60_000);
      const { service } = createService();
      const socket = createSocket();
      service.register(socket, await service.validateToken(token), token);

      service.unregister(socket);
      jest.advanceTimersByTime(120_000);

      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.disconnect).not.toHaveBeenCalled();
    });
  });
});

function tokenExpiry(token: string): number {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8'),
  ) as { exp: number };
  return payload.exp * 1000;
}
