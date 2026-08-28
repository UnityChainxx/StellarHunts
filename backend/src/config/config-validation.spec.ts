import * as Joi from 'joi';

// Replicates the validation schema used in AppModule so we can unit-test
// it without booting the full NestJS DI container.
const validationSchema = Joi.object({
  JWT_SECRET: Joi.string().required(),
  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),
  STELLAR_MODE: Joi.string().valid('mock', 'live').default('live'),
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  STELLAR_NETWORK: Joi.string().valid('testnet', 'pubnet').default('testnet'),
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
    const { error } = validationSchema.validate(env, { allowUnknown: true });
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
    const { error, value } = validationSchema.validate(env, {
      allowUnknown: true,
    });
    expect(error).toBeUndefined();
    expect(value.DATABASE_PORT).toBe(5432);
  });

  it('defaults Stellar mode to live', () => {
    const env = {
      JWT_SECRET: 'super-secret',
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'stellarhunts',
    };
    const { error, value } = validationSchema.validate(env, {
      allowUnknown: true,
    });
    expect(error).toBeUndefined();
    expect(value.STELLAR_MODE).toBe('live');
  });

  it('rejects unknown Stellar modes', () => {
    const { error } = validationSchema.validate(
      { STELLAR_MODE: 'sandbox' },
      { allowUnknown: true },
    );
    expect(error).toBeDefined();
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
    const { error } = validationSchema.validate(env, { allowUnknown: true });
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
    const { error } = validationSchema.validate(env, { allowUnknown: true });
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
    const { error } = validationSchema.validate(env, { allowUnknown: true });
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
    const { error } = validationSchema.validate(env, { allowUnknown: true });
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
    const { error } = validationSchema.validate(env, { allowUnknown: true });
    expect(error).toBeDefined();
    expect(error!.details.some((d) => d.path.includes('DATABASE_NAME'))).toBe(
      true,
    );
  });
});
