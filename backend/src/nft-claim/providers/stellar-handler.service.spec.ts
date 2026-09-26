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

describe('StellarHandlerService SSRF validation for SOROBAN_RPC_URL (issue #485)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.STELLAR_MODE = 'live';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows an approved https Stellar endpoint on the live claim path', () => {
    process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
    const service = new StellarHandlerService();

    expect((service as any).validateRpcUrl()).toBe(
      'https://soroban-testnet.stellar.org',
    );
  });

  it('rejects a non-https URL on the live claim path', async () => {
    process.env.SOROBAN_RPC_URL = 'http://soroban-testnet.stellar.org';
    const service = new StellarHandlerService();

    await expect(
      service.claimNFT({ userId: 'u1', nftId: 'nft-1' }),
    ).rejects.toThrow(
      'Invalid SOROBAN_RPC_URL: protocol "http:" is not allowed, must be https:',
    );
  });

  it('rejects a disallowed host on the live claim path', async () => {
    process.env.SOROBAN_RPC_URL = 'https://attacker-rpc.example.com';
    const service = new StellarHandlerService();

    await expect(
      service.claimNFT({ userId: 'u1', nftId: 'nft-1' }),
    ).rejects.toThrow(
      'Invalid SOROBAN_RPC_URL: host "attacker-rpc.example.com" is not an approved Stellar RPC endpoint',
    );
  });

  it('allows local-dev host in non-production environments', () => {
    process.env.NODE_ENV = 'development';
    process.env.SOROBAN_RPC_URL = 'http://localhost:8000';
    const service = new StellarHandlerService();

    expect((service as any).validateRpcUrl()).toBe('http://localhost:8000');
  });

  it('rejects local-dev allowances when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SOROBAN_RPC_URL = 'http://localhost:8000';
    const service = new StellarHandlerService();

    await expect(
      service.claimNFT({ userId: 'u1', nftId: 'nft-1' }),
    ).rejects.toThrow(/Invalid SOROBAN_RPC_URL/);
  });
});
