// Single source of truth for the backend API base URL and versioned prefix.
//
// The backend serves every route under `/api/<API_VERSION>` (see
// `backend/src/main.ts` and `backend/config/app.config.ts`), so the
// frontend must build all backend URLs through `apiUrl()` to stay in
// sync. The prefix is versioned on the backend via `API_VERSION` and
// defaulted to `v1` here — change both together.
//
// Override the backend origin with `NEXT_PUBLIC_API_URL` when the API is
// not served from `http://localhost:3001` (the dev default).

const API_VERSION = "v1";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
).replace(/\/+$/, "");

/**
 * Builds a backend API URL for a route path, e.g.
 * `apiUrl("/auth/login")` → `http://localhost:3001/api/v1/auth/login`.
 *
 * @param {string} path - route path, with or without a leading "/"
 */
export function apiUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}/api/${API_VERSION}${normalized}`;
}

export { API_BASE_URL, API_VERSION };
