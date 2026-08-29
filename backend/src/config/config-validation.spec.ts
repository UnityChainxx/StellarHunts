import * as Joi from 'joi';

// Replicates the validation schema used in AppModule so we can unit-test
// it without booting the full NestJS DI container.
// @nestjs/config validates with abortEarly: false + allowUnknown: true by
// default, so replicate those options here.
const validateOptions = { allowUnknown: true, abortEarly: false };

const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),
  DATABASE_SYNC: Joi.string().valid('true', 'false').default('false'),
  DATABASE_LOAD: Joi.string().valid('true', 'false').default('false'),
  STELLAR_MODE: Joi.string().valid('mock', 'live').default('mock'),
  STELLAR_NETWORK: Joi.string()
    .valid('testnet', 'mainnet')
    .default('testnet'),
  SOROBAN_RPC_URL: Joi.string()
    .uri()
    .when('STELLAR_MODE', { is: 'live', then: Joi.required() }),
  SOROBAN_NFT_CONTRACT_ID: Joi.string().when('STELLAR_MODE', {
    is: 'live',
    then: Joi.required(),
  }),
  STELLAR_HUNTS_CONTRACT_ID: Joi.string().when('STELLAR_MODE', {
    is: 'live',
    then: Joi.required(),
  }),
  STELLAR_HUNTS_NFT_CONTRACT_ID: Joi.string().when('STELLAR_MODE', {
    is: 'live',
    then: Joi.required(),
  }),
  REDIS_URL: Joi.string().uri().allow(''),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow(''),
  REDIS_DB: Joi.number().integer().min(0).default(0),
});

describe('Config validation schema', () => {
  it('passes with all required env vars set', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 5432,
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeUndefined();
  });

  it('uses default DATABASE_PORT when omitted', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      // DATABASE_PORT omitted
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
    };
    const { error, value } = validationSchema.validate(env, validateOptions);
    expect(error).toBeUndefined();
    expect(value.DATABASE_PORT).toBe(5432);
  });

  it('fails when JWT_SECRET is missing', () => {
    const env = {
      // JWT_SECRET omitted
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 5432,
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('JWT_SECRET'))).toBe(
      true,
    );
  });

  it('fails when DATABASE_HOST is missing', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      // DATABASE_HOST omitted
      DATABASE_PORT: 5432,
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('DATABASE_HOST'))).toBe(
      true,
    );
  });

  it('fails when DATABASE_USER is missing', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 5432,
      // DATABASE_USER omitted
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('DATABASE_USER'))).toBe(
      true,
    );
  });

  it('fails when DATABASE_PASSWORD is missing', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 5432,
      DATABASE_USER: 'postgres',
      // DATABASE_PASSWORD omitted
      DATABASE_NAME: 'stellarhunts',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(
      error!.details.some((d) => d.path.includes('DATABASE_PASSWORD')),
    ).toBe(true);
  });

  it('fails when DATABASE_NAME is missing', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 5432,
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      // DATABASE_NAME omitted
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('DATABASE_NAME'))).toBe(
      true,
    );
  });

  // ── Stellar / Soroban conditional rules (mock vs live) ─────────────

  it('passes in mock mode without RPC URL or contract IDs', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      STELLAR_MODE: 'mock',
      // SOROBAN_RPC_URL and contract IDs omitted — allowed in mock mode
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeUndefined();
  });

  it('defaults STELLAR_MODE to mock when omitted', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      // STELLAR_MODE omitted
    };
    const { error, value } = validationSchema.validate(env, validateOptions);
    expect(error).toBeUndefined();
    expect(value.STELLAR_MODE).toBe('mock');
  });

  it('passes in live mode when RPC URL and contract IDs are present', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      STELLAR_MODE: 'live',
      SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
      SOROBAN_NFT_CONTRACT_ID: 'CA-test-nft',
      STELLAR_HUNTS_CONTRACT_ID: 'CA-test-hunts',
      STELLAR_HUNTS_NFT_CONTRACT_ID: 'CA-test-hunts-nft',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeUndefined();
  });

  it('fails in live mode when SOROBAN_RPC_URL is missing', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      STELLAR_MODE: 'live',
      SOROBAN_NFT_CONTRACT_ID: 'CA-test-nft',
      STELLAR_HUNTS_CONTRACT_ID: 'CA-test-hunts',
      STELLAR_HUNTS_NFT_CONTRACT_ID: 'CA-test-hunts-nft',
      // SOROBAN_RPC_URL omitted
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('SOROBAN_RPC_URL'))).toBe(
      true,
    );
  });

  it('fails in live mode when contract IDs are missing', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      STELLAR_MODE: 'live',
      SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
      // contract IDs omitted
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(
      error!.details.some((d) => d.path.includes('SOROBAN_NFT_CONTRACT_ID')),
    ).toBe(true);
    expect(
      error!.details.some((d) => d.path.includes('STELLAR_HUNTS_CONTRACT_ID')),
    ).toBe(true);
  });

  it('rejects an invalid STELLAR_MODE value', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      STELLAR_MODE: 'production',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('STELLAR_MODE'))).toBe(
      true,
    );
  });

  it('rejects an invalid STELLAR_NETWORK value', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      STELLAR_NETWORK: 'ropsten',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('STELLAR_NETWORK'))).toBe(
      true,
    );
  });

  // ── Redis / CORS / ports ───────────────────────────────────────────

  it('passes with full Redis configuration', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      REDIS_URL: 'redis://localhost:6379',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6380,
      REDIS_PASSWORD: 'secret',
      REDIS_DB: 2,
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeUndefined();
  });

  it('accepts an empty REDIS_URL / REDIS_PASSWORD', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      REDIS_URL: '',
      REDIS_PASSWORD: '',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeUndefined();
  });

  it('rejects an invalid REDIS_PORT', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      REDIS_PORT: 70000,
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('REDIS_PORT'))).toBe(
      true,
    );
  });

  it('rejects an invalid FRONTEND_URL (CORS origin)', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
      FRONTEND_URL: 'not-a-url',
    };
    const { error } = validationSchema.validate(env, validateOptions);
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('FRONTEND_URL'))).toBe(
      true,
    );
  });
});
