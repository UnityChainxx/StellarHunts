import { apiClient } from "@/lib/api";

/**
 * Fetches the puzzle roadmap from the backend.
 *
 * The backend returns either a bare array or `{ puzzles: [...] }`; both
 * shapes are normalised here so callers always receive an array.
 *
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Array>}
 */
export async function fetchPuzzleRoadmap({ signal } = {}) {
  const response = await apiClient.get("/puzzles/roadmap", { signal });
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.puzzles)) return data.puzzles;
  return [];
}
