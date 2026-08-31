import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────
// Guard against reintroducing TestComponent (issue #337)
//
// `frontend/components/TestComponent.jsx` used to fetch from
// `https://jsonplaceholder.typicode.com` inside a client component and was
// wired into the production tree. It was removed because it had no purpose
// in the shipped app and leaked an external test dependency into the client
// bundle. These assertions keep the external test request out of the
// non-test source tree so it cannot silently come back.
// ─────────────────────────────────────────────────────────────────────────

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // Skip node_modules, build artifacts, and hidden dirs.
    if (['node_modules', '.next', '.turbo'].includes(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;
    // Guard tests themselves may reference these strings, so don't descend
    // into tests/ (which would read this very file) or test.fixtures.
    if (entry.name === 'tests') continue;
    if (entry.isDirectory()) {
      results = results.concat(walk(full));
    } else if (/(\.(js|jsx|ts|tsx))$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe('TestComponent removal guards', () => {
  it('does not contain a jsonplaceholder reference in production source', () => {
    const tainted = walk(path.join(__dirname, '..'))
      .filter((f) => fs.readFileSync(f, 'utf8').includes('jsonplaceholder'))
      .map((f) => path.relative(path.join(__dirname, '..'), f));
    expect(tainted).toEqual([]);
  });

  it('does not re-add frontend/components/TestComponent.jsx', () => {
    const target = path.join(__dirname, '..', 'components', 'TestComponent.jsx');
    expect(fs.existsSync(target)).toBe(false);
  });
});