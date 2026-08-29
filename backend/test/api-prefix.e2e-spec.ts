import { Controller, Get, Module, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

// Minimal controllers so this spec verifies the global prefix contract
// without needing a database. The frontend route-compatibility tests
// (frontend/tests/apiRoutes.test.js) lock the same contract on the client
// side — keep the two in sync (issue #360).
@Controller('probe')
class ProbeController {
  @Get()
  root() {
    return { ok: true };
  }

  @Get('nested')
  nested() {
    return { nested: true };
  }
}

// Mirrors the Swagger UI exclusion configured in backend/src/main.ts
// (the /docs route family stays outside the global prefix).
@Controller('docs')
class DocsController {
  @Get('probe')
  probe() {
    return { docs: true };
  }
}

@Module({ controllers: [ProbeController, DocsController] })
class ProbeModule {}

describe('API prefix contract (frontend ↔ backend)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors backend/src/main.ts: the version comes from
    // `appConfig.apiVersion` (backend/config/app.config.ts), default 'v1';
    // the docs exclusion uses string route patterns (not RegExps).
    app.setGlobalPrefix('api/v1', {
      exclude: ['docs', 'docs-json', 'docs/(.*)'],
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves controllers under the /api/v1 prefix', () => {
    return request(app.getHttpServer())
      .get('/api/v1/probe')
      .expect(200)
      .expect({ ok: true });
  });

  it('serves nested routes under the /api/v1 prefix', () => {
    return request(app.getHttpServer())
      .get('/api/v1/probe/nested')
      .expect(200)
      .expect({ nested: true });
  });

  it('does not serve unprefixed routes', () => {
    return request(app.getHttpServer()).get('/probe').expect(404);
  });

  it('excludes the /docs route family from the prefix', () => {
    return request(app.getHttpServer())
      .get('/docs/probe')
      .expect(200)
      .expect({ docs: true });
  });

  it('does not double-prefix excluded routes', () => {
    return request(app.getHttpServer()).get('/api/v1/docs/probe').expect(404);
  });
});
