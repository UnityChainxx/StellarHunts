import { apiClient } from "@/lib/api";

// Fetches the game's difficulty configuration (e.g. available difficulty
// levels and their settings) from the backend.
export async function fetchDifficultyConfig() {
  const response = await apiClient.get("/game/difficulty-config");
  return response.data;
}

// Fetches a single puzzle for a given difficulty level and index
// (e.g. the 5th puzzle in the "medium" set).
export async function fetchPuzzleForDifficulty(difficulty, index) {
  const response = await apiClient.get(`/puzzles/${difficulty}/${index}`);
  return response.data;
}