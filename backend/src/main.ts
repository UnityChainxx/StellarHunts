import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService>(ConfigService);

  // The frontend calls endpoints under the `/api` prefix (see
  // frontend/store calls to /api/login, /api/register, etc.), so the global
  // prefix is set on the whole Nest app. This also resolves issue #105 which
  // expects the /api/users/:userId/history URL shape.
  //
  // Swagger UI is excluded so /docs, its JSON sibling /docs-json, and their
  // nested asset routes (e.g. /docs/swagger-ui-init.js) stay at canonical
  // paths instead of being double-prefixed to /api. Nest matches each string
  // entry against the registered handler path (path-to-regexp) before the
  // global prefix is applied, so the `{*splat}` entries cover nested assets.
  app.setGlobalPrefix('api', {
    exclude: [
      'docs',
      'docs/{*splat}',
      'docs-json',
      'docs-json/{*splat}',
    ],
  });

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
    ) ?? [
      'Content-Type',
      'Authorization',
    ],
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
}

bootstrap();
