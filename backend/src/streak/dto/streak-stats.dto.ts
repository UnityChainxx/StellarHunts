import type { ActivityType } from '../entities/streak-activity.entity';

export class StreakStatsDto {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
  lastActivityDate: Date | null;
  streakStartDate: Date | null;
  isActive: boolean;
  daysUntilReset: number;
  streakPercentile?: number; // Optional ranking
}

export class StreakLeaderboardDto {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  rank: number;
  isActive: boolean;
}

export class StreakHistoryDto {
  date: Date;
  activityTypes: ActivityType[];
  activityCount: number;
  streakDay: number;
}
