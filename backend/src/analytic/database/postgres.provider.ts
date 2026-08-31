import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

/**
 * Injection token for the shared pg Pool used by the analytic module.
 * Kept as a plain token (rather than a class) so this doesn't force a
 * particular ORM on the rest of the app — analytic writes/reads are
 * simple enough that raw SQL via `pg` is clearer than an ORM layer.
 */
export const PG_POOL = 'PG_POOL';

export const postgresProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Pool => {
    const connectionString = configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not configured. AnalyticsModule requires a ' +
          'Postgres connection string (aggregations are no longer ' +
          'stored in-memory).',
      );
    }
    return new Pool({
      connectionString,
      max: configService.get<number>('ANALYTICS_PG_POOL_SIZE') ?? 10,
    });
  },
};
