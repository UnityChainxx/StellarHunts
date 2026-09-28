import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────
// Single QueryClient guards (issue #549)
//
// `frontend/lib/queryClient.js` exported a module-level `new QueryClient()`
// that nothing imported, while `frontend/lib/Providers.js` built the client
// the application actually uses. Two clients meant two independent caches,
// one of them dead, and the dead file was a near-duplicate a contributor
// could follow by mistake when adding query configuration. It has been
// deleted; these assertions keep it gone and keep the construction site
// singular.
//
// Two properties are worth protecting beyond the literal issue:
//
// 1. The surviving client is created inside the `Providers` component with
//    `useState`, not at module scope. This is a Next.js 14 App Router app,
//    and a module-level QueryClient in a client component is shared between
//    server renders, leaking one visitor's cache into another's response.
//    "Move the client into a module" is therefore not an acceptable way to
//    reintroduce a single source, and the module-scope check rejects it.
//
// 2. Consumers must read the client from context. A hook or service that
//    built its own QueryClient would create a second cache that never sees
//    the invalidations the rest of the app performs, which is the same bug
//    in a new place.
//
// These are static checks on purpose. `lib/Providers.js` is a `.js` file that
// contains JSX, and the repository's vitest/oxc transform does not enable JSX
// for `.js`, so no test can import it today; every existing render test
// imports a `.jsx` or `.tsx` module. Renaming the file is out of scope here.
// ─────────────────────────────────────────────────────────────────────────

const FRONTEND_ROOT = path.join(__dirname, '..');
const PROVIDERS = path.join(FRONTEND_ROOT, 'lib', 'Providers.js');
const DEAD_MODULE = path.join(FRONTEND_ROOT, 'lib', 'queryClient.js');
const LAYOUT = path.join(FRONTEND_ROOT, 'app', 'layout.js');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (['node_modules', '.next', '.turbo'].includes(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;
    // Skip the guard tests themselves, which necessarily name the strings
    // they search for, and skip tests/ generally.
    if (entry.name === 'tests') continue;
    if (entry.isDirectory()) {
      results = results.concat(walk(full));
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const productionFiles = walk(FRONTEND_ROOT);
const relative = (file) => path.relative(FRONTEND_ROOT, file);
const read = (file) => fs.readFileSync(file, 'utf8');

describe('single QueryClient instance', () => {
  it('no longer ships the unreferenced queryClient module', () => {
    expect(fs.existsSync(DEAD_MODULE)).toBe(false);
  });

  it('constructs a QueryClient in exactly one production file', () => {
    const sites = productionFiles
      .filter((file) => /new QueryClient\s*\(/.test(read(file)))
      .map(relative)
      .sort();
    expect(sites).toEqual(['lib/Providers.js']);
  });

  it('constructs the client inside the component, not at module scope', () => {
    const providers = read(PROVIDERS);
    const construction = /new QueryClient\s*\(/.exec(providers);
    expect(construction).not.toBeNull();

    // Everything above `export default function Providers` is module scope.
    // The construction must not appear there, or the cache would be shared
    // across server renders.
    const componentStart = providers.search(/export default function Providers/);
    expect(componentStart).toBeGreaterThan(-1);
    expect(construction.index).toBeGreaterThan(componentStart);
  });

  it('does not re-export a QueryClient singleton from any module', () => {
    const offenders = productionFiles
      .filter((file) =>
        /export\s+(const|let|var)\s+\w*[qQ]uery[Cc]lient\s*=/.test(read(file)),
      )
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it('is not imported from anywhere', () => {
    const importers = productionFiles
      .filter((file) => /lib\/queryClient|from\s+['"][^'"]*queryClient['"]/.test(read(file)))
      .map(relative);
    expect(importers).toEqual([]);
  });
});

describe('consumers read the client from context', () => {
  // Every production file that touches the query cache must reach it through
  // the provider, never by constructing a client of its own.
  const consumers = productionFiles
    .filter((file) => /invalidateQueries|useQueryClient|QueryClientProvider|getQueryData|setQueryData/.test(read(file)))
    .map(relative)
    .sort();

  it('finds the known consumers', () => {
    expect(consumers).toContain('hooks/useApiQuery.js');
    expect(consumers).toContain('hooks/useApiMutation.js');
    expect(consumers).toContain('services/puzzleReviewHooks.js');
  });

  it('gives every consumer the client via useQueryClient, except the provider itself', () => {
    const offenders = consumers
      .filter((file) => file !== 'lib/Providers.js')
      .filter((file) => !/useQueryClient\s*\(/.test(read(path.join(FRONTEND_ROOT, file))))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe('app wiring', () => {
  it('mounts Providers from the app layout', () => {
    expect(read(LAYOUT)).toMatch(/import\s+Providers\s+from\s+['"]@\/lib\/Providers['"]/);
  });

  it('provides the client to the tree', () => {
    const providers = read(PROVIDERS);
    expect(providers).toMatch(/<QueryClientProvider\s+client=\{queryClient\}>/);
  });
});
