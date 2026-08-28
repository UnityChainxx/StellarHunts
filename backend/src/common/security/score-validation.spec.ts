import { BadRequestException } from '@nestjs/common';
import {
  isValidScore,
  assertValidScore,
  DEFAULT_MAX_SCORE,
} from './score-validation';

describe('score-validation', () => {
  describe('isValidScore', () => {
    it('accepts zero and positive integers', () => {
      expect(isValidScore(0)).toBe(true);
      expect(isValidScore(1)).toBe(true);
      expect(isValidScore(999999)).toBe(true);
    });

    it('rejects negative values', () => {
      expect(isValidScore(-1)).toBe(false);
      expect(isValidScore(-0.5)).toBe(false);
    });

    it('rejects non-finite values', () => {
      expect(isValidScore(NaN)).toBe(false);
      expect(isValidScore(Infinity)).toBe(false);
      expect(isValidScore(-Infinity)).toBe(false);
    });

    it('rejects non-number values', () => {
      expect(isValidScore('100')).toBe(false);
      expect(isValidScore(null)).toBe(false);
      expect(isValidScore(undefined)).toBe(false);
      expect(isValidScore({})).toBe(false);
      expect(isValidScore([])).toBe(false);
    });

    it('rejects fractional values by default', () => {
      expect(isValidScore(10.5)).toBe(false);
    });

    it('accepts fractional values when allowDecimal is set', () => {
      expect(isValidScore(10.5, { allowDecimal: true })).toBe(true);
    });

    it('rejects values above the configured max (impossible scores)', () => {
      expect(isValidScore(DEFAULT_MAX_SCORE)).toBe(true);
      expect(isValidScore(DEFAULT_MAX_SCORE + 1)).toBe(false);
      expect(isValidScore(5, { max: 5 })).toBe(true);
      expect(isValidScore(6, { max: 5 })).toBe(false);
    });
  });

  describe('assertValidScore', () => {
    it('returns the score when valid', () => {
      expect(assertValidScore(42)).toBe(42);
    });

    it('throws BadRequestException when invalid', () => {
      expect(() => assertValidScore(-1)).toThrow(BadRequestException);
      expect(() => assertValidScore(NaN)).toThrow(BadRequestException);
      expect(() => assertValidScore(1.5)).toThrow(BadRequestException);
      expect(() => assertValidScore(999999999)).toThrow(BadRequestException);
    });

    it('mentions the field name in the error message', () => {
      expect(() => assertValidScore(-5, { field: 'activityPoints' })).toThrow(
        'activityPoints',
      );
    });
  });
});
