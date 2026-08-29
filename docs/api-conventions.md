# API route conventions

Every browser-to-backend request uses the same URL shape:

```
{backend origin}/api/{version}/{controller path}
```

## The prefix: `/api/v1`

- The backend mounts every route under a global prefix built from
  `appConfig.apiVersion` (`backend/config/app.config.ts`, env
  `API_VERSION`, default **`v1`**), so the canonical prefix is
  **`/api/v1`** (`backend/src/main.ts`).
- The frontend must never hardcode backend URLs. It builds them with the
  shared helper `apiUrl()` in `frontend/lib/api.js`, which appends the
  prefix to the base URL from `NEXT_PUBLIC_API_URL` (default
  `http://localhost:3001` in development):

  ```js
  import { apiUrl } from "@/lib/api";
  apiUrl("/auth/login"); // → http://localhost:3001/api/v1/auth/login
  ```

- Examples: `POST /auth/login` → `POST /api/v1/auth/login`,
  `GET /users/:id/inventory/nfts` → `GET /api/v1/users/:id/inventory/nfts`.

## Rules

1. **Use `apiUrl()` everywhere.** No inline `fetch("/api/...")`,
   `axios.get("http://localhost:3001/...")`, or port-specific URLs in
   frontend code.
2. **The version lives in one place.** Change `API_VERSION` in
   `frontend/lib/api.js` and `apiVersion` in `backend/config/app.config.ts`
   together.
3. **`/docs` is exempt.** Swagger UI stays at `/docs` (not
   `/api/v1/docs`); the backend excludes the `docs` path family (exact
   `/docs`, `/docs-json`, and everything under `/docs/`) from the prefix.
4. **Frontend-only API routes** (Next.js route handlers under
   `frontend/app/api/`, e.g. the referral mock endpoints) are unrelated to
   the backend prefix and keep using relative `/api/...` paths.

## How the contract is enforced

- `frontend/tests/apiRoutes.test.js` — asserts every frontend call site
  (stores, services) builds `/api/v1` routes through `apiUrl()`.
- `backend/test/api-prefix.e2e-spec.ts` — boots a minimal Nest app with the
  same prefix config and asserts the prefix and `/docs` exclusion behave
  as documented.
- `docs/api.md` — the endpoint reference (paths are listed without the
  prefix; mentally prefix each with `/api/v1`).

If a backend route changes, update the frontend call site, `docs/api.md`,
and the two tests in the same PR.
