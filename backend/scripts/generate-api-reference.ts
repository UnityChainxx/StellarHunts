/**
 * Renders the committed Markdown reference (`docs/api.md`) from the emitted
 * OpenAPI document (`docs/openapi.json`).
 *
 * Run via `npm --prefix backend run openapi:docs` (or `openapi:generate` to
 * emit and render in one step). See issue #555.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  renderOpenApiMarkdown,
  type OpenApiDocumentLike,
} from '../src/openapi/render-markdown';

const INPUT_PATH = resolve(__dirname, '../../docs/openapi.json');
const OUTPUT_PATH = resolve(__dirname, '../../docs/api.md');

function main(): void {
  const document = JSON.parse(readFileSync(INPUT_PATH, 'utf8')) as OpenApiDocumentLike;
  const markdown = renderOpenApiMarkdown(document);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, markdown, 'utf8');
  process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `Failed to render the API reference: ${(error as Error)?.message ?? error}\n` +
      'Run `npm --prefix backend run openapi:emit` first.\n',
  );
  process.exitCode = 1;
}
