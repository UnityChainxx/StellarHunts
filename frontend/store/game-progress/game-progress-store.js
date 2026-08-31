import create from "zustand";
import { persist } from "zustand/middleware";

const useGameProgressStore = create(
  persist(
    (set) => ({
      completedPuzzles: [],
      score: 0,
      achievements: [],
      addCompletedPuzzle: (puzzleId) =>
        set((state) => ({
          completedPuzzles: [...state.completedPuzzles, puzzleId],
        })),
      incrementScore: (points) =>
        set((state) => ({
          score: state.score + points,
        })),
      addAchievement: (achievement) =>
        set((state) => ({
          achievements: [...state.achievements, achievement],
        })),
      resetProgress: () =>
        set({
          completedPuzzles: [],
          score: 0,
          achievements: [],
        }),
    }),
    {
      name: "game-progress-store:v1", // unique name for storage — do not reuse 'game-storage'
      getStorage: () => localStorage, // (optional) by default, 'localStorage' is used
    },
  ),
);

export default useGameProgressStore;
