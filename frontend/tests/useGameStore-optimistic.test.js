import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import useGameStore from '@/store/useGameStore';
import axios from 'axios';

// Reset the persisted singleton store state between tests. Rehydrating a
// fresh store leaves an empty base state, which we then re-seed so each
// test starts from the same snapshot (issue #299 optimistic rollback).
const resetStore = () => {
  useGameStore.setState({
    user: { id: 'user-1' },
    currentDifficulty: 'easy',
    currentPuzzleIndex: 0,
    completedPuzzles: [],
    completedDifficulties: [],
    score: 0,
    nfts: [],
    errors: [],
    difficultyConfig: null,
  });
};

describe('useGameStore optimistic-update rollback (issue #299)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('applies completePuzzle optimistically, then persists on success', async () => {
    useGameStore.setState({
      user: { id: 'user-1' },
      completedPuzzles: ['easy-0'],
      score: 100,
    });
    axios.post.mockResolvedValue({ data: { ok: true } });

    // Start the action; state is applied synchronously before the await.
    const promise = useGameStore.getState().completePuzzle('easy-1');

    // Optimistic state is visible immediately (before the request settles).
    expect(useGameStore.getState().completedPuzzles).toContain('easy-1');
    expect(useGameStore.getState().score).toBe(200);

    await promise;

    // Still applied after success (no rollback).
    expect(useGameStore.getState().completedPuzzles).toContain('easy-1');
    expect(useGameStore.getState().score).toBe(200);
  });

  it('rolls back completePuzzle to the prior state when the request fails', async () => {
    useGameStore.setState({
      user: { id: 'user-1' },
      completedPuzzles: ['easy-0'],
      score: 100,
    });
    axios.post.mockRejectedValue(new Error('network down'));

    const promise = useGameStore.getState().completePuzzle('easy-1');

    // Optimistic while in flight.
    expect(useGameStore.getState().completedPuzzles).toContain('easy-1');
    expect(useGameStore.getState().score).toBe(200);

    await promise;

    // Rolled back to the exact prior state on failure.
    const state = useGameStore.getState();
    expect(state.completedPuzzles).toEqual(['easy-0']);
    expect(state.score).toBe(100);
    expect(state.errors.length).toBe(1);
    expect(state.errors[0].action).toBe('completePuzzle');
  });

  it('rolls back addNFT when the request fails, leaving inventory unchanged', async () => {
    useGameStore.setState({
      user: { id: 'user-1' },
      nfts: [{ id: 'nft-1' }],
    });
    axios.post.mockRejectedValue(new Error('network down'));

    const promise = useGameStore.getState().addNFT({ id: 'nft-2' });

    // Optimistically added.
    expect(useGameStore.getState().nfts).toHaveLength(2);

    await promise;

    // Rolled back — no phantom NFT remains.
    const state = useGameStore.getState();
    expect(state.nfts).toEqual([{ id: 'nft-1' }]);
    expect(state.errors[0].action).toBe('addNFT');
  });
});
