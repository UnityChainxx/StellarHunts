import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import axios from 'axios';

const DEFAULT_RPC_TIMEOUT_MS = 2000;

/**
 * Health indicator for the Stellar / Soroban RPC endpoint.
 *
 * Only active when the backend is running in live mode with a configured
 * `SOROBAN_RPC_URL` (`STELLAR_MODE != mock`). In mock mode the dependency is
 * not required, so the check reports healthy to keep local/dev readiness
 * green. A reachable RPC URL answering with any non-5xx status is treated as
 * healthy; 5xx responses and timeouts are failures.
 */
@Injectable()
export class StellarRpcHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(StellarRpcHealthIndicator.name);
  private readonly rpcUrl?: string;
  private readonly enabled: boolean;

  constructor(configService: ConfigService) {
    super();
    const mode =
      configService.get<string>('STELLAR_MODE') ||
      process.env.STELLAR_MODE ||
      'mock';
    const url =
      configService.get<string>('SOROBAN_RPC_URL') ||
      process.env.SOROBAN_RPC_URL;
    this.enabled = mode !== 'mock' && Boolean(url);
    this.rpcUrl = url;
  }

  get isConfigured(): boolean {
    return this.enabled;
  }

  async pingCheck(
    key: string,
    timeoutMs: number = DEFAULT_RPC_TIMEOUT_MS,
  ): Promise<HealthIndicatorResult> {
    if (!this.enabled) {
      return this.getStatus(key, true, { mode: 'mock' });
    }

    try {
      const response = await axios.get(this.rpcUrl as string, {
        timeout: timeoutMs,
        validateStatus: () => true,
      });

      if (response.status >= 500) {
        throw new Error(`Stellar RPC responded with HTTP ${response.status}`);
      }

      return this.getStatus(key, true, { statusCode: response.status });
    } catch (error) {
      this.logger.warn(
        `Stellar RPC health check failed: ${(error as Error).message}`,
      );
      throw new HealthCheckError(
        'Stellar RPC ping failed',
        this.getStatus(key, false, {
          message: (error as Error).message,
        }),
      );
    }
  }
}
