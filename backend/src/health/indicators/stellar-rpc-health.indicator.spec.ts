import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import axios from 'axios';
import { StellarRpcHealthIndicator } from './stellar-rpc-health.indicator';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockConfig = (mode: string | undefined, url: string | undefined) =>
  ({
    get: jest.fn((key: string) => {
      if (key === 'STELLAR_MODE') return mode;
      if (key === 'SOROBAN_RPC_URL') return url;
      return undefined;
    }),
  } as unknown as ConfigService);

describe('StellarRpcHealthIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STELLAR_MODE;
    delete process.env.SOROBAN_RPC_URL;
  });

  it('reports healthy in mock mode without contacting the network', async () => {
    const indicator = new StellarRpcHealthIndicator(mockConfig('mock', undefined));

    expect(indicator.isConfigured).toBe(false);
    await expect(indicator.pingCheck('stellar-rpc')).resolves.toMatchObject({
      'stellar-rpc': { status: 'up', mode: 'mock' },
    });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('is not configured when live mode has no rpc url', () => {
    const indicator = new StellarRpcHealthIndicator(
      mockConfig('live', undefined),
    );
    expect(indicator.isConfigured).toBe(false);
  });

  it('reports healthy when the rpc endpoint answers with a non-5xx status', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200 } as never);
    const indicator = new StellarRpcHealthIndicator(
      mockConfig('live', 'https://rpc.example.com'),
    );

    expect(indicator.isConfigured).toBe(true);
    await expect(indicator.pingCheck('stellar-rpc')).resolves.toMatchObject({
      'stellar-rpc': { status: 'up', statusCode: 200 },
    });
    expect(mockedAxios.get).toHaveBeenCalledWith('https://rpc.example.com', {
      timeout: 2000,
      validateStatus: expect.any(Function),
    });
  });

  it('fails when the rpc endpoint responds with a 5xx status', async () => {
    mockedAxios.get.mockResolvedValue({ status: 503 } as never);
    const indicator = new StellarRpcHealthIndicator(
      mockConfig('live', 'https://rpc.example.com'),
    );

    await expect(indicator.pingCheck('stellar-rpc')).rejects.toBeInstanceOf(
      HealthCheckError,
    );
  });

  it('fails when the rpc endpoint is unreachable', async () => {
    mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const indicator = new StellarRpcHealthIndicator(
      mockConfig('live', 'https://rpc.example.com'),
    );

    await expect(indicator.pingCheck('stellar-rpc')).rejects.toBeInstanceOf(
      HealthCheckError,
    );
  });
});
