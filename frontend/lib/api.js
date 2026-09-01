import axios from "axios";

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

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 2;

export class ApiError extends Error {
  constructor(message, { status, data, cause } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.cause = cause;
  }
}

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

function normalizeError(error) {
  const responseData = error?.response?.data;
  const message = responseData?.message || error?.message || "Request failed";
  return new ApiError(
    Array.isArray(message) ? message.join(", ") : message,
    {
      status: error?.response?.status,
      data: responseData,
      cause: error,
    },
  );
}

function isRetryable(error) {
  const status = error?.response?.status;
  return !status || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function request(method, path, data, options = {}) {
  const {
    retries = DEFAULT_RETRIES,
    timeout = DEFAULT_TIMEOUT,
    withCredentials = true,
    ...config
  } = options;
  const requestConfig = { ...config, timeout, withCredentials };
  const url = apiUrl(path);

  for (let attempt = 0; ; attempt += 1) {
    try {
      if (method === "get" || method === "delete") {
        return await axios[method](url, requestConfig);
      }
      return await axios[method](url, data, requestConfig);
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) {
        throw normalizeError(error);
      }
    }
  }
}

export const apiClient = {
  get: (path, options) => request("get", path, undefined, options),
  delete: (path, options) => request("delete", path, undefined, options),
  post: (path, data, options) => request("post", path, data, options),
  put: (path, data, options) => request("put", path, data, options),
  patch: (path, data, options) => request("patch", path, data, options),
};

export { API_BASE_URL, API_VERSION, DEFAULT_TIMEOUT, DEFAULT_RETRIES };
