import { registerAs } from '@nestjs/config';

function toBoolean(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value === 'true' || value === '1';
}

export default registerAs('database', () => ({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  name: process.env.DATABASE_NAME,
  synchronize: toBoolean(process.env.DATABASE_SYNC),
  autoload: toBoolean(process.env.DATABASE_LOAD) || true,
}));
