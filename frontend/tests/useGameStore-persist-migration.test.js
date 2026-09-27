import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store imports the shared axios client lazily; mock it so importing the
// module never performs real network setup.
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

const LEGACY_KEY = 'game-storage';
const PERSIST_KEY = 'game-store:v1';

// Re-import the store after seeding localStorage so persist hydrates from the
// payload the test writes (issue #496).
const loadStore = () => import('@/store/useGameStore');

describe('useGameStore persist key migration (issue #496)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('hydrates progress persisted under the legacy game-storage key and re-keys it', async () => {
    const legacyPayload = JSON.stringify({
      state: {
        completedPuzzles: ['easy-0', 'easy-1'],
        completedDifficulties: [],
        currentDifficulty: 'easy',
        currentPuzzleIndex: 2,
        score: 200,
        // Fields older builds persisted but that are no longer allow-listed.
        user: { id: 'legacy-user' },
        nfts: [{ id: 'nft-legacy' }],
      },
      version: 1,
    });
    localStorage.setItem(LEGACY_KEY, legacyPayload);

    const { default: useGameStore } = await loadStore();

    // Progress survives hydration from the legacy key.
    const state = useGameStore.getState();
    expect(state.completedPuzzles).toEqual(['easy-0', 'easy-1']);
    expect(state.score).toBe(200);
    expect(state.currentPuzzleIndex).toBe(2);

    // The payload was migrated to the canonical key and the legacy entry
    // removed so the two can never drift apart.
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull();
  });

  it('migrates an old-schema (version 0) payload without losing progress', async () => {
    const oldSchemaPayload = JSON.stringify({
      state: { score: 150, completedPuzzles: ['easy-0'] },
      version: 0,
    });
    localStorage.setItem(PERSIST_KEY, oldSchemaPayload);

    const { default: useGameStore } = await loadStore();

    const state = useGameStore.getState();
    expect(state.score).toBe(150);
    expect(state.completedPuzzles).toEqual(['easy-0']);
    // Missing fields are normalised to the current shape.
    expect(state.currentDifficulty).toBe('easy');
    expect(state.currentPuzzleIndex).toBe(0);
    expect(state.completedDifficulties).toEqual([]);
  });

  it('writes only durable progress under the canonical key', async () => {
    const { default: useGameStore } = await loadStore();

    useGameStore.setState({
      score: 300,
      completedPuzzles: ['easy-9'],
      user: { id: 'user-1' },
      nfts: [{ id: 'nft-1' }],
    });

    // Flush the throttled localStorage write.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const raw = localStorage.getItem(PERSIST_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw);
    expect(parsed.state.score).toBe(300);
    expect(parsed.state.completedPuzzles).toEqual(['easy-9']);
    // user/nfts are server-owned and must not be persisted.
    expect(parsed.state.user).toBeUndefined();
    expect(parsed.state.nfts).toBeUndefined();
  });
});
