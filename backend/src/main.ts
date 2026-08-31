import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { securityHeadersConfig } from './security-headers';

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

  app.setGlobalPrefix('api', { exclude: [/^docs/] });
  // Every route is served under the `/api/<version>` prefix. The version
  // comes from `appConfig.apiVersion` (backend/config/app.config.ts,
  // env `API_VERSION`), which defaults to `v1`, so the browser talks to
  // e.g. `POST /api/v1/auth/login`. The frontend builds all backend URLs
  // through `frontend/lib/api.js` (`apiUrl()`); the shared contract is
  // documented in docs/api-conventions.md and locked by the integration
  // tests (frontend/tests/apiRoutes.test.js and
  // backend/test/api-prefix.e2e-spec.ts).
  //
  // Swagger UI is excluded so /docs, its JSON sibling /docs-json, and its
  // nested asset routes (e.g. /docs/swagger-ui-init.js) stay at canonical
  // paths instead of being double-prefixed to /api.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'docs', method: RequestMethod.ALL },
      { path: 'docs-json', method: RequestMethod.ALL },
      { path: 'docs/(.*)', method: RequestMethod.ALL },
    ],
  });

  const corsOrigin = configService.get<string>('appConfig.cors.origin') ?? '*';
  const credentials = configService.get<boolean>('appConfig.cors.credentials') ?? true;

  app.enableCors({
    origin: (origin, callback) => {
      if (credentials && corsOrigin === '*') {
        const allowlist = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [];
        if (!origin || allowlist.includes(origin) || origin === 'http://localhost:3000') {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      } else {
        if (corsOrigin === '*') {
          callback(null, true);
        } else {
          const allowlist = corsOrigin.split(',');
          if (!origin || allowlist.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        }
      }
    },
    methods: configService.get<string[]>('appConfig.cors.methods') ?? [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: configService.get<string[]>(
      'appConfig.cors.allowedHeaders',
    ) ?? ['Content-Type', 'Authorization'],
    credentials,
  });

  app.use(helmet(securityHeadersConfig));

  // Global validation policy (issue #340): unknown properties are stripped,
  // DTOs are transformed, and all controllers share the same defaults.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger (/docs) is an introspection surface that reveals controller
  // paths, DTO shapes, and schema internals. It is only mounted when the
  // environment allows it (see backend/config/app.config.ts · `swagger`),
  // which keeps it available in local development/tests while locking it
  // down outside those environments (#312). When disabled the /docs route
  // family is simply never registered, so e.g. a production server returns
  // 404 instead of exposing the UI or spec.
  const swaggerEnabled =
    configService.get<boolean>('appConfig.swagger.enabled') ?? true;
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('StellarHunts API')
      .setDescription('StellarHunts backend REST API documentation.')
      .setVersion(apiVersion)
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      // Keep secrets out of the generated spec: JWT agents and anything
      // validated with the sensitive fields/roles patterns are stripped
      // from example output rather than serialised into the OpenAPI JSON.
      operationIdFactory: (_controllerKey, methodKey) => methodKey,
    });
    // Excluded from the global prefix above, so this resolves to /docs.
    SwaggerModule.setup('docs', app, document);
  }

  const port = parseInt(process.env.PORT, 10) || 3001;
  await app.listen(port);
  logger.log(`StellarHunts API listening on http://localhost:${port}`);
  if (swaggerEnabled) {
    logger.log(`Swagger UI available at http://localhost:${port}/docs`);
  } else {
    logger.log('Swagger UI is disabled for the current environment');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Graceful shutdown — close HTTP, database, Redis, Socket.IO and stop
  // scheduled (cron) jobs on SIGTERM / SIGINT (#GracefulShutdown).
  //
  // We register our own handlers (instead of app.enableShutdownHooks())
  // so we control logging and the process exit code. `app.close()` runs
  // the Nest lifecycle hooks in order:
  //   beforeApplicationShutdown(signal) → onApplicationShutdown(signal)
  // during which TypeORM disconnects (DB), the HTTP server stops
  // accepting connections, Redis is QUIT, the Socket.IO server closes,
  // and the SchedulerRegistry is drained of cron/interval jobs.
  // ─────────────────────────────────────────────────────────────────────
  let shuttingDown = false;
  let forceTimer: NodeJS.Timeout | undefined;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`Received ${signal}, starting graceful shutdown…`);

    // Safety net: never hang forever. Force exit before the platform's
    // SIGKILL window if anything in the shutdown chain stalls.
    forceTimer = setTimeout(() => {
      logger.error(
        `Graceful shutdown timed out after ${FORCE_SHUTDOWN_TIMEOUT_MS}ms — forcing exit.`,
      );
      process.exit(1);
    }, FORCE_SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    try {
      await app.close();
      logger.log('Graceful shutdown complete.');
      if (forceTimer) clearTimeout(forceTimer);
      process.exit(0);
    } catch (err) {
      logger.error(
        `Error during graceful shutdown: ${(err as Error).message}`,
        (err as Error).stack,
      );
      if (forceTimer) clearTimeout(forceTimer);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap();
