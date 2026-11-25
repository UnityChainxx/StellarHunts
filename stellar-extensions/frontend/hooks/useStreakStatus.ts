/**
 * useStreakStatus — Fetch Daily Streak and Login Bonus (issue #917)
 *
 * Returns the current user's streak status, daily login bonus availability,
 * streak freeze count, and next milestone target.
 */

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreakStatus {
  currentStreak: number;
  longestStreak: number;
  loggedInToday: boolean;
  dailyBonusAvailable: boolean;
  dailyBonusXp: number;
  streakFreezesUsed: number;
  streakFreezesMax: number;
  nextMilestone: number;
  nextMilestoneReward: string;
  lastActivityDate: string | null;
}

interface UseStreakStatusReturn {
  streak: StreakStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  claimDailyBonus: () => Promise<void>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STREAK_MILESTONES = [7, 14, 30, 60, 100, 365];
const MILESTONE_REWARDS: Record<number, string> = {
  7:   '🔥 7-Day Streak Badge',
  14:  '⭐ 2-Week Champion',
  30:  '🏆 Monthly Master',
  60:  '💎 2-Month Legend',
  100: '🌟 Century Club NFT',
  365: '👑 Year of Puzzles NFT',
};
const CACHE_TTL_MS = 60_000; // 1 minute

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStreakStatus(userId: string | null): UseStreakStatusReturn {
  const [streak, setStreak] = useState<StreakStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchStreak = useCallback(async () => {
    if (!userId) return;

    // Short-circuit if data is still fresh
    if (streak && Date.now() - lastFetch < CACHE_TTL_MS) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/${userId}/streak`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch streak: ${res.status}`);
      }

      const data = await res.json();

      const currentStreak: number = data.currentStreak ?? 0;
      const nextMilestone = STREAK_MILESTONES.find((m) => m > currentStreak) ?? STREAK_MILESTONES[STREAK_MILESTONES.length - 1];

      const today = new Date().toISOString().split('T')[0];
      const lastActivity: string | null = data.lastActivityDate ?? null;
      const loggedInToday = lastActivity ? lastActivity.startsWith(today) : false;

      setStreak({
        currentStreak,
        longestStreak: data.longestStreak ?? currentStreak,
        loggedInToday,
        dailyBonusAvailable: !loggedInToday,
        dailyBonusXp: data.dailyBonusXp ?? 10,
        streakFreezesUsed: data.streakFreezesUsed ?? 0,
        streakFreezesMax: data.streakFreezesMax ?? 3,
        nextMilestone,
        nextMilestoneReward: MILESTONE_REWARDS[nextMilestone] ?? '🎁 Bonus XP',
        lastActivityDate: lastActivity,
      });

      setLastFetch(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId, streak, lastFetch]);

  const claimDailyBonus = useCallback(async () => {
    if (!userId || !streak?.dailyBonusAvailable) return;

    try {
      await fetch(`/api/users/${userId}/streak/claim`, {
        method: 'POST',
        credentials: 'include',
      });
      // Invalidate cache and re-fetch
      setLastFetch(0);
      await fetchStreak();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim bonus');
    }
  }, [userId, streak, fetchStreak]);

  useEffect(() => {
    fetchStreak();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { streak, loading, error, refetch: fetchStreak, claimDailyBonus };
}

export default useStreakStatus;
