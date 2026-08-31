import { StreakCalculationService } from './streak-calculation.service';

describe('StreakCalculationService', () => {
  let service: StreakCalculationService;

  beforeEach(() => {
    service = new StreakCalculationService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const freezeNow = (iso: string) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(iso));
  };

  describe('calculateStreakForDates', () => {
    it('returns zero streaks for no activity', () => {
      const result = service.calculateStreakForDates([]);
      expect(result).toEqual({
        currentStreak: 0,
        longestStreak: 0,
        streakStartDate: null,
        shouldReset: false,
      });
    });

    it('counts a single activity today as a one-day streak', () => {
      freezeNow('2026-06-01T12:00:00.000Z');
      const result = service.calculateStreakForDates([
        new Date('2026-06-01T08:00:00.000Z'),
      ]);
      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(1);
      expect(result.shouldReset).toBe(false);
    });

    it('counts consecutive days', () => {
      freezeNow('2026-06-03T12:00:00.000Z');
      const result = service.calculateStreakForDates([
        new Date('2026-06-03T09:00:00.000Z'),
        new Date('2026-06-02T09:00:00.000Z'),
        new Date('2026-06-01T09:00:00.000Z'),
      ]);
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(3);
    });

    it('counts an activity from yesterday as a live streak', () => {
      freezeNow('2026-06-02T12:00:00.000Z');
      const result = service.calculateStreakForDates([
        new Date('2026-06-01T09:00:00.000Z'),
      ]);
      expect(result.currentStreak).toBe(1);
      expect(result.shouldReset).toBe(false);
    });

    it('deduplicates multiple activities on the same day', () => {
      freezeNow('2026-06-03T12:00:00.000Z');
      const result = service.calculateStreakForDates([
        new Date('2026-06-03T09:00:00.000Z'),
        new Date('2026-06-03T14:00:00.000Z'),
        new Date('2026-06-02T09:00:00.000Z'),
        new Date('2026-06-02T18:00:00.000Z'),
        new Date('2026-06-01T09:00:00.000Z'),
      ]);
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(3);
    });

    it('breaks the streak on a missed day', () => {
      freezeNow('2026-06-03T12:00:00.000Z');
      // Activity today and two days ago (missed yesterday); the older pair
      // May 31 -> Jun 1 still forms the longest streak.
      const result = service.calculateStreakForDates([
        new Date('2026-06-03T09:00:00.000Z'),
        new Date('2026-06-01T09:00:00.000Z'),
        new Date('2026-05-31T09:00:00.000Z'),
      ]);
      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(2);
      expect(result.shouldReset).toBe(false);
    });

    it('resets after the configured inactivity window', () => {
      freezeNow('2026-06-05T12:00:00.000Z');
      // Last activity three days ago (> resetAfterDays of 2).
      const result = service.calculateStreakForDates([
        new Date('2026-06-02T09:00:00.000Z'),
        new Date('2026-06-01T09:00:00.000Z'),
      ]);
      expect(result.currentStreak).toBe(0);
      expect(result.shouldReset).toBe(true);
      expect(result.longestStreak).toBe(2);
    });

    it('keeps activities across a DST transition on consecutive days', () => {
      freezeNow('2026-03-10T12:00:00.000Z');
      // A DST spring-forward day is only 23 wall-clock hours long. Two
      // activities 23h apart that land on consecutive calendar days must
      // still count as two streak days (pure epoch math, no 24h rounding).
      const result = service.calculateStreakForDates([
        new Date('2026-03-09T11:00:00.000Z'),
        new Date('2026-03-08T12:00:00.000Z'),
      ]);
      expect(result.currentStreak).toBe(2);
      expect(result.shouldReset).toBe(false);
    });

    it('does not collapse a 35-hour gap into one day', () => {
      freezeNow('2026-03-11T12:00:00.000Z');
      // Round-based day math would treat a 35h span as one day and keep a
      // streak alive across it; day-index math sees two calendar days.
      const result = service.calculateStreakForDates([
        new Date('2026-03-10T00:00:00.000Z'),
        new Date('2026-03-08T13:00:00.000Z'),
      ]);
      expect(result.currentStreak).toBe(1);
      expect(result.shouldReset).toBe(false);
    });

    it('does not shift UTC-midnight activities into the previous day for positive offsets', () => {
      freezeNow('2026-01-10T12:00:00.000Z');
      // With a positive offset (e.g. IST +5.5), midnight UTC falls in the
      // same calendar day after shifting. The previous implementation used
      // local setHours() arithmetic and pushed these into the prior day.
      const result = service.calculateStreakForDates(
        [
          new Date('2026-01-10T00:00:00.000Z'),
          new Date('2026-01-09T00:00:00.000Z'),
        ],
        { timezoneOffset: 5.5 },
      );
      expect(result.currentStreak).toBe(2);
    });

    it('honours the timezone offset when choosing the current day', () => {
      freezeNow('2026-06-01T23:00:00.000Z');
      // 23:00 UTC on June 1 is already June 2 in a +2 timezone, so the
      // June 1 activity counts as "yesterday" and keeps a 1-day streak.
      const result = service.calculateStreakForDates(
        [new Date('2026-06-01T09:00:00.000Z')],
        { timezoneOffset: 2 },
      );
      expect(result.currentStreak).toBe(1);
      expect(result.shouldReset).toBe(false);
    });
  });

  describe('getDaysUntilReset', () => {
    it('returns days remaining before reset', () => {
      freezeNow('2026-06-03T12:00:00.000Z');
      expect(
        service.getDaysUntilReset(new Date('2026-06-01T09:00:00.000Z')),
      ).toBe(0);
      expect(
        service.getDaysUntilReset(new Date('2026-06-02T09:00:00.000Z')),
      ).toBe(1);
      expect(
        service.getDaysUntilReset(new Date('2026-06-03T09:00:00.000Z')),
      ).toBe(2);
    });
  });
});
