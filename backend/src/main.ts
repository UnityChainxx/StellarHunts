import { Module } from "@nestjs/common"
import { AppController } from "./app.controller"
import { AppService } from "./app.service"
import { TypeOrmModule } from "@nestjs/typeorm"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { AuthModule } from "./auth/auth.module"
import { UserInventoryModule } from "./user-inventory/user-inventory.module"
import { CacheModule } from "./cache/cache.module"
import appConfig from "config/app.config"
import databaseConfig from "config/database.config"
import { PuzzleCategoryModule } from "./puzzle-category/puzzle-category.module"
import { RewardModule } from "./reward/reward.module"
import { PuzzleModule } from "./puzzle/puzzle.module"
import { PuzzleSubmissionModule } from "./puzzle-submission/puzzle-submission.module"
import { ContentModule } from "./content/content.module"
import { UserReportCardModule } from "./user-report-card/user-report-card.module"
import { PuzzleDependencyModule } from "./puzzle-dependency/puzzle-dependency.module"
import { TimeTrialModule } from "./time-trial/time-trial.module"
import { InAppNotificationsModule } from "./in-app-notifications/in-app-notifications.module"
import { User } from "./auth/entities/user.entity"
import { TimeTrial } from "./time-trial/time-trial.entity"
import { Puzzle } from "./puzzle/puzzle.entity"
import { Category } from "./puzzle-category/entities/category.entity"
import { AnalyticModule } from './analytic/analytic.module';
import { RewardShopModule } from './reward-shop/reward-shop.module';
import { ApiKeyModule } from './api-key/api-key.module';
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

  // Global validation policy (issue #340): unknown properties are stripped,
  // DTOs are transformed, and all controllers share the same defaults.
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
