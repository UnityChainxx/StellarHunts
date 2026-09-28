import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as Joi from 'joi';

import {
  STELLAR_MODE_DEFAULT,
  validationOptions,
  validationSchema,
} from './config.validation';

/**
 * These tests exercise the real startup schema, imported from
 * `config/config.validation.ts` — the same object `ConfigModule.forRoot()`
 * is given in `src/app.module.ts`.
 *
 * They previously validated a re-declared copy. That copy had diverged from
 * the schema the application loads (duplicate `NODE_ENV` key, no Redis or
 * Stellar keys, no live-mode rules) and contained two mutually exclusive
 * `STELLAR_MODE` default tests, so the suite failed to compile with TS1117
 * and asserted nothing about real boot behaviour (issue #492).
 */

const REPO_ROOT = join(__dirname, '..', '..');
const ENV_EXAMPLE_PATH = join(REPO_ROOT, '.env.example');
const README_PATH = join(REPO_ROOT, '..', 'README.md');

/**
 * A complete, valid environment used as the base for focused assertions.
 *
 * `STELLAR_MODE=mock` is set explicitly because the schema default is `live`
 * (see `STELLAR_MODE_DEFAULT`), and `live` requires Soroban configuration.
 * This mirrors what CI and `.env.example` do: an environment that omits
 * `STELLAR_MODE` is a deployment with Soroban credentials, which is covered
 * by its own tests below.
 */
const baseEnv = () => ({
  JWT_SECRET: 'super-secret',
  DATABASE_HOST: 'localhost',
  DATABASE_USER: 'postgres',
  DATABASE_PASSWORD: 'password',
  DATABASE_NAME: 'stellarshunts',
  STELLAR_MODE: 'mock' as string,
});

/** A valid `live` environment, i.e. one with Soroban credentials present. */
const liveEnv = () => ({
  ...baseEnv(),
  STELLAR_MODE: 'live',
  SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
  SOROBAN_NFT_CONTRACT_ID: 'CA-test-nft',
  STELLAR_HUNTS_CONTRACT_ID: 'CA-test-hunts',
  STELLAR_HUNTS_NFT_CONTRACT_ID: 'CA-test-hunts-nft',
});

/**
 * Stand-ins for the required values that `backend/.env.example` ships blank
 * on purpose (`JWT_SECRET=`, `DATABASE_PASSWORD=`).
 *
 * A blank line in a template is a prompt to fill in a secret, not a value to
 * validate, and `required()` correctly rejects an empty string. Substituting
 * a placeholder lets the test assert the thing it actually cares about —
 * that the *documented* values are accepted by the schema — while the
 * separate assertion below pins which keys are allowed to be blank.
 */
const REQUIRED_PLACEHOLDERS: Record<string, string> = {
  JWT_SECRET: 'placeholder-from-env-example',
  DATABASE_PASSWORD: 'placeholder-from-env-example',
};

/**
 * Parses `KEY=value` pairs out of a dotenv-style file, including the
 * commented-out ones.
 *
 * `backend/.env.example` documents most of its keys as commented examples
 * (`# STELLAR_NETWORK=testnet`) because they are environment-specific. Those
 * commented values are exactly the ones that can drift out of sync with the
 * schema — `STELLAR_NETWORK=mainnet` was documented that way and rejected by
 * the schema — so they are treated as real documentation and validated too.
 */
function parseEnvFile(source: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim().replace(/^#\s?/, '');
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (!key) continue;

    // Strip a trailing `# comment` that is not inside the value.
    const value = line.slice(separator + 1).split('#')[0].trim();
    parsed[key] = value;
  }

  return parsed;
}

const readEnvExample = () => parseEnvFile(readFileSync(ENV_EXAMPLE_PATH, 'utf8'));

/** The keys the schema declares, as reported by Joi itself. */
const schemaKeys = (): string[] => Object.keys(validationSchema.describe().keys);

describe('Config validation schema', () => {
  describe('the schema under test is the one the application loads', () => {
    it('exports a Joi object schema', () => {
      expect(Joi.isSchema(validationSchema)).toBe(true);
      expect(validationSchema.type).toBe('object');
    });

    it('validates with the same options app.module.ts passes to ConfigModule', () => {
      // `abortEarly: false` is what makes a misconfigured deployment report
      // every bad key at once; `allowUnknown: true` is what keeps variables
      // the schema does not model from blocking startup.
      expect(validationOptions).toEqual({
        allowUnknown: true,
        abortEarly: false,
      });
    });

    it('declares each key exactly once', () => {
      // A duplicate object key is a compile error in TypeScript but a silent
      // last-one-wins override in plain JavaScript. Asserting the count makes
      // the schema's own key list self-checking.
      const keys = schemaKeys();
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('required variables', () => {
    it('passes with all required env vars set', () => {
      const { error } = validationSchema.validate(baseEnv(), validationOptions);
      expect(error).toBeUndefined();
    });

    it.each([
      'JWT_SECRET',
      'DATABASE_HOST',
      'DATABASE_USER',
      'DATABASE_PASSWORD',
      'DATABASE_NAME',
    ])('fails when %s is missing', (key) => {
      const env: Record<string, string> = { ...baseEnv() };
      delete env[key];

      const { error } = validationSchema.validate(env, validationOptions);

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes(key))).toBe(true);
    });

    it('reports every missing key in one pass rather than only the first', () => {
      const { error } = validationSchema.validate({}, validationOptions);
      const reported = error.details.map((d) => d.path[0]);

      expect(reported).toEqual(
        expect.arrayContaining([
          'JWT_SECRET',
          'DATABASE_HOST',
          'DATABASE_USER',
          'DATABASE_PASSWORD',
          'DATABASE_NAME',
        ]),
      );
    });
  });

  describe('defaults', () => {
    it('uses default DATABASE_PORT when omitted', () => {
      const env: Record<string, string> = { ...baseEnv() };
      delete env.DATABASE_PORT;

      const { error, value } = validationSchema.validate(env, validationOptions);

      expect(error).toBeUndefined();
      expect(value.DATABASE_PORT).toBe(5432);
    });

    it('uses default PORT, FRONTEND_URL and JWT lifetimes when omitted', () => {
      const { error, value } = validationSchema.validate(baseEnv(), validationOptions);

      expect(error).toBeUndefined();
      expect(value.PORT).toBe(3001);
      expect(value.FRONTEND_URL).toBe('http://localhost:3000');
      expect(value.JWT_EXPIRES_IN).toBe('15m');
      expect(value.JWT_REFRESH_EXPIRES_IN).toBe('30d');
      expect(value.NODE_ENV).toBe('development');
      expect(value.STELLAR_NETWORK).toBe('testnet');
    });

    it('defaults DATABASE_SYNC and DATABASE_LOAD to false', () => {
      const { value } = validationSchema.validate(baseEnv(), validationOptions);

      // `config/database.config.ts` compares these against the literal
      // string 'true', so an unset variable must mean "off", not "on".
      expect(value.DATABASE_SYNC).toBe(false);
      expect(value.DATABASE_LOAD).toBe(false);
    });
  });

  describe('STELLAR_MODE default (issue #492)', () => {
    it('defaults STELLAR_MODE to live, the fail-closed default', () => {
      // `STELLAR_MODE` is omitted here, and the Soroban credentials are
      // present, because the default is `live` and `live` requires them.
      // This is a deployment that has provisioned Stellar but relies on the
      // default rather than setting the variable.
      const env: Record<string, string> = { ...liveEnv() };
      delete env.STELLAR_MODE;

      const { error, value } = validationSchema.validate(env, validationOptions);

      expect(error).toBeUndefined();
      expect(value.STELLAR_MODE).toBe('live');
      expect(value.STELLAR_MODE).toBe(STELLAR_MODE_DEFAULT);
    });

    it('fails a deployment that omits STELLAR_MODE without Soroban credentials', () => {
      // The concrete payoff of defaulting to `live`: a deployment that
      // forgets the variable is told exactly which keys are missing, at
      // startup, instead of booting and minting synthetic NFT successes.
      const env: Record<string, string> = { ...baseEnv() };
      delete env.STELLAR_MODE;

      const { error, value } = validationSchema.validate(env, validationOptions);

      expect(value.STELLAR_MODE).toBe('live');
      expect(error).toBeDefined();
      expect(
        error.details.map((d) => d.path[0]),
      ).toEqual(
        expect.arrayContaining([
          'SOROBAN_RPC_URL',
          'SOROBAN_NFT_CONTRACT_ID',
          'STELLAR_HUNTS_CONTRACT_ID',
          'STELLAR_HUNTS_NFT_CONTRACT_ID',
        ]),
      );
    });

    it('matches the default the schema itself reports', () => {
      // Read the default back out of Joi rather than hard-coding it a second
      // time, so the constant and the schema cannot disagree.
      expect(
        validationSchema.describe().keys.STELLAR_MODE.flags.default,
      ).toBe(STELLAR_MODE_DEFAULT);
    });

    it('rejects an invalid STELLAR_MODE value', () => {
      const { error } = validationSchema.validate(
        { ...baseEnv(), STELLAR_MODE: 'production' },
        validationOptions,
      );

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('STELLAR_MODE'))).toBe(true);
    });

    it('is documented identically in README.md and .env.example', () => {
      // Acceptance criterion: the default is the same in code, README.md and
      // backend/.env.example. Asserted rather than trusted, because the three
      // previously disagreed and nothing detected it.
      const readme = readFileSync(README_PATH, 'utf8');
      const envExample = readFileSync(ENV_EXAMPLE_PATH, 'utf8');

      const declaredDefault = /schema default for `?STELLAR_MODE`? is \*\*`?(\w+)`?\*\*/i;
      const documentedInReadme = readme.match(declaredDefault);
      const documentedInEnvExample = envExample.match(declaredDefault);

      expect(documentedInReadme).not.toBeNull();
      expect(documentedInEnvExample).not.toBeNull();
      expect(documentedInReadme[1]).toBe(STELLAR_MODE_DEFAULT);
      expect(documentedInEnvExample[1]).toBe(STELLAR_MODE_DEFAULT);
    });

    it('documents the mock-mode opt-in that local development requires', () => {
      // Because the default is `live`, a developer following the setup docs
      // has to set `mock` explicitly or boot fails on missing Soroban config.
      // If this assertion ever fails, the docs no longer explain how to run
      // locally.
      const envExample = readFileSync(ENV_EXAMPLE_PATH, 'utf8');
      const readme = readFileSync(README_PATH, 'utf8');

      expect(envExample).toMatch(/^STELLAR_MODE=mock$/m);
      expect(readme).toMatch(/^STELLAR_MODE=mock$/m);
    });
  });

  describe('mock mode', () => {
    it('passes without RPC URL or contract IDs', () => {
      const { error } = validationSchema.validate(
        { ...baseEnv(), STELLAR_MODE: 'mock' },
        validationOptions,
      );

      expect(error).toBeUndefined();
    });
  });

  describe('live mode requires Soroban configuration', () => {
    it('passes when RPC URL and all contract IDs are present', () => {
      const { error } = validationSchema.validate(liveEnv(), validationOptions);
      expect(error).toBeUndefined();
    });

    it.each([
      'SOROBAN_RPC_URL',
      'SOROBAN_NFT_CONTRACT_ID',
      'STELLAR_HUNTS_CONTRACT_ID',
      'STELLAR_HUNTS_NFT_CONTRACT_ID',
    ])('fails when %s is missing', (key) => {
      const env: Record<string, string> = { ...liveEnv };
      delete env[key];

      const { error } = validationSchema.validate(env, validationOptions);

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes(key))).toBe(true);
    });

    it('rejects a blank contract ID rather than accepting an empty string', () => {
      // `''` satisfies `required()` in some Joi versions depending on how the
      // key arrives, so the contract-id schema is additionally `min(1)`.
      const { error } = validationSchema.validate(
        { ...liveEnv, SOROBAN_NFT_CONTRACT_ID: '   ' },
        validationOptions,
      );

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('SOROBAN_NFT_CONTRACT_ID'))).toBe(
        true,
      );
    });

    it('rejects a non-URL SOROBAN_RPC_URL', () => {
      const { error } = validationSchema.validate(
        { ...liveEnv, SOROBAN_RPC_URL: 'soroban-testnet.stellar.org' },
        validationOptions,
      );

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('SOROBAN_RPC_URL'))).toBe(true);
    });
  });

  describe('STELLAR_NETWORK', () => {
    it('rejects an invalid STELLAR_NETWORK value', () => {
      const { error } = validationSchema.validate(
        { ...baseEnv(), STELLAR_MODE: 'mock', STELLAR_NETWORK: 'ropsten' },
        validationOptions,
      );

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('STELLAR_NETWORK'))).toBe(true);
    });

    it('accepts both testnet and pubnet', () => {
      for (const network of ['testnet', 'pubnet']) {
        const { error } = validationSchema.validate(
          { ...baseEnv(), STELLAR_MODE: 'mock', STELLAR_NETWORK: network },
          validationOptions,
        );
        expect(error).toBeUndefined();
      }
    });
  });

  describe('Redis / CORS / ports', () => {
    it('passes with full Redis configuration', () => {
      const { error } = validationSchema.validate(
        {
          ...baseEnv(),
          REDIS_URL: 'redis://localhost:6379',
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6380,
          REDIS_PASSWORD: 'secret',
          REDIS_DB: 2,
        },
        validationOptions,
      );

      expect(error).toBeUndefined();
    });

    it('accepts an empty REDIS_URL / REDIS_PASSWORD', () => {
      const { error } = validationSchema.validate(
        { ...baseEnv(), REDIS_URL: '', REDIS_PASSWORD: '' },
        validationOptions,
      );

      expect(error).toBeUndefined();
    });

    it('rejects an invalid REDIS_PORT', () => {
      const { error } = validationSchema.validate(
        { ...baseEnv(), REDIS_PORT: 70000 },
        validationOptions,
      );

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('REDIS_PORT'))).toBe(true);
    });

    it('rejects a negative REDIS_DB', () => {
      const { error } = validationSchema.validate(
        { ...baseEnv(), REDIS_DB: -1 },
        validationOptions,
      );

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('REDIS_DB'))).toBe(true);
    });

    it('rejects an invalid FRONTEND_URL (CORS origin)', () => {
      const { error } = validationSchema.validate(
        { ...baseEnv(), FRONTEND_URL: 'not-a-url' },
        validationOptions,
      );

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('FRONTEND_URL'))).toBe(true);
    });

    it('rejects a non-boolean DATABASE_SYNC', () => {
      // `config/database.config.ts` does `=== 'true'`, so a typo silently
      // disables synchronisation. The schema should reject it outright.
      const { error } = validationSchema.validate(
        { ...baseEnv(), DATABASE_SYNC: 'yes' },
        validationOptions,
      );

      expect(error).toBeDefined();
      expect(error.details.some((d) => d.path.includes('DATABASE_SYNC'))).toBe(true);
    });
  });

  describe('backend/.env.example agrees with the schema (issue #492)', () => {
    it('parses the documented keys', () => {
      const documented = readEnvExample();

      // Guards the parser itself: if this fails, the assertions below are
      // vacuous because they would be validating an empty object.
      expect(Object.keys(documented).length).toBeGreaterThan(10);
      expect(documented).toHaveProperty('JWT_SECRET');
      expect(documented).toHaveProperty('STELLAR_NETWORK');
    });

    it('declares no key that the schema does not model', () => {
      const documented = readEnvExample();
      const undeclared = Object.keys(documented).filter(
        (key) => !schemaKeys().includes(key),
      );

      expect(undeclared).toEqual([]);
    });

    it('blanks only the values a developer supplies or may leave empty', () => {
      const documented = readEnvExample();
      const blank = Object.entries(documented)
        .filter(([, value]) => value === '')
        .map(([key]) => key)
        .sort();

      // Pinned deliberately. A blank in this template means one of exactly
      // three things, and the list is short enough to read:
      //
      // - `JWT_SECRET` / `DATABASE_PASSWORD`: secrets the developer must
      //   generate or choose. `required()` correctly rejects an empty string.
      // - `SOROBAN_NFT_CONTRACT_ID`, `STELLAR_HUNTS_CONTRACT_ID`,
      //   `STELLAR_HUNTS_NFT_CONTRACT_ID`: required only in `live` mode, and
      //   this template targets `mock`, so blank is the local default.
      // - `REDIS_PASSWORD`: Redis is optional and an empty password is a
      //   valid "no auth" configuration.
      //
      // Any new blank therefore has to be added here with its reason, rather
      // than appearing in the template unnoticed.
      expect(blank).toEqual([
        'DATABASE_PASSWORD',
        'JWT_SECRET',
        'REDIS_PASSWORD',
        'SOROBAN_NFT_CONTRACT_ID',
        'STELLAR_HUNTS_CONTRACT_ID',
        'STELLAR_HUNTS_NFT_CONTRACT_ID',
      ]);
    });

    it('validates every documented value', () => {
      const documented = readEnvExample();

      // Blank required values are substituted with a placeholder; every other
      // documented value — including the commented-out ones — is validated
      // exactly as written.
      const filled = Object.fromEntries(
        Object.entries(documented).map(([key, value]) => [
          key,
          value === '' ? REQUIRED_PLACEHOLDERS[key] : value,
        ]),
      );

      // Validated as a developer uses the template: mock mode, so the
      // commented Soroban examples are not required. `allowUnknown: false`
      // is used deliberately here — with the application's own
      // `allowUnknown: true` this test could not fail on an undeclared key.
      const { error } = validationSchema.validate(
        { ...filled, STELLAR_MODE: 'mock' },
        { allowUnknown: false, abortEarly: false },
      );

      // This is the assertion that catches a documented-but-rejected value
      // such as the previous `STELLAR_NETWORK=mainnet` before it reaches a
      // developer's machine.
      expect(error).toBeUndefined();
    });

    it('documents STELLAR_NETWORK as a value the schema accepts', () => {
      const documented = readEnvExample();

      expect(['testnet', 'pubnet']).toContain(documented.STELLAR_NETWORK);
    });

    it('documents a live-mode configuration that the schema accepts', () => {
      const documented = readEnvExample();

      const live = {
        ...baseEnv(),
        STELLAR_MODE: 'live',
        SOROBAN_RPC_URL: documented.SOROBAN_RPC_URL,
        SOROBAN_NFT_CONTRACT_ID: 'CA-document-example',
        STELLAR_HUNTS_CONTRACT_ID: 'CA-document-example',
        STELLAR_HUNTS_NFT_CONTRACT_ID: 'CA-document-example',
      };

      const { error } = validationSchema.validate(live, validationOptions);
      expect(error).toBeUndefined();
    });
  });
});
