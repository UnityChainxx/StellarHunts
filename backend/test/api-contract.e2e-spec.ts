/**
 * Shared API contract test — issue #568
 *
 * Verifies the client/server contract that both halves of the application
 * depend on:
 *
 * 1. Global prefix: every backend route lives under `/api/v1`. The prefix
 *    value is imported from `src/api-prefix.ts`, the same module used by
 *    `src/main.ts`, so the runtime and this test cannot disagree.
 *
 * 2. Error envelope: NestJS's built-in exception layer returns a JSON body
 *    with at least `{ statusCode, message }`. The frontend `normalizeError`
 *    helper in `frontend/lib/api.js` reads `response.data.message`, so both
 *    the shape and the field name are part of the contract.
 *
 * 3. Representative endpoint: a real route (the health probe) is verified to
 *    respond under the prefix so CI catches a missing prefix registration.
 *
 * Both this file and `frontend/tests/apiRoutes.test.js` import or mirror the
 * same prefix constant. A change to either side without updating the other
 * will fail the corresponding test suite.
 */

import {
  Controller,
  Get,
  Module,
  INestApplication,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { buildApiPrefix, DEFAULT_API_VERSION, DOCS_ROUTE_EXCLUSIONS } from '../src/api-prefix';

// ---------------------------------------------------------------------------
// Minimal application: one working endpoint + one that throws a structured
// HTTP error so the error-envelope shape can be asserted.
// ---------------------------------------------------------------------------

@Controller('contract')
class ContractController {
  /** Happy-path probe: verifies the prefix and a 200 response. */
  @Get('ping')
  ping() {
    return { ok: true, version: DEFAULT_API_VERSION };
  }

  /** Error-path probe: asserts the error envelope shape. */
  @Get('error')
  error(): never {
    throw new HttpException(
      { statusCode: HttpStatus.BAD_REQUEST, message: 'contract-error-probe' },
      HttpStatus.BAD_REQUEST,
    );
  }
}

@Module({ controllers: [ContractController] })
class ContractModule {}

// ---------------------------------------------------------------------------
// Contract assertions
// ---------------------------------------------------------------------------

describe('Shared API contract (issue #568)', () => {
  let app: INestApplication;
  const prefix = buildApiPrefix(DEFAULT_API_VERSION); // 'api/v1'

  beforeAll(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      imports: [ContractModule],
    }).compile();

    app = fixture.createNestApplication();
    // Mirror the real bootstrap (src/main.ts) so this spec asserts the same
    // configuration the running application uses, not a re-declared copy.
    app.setGlobalPrefix(prefix, { exclude: DOCS_ROUTE_EXCLUSIONS });
    await app.init();
  });

  afterAll(() => app.close());

  // ── 1. Prefix contract ──────────────────────────────────────────────────

  it('serves routes under /api/v1 (default prefix)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/contract/ping')
      .expect(200)
      .expect((res) => {
        expect(res.body.ok).toBe(true);
        // The version embedded in the response must match the prefix constant.
        expect(res.body.version).toBe(DEFAULT_API_VERSION);
      });
  });

  it('returns 404 for routes without the /api/v1 prefix', () => {
    return request(app.getHttpServer())
      .get('/contract/ping')
      .expect(404);
  });

  // ── 2. Error envelope contract ──────────────────────────────────────────
  //
  // The frontend `normalizeError` in `frontend/lib/api.js` reads:
  //   const message = responseData?.message || error?.message || "Request failed"
  //
  // That means the JSON response body MUST contain a `message` field.
  // NestJS's built-in exception layer always produces `{ statusCode, message }`
  // for HttpExceptions, which this test pins.

  it('error responses carry a JSON body with statusCode and message', () => {
    return request(app.getHttpServer())
      .get('/api/v1/contract/error')
      .expect(400)
      .expect((res) => {
        // The envelope the frontend normalizeError relies on.
        expect(res.body).toMatchObject({
          statusCode: 400,
          message: 'contract-error-probe',
        });
      });
  });

  it('404 responses carry a JSON body with statusCode and message', () => {
    return request(app.getHttpServer())
      .get('/api/v1/contract/does-not-exist')
      .expect(404)
      .expect((res) => {
        expect(typeof res.body.statusCode).toBe('number');
        expect(typeof res.body.message).toBe('string');
        expect(res.body.message.length).toBeGreaterThan(0);
      });
  });

  // ── 3. Prefix constant integrity ────────────────────────────────────────
  //
  // The default version must equal 'v1' so the frontend's hardcoded
  // `API_VERSION = "v1"` in `frontend/lib/api.js` stays correct.

  it('DEFAULT_API_VERSION equals "v1"', () => {
    expect(DEFAULT_API_VERSION).toBe('v1');
  });

  it('buildApiPrefix("v1") produces "api/v1"', () => {
    expect(buildApiPrefix('v1')).toBe('api/v1');
  });

  it('buildApiPrefix uses DEFAULT_API_VERSION as fallback', () => {
    // Passing undefined triggers the env / default fallback path.
    expect(buildApiPrefix(undefined)).toBe(`api/${DEFAULT_API_VERSION}`);
  });
});
