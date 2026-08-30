import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────
// Frontend ↔ backend route compatibility (issue #360)
//
// The backend serves every route under `/api/v1` (see
// backend/src/main.ts and backend/config/app.config.ts). These tests lock
// the contract: every browser call to the backend must go through
// `apiUrl()` and use the `/api/v1` prefix. If a route path changes here,
// the backend e2e spec (backend/test/api-prefix.e2e-spec.ts) must be
// updated in the same PR.
// ─────────────────────────────────────────────────────────────────────────

const BACKEND = 'http://localhost:3001';
const PREFIX = '/api/v1';

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

describe('apiUrl() — shared backend URL builder', () => {
  it('prefixes every backend route with /api/v1', async () => {
    const { apiUrl, API_VERSION } = await import('@/lib/api');
    expect(API_VERSION).toBe('v1');
    expect(apiUrl('/auth/login')).toBe(`${BACKEND}${PREFIX}/auth/login`);
    expect(apiUrl('/auth/register')).toBe(`${BACKEND}${PREFIX}/auth/register`);
    expect(apiUrl('/auth/profile')).toBe(`${BACKEND}${PREFIX}/auth/profile`);
    expect(apiUrl('/game/difficulty-config')).toBe(`${BACKEND}${PREFIX}/game/difficulty-config`);
    expect(apiUrl('/users/42/inventory/nfts')).toBe(`${BACKEND}${PREFIX}/users/42/inventory/nfts`);
    expect(apiUrl('rewards')).toBe(`${BACKEND}${PREFIX}/rewards`);
  });

  it('strips trailing slashes from the configured base URL', async () => {
    const { apiUrl, API_BASE_URL } = await import('@/lib/api');
    expect(API_BASE_URL).toBe(BACKEND);
    expect(apiUrl('/rewards').startsWith(`${BACKEND}/api/`)).toBe(true);
  });
});

describe('gameApi — route call sites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('calls difficulty config and puzzle routes under /api/v1', async () => {
    const axios = (await import('axios')).default;
    const { fetchDifficultyConfig, fetchPuzzleForDifficulty } = await import('@/services/gameApi');

    await fetchDifficultyConfig();
    expect(axios.get).toHaveBeenCalledWith(`${BACKEND}${PREFIX}/game/difficulty-config`);

    await fetchPuzzleForDifficulty('easy', 2);
    expect(axios.get).toHaveBeenCalledWith(`${BACKEND}${PREFIX}/puzzles/easy/2`);
  });
});

describe('useGameStore — route call sites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('auth actions hit /api/v1/auth/*', async () => {
    const axios = (await import('axios')).default;
    const { default: useGameStore } = await import('@/store/useGameStore');

    await useGameStore.getState().register('alice', 'secret');
    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      `${BACKEND}${PREFIX}/auth/register`,
      { username: 'alice', password: 'secret' },
      { withCredentials: true },
    );

    await useGameStore.getState().login('alice', 'secret');
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      `${BACKEND}${PREFIX}/auth/login`,
      { username: 'alice', password: 'secret' },
      { withCredentials: true },
    );

    await useGameStore.getState().logout();
    expect(axios.post).toHaveBeenNthCalledWith(3, `${BACKEND}${PREFIX}/auth/logout`, {}, { withCredentials: true });
  });

  it('game and user routes hit /api/v1/*', async () => {
    const axios = (await import('axios')).default;
    const { default: useGameStore } = await import('@/store/useGameStore');

    await useGameStore.getState().fetchDifficultyConfig();
    expect(axios.get).toHaveBeenNthCalledWith(1, `${BACKEND}${PREFIX}/game/difficulty-config`);

    // GET /users/:id — the real backend route (plural "users").
    useGameStore.setState({ user: { id: 'u-123' } });
    await useGameStore.getState().loadUserData();
    expect(axios.get).toHaveBeenNthCalledWith(2, `${BACKEND}${PREFIX}/users/u-123`, { withCredentials: true });

    await useGameStore.getState().fetchNftsPage({ page: 1, limit: 20 });
    expect(axios.get).toHaveBeenNthCalledWith(
      3,
      `${BACKEND}${PREFIX}/users/u-123/inventory/nfts`,
      expect.objectContaining({ params: { page: 1, limit: 20 } }),
    );

    await useGameStore.getState().addNFT({ id: 'n-1' });
    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      `${BACKEND}${PREFIX}/nft/add`,
      { userId: 'u-123', nft: { id: 'n-1' } },
      { withCredentials: true },
    );

    await useGameStore.getState().resetProgress();
    expect(axios.post).toHaveBeenNthCalledWith(2, `${BACKEND}${PREFIX}/game/reset`, { userId: 'u-123' }, { withCredentials: true });
  });
});

describe('auth-store — route call sites', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('register/login/profile hit /api/v1/auth/*', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u-1' }, token: 'jwt-token' }),
    });

    const { default: useAuthStore } = await import('@/store/auth/auth-store');

    await useAuthStore.getState().register({ email: 'a@b.c', password: 'x' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND}${PREFIX}/auth/register`,
      expect.objectContaining({ method: 'POST' }),
    );

    await useAuthStore.getState().login({ email: 'a@b.c', password: 'x' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND}${PREFIX}/auth/login`,
      expect.objectContaining({ method: 'POST' }),
    );

    // fetchUser must target the existing backend route /auth/profile.
    await useAuthStore.getState().fetchUser();
    const profileCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/profile'),
    );
    expect(profileCall).toBeDefined();
    expect(profileCall[1]).toEqual(expect.objectContaining({ method: 'GET' }));
  });
});

describe('nft-reward-store — route call sites', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches rewards from /api/v1/rewards', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({ ok: true, statusText: 'OK', json: async () => [] });

    const { default: useRewardStore } = await import('@/store/reward/nft-reward-store');
    await useRewardStore.getState().fetchRewards();

    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND}${PREFIX}/rewards`);
  });
});
