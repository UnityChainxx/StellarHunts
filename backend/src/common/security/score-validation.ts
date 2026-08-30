import { BadRequestException } from '@nestjs/common';

/**
 * Options for score validation (issue #364 — leaderboard abuse and score
 * validation).
 */
export interface ScoreValidationOptions {
  /**
   * Inclusive upper bound used to reject "impossible" scores. Defaults to
   * {@link DEFAULT_MAX_SCORE}.
   */
  max?: number;
  /** Field name surfaced in error messages. Defaults to `score`. */
  field?: string;
  /** Allow fractional values (e.g. percentages). Defaults to `false`. */
  allowDecimal?: boolean;
}

/** Upper bound used when no explicit max is supplied. */
export const DEFAULT_MAX_SCORE = 1_000_000;

/**
 * Return `true` only for scores that are:
 * - a finite number (rejects `NaN`, `Infinity`, strings, null, …)
 * - non-negative (rejects negative values)
 * - an integer by default, or a fraction when `allowDecimal` is set
 * - within the configured upper bound (rejects impossible scores)
 */
export function isValidScore(
  value: unknown,
  options: ScoreValidationOptions = {},
): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  const { max = DEFAULT_MAX_SCORE, allowDecimal = false } = options;
  if (value < 0) {
    return false;
  }
  if (!allowDecimal && !Number.isInteger(value)) {
    return false;
  }
  return value <= max;
}

/**
 * Validate a score and return it as a `number`, or throw a
 * `BadRequestException` describing why it was rejected.
 */
export function assertValidScore(
  value: unknown,
  options: ScoreValidationOptions = {},
): number {
  const field = options.field ?? 'score';
  const max = options.max ?? DEFAULT_MAX_SCORE;
  if (!isValidScore(value, options)) {
    throw new BadRequestException(
      `${field} must be a non-negative ${
        options.allowDecimal ? 'number' : 'integer'
      } between 0 and ${max}`,
    );
  }
  return value as number;
}
