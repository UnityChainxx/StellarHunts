import { Injectable } from '@nestjs/common';

export interface StreakCalculationConfig {
  gracePeriodHours: number; // Hours after midnight to still count as previous day
  timezoneOffset: number; // User's timezone offset in hours
  resetAfterDays: number; // Days of inactivity before streak resets
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

@Injectable()
export class StreakCalculationService {
  private readonly defaultConfig: StreakCalculationConfig = {
    gracePeriodHours: 6, // 6 AM grace period
    timezoneOffset: 0, // UTC by default
    resetAfterDays: 2, // Reset after 2 days of inactivity
  };

  calculateStreakForDates(
    activityDates: Date[],
    config: Partial<StreakCalculationConfig> = {},
  ): {
    currentStreak: number;
    longestStreak: number;
    streakStartDate: Date | null;
    shouldReset: boolean;
  } {
    const fullConfig = { ...this.defaultConfig, ...config };

    if (activityDates.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        streakStartDate: null,
        shouldReset: false,
      };
    }

    // Normalize each activity to its calendar day. Day indexes are computed
    // from epoch milliseconds (shifted by the user's timezone offset), so a
    // day is always exactly 24h and DST transitions cannot split or merge
    // days. Deduplicate so multiple activities on the same day count once.
    const byDay = new Map<number, Date>();
    for (const date of activityDates) {
      const dayIndex = this.getDayIndex(date, fullConfig.timezoneOffset);
      const existing = byDay.get(dayIndex);
      if (!existing || date.getTime() > existing.getTime()) {
        byDay.set(dayIndex, date);
      }
    }
    const dayIndexes = [...byDay.keys()].sort((a, b) => b - a);
    const uniqueDates = dayIndexes.map((index) => byDay.get(index) as Date);

    // The server clock is the reference point for "today".
    const todayIndex = this.getDayIndex(new Date(), fullConfig.timezoneOffset);
    const mostRecentIndex = dayIndexes[0];

    // Check if streak should be reset
    const daysSinceLastActivity = todayIndex - mostRecentIndex;
    const shouldReset = daysSinceLastActivity > fullConfig.resetAfterDays;

    if (shouldReset) {
      return {
        currentStreak: 0,
        longestStreak: this.calculateLongestStreak(dayIndexes),
        streakStartDate: null,
        shouldReset: true,
      };
    }

    // Calculate current streak
    const currentStreak = this.calculateCurrentStreak(dayIndexes, todayIndex);
    const longestStreak = Math.max(
      this.calculateLongestStreak(dayIndexes),
      currentStreak,
    );

    const streakStartDate =
      currentStreak > 0
        ? uniqueDates[Math.min(currentStreak - 1, uniqueDates.length - 1)]
        : null;

    return {
      currentStreak,
      longestStreak,
      streakStartDate,
      shouldReset: false,
    };
  }

  /**
   * Count consecutive days ending at (or the day before) today.
   * A gap of more than one day breaks the streak, so a missed day is
   * reflected as a shorter (or zero) current streak.
   */
  private calculateCurrentStreak(
    dayIndexes: number[],
    todayIndex: number,
  ): number {
    if (dayIndexes.length === 0) return 0;

    let streak = 0;
    let expectedIndex = todayIndex;

    for (let i = 0; i < dayIndexes.length; i++) {
      const diff = expectedIndex - dayIndexes[i];

      if (diff === 0) {
        // Activity on the expected day.
        streak++;
        expectedIndex -= 1;
      } else if (diff === 1 && i === 0) {
        // Most recent activity was yesterday; the streak is still alive.
        streak++;
        expectedIndex = dayIndexes[i] - 1;
      } else {
        // Gap in the streak.
        break;
      }
    }

    return streak;
  }

  private calculateLongestStreak(dayIndexes: number[]): number {
    if (dayIndexes.length === 0) return 0;

    let longestStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < dayIndexes.length; i++) {
      if (dayIndexes[i - 1] - dayIndexes[i] === 1) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    return longestStreak;
  }

  /**
   * Calendar day index for a date, shifted by the user's timezone offset.
   * Pure epoch arithmetic — a day is always 24h, so DST transitions (23h or
   * 25h days) cannot skew the result.
   */
  private getDayIndex(date: Date, timezoneOffsetHours: number): number {
    return Math.floor(
      (date.getTime() + timezoneOffsetHours * MS_PER_HOUR) / MS_PER_DAY,
    );
  }

  getDaysUntilReset(
    lastActivityDate: Date,
    config: Partial<StreakCalculationConfig> = {},
  ): number {
    const fullConfig = { ...this.defaultConfig, ...config };
    const todayIndex = this.getDayIndex(new Date(), fullConfig.timezoneOffset);
    const lastActivityIndex = this.getDayIndex(
      lastActivityDate,
      fullConfig.timezoneOffset,
    );
    const daysSinceActivity = Math.max(0, todayIndex - lastActivityIndex);
    return Math.max(0, fullConfig.resetAfterDays - daysSinceActivity);
  }
}
