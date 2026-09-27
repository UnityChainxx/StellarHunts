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

- `backend/src/api-prefix.ts` — the single source of truth for the global
  prefix. `backend/src/main.ts` and `backend/test/api-prefix.e2e-spec.ts`
  both import it, so the runtime and the test cannot disagree.
- `frontend/tests/apiRoutes.test.js` — asserts every frontend call site
  (stores, services) builds `/api/v1` routes through `apiUrl()`.
- `backend/test/api-prefix.e2e-spec.ts` — boots a minimal Nest app with the
  shared prefix config and asserts the prefix and `/docs` exclusion behave
  as documented.
- `.github/workflows/build.yml` (`backend-openapi` job) — regenerates the
  OpenAPI document and the reference and fails when the committed files are
  stale.

If a backend route changes, update the frontend call site and let the
OpenAPI pipeline regenerate `docs/api.md` in the same PR.

## Generated API reference

`docs/api.md` is **generated** and must not be edited by hand:

```bash
npm --prefix backend run openapi:generate   # emit docs/openapi.json + docs/api.md
npm --prefix backend run openapi:check      # regenerate and fail if docs are stale
```

The pipeline is:

1. `backend/scripts/generate-openapi.ts` boots the Nest application without
   serving it and writes `docs/openapi.json` (`npm run openapi:emit`).
   Authentication requirements are derived from route guards and recorded as
   `x-auth` extensions.
2. `backend/scripts/generate-api-reference.ts` renders `docs/api.md` from that
   document (`npm run openapi:docs`).

Do not edit `docs/api.md` directly — change the controllers (or their
`@ApiBearerAuth()` / `@UseGuards()` decorators) and regenerate. The reference
advertises the `/api/v1` prefix via the document's `servers` entry, so the
paths inside it are listed without the prefix.
