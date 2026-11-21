import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { WS_AUTH_AUDIT_LOGGER } from './ws-auth.constants';
import { WsAuthGuard } from './ws-auth.guard';
import { WsAuthModule } from './ws-auth.module';
import { WsAuthService } from './ws-auth.service';
import { WsConnectionRateLimiter } from './ws-connection-rate-limiter';
import { createAuditCollector } from './testing/ws-auth.test-utils';

describe('WsAuthModule', () => {
  it('wires the guard, service and rate limiter', async () => {
    const { logger } = createAuditCollector();
    const moduleRef = await Test.createTestingModule({
      imports: [
        WsAuthModule.forRoot({
          jwtSecret: 'module-secret',
          maxConnectionAttempts: 3,
          auditLogger: logger,
        }),
      ],
    }).compile();

    expect(moduleRef.get(WsAuthGuard)).toBeInstanceOf(WsAuthGuard);
    expect(moduleRef.get(WsAuthService)).toBeInstanceOf(WsAuthService);
    expect(moduleRef.get(WsConnectionRateLimiter)).toBeInstanceOf(
      WsConnectionRateLimiter,
    );
    expect(moduleRef.get(WS_AUTH_AUDIT_LOGGER)).toBe(logger);

    await moduleRef.close();
  });
});
