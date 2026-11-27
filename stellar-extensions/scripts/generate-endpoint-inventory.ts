#!/usr/bin/env ts-node
/**
 * generate-endpoint-inventory.ts
 *
 * Scans all NestJS controller files in the backend and produces a complete
 * inventory of API endpoints, including HTTP method, path, auth guards, and
 * the module they belong to.
 *
 * Usage:
 *   npx ts-node stellar-extensions/scripts/generate-endpoint-inventory.ts [--format json|md]
 *
 * Options:
 *   --format json   Output JSON (default)
 *   --format md     Output Markdown table
 *
 * Technical context:
 *   Follows patterns in backend/scripts/generate-openapi.ts and
 *   backend/scripts/audit-modules.ts.
 *
 * Resolves issue #1003.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EndpointEntry {
  module: string;
  controller: string;
  method: string;
  path: string;
  authGuards: string[];
  handlerName: string;
  hasOpenApiCompatible: boolean;
}

interface InventoryReport {
  generatedAt: string;
  backendSrcDir: string;
  totalEndpoints: number;
  modules: {
    [moduleName: string]: EndpointEntry[];
  };
  openApiCompatibilityCheck: {
    totalHandlers: number;
    decoratedWithApiOperation: number;
    missingApiOperation: string[];
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND_SRC = path.resolve(__dirname, '../../backend/src');

/** HTTP method decorators NestJS uses */
const HTTP_METHOD_DECORATORS = ['@Get', '@Post', '@Put', '@Patch', '@Delete', '@Head', '@Options', '@All'];

/** Auth-related guard / decorator names we look for */
const AUTH_GUARD_PATTERNS = [
  'AuthGuard',
  'JwtAuthGuard',
  'AdminGuard',
  'RolesGuard',
  'OwnershipGuard',
  '@UseGuards',
];

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect all *.controller.ts files under a directory,
 * excluding node_modules and dist.
 */
function findControllerFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findControllerFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Derive the module name from the controller's directory relative to src/.
 * e.g. backend/src/puzzle-categories/puzzle-categories.controller.ts → "puzzle-categories"
 */
function moduleNameFromPath(controllerPath: string): string {
  const rel = path.relative(BACKEND_SRC, controllerPath);
  const parts = rel.split(path.sep);
  // If the file is directly in src/ return "root"
  return parts.length > 1 ? parts[0] : 'root';
}

// ---------------------------------------------------------------------------
// AST-lite parsing (regex-based, no full TypeScript AST required)
// ---------------------------------------------------------------------------

/** Extract the string value from a decorator argument, e.g. @Get('foo/bar') → 'foo/bar' */
function extractDecoratorPath(line: string, decorator: string): string {
  const match = line.match(new RegExp(`${decorator}\\s*\\(\\s*['"\`]([^'"\`]*)['"\`]`));
  return match ? match[1] : '';
}

/** Extract guard names from @UseGuards(...) lines */
function extractGuards(block: string): string[] {
  const guards: string[] = [];
  const useGuardsMatch = block.match(/@UseGuards\s*\(([^)]+)\)/g);
  if (!useGuardsMatch) return guards;

  for (const match of useGuardsMatch) {
    const inner = match.replace(/@UseGuards\s*\(/, '').replace(/\)$/, '');
    for (const part of inner.split(',')) {
      const guardName = part.trim().replace(/AuthGuard\s*\(\s*['"`][^'"`]*['"`]\s*\)/, 'AuthGuard(jwt)');
      if (guardName) guards.push(guardName);
    }
  }
  return guards;
}

/** Check whether a handler has @ApiOperation (OpenAPI compatibility) */
function hasApiOperation(block: string): boolean {
  return /@ApiOperation\s*\(/.test(block);
}

/**
 * Parse a single controller file and return all endpoints found.
 */
function parseController(filePath: string): EndpointEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const moduleName = moduleNameFromPath(filePath);
  const controllerName = path.basename(filePath, '.controller.ts');
  const entries: EndpointEntry[] = [];

  // Extract the controller-level @Controller('prefix') path
  let controllerPrefix = '';
  const controllerMatch = content.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]/);
  if (controllerMatch) {
    controllerPrefix = '/' + controllerMatch[1].replace(/^\//, '');
  }

  // Split the file into per-method "blocks" — a block starts at a @Get/@Post
  // etc. decorator and ends just before the next one (or end of file).
  // We walk line by line and accumulate a lookahead buffer.
  let currentBlock = '';
  let currentMethodDecorator = '';
  let currentMethodPath = '';
  let currentHandlerName = '';

  const flushBlock = () => {
    if (!currentMethodDecorator) return;

    const method = currentMethodDecorator.replace('@', '').toUpperCase();
    const routePath = [controllerPrefix, currentMethodPath].join('/').replace(/\/+/g, '/');
    const guards = extractGuards(currentBlock);
    const openApi = hasApiOperation(currentBlock);

    // Extract the handler method name (the first function identifier after the last decorator block)
    const handlerMatch = currentBlock.match(/(?:async\s+)?(\w+)\s*\(/g);
    const handlerName =
      handlerMatch && handlerMatch.length > 0
        ? handlerMatch[handlerMatch.length - 1].replace(/(?:async\s+)?(\w+)\s*\(/, '$1')
        : 'unknown';

    entries.push({
      module: moduleName,
      controller: controllerName,
      method,
      path: routePath,
      authGuards: guards,
      handlerName,
      hasOpenApiCompatible: openApi,
    });

    currentBlock = '';
    currentMethodDecorator = '';
    currentMethodPath = '';
    currentHandlerName = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect start of a new HTTP method decorator
    const decoratorMatch = HTTP_METHOD_DECORATORS.find((d) => trimmed.startsWith(d));
    if (decoratorMatch) {
      // Flush the previous block
      flushBlock();
      currentMethodDecorator = decoratorMatch;
      currentMethodPath = extractDecoratorPath(trimmed, decoratorMatch.replace('@', '\\@?'));
    }

    if (currentMethodDecorator) {
      currentBlock += line + '\n';
    }
  }
  flushBlock(); // flush final block

  return entries;
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

function buildReport(entries: EndpointEntry[]): InventoryReport {
  const modules: { [name: string]: EndpointEntry[] } = {};
  for (const entry of entries) {
    if (!modules[entry.module]) modules[entry.module] = [];
    modules[entry.module].push(entry);
  }

  const missingApiOperation = entries
    .filter((e) => !e.hasOpenApiCompatible)
    .map((e) => `${e.module}/${e.controller}.controller.ts → ${e.handlerName}`);

  return {
    generatedAt: new Date().toISOString(),
    backendSrcDir: BACKEND_SRC,
    totalEndpoints: entries.length,
    modules,
    openApiCompatibilityCheck: {
      totalHandlers: entries.length,
      decoratedWithApiOperation: entries.filter((e) => e.hasOpenApiCompatible).length,
      missingApiOperation,
    },
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatJson(report: InventoryReport): string {
  return JSON.stringify(report, null, 2);
}

function formatMarkdown(report: InventoryReport): string {
  const lines: string[] = [
    '# API Endpoint Inventory',
    '',
    `Generated: ${report.generatedAt}`,
    `Total endpoints: **${report.totalEndpoints}**`,
    '',
    '---',
    '',
  ];

  for (const [moduleName, endpoints] of Object.entries(report.modules)) {
    lines.push(`## Module: \`${moduleName}\``);
    lines.push('');
    lines.push('| Method | Path | Auth Guards | Handler | OpenAPI |');
    lines.push('|--------|------|-------------|---------|---------|');

    for (const ep of endpoints) {
      const guards = ep.authGuards.length > 0 ? ep.authGuards.join(', ') : '—';
      const openApi = ep.hasOpenApiCompatible ? '✅' : '❌';
      lines.push(`| ${ep.method} | \`${ep.path}\` | ${guards} | \`${ep.handlerName}\` | ${openApi} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## OpenAPI Compatibility Check');
  lines.push('');
  lines.push(
    `${report.openApiCompatibilityCheck.decoratedWithApiOperation} / ${report.openApiCompatibilityCheck.totalHandlers} handlers have \`@ApiOperation\`.`,
  );

  if (report.openApiCompatibilityCheck.missingApiOperation.length > 0) {
    lines.push('');
    lines.push('**Missing `@ApiOperation`:**');
    for (const item of report.openApiCompatibilityCheck.missingApiOperation) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const formatFlagIndex = args.indexOf('--format');
  const format: 'json' | 'md' =
    formatFlagIndex !== -1 && args[formatFlagIndex + 1] === 'md' ? 'md' : 'json';

  if (!fs.existsSync(BACKEND_SRC)) {
    process.stderr.write(
      `Error: backend src directory not found at ${BACKEND_SRC}\n` +
        'Run this script from the repository root.\n',
    );
    process.exit(1);
  }

  const controllerFiles = findControllerFiles(BACKEND_SRC);
  process.stderr.write(`Found ${controllerFiles.length} controller file(s).\n`);

  const allEntries: EndpointEntry[] = [];
  for (const file of controllerFiles) {
    const entries = parseController(file);
    allEntries.push(...entries);
  }

  const report = buildReport(allEntries);
  const output = format === 'md' ? formatMarkdown(report) : formatJson(report);

  process.stdout.write(output + '\n');
}

main();
