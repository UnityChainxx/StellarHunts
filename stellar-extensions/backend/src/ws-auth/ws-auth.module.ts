import { Module, type DynamicModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConsoleWsAuditLogger } from './ws-audit.logger';
import {
  WS_AUTH_AUDIT_LOGGER,
  WS_AUTH_DEFAULTS,
  WS_AUTH_OPTIONS,
} from './ws-auth.constants';
import { WsAuthGuard } from './ws-auth.guard';
import { WsAuthService } from './ws-auth.service';
import type { WsAuthModuleOptions } from './ws-auth.types';
import { WsConnectionRateLimiter } from './ws-connection-rate-limiter';

/**
 * Registers the WebSocket connection auth guard, its session registry, the
 * per-IP rate limiter and the audit sink.
 *
 * ```ts
 * @Module({
 *   imports: [
 *     WsAuthModule.forRoot({ jwtSecret: process.env.JWT_SECRET }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class WsAuthModule {
  static forRoot(options: WsAuthModuleOptions = {}): DynamicModule {
    return {
      module: WsAuthModule,
      imports: [
        JwtModule.register({
          secret: options.jwtSecret,
          signOptions: {},
        }),
      ],
      providers: [
        { provide: WS_AUTH_OPTIONS, useValue: options },
        {
          provide: WS_AUTH_AUDIT_LOGGER,
          useValue: options.auditLogger ?? new ConsoleWsAuditLogger(),
        },
        {
          provide: WsConnectionRateLimiter,
          useFactory: (moduleOptions: WsAuthModuleOptions) =>
            new WsConnectionRateLimiter(
              moduleOptions.maxConnectionAttempts ??
                WS_AUTH_DEFAULTS.maxConnectionAttempts,
              moduleOptions.rateLimitWindowMs ??
                WS_AUTH_DEFAULTS.rateLimitWindowMs,
              moduleOptions.now,
            ),
          inject: [WS_AUTH_OPTIONS],
        },
        WsAuthService,
        WsAuthGuard,
      ],
      exports: [
        WsAuthService,
        WsAuthGuard,
        WsConnectionRateLimiter,
        WS_AUTH_OPTIONS,
        WS_AUTH_AUDIT_LOGGER,
      ],
    };
  }
}
