"use client";

import { useApiQuery } from "./useApiQuery";
import { fetchPuzzleRoadmap } from "../services/roadmapService";

/**
 * Loads the puzzle roadmap with the shared query wrapper, giving the roadmap
 * page real loading / error / empty states (and a retry via `refetch`).
 */
export function useRoadmap() {
  return useApiQuery({
    key: ["puzzles", "roadmap"],
    fn: fetchPuzzleRoadmap,
    staleTime: 5 * 60_000,
  });
}

export default useRoadmap;
