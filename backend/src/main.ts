import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { DOCS_ROUTE_EXCLUSIONS, buildApiPrefix } from './api-prefix';
import { setupSwagger } from './swagger';
import { securityHeadersConfig } from './security-headers';
import { RequestTraceInterceptor } from './common/interceptors/request-trace.interceptor';

/**
 * Hard limit (ms) we allow the graceful shutdown sequence to take before
 * forcing process exit. Kubernetes/the container runtime send a SIGKILL
 * ~30s after SIGTERM, so we stay safely underneath that to avoid being
 * killed mid-shutdown while still guaranteeing the process eventually exits.
 */
const FORCE_SHUTDOWN_TIMEOUT_MS = 25_000;

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService>(ConfigService);

  // The frontend calls endpoints under the `/api` prefix (see
  // frontend/store calls to /api/login, /api/register, etc.), so the global
  // prefix is set on the whole Nest app. This also resolves issue #105 which
  // expects the /api/users/:userId/history URL shape.
  //
  // Swagger UI is excluded so /docs, its JSON sibling /docs-json, and its
  // nested asset routes (e.g. /docs/swagger-ui-init.js) stay at canonical
  // paths instead of being double-prefixed to /api. Nest treats string
  // entries as exact paths, so we also pass a RegExp to cover /docs/....
  // A single anchored regex covers `docs`, `docs-json`, and any nested
  // /docs/<asset> route (e.g. /docs/swagger-ui-init.js). Nest evaluates the
  // exclude list against the registered handler path before the global
  // prefix is applied.
  app.setGlobalPrefix('api', {
    exclude: ['docs', 'docs-json', 'docs/{*path}'],
  });

  app.enableCors({
    origin: configService.get<string>('appConfig.cors.origin') ?? '*',
    methods: configService.get<string[]>('appConfig.cors.methods') ?? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: configService.get<string[]>('appConfig.cors.allowedHeaders') ?? ['Content-Type', 'Authorization'],
    credentials: configService.get<boolean>('appConfig.cors.credentials') ?? true,
  });
  app.use(helmet());
  // forbidNonWhitelisted is the settled posture (issue #529): unknown
  // properties must be rejected with 400, not silently stripped. The pipe
  // spec in src/config/global-validation-pipe.spec.ts asserts this mode.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Issue #753: Apply structured request tracing globally.
  // Every request receives a UUID trace ID (X-Trace-Id header) and emits
  // JSON-structured incoming_request / outgoing_response log events.
  // Sampling is controlled via LOG_SAMPLE_RATE env var (0–1, default 1).
  app.useGlobalInterceptors(new RequestTraceInterceptor());

  // Respect `appConfig.swagger.enabled` (see backend/config/app.config.ts):
  // the UI is mounted in development but stays off by default in
  // production/staging/test unless `SWAGGER_ENABLED=true` is set explicitly.
  setupSwagger(app, configService);

  const port = Number.parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port);
  logger.log(`StellarHunts API listening on http://localhost:${port}`);
}

void bootstrap();
