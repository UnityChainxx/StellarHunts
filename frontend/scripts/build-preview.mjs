#!/usr/bin/env node
/**
 * Static preview build for PR preview deployments (issue #769).
 *
 * GitHub Pages only serves static files, so the preview build:
 *   1. sets the export-mode environment variables consumed by
 *      `next.config.mjs` (`NEXT_OUTPUT=export`, `NEXT_PUBLIC_BASE_PATH`),
 *   2. temporarily relocates the routes that cannot be statically exported —
 *      the server-only `app/api` handlers (a preview talks to the backend
 *      directly via `NEXT_PUBLIC_API_URL`) and the `app/ref/[referralId]`
 *      client page with user-generated dynamic params ("use client" pages
 *      cannot declare generateStaticParams; the route simply 404s in the
 *      preview),
 *   3. runs `next build`, which emits the static site into `out/`,
 *   4. restores everything even when the build fails.
 *
 * Usage:
 *   NEXT_PUBLIC_BASE_PATH=/previews/pr-123 node scripts/build-preview.mjs
 *
 * Testnet configuration (issue #769 acceptance criteria) is injected by the
 * caller: NEXT_PUBLIC_STELLAR_NETWORK=testnet and NEXT_PUBLIC_API_URL pointing
 * at the testnet backend.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Routes relocated for the static export (see the header comment). */
const RELOCATED_ROUTES = [path.join('app', 'api'), path.join('app', 'ref')];
const stashDir = path.join(frontendRoot, '.preview-stash');

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
process.env.NEXT_OUTPUT = 'export';
process.env.NEXT_PUBLIC_BASE_PATH = basePath;

const restored = () => !existsSync(stashDir);

function stashRoutes() {
  if (existsSync(stashDir)) {
    // A previous failed run left the stash behind — restore it first.
    restoreRoutes();
  }
  for (const rel of RELOCATED_ROUTES) {
    const dir = path.join(frontendRoot, rel);
    if (!existsSync(dir)) continue;
    cpSync(dir, path.join(stashDir, rel), { recursive: true });
    rmSync(dir, { recursive: true, force: true });
    console.log(`[preview-build] relocated ${rel} for the static export`);
  }
}

function restoreRoutes() {
  for (const rel of RELOCATED_ROUTES) {
    const dir = path.join(frontendRoot, rel);
    const stashed = path.join(stashDir, rel);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
    if (existsSync(stashed)) {
      cpSync(stashed, dir, { recursive: true });
      rmSync(stashed, { recursive: true, force: true });
    }
    console.log(`[preview-build] restored ${rel}`);
  }
}

let exitCode = 0;
try {
  stashRoutes();
  const { spawnSync } = await import('node:child_process');
  const isWindows = process.platform === 'win32';
  const nextBin = path.join(frontendRoot, 'node_modules', '.bin', isWindows ? 'next.cmd' : 'next');
  const result = spawnSync(nextBin, ['build'], {
    stdio: 'inherit',
    env: process.env,
    cwd: frontendRoot,
    shell: isWindows,
  });
  exitCode = result.status ?? 1;
  if (exitCode !== 0) {
    console.error(`[preview-build] next build failed with exit code ${exitCode}`);
  }
} finally {
  if (!restored()) restoreRoutes();
}

if (exitCode === 0 && !existsSync(path.join(frontendRoot, 'out', 'index.html'))) {
  console.error('[preview-build] export completed but out/index.html is missing');
  exitCode = 1;
}

process.exit(exitCode);
