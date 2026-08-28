import { StellarHandlerService } from './stellar-handler.service';

describe('StellarHandlerService mode selection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to live mode', () => {
    delete process.env.STELLAR_MODE;
    process.env.NODE_ENV = 'test';

    expect(new StellarHandlerService()).toBeDefined();
  });

  it('allows mock mode outside production', () => {
    process.env.STELLAR_MODE = 'mock';
    process.env.NODE_ENV = 'test';

    expect(new StellarHandlerService()).toBeDefined();
  });

  it('rejects mock mode in production', () => {
    process.env.STELLAR_MODE = 'mock';
    process.env.NODE_ENV = 'production';

    expect(() => new StellarHandlerService()).toThrow(
      'STELLAR_MODE=mock is not allowed when NODE_ENV=production.',
    );
  });

  it('rejects unsupported modes', () => {
    process.env.STELLAR_MODE = 'sandbox';

    expect(() => new StellarHandlerService()).toThrow(
      'STELLAR_MODE must be either "mock" or "live".',
    );
  });
});
