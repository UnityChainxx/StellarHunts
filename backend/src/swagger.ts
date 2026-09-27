import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Builds the Swagger document metadata from runtime configuration.
 */
export function buildSwaggerConfig(configService: ConfigService) {
  return new DocumentBuilder()
    .setTitle('StellarHunts API')
    .setDescription('StellarHunts backend REST API documentation.')
    .setVersion(configService.get<string>('appConfig.apiVersion') ?? '1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();
}

/**
 * Registers the Swagger UI (and its `/docs-json` document endpoint) only
 * when `appConfig.swagger.enabled` is true.
 *
 * `/docs` is a powerful introspection surface — it exposes the full route
 * inventory and DTO shapes — so `backend/config/app.config.ts` disables it
 * by default outside development and exposes `SWAGGER_ENABLED=true` as the
 * explicit opt-in. Reading the flag here (instead of unconditionally
 * calling `SwaggerModule.setup`) keeps the config flag authoritative (see
 * issue #472). Returns whether the UI was mounted so callers and tests can
 * assert the decision.
 */
export function setupSwagger(
  app: INestApplication,
  configService: ConfigService,
): boolean {
  const enabled =
    configService.get<boolean>('appConfig.swagger.enabled') === true;

  if (!enabled) {
    return false;
  }

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, buildSwaggerConfig(configService)),
  );

  return true;
}
