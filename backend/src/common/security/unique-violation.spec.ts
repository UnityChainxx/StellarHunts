import { QueryFailedError } from 'typeorm';
import { isUniqueViolation } from './unique-violation';

function buildQueryFailedError(code: string): QueryFailedError {
  return new QueryFailedError('INSERT INTO t', [], { code } as any);
}

describe('unique-violation', () => {
  it('returns true for Postgres unique-violation errors (23505)', () => {
    expect(isUniqueViolation(buildQueryFailedError('23505'))).toBe(true);
  });

  it('returns false for other Postgres errors', () => {
    expect(isUniqueViolation(buildQueryFailedError('23503'))).toBe(false);
    expect(isUniqueViolation(buildQueryFailedError('42P01'))).toBe(false);
  });

  it('returns false for non-QueryFailedError values', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
