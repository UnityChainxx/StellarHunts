import { describe, expect, it } from '@jest/globals';
import { WsAuthGateway } from './ws-auth.gateway';
import { WS_AUTH_REFRESHED_EVENT } from './ws-auth.constants';
import {
  createService,
  createSocket,
  signTestToken,
} from './testing/ws-auth.test-utils';
import type { WsAuthService } from './ws-auth.service';

class TestGateway extends WsAuthGateway {
  constructor(wsAuth: WsAuthService) {
    super(wsAuth);
  }
}

const FIXED_NOW = Date.now();

async function setUp() {
  const { service, events } = createService({ now: () => FIXED_NOW });
  const gateway = new TestGateway(service);
  const token = await signTestToken({ sub: 'user-1' }, { expiresIn: '60s' });
  const socket = createSocket();
  service.register(socket, await service.validateToken(token), token);
  return { gateway, service, events, socket, token };
}

describe('WsAuthGateway', () => {
  it('rotates the token on a valid refresh request', async () => {
    const { gateway, service, socket } = await setUp();
    const nextToken = await signTestToken({ sub: 'user-1' }, { expiresIn: '600s' });

    const ack = await gateway.handleWsAuthRefresh(socket, { token: nextToken });

    expect(ack).toMatchObject({ ok: true });
    expect(ack.expiresAt).toBeGreaterThan(FIXED_NOW + 60_000);
    expect(service.get(socket.id)?.token).toBe(nextToken);
    expect(socket.emit).toHaveBeenCalledWith(WS_AUTH_REFRESHED_EVENT, {
      expiresAt: ack.expiresAt,
    });
  });

  it('rejects a refresh request without a token', async () => {
    const { gateway, socket } = await setUp();

    await expect(gateway.handleWsAuthRefresh(socket, {})).resolves.toEqual({
      ok: false,
      error: 'missing-token',
    });
  });

  it('keeps the connection alive when a refresh token is invalid', async () => {
    const { gateway, service, socket, token } = await setUp();

    const ack = await gateway.handleWsAuthRefresh(socket, { token: 'garbage' });

    expect(ack).toEqual({ ok: false, error: 'refresh-rejected' });
    expect(service.get(socket.id)?.token).toBe(token);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('unregisters the socket on disconnect', async () => {
    const { gateway, service, socket } = await setUp();
    expect(service.activeSessionCount).toBe(1);

    gateway.handleDisconnect(socket);

    expect(service.activeSessionCount).toBe(0);
  });
});
