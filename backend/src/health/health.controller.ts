import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { StellarRpcHealthIndicator } from './indicators/stellar-rpc-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly stellar: StellarRpcHealthIndicator,
  ) {}

  /**
   * Liveness probe. Returns 200 as soon as the process is accepting
   * requests. Deliberately does not touch external dependencies so a
   * degraded dependency does not cause orchestrators to restart the pod.
   */
  @Get('live')
  live() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe. Returns 503 unless PostgreSQL, Redis, and (in live
   * mode) Stellar RPC are all reachable. Reads are routed to the database
   * on every request, so the API must not receive traffic while any
   * required dependency is down.
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    const checks = [
      () => this.db.pingCheck('postgres', { timeout: 1500 }),
      () => this.redis.pingCheck('redis'),
    ];

    // Stellar RPC is only a hard dependency outside mock mode. In mock
    // mode (STELLAR_MODE=mock, the default for local development) the
    // check reports healthy so local/dev deployments still pass readiness.
    if (this.stellar.isConfigured) {
      checks.push(() => this.stellar.pingCheck('stellar-rpc'));
    }

    return this.health.check(checks);
  }
}
