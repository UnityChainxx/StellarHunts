import { describe, it, expect, vi } from 'vitest';

// Mock the axios module so no real HTTP requests are made during tests;
// individual tests configure .get/.post return values as needed.
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
  // Mirrors the fallback logic in the hook itself, so the expected
  // referral link matches whatever base URL the hook would actually use.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nft-hunt.com';

  // Reset mock call history/state before every test so assertions like
  // `toHaveBeenCalled` aren't polluted by previous tests.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateReferralLink', () => {
    it('generates the correct referral link for a given user ID', () => {
      const { result } = renderHook(() => useReferral());
      const link = result.current.generateReferralLink(mockUserId);
      // Link should be the base app URL plus a /ref/<userId> path.
      expect(link).toBe(`${baseUrl}/ref/${mockUserId}`);
    });
  });

  describe('fetchReferralData', () => {
    it('sets loading and fetches referral data successfully', async () => {
      // Shape of a successful API response: aggregate stats plus a list
      // of users the given user has invited.
      const mockData = {
        data: {
          stats: { totalInvites: 5, activeUsers: 3, totalRewards: 100, totalXPEarned: 500, nextMilestone: '10' },
          invitedUsers: [{ id: '1', username: 'friend1' }],
        },
      };
      axios.get.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useReferral());

      // Wrap the async fetch in act() so React processes the resulting
      // state updates before assertions run.
      await act(async () => {
        await result.current.fetchReferralData(mockUserId);
      });

      // Wait until the hook's loading flag flips back to false.
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // No error, and stats/invited users are populated from the response.
      expect(result.current.error).toBe(null);
      expect(result.current.referralStats.totalInvites).toBe(5);
      expect(result.current.referralStats.activeUsers).toBe(3);
      expect(result.current.invitedUsers).toHaveLength(1);
    });

    it('sets an error when the API call fails', async () => {
      // Simulate a failed request (e.g. network issue) from axios.
      axios.get.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useReferral());

      await act(async () => {
        await result.current.fetchReferralData(mockUserId);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Hook should surface a user-friendly error message rather than
      // leaking the raw error or leaving state undefined.
      expect(result.current.error).toBe('Failed to load referral data');
    });

    it('does nothing when no userId is provided', async () => {
      const { result } = renderHook(() => useReferral());

      // Passing a falsy userId should be a no-op: no request made, no
      // lingering loading state.
      await act(async () => {
        await result.current.fetchReferralData(null);
      });

      expect(result.current.loading).toBe(false);
      expect(axios.get).not.toHaveBeenCalled();
    });
  });

  describe('getRewardTier', () => {
    // Table-driven test: verifies the invite-count-to-tier mapping across
    // both the lower and upper edges of each tier's range.
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
      // With 3 invites, the next milestone is 5, leaving 2 more to go.
      expect(progress.current).toBe(3);
      expect(progress.next).toBe(5);
      expect(progress.remaining).toBe(2);
    });

    it('caps progress at 100% when above the highest milestone', () => {
      const { result } = renderHook(() => useReferral());
      // 60 invites exceeds every defined milestone, so progress should
      // report the highest milestone (50) and cap out at 100%, rather
      // than exceeding it or throwing.
      const progress = result.current.getProgressToNextMilestone(60);
      expect(progress.next).toBe(50);
      expect(progress.progress).toBe(100);
    });
  });

  describe('trackReferral', () => {
    it('calls the track endpoint and refreshes referral data', async () => {
      // Response returned by the follow-up GET that refreshes stats
      // after a successful track call.
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

      // Verifies the POST is made with the expected body and credentials,
      // and that the hook's state reflects the refreshed stats afterward.
      expect(axios.post).toHaveBeenCalledWith(
        '/api/referrals/track',
        { referrerId: mockUserId, newUserId: 'new-user-1' },
        { withCredentials: true },
      );
      expect(result.current.referralStats.totalInvites).toBe(6);
    });
  });
});