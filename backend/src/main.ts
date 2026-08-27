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
  SwaggerModule.setup('docs', app, document);

  const port = parseInt(process.env.PORT, 10) || 3001;
  await app.listen(port);
  logger.log(`StellarHunts API listening on http://localhost:${port}`);
  logger.log(`Swagger UI available at http://localhost:${port}/docs`);
}

bootstrap();
