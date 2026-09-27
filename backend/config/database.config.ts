import { registerAs } from '@nestjs/config';

// Registers a namespaced "database" configuration factory with NestJS's
// ConfigModule. Once registered, this config can be injected elsewhere via
// ConfigService.get('database') or @Inject(databaseConfig.KEY), and is
// typically spread into TypeORM's connection options.
export default registerAs('database', () => ({
  // Database server hostname; defaults to localhost for local development.
  host: process.env.DATABASE_HOST || 'localhost',
  // Database server port. parseInt returns NaN for an unset/invalid value,
  // in which case the `|| 5432` fallback kicks in to use Postgres's default port.
  port: parseInt(process.env.DATABASE_PORT) || 5432,
  // Database user credentials; no fallback, so these must be set via env vars.
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  // Name of the database/schema to connect to.
  name: process.env.DATABASE_NAME,
  // Whether TypeORM should auto-sync entity definitions to the DB schema.
  // Convenient in development but risky in production (can cause data loss),
  // so this should stay disabled ('false'/unset) outside local/dev environments.
  synchronize: process.env.DATABASE_SYNC === 'true',
  // Whether to autoload entities (e.g. TypeOrmModule's autoLoadEntities option)
  // instead of requiring them to be listed explicitly.
  autoload: process.env.DATABASE_LOAD === 'true',
  // Whether pending migrations should be run automatically on startup.
  migrationsRun: process.env.DATABASE_MIGRATIONS_RUN === 'true',
}));