import { apiClient } from "@/lib/api";

export async function fetchDifficultyConfig() {
  const response = await apiClient.get("/game/difficulty-config");
  return response.data;
}

export async function fetchPuzzleForDifficulty(difficulty, index) {
  const response = await apiClient.get(`/puzzles/${difficulty}/${index}`);
  return response.data;
}
