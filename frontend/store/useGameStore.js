import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import axios from "axios";

// Keep only a small, lightweight index of NFTs in localStorage so we never
// blow the ~5MB quota as the collection grows (#104). Full NFT payloads are
// fetched from the server on demand via the paginated inventory endpoints.
const PERSISTED_NFT_LIMIT = 50;

const buildLightweightNftIndex = (nfts = []) => {
  return nfts.slice(-PERSISTED_NFT_LIMIT).map((nft) => {
    if (!nft || typeof nft !== "object") return nft;
    return {
      id: nft.id ?? nft.assetId ?? null,
      assetId: nft.assetId ?? nft.id ?? null,
      assetType: nft.assetType ?? "nft",
      name: nft.name,
      rarity: nft.rarity,
      imageUrl: nft.imageUrl,
      src: nft.src,
      acquiredAt: nft.acquiredAt,
    };
  });
};

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

      // Auth actions
      register: async (username, password) => {
        try {
          const response = await axios.post(
            "http://localhost:4001/auth/register",
            { username, password },
            { withCredentials: true }
          );
          set({ user: response.data });
        } catch (error) {
          console.error("Registration failed:", error);
          throw error;
        }
      },

      login: async (username, password) => {
        try {
          const response = await axios.post(
            "http://localhost:4001/auth/login",
            { username, password },
            { withCredentials: true }
          );
          set({ user: response.data });
        } catch (error) {
          console.error("Login failed:", error);
          throw error;
        }
      },

      logout: async () => {
        try {
          await axios.post(
            "http://localhost:4001/auth/logout",
            {},
            { withCredentials: true }
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
          console.error("Logout failed:", error);
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
        } = get();
        if (!user) return;

        const newCompletedPuzzles = [...completedPuzzles, puzzleId];
        const currentDifficultyPuzzles = newCompletedPuzzles.filter((id) =>
          id.startsWith(currentDifficulty)
        );

        const isLevelCompleted = currentDifficultyPuzzles.length === 5;
        const newCompletedDifficulties = isLevelCompleted
          ? [...completedDifficulties, currentDifficulty]
          : completedDifficulties;

        let nextDifficulty = currentDifficulty;
        let nextPuzzleIndex = (currentPuzzleIndex + 1) % 5;

        if (isLevelCompleted) {
          const difficultyLevels = ["easy", "medium", "difficult", "advanced"];
          const currentIndex = difficultyLevels.indexOf(currentDifficulty);
          if (currentIndex < difficultyLevels.length - 1) {
            nextDifficulty = difficultyLevels[currentIndex + 1];
            nextPuzzleIndex = 0;
          }
        }

        const newScore = score + 100;

        // Update the backend
        try {
          await axios.post(
            "http://localhost:4001/game/update",
            {
              userId: user.id,
              completedPuzzles: newCompletedPuzzles,
              completedDifficulties: newCompletedDifficulties,
              currentDifficulty: nextDifficulty,
              currentPuzzleIndex: nextPuzzleIndex,
              score: newScore,
            },
            { withCredentials: true }
          );

          set({
            completedPuzzles: newCompletedPuzzles,
            completedDifficulties: newCompletedDifficulties,
            currentDifficulty: nextDifficulty,
            currentPuzzleIndex: nextPuzzleIndex,
            score: newScore,
          });
        } catch (error) {
          console.error("Failed to update game progress:", error);
        }
      },

      addNFT: async (nft) => {
        const { user, nfts } = get();
        if (!user) return;

        try {
          await axios.post(
            "http://localhost:4001/nft/add",
            {
              userId: user.id,
              nft,
            },
            { withCredentials: true }
          );

          set({ nfts: [...nfts, nft] });
        } catch (error) {
          console.error("Failed to add NFT:", error);
        }
      },

      // Server-side paginated fetch used by the virtualized gallery.
      // Returns { items, page, limit, total, hasMore } and merges new items
      // into the in-memory store without touching localStorage (#104).
      fetchNftsPage: async ({ page = 1, limit = 20 } = {}) => {
        const { user } = get();
        if (!user) return { items: [], page, limit, total: 0, hasMore: false };

        try {
          const response = await axios.get(
            `http://localhost:4001/users/${user.id}/inventory/nfts`,
            {
              params: { page, limit },
              withCredentials: true,
            }
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
              items.filter((n) => n && !seen.has(n.id))
            );
            set({ nfts: merged });
          }

          return { items, page, limit, total, hasMore };
        } catch (error) {
          console.error("Failed to fetch NFT page:", error);
          return { items: [], page, limit, total: 0, hasMore: false };
        }
      },

      // Load user data
      loadUserData: async () => {
        const { user } = get();
        if (!user) return;

        try {
          const response = await axios.get(
            `http://localhost:4001/user/${user.id}`,
            { withCredentials: true }
          );
          set(response.data);
        } catch (error) {
          console.error("Failed to load user data:", error);
        }
      },

      // Reset progress
      resetProgress: async () => {
        const { user } = get();
        if (!user) return;

        try {
          await axios.post(
            `http://localhost:4001/game/reset`,
            { userId: user.id },
            { withCredentials: true }
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
          console.error("Failed to reset progress:", error);
        }
      },
    }),
    {
      name: "game-storage",
      storage: createJSONStorage(() => {
        // Wrap localStorage in a defensive try/catch — if quota is exceeded
        // (#104) we drop the NFT index instead of throwing and corrupting the
        // hydration of the rest of the persisted state.
        const safeStorage = {
          getItem: (name) => {
            try {
              return localStorage.getItem(name);
            } catch (err) {
              console.warn("localStorage read failed:", err);
              return null;
            }
          },
          setItem: (name, value) => {
            try {
              localStorage.setItem(name, value);
            } catch (err) {
              // Quota exceeded — persist everything except the NFT index.
              try {
                const slim = JSON.parse(value);
                if (slim && slim.state && Array.isArray(slim.state.nfts)) {
                  slim.state.nfts = [];
                  localStorage.setItem(name, JSON.stringify(slim));
                  return;
                }
              } catch (_) {
                /* fallthrough */
              }
              console.warn("localStorage write failed:", err);
            }
          },
          removeItem: (name) => {
            try {
              localStorage.removeItem(name);
            } catch (err) {
              console.warn("localStorage remove failed:", err);
            }
          },
        };
        return safeStorage;
      }),
      partialize: (state) => ({
        // Persist everything except the full NFT payloads — we keep only a
        // trimmed lightweight index to avoid hitting the quota (#104).
        user: state.user,
        currentDifficulty: state.currentDifficulty,
        currentPuzzleIndex: state.currentPuzzleIndex,
        completedPuzzles: state.completedPuzzles,
        completedDifficulties: state.completedDifficulties,
        score: state.score,
        nfts: buildLightweightNftIndex(state.nfts),
      }),
      version: 2,
      migrate: (persistedState, fromVersion) => {
        // v1 → v2: nothing to migrate; older `nfts` payloads (if oversized)
        // are simply replaced on next save by the new partialize function.
        if (!persistedState) return persistedState;
        return persistedState;
      },
      // IMPORTANT (#104): on rehydration the persisted `nfts` is only the
      // trimmed lightweight index (latest 50, metadata stripped). Without
      // this onRehydrateStorage hook consumers would render broken cards
      // (missing imageUrl/src) after a refresh. We auto-fire the first
      // server-side page so the in-memory collection is back to full.
      onRehydrateStorage: () => (rehydratedState) => {
        if (!rehydratedState || !rehydratedState.user) return;
        // Defer to a microtask so callers that already subscribe to the
        // store observe the populated `nfts` in the next render.
        queueMicrotask(() => {
          const { fetchNftsPage } = rehydratedState;
          if (typeof fetchNftsPage === "function") {
            // 50 matches `PERSISTED_NFT_LIMIT`; bump if you change one or
            // the other.
            fetchNftsPage({ page: 1, limit: 50 }).catch(() => {});
          }
        });
      },
    }
  )
);

export default useGameStore;
