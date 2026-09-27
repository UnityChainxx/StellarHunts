/**
 * Deterministic OpenAPI → Markdown renderer.
 *
 * This is the single implementation behind the committed `docs/api.md`
 * reference. It is a pure function of the OpenAPI document so it can be unit
 * tested without booting the application, and so `npm run openapi:docs`
 * reproduces byte-for-byte identical output on every machine (issue #555).
 */

/** Minimal structural view of the parts of an OpenAPI document we consume. */
export interface OpenApiOperationLike {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: Array<Record<string, string[]>>;
  'x-auth'?: string;
}

export interface OpenApiDocumentLike {
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, OpenApiOperationLike>>;
  security?: Array<Record<string, string[]>>;
}

export interface RenderOptions {
  /** Command advertised in the generated banner. */
  regenerationCommand?: string;
  /** Relative link to the hand-written route conventions. */
  conventionsPath?: string;
}

/** HTTP methods in the order they are listed inside a path. */
export const HTTP_METHOD_ORDER = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
] as const;

const DEFAULT_TAG = 'Default';

const ERROR_RESPONSES: ReadonlyArray<[string, string]> = [
  ['200', 'OK'],
  ['201', 'Created'],
  ['400', 'Bad Request (validation error)'],
  ['401', 'Unauthorized (missing or invalid JWT)'],
  ['403', 'Forbidden (insufficient role)'],
  ['404', 'Not Found'],
  ['409', 'Conflict'],
  ['429', 'Too Many Requests (rate limited)'],
  ['500', 'Internal Server Error'],
];

interface OperationRow {
  method: string;
  path: string;
  auth: string;
  summary: string;
}

/** Turns a security scheme name into the label shown in the reference. */
function prettyScheme(name: string): string {
  if (name === 'bearer' || name === 'jwt') return 'JWT';
  if (name === 'api-key' || name === 'apiKey') return 'API key';
  return name;
}

/**
 * Resolves the auth label for an operation. An explicit `x-auth` vendor
 * extension wins (the CI emitter computes it from the route's guards, which
 * the OpenAPI scanner cannot see); otherwise it is derived from the operation
 * or document `security` requirement, and defaults to `Public`.
 */
export function resolveAuthLabel(
  operation: OpenApiOperationLike,
  document: OpenApiDocumentLike,
): string {
  const explicit = operation['x-auth'];
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const security = operation.security ?? document.security;
  if (!security || security.length === 0) return 'Public';

  const schemes = new Set<string>();
  for (const requirement of security) {
    for (const name of Object.keys(requirement)) schemes.add(prettyScheme(name));
  }
  return schemes.size > 0 ? [...schemes].join(' + ') : 'Public';
}

/** Escapes a value so it cannot break out of a Markdown table cell. */
function escapeCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** GitHub-compatible heading anchor. */
export function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Collects every operation into per-tag groups, preserving the order in which
 * tags first appear in the document so the output is stable.
 */
export function collectOperations(
  document: OpenApiDocumentLike,
): Map<string, OperationRow[]> {
  const groups = new Map<string, OperationRow[]>();

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of HTTP_METHOD_ORDER) {
      const operation = pathItem[method];
      if (!operation) continue;

      const tags = operation.tags?.length ? operation.tags : [DEFAULT_TAG];
      const summary = operation.summary ?? operation.description ?? '';
      const row: OperationRow = {
        method: method.toUpperCase(),
        path,
        auth: resolveAuthLabel(operation, document),
        summary: escapeCell(summary),
      };

      for (const tag of tags) {
        const existing = groups.get(tag);
        if (existing) existing.push(row);
        else groups.set(tag, [row]);
      }
    }
  }

  return groups;
}

/** Renders the OpenAPI document as the committed Markdown reference. */
export function renderOpenApiMarkdown(
  document: OpenApiDocumentLike,
  options: RenderOptions = {},
): string {
  const regenerationCommand =
    options.regenerationCommand ?? 'npm --prefix backend run openapi:generate';
  const conventionsPath = options.conventionsPath ?? 'api-conventions.md';

  const groups = collectOperations(document);
  const serverUrl = document.servers?.[0]?.url ?? '/';

  const lines: string[] = [];
  lines.push(`# ${document.info.title} Reference`);
  lines.push('');
  lines.push('> **This file is generated — do not edit it by hand.**');
  lines.push('> It is rendered from `docs/openapi.json`, which is emitted from the');
  lines.push('> running NestJS application (see issue #555). Regenerate both with:');
  lines.push('>');
  lines.push('> ```bash');
  lines.push(`> ${regenerationCommand}`);
  lines.push('> ```');
  lines.push('>');
  lines.push(
    '> CI fails when this file or `docs/openapi.json` does not match a fresh',
  );
  lines.push('> generation.');
  lines.push('');
  lines.push(`**API version:** ${document.info.version}`);
  lines.push('');
  lines.push(`**Base URL:** \`${serverUrl}\``);
  lines.push('');
  lines.push(
    `**Conventions:** every route is served under the versioned prefix above;` +
      ` see [${conventionsPath}](${conventionsPath}) for the rules.`,
  );
  lines.push('');
  lines.push(
    '**Authentication:** operations marked `JWT` require an' +
      ' `Authorization: Bearer <jwt>` header. `JWT + Admin` additionally' +
      ' requires an admin role. `Public` routes accept anonymous requests.',
  );
  lines.push('');

  if (groups.size === 0) {
    lines.push('_No operations were found in the OpenAPI document._');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Contents');
  lines.push('');
  for (const tag of groups.keys()) {
    lines.push(`- [${tag}](#${slugifyHeading(tag)})`);
  }
  lines.push('');

  for (const [tag, rows] of groups.entries()) {
    lines.push('---');
    lines.push('');
    lines.push(`## ${tag}`);
    lines.push('');
    lines.push('| Method | Path | Auth | Description |');
    lines.push('|--------|------|------|-------------|');
    for (const row of rows) {
      lines.push(
        `| ${row.method} | \`${escapeCell(row.path)}\` | ${row.auth} | ${row.summary} |`,
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Error Responses');
  lines.push('');
  lines.push('All endpoints return standard HTTP status codes:');
  lines.push('');
  lines.push('| Status | Meaning |');
  lines.push('|--------|---------|');
  for (const [status, meaning] of ERROR_RESPONSES) {
    lines.push(`| ${status} | ${meaning} |`);
  }
  lines.push('');
  lines.push('Error bodies follow the NestJS default shape:');
  lines.push('');
  lines.push('```json');
  lines.push('{');
  lines.push('  "statusCode": 400,');
  lines.push('  "message": ["field must not be empty"],');
  lines.push('  "error": "Bad Request"');
  lines.push('}');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
