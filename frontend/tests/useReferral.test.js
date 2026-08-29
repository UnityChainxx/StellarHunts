import { describe, it, expect, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useReferral } from '@/hooks/useReferral';
import axios from 'axios';

describe('useReferral', () => {
  const mockUserId = 'user-abc-123';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nft-hunt.com';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateReferralLink', () => {
    it('generates the correct referral link for a given user ID', () => {
      const { result } = renderHook(() => useReferral());
      const link = result.current.generateReferralLink(mockUserId);
      expect(link).toBe(`${baseUrl}/ref/${mockUserId}`);
    });
  });

  describe('fetchReferralData', () => {
    it('sets loading and fetches referral data successfully', async () => {
      const mockData = {
        data: {
          stats: { totalInvites: 5, activeUsers: 3, totalRewards: 100, totalXPEarned: 500, nextMilestone: '10' },
          invitedUsers: [{ id: '1', username: 'friend1' }],
        },
      };
      axios.get.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useReferral());

      await act(async () => {
        await result.current.fetchReferralData(mockUserId);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(null);
      expect(result.current.referralStats.totalInvites).toBe(5);
      expect(result.current.referralStats.activeUsers).toBe(3);
      expect(result.current.invitedUsers).toHaveLength(1);
    });

    it('sets an error when the API call fails', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useReferral());

      await act(async () => {
        await result.current.fetchReferralData(mockUserId);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load referral data');
    });

    it('does nothing when no userId is provided', async () => {
      const { result } = renderHook(() => useReferral());

      await act(async () => {
        await result.current.fetchReferralData(null);
      });

      expect(result.current.loading).toBe(false);
      expect(axios.get).not.toHaveBeenCalled();
    });
  });

  describe('getRewardTier', () => {
    it.each([
      [0, 'Common'],
      [3, 'Common'],
      [5, 'Rare'],
      [8, 'Rare'],
      [10, 'Epic'],
      [20, 'Epic'],
      [25, 'Legendary'],
      [40, 'Legendary'],
      [50, 'Mythic'],
      [100, 'Mythic'],
    ])('returns %s tier for %d invites', (invites, expectedTier) => {
      const { result } = renderHook(() => useReferral());
      const tier = result.current.getRewardTier(invites);
      expect(tier.tier).toBe(expectedTier);
    });
  });

  describe('getProgressToNextMilestone', () => {
    it('calculates progress correctly toward the next milestone', () => {
      const { result } = renderHook(() => useReferral());
      const progress = result.current.getProgressToNextMilestone(3);
      expect(progress.current).toBe(3);
      expect(progress.next).toBe(5);
      expect(progress.remaining).toBe(2);
    });

    it('caps progress at 100% when above the highest milestone', () => {
      const { result } = renderHook(() => useReferral());
      const progress = result.current.getProgressToNextMilestone(60);
      expect(progress.next).toBe(50);
      expect(progress.progress).toBe(100);
    });
  });

  describe('trackReferral', () => {
    it('calls the track endpoint and refreshes referral data', async () => {
      const mockStats = {
        data: {
          stats: { totalInvites: 6, activeUsers: 4, totalRewards: 120, totalXPEarned: 600, nextMilestone: '10' },
          invitedUsers: [],
        },
      };
      axios.post.mockResolvedValueOnce({});
      axios.get.mockResolvedValueOnce(mockStats);

      const { result } = renderHook(() => useReferral());

      await act(async () => {
        await result.current.trackReferral(mockUserId, 'new-user-1');
      });

      expect(axios.post).toHaveBeenCalledWith(
        '/api/referrals/track',
        { referrerId: mockUserId, newUserId: 'new-user-1' },
        { withCredentials: true },
      );
      expect(result.current.referralStats.totalInvites).toBe(6);
    });
  });
});
