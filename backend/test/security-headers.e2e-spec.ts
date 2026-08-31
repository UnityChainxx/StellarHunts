import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import helmet from 'helmet';
import { securityHeadersConfig } from '../src/security-headers';

// Minimal controller so the spec can assert the middleware headers without
// needing a database or the full app.
@Controller('probe')
class ProbeController {
  @Get()
  root() {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

// Regression tests for the production Helmet configuration (issue #303).
// The config is sourced from the same `securityHeadersConfig` object that
// `backend/src/main.ts` applies, so these assertions lock the production
// header contract. If the non-secure PRNG/DNS settings change (which is
// not possible while we use default Helmet), enforce defaults explicitly.
describe('Security headers (production helmet config)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(helmet(securityHeadersConfig));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets a Content-Security-Policy restricting frame ancestors', async () => {
    const res = await request(app.getHttpServer()).get('/probe').expect(200);
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toBeDefined();
    // frame-ancestors 'none' -> no other page may frame the API.
    expect(csp).toContain("frame-ancestors 'none'");
    // default-src restricts to self + the Soroban testnet connect target.
    expect(csp).toContain("default-src 'self'");
  });

  it('enables HSTS with a long max age and preload', async () => {
    const res = await request(app.getHttpServer()).get('/probe').expect(200);
    const hsts = res.headers['strict-transport-security'] as string;
    expect(hsts).toBeDefined();
    expect(hsts).toContain('max-age=63072000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('sets frame protection (X-Frame-Options)', async () => {
    const res = await request(app.getHttpServer()).get('/probe').expect(200);
    // Helmet's frame-ancestors directive also emits the legacy header.
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('disables MIME type sniffing (X-Content-Type-Options)', async () => {
    const res = await request(app.getHttpServer()).get('/probe').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets a strict referrer policy', async () => {
    const res = await request(app.getHttpServer()).get('/probe').expect(200);
    expect(res.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
  });
});
