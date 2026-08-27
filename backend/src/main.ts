import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';

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
  app.setGlobalPrefix('api', { exclude: [/^docs/] });

  app.enableCors({
    origin: configService.get<string>('appConfig.cors.origin') ?? '*',
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
    credentials:
      configService.get<boolean>('appConfig.cors.credentials') ?? true,
  });

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", "https://soroban-testnet.stellar.org"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const apiVersion = configService.get<string>('appConfig.apiVersion') ?? '1.0';
  const swaggerConfig = new DocumentBuilder()
    .setTitle('StellarHunts API')
    .setDescription('StellarHunts backend REST API documentation.')
    .setVersion(apiVersion)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Excluded from the global prefix above, so this resolves to /docs.
  SwaggerModule.setup('docs', app, document);

  const port = parseInt(process.env.PORT, 10) || 3001;
  await app.listen(port);
  logger.log(`StellarHunts API listening on http://localhost:${port}`);
  logger.log(`Swagger UI available at http://localhost:${port}/docs`);

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
