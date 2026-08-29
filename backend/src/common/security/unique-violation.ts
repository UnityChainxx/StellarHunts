import { QueryFailedError } from 'typeorm';

/**
 * Return `true` when `error` is a Postgres unique-constraint violation
 * (SQLSTATE 23505). Used to turn check-then-insert races into idempotent,
 * well-defined responses (issue #364 — duplicate submissions).
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = (error as QueryFailedError & { driverError?: { code?: string } })
    .driverError;
  return typeof driverError?.code === 'string' && driverError.code === '23505';
}
