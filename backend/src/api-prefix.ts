/**
 * Single source of truth for the backend's versioned global route prefix.
 *
 * Every route the backend serves lives under `api/<version>`, where
 * `<version>` comes from `appConfig.apiVersion` (env `API_VERSION`, default
 * `v1`). Both the runtime bootstrap (`src/main.ts`) and the e2e contract test
 * (`test/api-prefix.e2e-spec.ts`) build the prefix through this module so the
 * documented `/api/v1` shape cannot drift from the code (issue #555).
 *
 * It is deliberately dependency-free (no Nest imports) so it can be used from
 * scripts and tests without booting an application.
 */

/** Version used when `API_VERSION` is unset or blank. */
export const DEFAULT_API_VERSION = 'v1';

/** Path segment of the Swagger UI (`GET /docs`). */
export const DOCS_PATH = 'docs';

/** Path segment of the raw OpenAPI document (`GET /docs-json`). */
export const DOCS_JSON_PATH = 'docs-json';

/**
 * Route patterns excluded from the global prefix. `/docs` and `/docs-json`
 * must stay unprefixed so the interactive docs and the raw document keep
 * working. The `docs/(.*)` entry covers every asset under `/docs/*`.
 */
export const DOCS_ROUTE_EXCLUSIONS = [
  DOCS_PATH,
  DOCS_JSON_PATH,
  `${DOCS_PATH}/(.*)`,
];

/**
 * Resolves the API version from an explicit value (e.g. `appConfig.apiVersion`)
 * falling back to `API_VERSION` and then {@link DEFAULT_API_VERSION}.
 */
export function resolveApiVersion(version?: string | null): string {
  const candidate = (version ?? process.env.API_VERSION ?? '').trim();
  return candidate.length > 0 ? candidate : DEFAULT_API_VERSION;
}

/**
 * Builds the global prefix, e.g. `api/v1`.
 *
 * Accepts a value that is either a bare version (`v1`) or a fully qualified
 * prefix (`api/v1`) so misconfiguration does not produce `api/api/v1`.
 */
export function buildApiPrefix(version?: string | null): string {
  const resolved = resolveApiVersion(version);
  return resolved.startsWith('api/') ? resolved : `api/${resolved}`;
}
