import axios from "axios";
import { apiUrl } from "@/lib/api";

export async function fetchDifficultyConfig() {
  const response = await axios.get(apiUrl("/game/difficulty-config"));
  return response.data;
}

export async function fetchPuzzleForDifficulty(difficulty, index) {
  const response = await axios.get(apiUrl(`/puzzles/${difficulty}/${index}`));
  return response.data;
}
