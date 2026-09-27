import * as fs from 'fs';
import * as path from 'path';

/**
 * Entity directories that are intentionally not registered with the
 * application connection.
 *
 * `src/game-mechanic` is an unwired, standalone feature prototype: it has no
 * module and nothing in the application imports it. Its `User` /
 * `PuzzleSubmission` / `Puzzle` classes also collide (by table name) with the
 * live entities of the same name, so registering them would break the
 * connection. It is excluded from the registration audit until it is either
 * wired up behind its own module or deleted.
 */
export const LEGACY_ENTITY_DIRS = ['game-mechanic'];

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, acc);
    } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Returns the entity classes declared by every `*.entity.ts` file under
 * `srcDir`, excluding `excludeDirs`.
 */
export function listEntityClasses(
  srcDir: string,
  excludeDirs: string[] = LEGACY_ENTITY_DIRS,
): { name: string; file: string }[] {
  const entities: { name: string; file: string }[] = [];

  for (const file of walkFiles(srcDir)) {
    if (!file.endsWith('.entity.ts')) continue;
    if (excludeDirs.some((dir) => file.includes(`${path.sep}${dir}${path.sep}`))) {
      continue;
    }

    const match = fs
      .readFileSync(file, 'utf-8')
      .match(/export\s+class\s+(\w+)/);
    if (match) entities.push({ name: match[1], file });
  }

  return entities;
}

/**
 * Collects the entity class names referenced inside any
 * `TypeOrmModule.forFeature([...])` call under `srcDir`.
 */
export function collectRegisteredEntities(srcDir: string): Set<string> {
  const registered = new Set<string>();

  for (const file of walkFiles(srcDir)) {
    const content = fs.readFileSync(file, 'utf-8');
    const forFeature = /forFeature\s*\(\s*\[([\s\S]*?)\]/g;
    let match: RegExpExecArray | null;
    while ((match = forFeature.exec(content)) !== null) {
      for (const token of match[1].matchAll(/\b([A-Z]\w+)\b/g)) {
        registered.add(token[1]);
      }
    }
  }

  return registered;
}

/**
 * Returns every entity class that is not registered by a
 * `TypeOrmModule.forFeature` call anywhere under `srcDir`.
 */
export function findUnregisteredEntities(
  srcDir: string,
  excludeDirs: string[] = LEGACY_ENTITY_DIRS,
): { name: string; file: string }[] {
  const registered = collectRegisteredEntities(srcDir);
  return listEntityClasses(srcDir, excludeDirs).filter(
    (entity) => !registered.has(entity.name),
  );
}
