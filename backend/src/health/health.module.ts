import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CacheModule } from '../cache/cache.module';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { StellarRpcHealthIndicator } from './indicators/stellar-rpc-health.indicator';

/**
 * HealthModule
 * ------------
 * Exposes liveness and readiness probes for the API.
 *
 * - `GET /api/health/live`  — liveness: the process is up and serving.
 * - `GET /api/health/ready` — readiness: required dependencies (PostgreSQL,
 *   Redis, and Stellar RPC when running in live mode) are reachable. Fails
 *   with HTTP 503 when any required dependency is unavailable.
 *
 * Terminus emits the standard `{ status, info, error, details }` payload for
 * the readiness check; the liveness endpoint returns a minimal payload so
 * orchestrators do not need to parse check details.
 */
@Module({
  imports: [TerminusModule, CacheModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, StellarRpcHealthIndicator],
})
export class HealthModule {}
