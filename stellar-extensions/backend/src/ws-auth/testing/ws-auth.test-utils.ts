import type { ExecutionContext } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import { WsAuthService } from '../ws-auth.service';
import type {
  WsAuditEvent,
  WsAuditLogger,
  WsAuthModuleOptions,
  WsAuthSocket,
} from '../ws-auth.types';

export const TEST_SECRET = 'stellar-hunts-test-secret';

type MockFn = ReturnType<typeof jest.fn>;

export interface TestSocket extends WsAuthSocket {
  emit: MockFn;
  disconnect: MockFn;
}

export function createJwtService(secret: string = TEST_SECRET): JwtService {
  return new JwtService({ secret });
}

export function signTestToken(
  payload: Record<string, unknown> = { sub: 'user-1' },
  options: { expiresIn?: JwtSignOptions['expiresIn']; secret?: string } = {},
): Promise<string> {
  return createJwtService(options.secret).signAsync(payload, {
    expiresIn: options.expiresIn ?? '5m',
  });
}

export function createSocket(overrides: Partial<WsAuthSocket> = {}): TestSocket {
  return {
    id: 'socket-1',
    handshake: {
      address: '203.0.113.5',
      auth: { token: 'placeholder-token' },
    },
    data: {},
    emit: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  } as TestSocket;
}

export function createWsContext(socket: WsAuthSocket): ExecutionContext {
  return {
    getType: () => 'ws',
    switchToWs: () => ({ getClient: () => socket }),
  } as unknown as ExecutionContext;
}

export function createAuditCollector(): {
  events: WsAuditEvent[];
  logger: WsAuditLogger;
} {
  const events: WsAuditEvent[] = [];
  return {
    events,
    logger: { log: (event: WsAuditEvent) => void events.push(event) },
  };
}

export function createService(options: WsAuthModuleOptions = {}): {
  service: WsAuthService;
  events: WsAuditEvent[];
} {
  const { events, logger } = createAuditCollector();
  const service = new WsAuthService(
    createJwtService(options.jwtSecret ?? TEST_SECRET),
    { jwtSecret: TEST_SECRET, ...options },
    logger,
  );
  return { service, events };
}
