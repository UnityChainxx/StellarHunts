import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { apiClient } from "@/lib/api";

/**
 * Returns a storage adapter that debounces `setItem` so that the
 * hot-path game actions (auth, score updates, NFT additions) don't
 * trigger a synchronous localStorage write on every `set()` call.
 * Bursts of mutations within `delayMs` collapse into one write.
 *
 * `removeItem` is flushed immediately so logout/reset semantics
 * aren't affected by the throttle window.
 *
 * Implementation note: the returned adapter is captured by
 * `createJSONStorage` exactly once (Zustand invokes the factory
 * function once and caches the result). The closure-scoped `timer`
 * and `pendingValue` therefore survive across `setItem` calls. Do
 * not move the factory invocation inside `setItem` or the debounce
 * will be defeated by per-call instance re-creation.
 */

const createThrottledStorage = (storage, delayMs = 150) => {
  let timer = null;
  let pending = null;
  const flush = () => {
    if (pending !== null) {
      try {
        // Write under the key `persist` passes us — never a hardcoded key,
        // so a rename can't silently strand the payload.
        storage.setItem(pending.name, pending.value);
      } catch (e) {
        // Quota or serialization errors should not break gameplay.
      }
      pending = null;
    }
    timer = null;
  };
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      pending = { name, value };
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(flush, delayMs);
    },
    removeItem: (name) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
      storage.removeItem(name);
    },
  };
};

/**
 * Returns `window.localStorage` in the browser, or a no-op storage
 * during SSR so `persist` doesn't crash during Next.js static
 * generation / server rendering.
 */
const safeLocalStorage = () => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return window.localStorage;
};

// Canonical persist key for this store, following the `<store-name>:v<version>`
// convention documented in frontend/store/README.md.
const PERSIST_KEY = "game-store:v1";

// Legacy key this store used before the naming convention was adopted.
// Reserved for this store's migration only — do not reuse it elsewhere.
const LEGACY_PERSIST_KEY = "game-storage";

/**
 * One-time migration for players whose progress was persisted under the
 * legacy `game-storage` key. Copies the payload to the canonical
 * `game-store:v1` key and removes the legacy entry so the two can never
 * drift apart. Runs synchronously (before hydration) so the migrated
 * value is visible to `persist` on its first read.
 */
const migrateLegacyPersistKey = (storage) => {
  let legacy;
  try {
    legacy = storage.getItem(LEGACY_PERSIST_KEY);
  } catch (e) {
    return;
  }
  if (legacy === null || legacy === undefined) return;

  try {
    if (storage.getItem(PERSIST_KEY) === null) {
      storage.setItem(PERSIST_KEY, legacy);
    }
  } catch (e) {
    // Quota/serialization errors must not block hydration — fall through
    // and still clear the legacy key so a retry can happen later.
  }
  storage.removeItem(LEGACY_PERSIST_KEY);
};

const DIFFICULTY_LEVELS = ["easy", "medium", "difficult", "advanced"];
const POINTS_PER_COMPLETION = 100;

const useGameStore = create(
  persist(
    (set, get) => ({
      // User state
      user: null,

      // Game progress
      currentDifficulty: "easy",
      currentPuzzleIndex: 0,
      completedPuzzles: [],
      completedDifficulties: [],
      score: 0,

      // NFT collection
      nfts: [],

      // Error surface
      errors: [],

      // Difficulty configuration (loaded from API)
      difficultyConfig: null,

      clearError: (index) =>
        set((state) => ({
          errors: state.errors.filter((_, i) => i !== index),
        })),

      // Auth actions
      register: async (username, password) => {
        try {
          const response = await apiClient.post(
            "/auth/register",
            { username, password },
          );
          set({ user: response.data });
          return { ok: true };
        } catch (error) {
          const entry = { action: "register", message: error.message, time: Date.now() };
          set((state) => ({ errors: [...state.errors, entry] }));
          return { ok: false, error: error.message };
        }
      },

      login: async (username, password) => {
        try {
          const response = await apiClient.post(
            "/auth/login",
            { username, password },
          );
          set({ user: response.data });
          return { ok: true };
        } catch (error) {
          const entry = { action: "login", message: error.message, time: Date.now() };
          set((state) => ({ errors: [...state.errors, entry] }));
          return { ok: false, error: error.message };
        }
      },

      logout: async () => {
        try {
          await apiClient.post(
            "/auth/logout",
            {},
          );
          set({
            user: null,
            currentDifficulty: "easy",
            currentPuzzleIndex: 0,
            completedPuzzles: [],
            completedDifficulties: [],
            score: 0,
            nfts: [],
          });
        } catch (error) {
          const entry = { action: "logout", message: error.message, time: Date.now() };
          set((state) => ({ errors: [...state.errors, entry] }));
        }
      },

      fetchDifficultyConfig: async () => {
        try {
          const response = await apiClient.get("/game/difficulty-config");
          set({ difficultyConfig: response.data });
        } catch (error) {
          const entry = { action: "fetchDifficultyConfig", message: error.message, time: Date.now() };
          set((state) => ({ errors: [...state.errors, entry] }));
        }
      },

      // Game actions
      completePuzzle: async (puzzleId) => {
        const {
          user,
          currentDifficulty,
          currentPuzzleIndex,
          completedPuzzles,
          completedDifficulties,
          score,
          difficultyConfig,
        } = get();
        if (!user) return;

        const newCompletedPuzzles = [...completedPuzzles, puzzleId];
        const currentDifficultyPuzzles = newCompletedPuzzles.filter((id) =>
          id.startsWith(currentDifficulty),
        );

        const isLevelCompleted = currentDifficultyPuzzles.length === 5;
        const newCompletedDifficulties = isLevelCompleted
          ? [...completedDifficulties, currentDifficulty]
          : completedDifficulties;

        let nextDifficulty = currentDifficulty;
        let nextPuzzleIndex = (currentPuzzleIndex + 1) % 5;

        if (isLevelCompleted) {
          const levels = difficultyConfig?.levels ?? DIFFICULTY_LEVELS;
          const currentIndex = levels.indexOf(currentDifficulty);
          if (currentIndex < levels.length - 1) {
            nextDifficulty = levels[currentIndex + 1];
            nextPuzzleIndex = 0;
          }
        }

        const pointsPerCompletion = difficultyConfig?.pointsPerCompletion ?? POINTS_PER_COMPLETION;
        const newScore = score + pointsPerCompletion;

        // Optimistic update: apply the new progress immediately so the UI
        // feels instant, then persist to the backend. If the request fails
        // we roll back to the exact prior snapshot so a failed mutation
        // never leaves the game state half-advanced (issue #299).
        const previous = {
          completedPuzzles,
          completedDifficulties,
          currentDifficulty,
          currentPuzzleIndex,
          score,
        };
        const next = {
          completedPuzzles: newCompletedPuzzles,
          completedDifficulties: newCompletedDifficulties,
          currentDifficulty: nextDifficulty,
          currentPuzzleIndex: nextPuzzleIndex,
          score: newScore,
        };
        set(next);

        try {
          await apiClient.post(
            "/game/update",
            {
              userId: user.id,
              completedPuzzles: newCompletedPuzzles,
              completedDifficulties: newCompletedDifficulties,
              currentDifficulty: nextDifficulty,
              currentPuzzleIndex: nextPuzzleIndex,
              score: newScore,
            },
          );
        } catch (error) {
          // Restore prior state on failure.
          set(previous);
          const entry = { action: "completePuzzle", message: error.message, time: Date.now() };
          set((state) => ({ errors: [...state.errors, entry] }));
        }
      },

      addNFT: async (nft) => {
        const { user, nfts } = get();
        if (!user) return;

        // Optimistic update: add the NFT locally first, then persist. On
        // failure we roll the inventory back to its prior contents (issue
        // #299) so a failed request never leaves a phantom NFT behind.
        const previousNfts = nfts;
        const nextNfts = [...nfts, nft];
        set({ nfts: nextNfts });

        try {
          await apiClient.post(
            "/nft/add",
            {
              userId: user.id,
              nft,
            },
          );
        } catch (error) {
          set({ nfts: previousNfts });
          const entry = { action: "addNFT", message: error.message, time: Date.now() };
          set((state) => ({ errors: [...state.errors, entry] }));
        }
      },

      // Server-side paginated fetch used by the virtualized gallery.
      // Returns { items, page, limit, total, hasMore } and merges new items
      // into the in-memory store without touching localStorage (#104).
      fetchNftsPage: async ({ page = 1, limit = 20 } = {}) => {
        const { user } = get();
        if (!user) return { items: [], page, limit, total: 0, hasMore: false };

        try {
          const response = await apiClient.get(
            `/users/${user.id}/inventory/nfts`,
            {
              params: { page, limit },
            },
          );

          const data = response.data || {};
          const items = data.items || data || [];
          const total = data.total ?? items.length;
          const hasMore = data.hasMore ?? page * limit < total;

          if (page === 1) {
            set({ nfts: items });
          } else {
            const existing = get().nfts || [];
            const seen = new Set(existing.map((n) => n.id));
            const merged = existing.concat(
              items.filter((n) => n && !seen.has(n.id)),
            );
            set({ nfts: merged });
          }

          return { items, page, limit, total, hasMore };
        } catch (error) {
          const entry = { action: "fetchNftsPage", message: error.message, time: Date.now() };
          set((state) => ({ errors: [...state.errors, entry] }));
          return { items: [], page, limit, total: 0, hasMore: false };
        }
      },

      // Load user data
      loadUserData: async () => {
        const { user } = get();
        if (!user) return;

        try {
          const response = await apiClient.get(`/users/${user.id}`);
          set(response.data);
        } catch (error) {
          const entry = { action: "loadUserData", message: error.message, time: Date.now() };
          set((state) => ({ errors: [...state.errors, entry] }));
        }
      },

      // Reset progress
      resetProgress: async () => {
        const { user } = get();
        if (!user) return;

        try {
          await apiClient.post(
            "/game/reset",
            { userId: user.id },
          );
          set({
            currentDifficulty: "easy",
            currentPuzzleIndex: 0,
            completedPuzzles: [],
            completedDifficulties: [],
            score: 0,
            nfts: [],
          });
        } catch (error) {
          const entry = { action: "resetProgress", message: error.message, time: Date.now() };
          set((state) => ({ errors: [...state.errors, entry] }));
        }
      },
    }),
    {
      name: PERSIST_KEY,
      // Throttle writes so the localStorage payload is only re-serialised
      // and written once per coalescing window (see `createThrottledStorage`).
      storage: createJSONStorage(() => {
        const storage = safeLocalStorage();
        migrateLegacyPersistKey(storage);
        return createThrottledStorage(storage);
      }),
      // Only durable progress is persisted. `user` (the auth/account object)
      // and `nfts` (the server-owned NFT gallery) are ephemeral client state
      // that is re-fetched from the API — persisting them would bloat
      // localStorage and risk stale data. See frontend/store/README.md.
      partialize: (state) => ({
        completedPuzzles: state.completedPuzzles,
        completedDifficulties: state.completedDifficulties,
        currentDifficulty: state.currentDifficulty,
        currentPuzzleIndex: state.currentPuzzleIndex,
        score: state.score,
      }),
      version: 1,
      // Payloads written before the `version` field existed are reported as
      // version 0. Normalise them to the current shape (defaulting any
      // missing field) instead of letting a shape change silently reset the
      // player's progress.
      migrate: (persistedState, version) => {
        if (!persistedState || version >= 1) {
          return persistedState;
        }
        return {
          completedPuzzles: persistedState.completedPuzzles ?? [],
          completedDifficulties: persistedState.completedDifficulties ?? [],
          currentDifficulty: persistedState.currentDifficulty ?? "easy",
          currentPuzzleIndex: persistedState.currentPuzzleIndex ?? 0,
          score: persistedState.score ?? 0,
        };
      },
    },
  ),
);

export default useGameStore;
