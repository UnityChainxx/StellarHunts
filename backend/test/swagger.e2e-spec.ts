import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import appConfig from '../config/app.config';
import { setupSwagger } from '../src/swagger';

// Minimal controller so the spec can assert the /docs gating decision
// without booting the full AppModule (which needs Postgres/Redis).
@Controller('probe')
class ProbeController {
  @Get()
  root() {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

// Regression tests for the conditional Swagger registration (issue #472).
// `/docs` must honour `appConfig.swagger.enabled` instead of always being
// mounted, so a production deployment does not leak its full route
// inventory unless the operator explicitly opts in.
describe('Swagger UI gating (appConfig.swagger.enabled)', () => {
  let app: INestApplication;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSwaggerEnabled = process.env.SWAGGER_ENABLED;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalSwaggerEnabled === undefined) {
      delete process.env.SWAGGER_ENABLED;
    } else {
      process.env.SWAGGER_ENABLED = originalSwaggerEnabled;
    }
  });

  async function bootApp(): Promise<void> {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ProbeModule,
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [appConfig],
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupSwagger(app, app.get(ConfigService));
    await app.init();
  }

  it('returns 404 for /docs and /docs-json when disabled in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SWAGGER_ENABLED;

    await bootApp();

    await request(app.getHttpServer()).get('/docs').expect(404);
    await request(app.getHttpServer()).get('/docs-json').expect(404);
  });

  it('serves /docs and /docs-json when SWAGGER_ENABLED=true in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SWAGGER_ENABLED = 'true';

    await bootApp();

    await request(app.getHttpServer()).get('/docs').expect(200);
    await request(app.getHttpServer()).get('/docs-json').expect(200);
  });

  it('serves /docs by default in development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SWAGGER_ENABLED;

    await bootApp();

    await request(app.getHttpServer()).get('/docs').expect(200);
  });
});
