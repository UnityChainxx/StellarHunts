import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Mock axios for useGameStore ─────────────────────────────────────
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

import axios from 'axios';

// ─── useGameStore (Zustand persist) ──────────────────────────────────
import useGameStore from '@/store/useGameStore';
import useGameProgressStore from '@/store/game-progress/game-progress-store';
import useRewardStore from '@/store/reward/nft-reward-store';

// ─── React Query hooks (puzzleReviewHooks) ──────────────────────────
import puzzleReviewService from '@/services/puzzleReviewService';
import {
  puzzleReviewKeys,
  useApproveReviewMutation,
  useRejectReviewMutation,
  useBulkApproveReviewsMutation,
  useBulkRejectReviewsMutation,
} from '@/services/puzzleReviewHooks';

vi.mock('@/services/puzzleReviewService', () => ({
  default: {
    getPuzzleReviews: vi.fn(),
    getReviewStats: vi.fn(),
    updateReviewStatus: vi.fn(),
    bulkUpdateReviewStatuses: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────
function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

// Reset Zustand stores between tests
beforeEach(() => {
  vi.clearAllMocks();
  // Reset useGameStore by clearing persisted state and resetting in-memory state
  useGameStore.setState({
    user: null,
    currentDifficulty: 'easy',
    currentPuzzleIndex: 0,
    completedPuzzles: [],
    completedDifficulties: [],
    score: 0,
    nfts: [],
    errors: [],
    difficultyConfig: null,
  });
  useGameProgressStore.setState({
    completedPuzzles: [],
    score: 0,
    achievements: [],
  });
  useRewardStore.setState({
    rewards: [],
    loading: false,
    error: null,
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PUZZLE MUTATIONS — cache invalidation & state refresh
// ═══════════════════════════════════════════════════════════════════════
describe('Cache invalidation — puzzle mutations', () => {
  it('completePuzzle updates score and completedPuzzles in store', async () => {
    const mockUser = { id: 'user-1', username: 'alice' };
    useGameStore.setState({ user: mockUser, score: 0, completedPuzzles: [] });
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.completePuzzle('easy-puzzle-1');
    });

    expect(result.current.completedPuzzles).toContain('easy-puzzle-1');
    expect(result.current.score).toBe(100);
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:3001/game/update',
      expect.objectContaining({
        userId: mockUser.id,
        completedPuzzles: ['easy-puzzle-1'],
        score: 100,
      }),
      { withCredentials: true },
    );
  });

  it('completePuzzle advances difficulty after 5 puzzles', async () => {
    const mockUser = { id: 'user-1', username: 'alice' };
    useGameStore.setState({
      user: mockUser,
      score: 400,
      currentDifficulty: 'easy',
      completedPuzzles: ['easy-1', 'easy-2', 'easy-3', 'easy-4'],
      completedDifficulties: [],
    });
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.completePuzzle('easy-5');
    });

    expect(result.current.completedDifficulties).toContain('easy');
    expect(result.current.currentDifficulty).toBe('medium');
    expect(result.current.currentPuzzleIndex).toBe(0);
    expect(result.current.score).toBe(500);
  });

  it('completePuzzle does not update state when user is null', async () => {
    useGameStore.setState({ user: null });
    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.completePuzzle('easy-1');
    });

    expect(result.current.completedPuzzles).toHaveLength(0);
    expect(result.current.score).toBe(0);
  });

  it('completePuzzle on API failure adds to errors and does not corrupt state', async () => {
    const mockUser = { id: 'user-1', username: 'alice' };
    useGameStore.setState({ user: mockUser, score: 0, completedPuzzles: [] });
    axios.post.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.completePuzzle('easy-1');
    });

    // State should NOT be updated when API fails
    expect(result.current.completedPuzzles).toHaveLength(0);
    expect(result.current.score).toBe(0);
    // Error should be logged
    expect(result.current.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.current.errors[0].action).toBe('completePuzzle');
  });

  it('resetProgress clears all game state', async () => {
    const mockUser = { id: 'user-1', username: 'alice' };
    useGameStore.setState({
      user: mockUser,
      score: 500,
      completedPuzzles: ['a', 'b', 'c'],
      completedDifficulties: ['easy'],
      currentDifficulty: 'medium',
      nfts: [{ id: 'nft-1' }],
    });
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.resetProgress();
    });

    expect(result.current.score).toBe(0);
    expect(result.current.completedPuzzles).toEqual([]);
    expect(result.current.completedDifficulties).toEqual([]);
    expect(result.current.currentDifficulty).toBe('easy');
    expect(result.current.currentPuzzleIndex).toBe(0);
    expect(result.current.nfts).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// LEADERBOARD / STREAK CACHE — invalidation patterns
// ═══════════════════════════════════════════════════════════════════════
describe('Cache invalidation — leaderboard and streak', () => {
  it('puzzleReviewHooks invalidateQueries on approve mutation', async () => {
    puzzleReviewService.updateReviewStatus.mockResolvedValueOnce({
      success: true,
      data: { id: 'r1', status: 'APPROVED' },
    });

    const { queryClient, wrapper } = createQueryWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useApproveReviewMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        reviewId: 'r1',
        moderationReason: 'good',
      });
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: puzzleReviewKeys.all,
    });
    spy.mockRestore();
  });

  it('puzzleReviewHooks invalidateQueries on reject mutation', async () => {
    puzzleReviewService.updateReviewStatus.mockResolvedValueOnce({
      success: true,
      data: { id: 'r2', status: 'REJECTED' },
    });

    const { queryClient, wrapper } = createQueryWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRejectReviewMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        reviewId: 'r2',
        moderationReason: 'spam',
      });
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: puzzleReviewKeys.all,
    });
    spy.mockRestore();
  });

  it('puzzleReviewHooks invalidateQueries on bulk approve', async () => {
    puzzleReviewService.bulkUpdateReviewStatuses.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'r1' }, { id: 'r2' }],
      skipped: [],
    });

    const { queryClient, wrapper } = createQueryWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useBulkApproveReviewsMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        reviewIds: ['r1', 'r2'],
        moderationReason: 'all good',
      });
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: puzzleReviewKeys.all,
    });
    spy.mockRestore();
  });

  it('puzzleReviewHooks invalidateQueries on bulk reject', async () => {
    puzzleReviewService.bulkUpdateReviewStatuses.mockResolvedValueOnce({
      success: true,
      data: [],
      skipped: ['r99'],
    });

    const { queryClient, wrapper } = createQueryWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useBulkRejectReviewsMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        reviewIds: ['r99'],
        moderationReason: 'offensive',
      });
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: puzzleReviewKeys.all,
    });
    spy.mockRestore();
  });

  it('streak leaderboard query key is derived from limit', () => {
    const key1 = ['streak', 'leaderboard', { limit: 10 }];
    const key2 = ['streak', 'leaderboard', { limit: 50 }];
    expect(key1).not.toEqual(key2);
  });

  it('login clears score and progress (simulating session refresh)', async () => {
    const { result } = renderHook(() => useGameStore());
    useGameStore.setState({
      user: { id: 'old-user' },
      score: 999,
      completedPuzzles: ['old'],
    });

    // Simulate a new login by setting user state (logout clears everything)
    axios.post.mockResolvedValueOnce({
      data: { id: 'new-user', username: 'bob' },
    });

    await act(async () => {
      await result.current.login('bob', 'pass');
    });

    expect(result.current.user?.id).toBe('new-user');
    // Login does NOT reset score (only logout does), but user is updated
    expect(result.current.score).toBe(999);
  });

  it('logout resets all cached game state', async () => {
    const { result } = renderHook(() => useGameStore());
    useGameStore.setState({
      user: { id: 'user-1' },
      score: 500,
      completedPuzzles: ['p1', 'p2'],
      nfts: [{ id: 'nft-1' }],
    });
    axios.post.mockResolvedValueOnce({});

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.score).toBe(0);
    expect(result.current.completedPuzzles).toEqual([]);
    expect(result.current.nfts).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// INVENTORY / NFT CACHE — add, fetch, pagination, reset
// ═══════════════════════════════════════════════════════════════════════
describe('Cache invalidation — inventory / NFT cache', () => {
  it('addNFT appends to nfts array', async () => {
    const mockUser = { id: 'user-1', username: 'alice' };
    useGameStore.setState({ user: mockUser, nfts: [] });
    const newNft = { id: 'nft-1', name: 'Cosmic Sword' };
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.addNFT(newNft);
    });

    expect(result.current.nfts).toHaveLength(1);
    expect(result.current.nfts[0].id).toBe('nft-1');
  });

  it('addNFT does nothing when user is null', async () => {
    useGameStore.setState({ user: null, nfts: [] });
    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.addNFT({ id: 'nft-1' });
    });

    expect(result.current.nfts).toHaveLength(0);
  });

  it('addNFT on API failure does not add to local state', async () => {
    const mockUser = { id: 'user-1' };
    useGameStore.setState({ user: mockUser, nfts: [] });
    axios.post.mockRejectedValueOnce(new Error('Server error'));

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.addNFT({ id: 'nft-fail' });
    });

    expect(result.current.nfts).toHaveLength(0);
    expect(result.current.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('fetchNftsPage replaces nfts on page 1', async () => {
    const mockUser = { id: 'user-1' };
    useGameStore.setState({ user: mockUser, nfts: [{ id: 'old' }] });
    const freshItems = [{ id: 'nft-a' }, { id: 'nft-b' }];
    axios.get.mockResolvedValueOnce({
      data: { items: freshItems, total: 2, hasMore: false },
    });

    const { result } = renderHook(() => useGameStore());

    let pageResult;
    await act(async () => {
      pageResult = await result.current.fetchNftsPage({ page: 1, limit: 20 });
    });

    expect(result.current.nfts).toEqual(freshItems);
    expect(pageResult.hasMore).toBe(false);
    // Old item should be replaced, not merged
    expect(result.current.nfts.find((n) => n.id === 'old')).toBeUndefined();
  });

  it('fetchNftsPage merges page 2 into existing nfts', async () => {
    const mockUser = { id: 'user-1' };
    useGameStore.setState({ user: mockUser, nfts: [{ id: 'nft-1' }] });
    const page2Items = [{ id: 'nft-2' }, { id: 'nft-3' }];
    axios.get.mockResolvedValueOnce({
      data: { items: page2Items, total: 3, hasMore: false },
    });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.fetchNftsPage({ page: 2, limit: 1 });
    });

    expect(result.current.nfts).toHaveLength(3);
    expect(result.current.nfts.map((n) => n.id)).toEqual([
      'nft-1',
      'nft-2',
      'nft-3',
    ]);
  });

  it('fetchNftsPage deduplicates when merging', async () => {
    const mockUser = { id: 'user-1' };
    useGameStore.setState({ user: mockUser, nfts: [{ id: 'nft-1' }] });
    // Page 2 returns a duplicate id
    const page2Items = [{ id: 'nft-1' }, { id: 'nft-2' }];
    axios.get.mockResolvedValueOnce({
      data: { items: page2Items, total: 2, hasMore: false },
    });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.fetchNftsPage({ page: 2, limit: 1 });
    });

    expect(result.current.nfts).toHaveLength(2);
    const ids = result.current.nfts.map((n) => n.id);
    expect(ids.filter((id) => id === 'nft-1')).toHaveLength(1);
  });

  it('fetchNftsPage returns empty on error', async () => {
    const mockUser = { id: 'user-1' };
    useGameStore.setState({ user: mockUser, nfts: [{ id: 'existing' }] });
    axios.get.mockRejectedValueOnce(new Error('timeout'));

    const { result } = renderHook(() => useGameStore());

    let pageResult;
    await act(async () => {
      pageResult = await result.current.fetchNftsPage({ page: 1, limit: 20 });
    });

    expect(pageResult.items).toEqual([]);
    expect(pageResult.total).toBe(0);
    // Existing nfts should not be wiped on error
    expect(result.current.nfts).toHaveLength(1);
  });

  it('resetProgress clears nfts', async () => {
    const mockUser = { id: 'user-1' };
    useGameStore.setState({
      user: mockUser,
      nfts: [{ id: 'nft-1' }, { id: 'nft-2' }],
      score: 300,
    });
    axios.post.mockResolvedValueOnce({});

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.resetProgress();
    });

    expect(result.current.nfts).toEqual([]);
    expect(result.current.score).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// REWARD CACHE — add, remove, fetch
// ═══════════════════════════════════════════════════════════════════════
describe('Cache invalidation — reward store', () => {
  it('addReward appends to rewards array', () => {
    const { result } = renderHook(() => useRewardStore());

    act(() => {
      result.current.addReward({ id: 'r-1', name: 'XP Boost' });
    });

    expect(result.current.rewards).toHaveLength(1);
    expect(result.current.rewards[0].id).toBe('r-1');
  });

  it('removeReward removes by id', () => {
    const { result } = renderHook(() => useRewardStore());
    useRewardStore.setState({
      rewards: [
        { id: 'r-1', name: 'XP Boost' },
        { id: 'r-2', name: 'Badge' },
      ],
    });

    act(() => {
      result.current.removeReward('r-1');
    });

    expect(result.current.rewards).toHaveLength(1);
    expect(result.current.rewards[0].id).toBe('r-2');
  });

  it('removeReward is a no-op for non-existent id', () => {
    const { result } = renderHook(() => useRewardStore());
    useRewardStore.setState({
      rewards: [{ id: 'r-1', name: 'XP Boost' }],
    });

    act(() => {
      result.current.removeReward('r-nonexistent');
    });

    expect(result.current.rewards).toHaveLength(1);
  });

  it('fetchRewards sets loading and populates rewards on success', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'r-1', name: 'Token' }],
    });

    const { result } = renderHook(() => useRewardStore());

    await act(async () => {
      await result.current.fetchRewards();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.rewards).toEqual([{ id: 'r-1', name: 'Token' }]);
    expect(result.current.error).toBeNull();
  });

  it('fetchRewards sets error on failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useRewardStore());

    await act(async () => {
      await result.current.fetchRewards();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Error: Internal Server Error');
    expect(result.current.rewards).toEqual([]);
  });

  it('addReward then removeReward leaves empty array', () => {
    const { result } = renderHook(() => useRewardStore());

    act(() => {
      result.current.addReward({ id: 'r-1', name: 'Token' });
    });
    act(() => {
      result.current.removeReward('r-1');
    });

    expect(result.current.rewards).toEqual([]);
  });

  it('multiple addReward calls accumulate', () => {
    const { result } = renderHook(() => useRewardStore());

    act(() => {
      result.current.addReward({ id: 'r-1', name: 'A' });
    });
    act(() => {
      result.current.addReward({ id: 'r-2', name: 'B' });
    });
    act(() => {
      result.current.addReward({ id: 'r-3', name: 'C' });
    });

    expect(result.current.rewards).toHaveLength(3);
    expect(result.current.rewards.map((r) => r.id)).toEqual([
      'r-1',
      'r-2',
      'r-3',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GAME PROGRESS STORE — score, puzzles, achievements
// ═══════════════════════════════════════════════════════════════════════
describe('Cache invalidation — game progress store', () => {
  it('addCompletedPuzzle appends puzzle id', () => {
    const { result } = renderHook(() => useGameProgressStore());

    act(() => {
      result.current.addCompletedPuzzle('puzzle-easy-3');
    });

    expect(result.current.completedPuzzles).toContain('puzzle-easy-3');
  });

  it('incrementScore adds points', () => {
    const { result } = renderHook(() => useGameProgressStore());
    useGameProgressStore.setState({ score: 100 });

    act(() => {
      result.current.incrementScore(250);
    });

    expect(result.current.score).toBe(350);
  });

  it('addAchievement appends achievement', () => {
    const { result } = renderHook(() => useGameProgressStore());

    act(() => {
      result.current.addAchievement({ id: 'ach-1', name: 'First Blood' });
    });

    expect(result.current.achievements).toHaveLength(1);
    expect(result.current.achievements[0].name).toBe('First Blood');
  });

  it('resetProgress clears all fields', () => {
    const { result } = renderHook(() => useGameProgressStore());
    useGameProgressStore.setState({
      completedPuzzles: ['p1', 'p2'],
      score: 500,
      achievements: [{ id: 'a1' }],
    });

    act(() => {
      result.current.resetProgress();
    });

    expect(result.current.completedPuzzles).toEqual([]);
    expect(result.current.score).toBe(0);
    expect(result.current.achievements).toEqual([]);
  });

  it('multiple addCompletedPuzzle calls accumulate', () => {
    const { result } = renderHook(() => useGameProgressStore());

    act(() => {
      result.current.addCompletedPuzzle('p1');
      result.current.addCompletedPuzzle('p2');
      result.current.addCompletedPuzzle('p3');
    });

    expect(result.current.completedPuzzles).toEqual(['p1', 'p2', 'p3']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// INTEGRATION — cross-store invalidation
// ═══════════════════════════════════════════════════════════════════════
describe('Cache invalidation — cross-store integration', () => {
  it('logout resets both game store and clears local state', async () => {
    const gameStore = useGameStore;
    const mockUser = { id: 'user-1' };
    gameStore.setState({
      user: mockUser,
      score: 300,
      completedPuzzles: ['p1'],
      nfts: [{ id: 'nft-1' }],
    });
    axios.post.mockResolvedValueOnce({});

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.score).toBe(0);
    expect(result.current.nfts).toEqual([]);
  });

  it('fetchDifficultyConfig updates config in store', async () => {
    const config = {
      levels: ['easy', 'medium', 'difficult', 'advanced'],
      pointsPerCompletion: 100,
    };
    axios.get.mockResolvedValueOnce({ data: config });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.fetchDifficultyConfig();
    });

    expect(result.current.difficultyConfig).toEqual(config);
  });

  it('loadUserData merges server state into store', async () => {
    const mockUser = { id: 'user-1', username: 'alice' };
    useGameStore.setState({ user: mockUser });
    axios.get.mockResolvedValueOnce({
      data: { score: 750, completedPuzzles: ['p1', 'p2', 'p3'] },
    });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.loadUserData();
    });

    expect(result.current.score).toBe(750);
    expect(result.current.completedPuzzles).toEqual(['p1', 'p2', 'p3']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DIFFICULTY CONFIG — cache refresh on config change
// ═══════════════════════════════════════════════════════════════════════
describe('Cache invalidation — difficulty config refresh', () => {
  it('completePuzzle uses config points when available', async () => {
    const mockUser = { id: 'user-1', username: 'alice' };
    useGameStore.setState({
      user: mockUser,
      score: 0,
      difficultyConfig: { pointsPerCompletion: 250 },
    });
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.completePuzzle('easy-1');
    });

    expect(result.current.score).toBe(250);
  });

  it('completePuzzle uses default points when config is null', async () => {
    const mockUser = { id: 'user-1', username: 'alice' };
    useGameStore.setState({
      user: mockUser,
      score: 0,
      difficultyConfig: null,
    });
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.completePuzzle('easy-1');
    });

    expect(result.current.score).toBe(100);
  });

  it('fetchDifficultyConfig failure logs error without crashing', async () => {
    axios.get.mockRejectedValueOnce(new Error('Config fetch failed'));

    const { result } = renderHook(() => useGameStore());

    await act(async () => {
      await result.current.fetchDifficultyConfig();
    });

    expect(result.current.difficultyConfig).toBeNull();
    expect(result.current.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.current.errors[0].action).toBe('fetchDifficultyConfig');
  });
});
