/**
 * Audit script to verify all backend modules are properly imported in AppModule.
 * Run: npx ts-node scripts/audit-modules.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../src');
const APP_MODULE = path.join(SRC_DIR, 'app.module.ts');

function getModuleDirectories(): string[] {
  return fs
    .readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => {
      const moduleFile = path.join(SRC_DIR, name, `${name}.module.ts`);
      return fs.existsSync(moduleFile);
    });
}

function getImportedModules(): string[] {
  const content = fs.readFileSync(APP_MODULE, 'utf-8');
  const importRegex = /import\s*\{[^}]*\}\s*from\s*['"]\.\/([^/]+)\//g;
  const modules: string[] = [];
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    modules.push(match[1]);
  }
  return modules;
}

function main() {
  const moduleDirs = getModuleDirectories();
  const imported = getImportedModules();

  const missing = moduleDirs.filter((dir) => !imported.includes(dir));
  const orphaned = imported.filter((dir) => !moduleDirs.includes(dir));

  if (missing.length === 0 && orphaned.length === 0) {
    console.log('All modules are properly imported in AppModule.');
    process.exit(0);
  }

  if (missing.length > 0) {
    console.log('Modules with .module.ts files but NOT imported in AppModule:');
    missing.forEach((m) => console.log(`  - ${m}`));
  }

  if (orphaned.length > 0) {
    console.log('\nModules imported in AppModule but missing directory:');
    orphaned.forEach((m) => console.log(`  - ${m}`));
  }

  process.exit(1);
}

main();
