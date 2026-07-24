#!/usr/bin/env ts-node
/**
 * bench-mint.ts
 * -------------
 * Probes `POST /nft-claim/claim` with a configurable number of requests and
 * a configurable level of concurrency, then reports end-to-end latency as
 * p50 / p95 / p99 / min / max / mean.
 *
 * The 95th-percentile latency from this script is what we want to keep under
 * 2s for StellarHunt's NFT mint path (#108). Run it in CI weekly against a
 * staging environment so we can detect tail-latency regressions before they
 * hit users.
 *
 * Usage:
 *   npx ts-node scripts/bench-mint.ts \
 *       --url http://localhost:4000 \
 *       --requests 500 \
 *       --concurrency 25 \
 *       --json
 */

import axios, { AxiosInstance } from 'axios';

interface CliArgs {
  url: string;
  path: string;
  requests: number;
  concurrency: number;
  warmup: number;
  timeoutMs: number;
  json: boolean;
}

interface RequestResult {
  status: number;
  elapsedMs: number;
  error?: string;
}

interface Stats {
  url: string;
  path: string;
  total: number;
  succeeded: number;
  failed: number;
  concurrency: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  errorBreakdown: Record<string, number>;
  ranAt: string;
}

// -------- arg parsing --------
function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i++;
  }

  return {
    url: String(args.url ?? process.env.BENCH_URL ?? 'http://localhost:4000'),
    path: String(args.path ?? '/nft-claim/claim'),
    requests: Number(args.requests ?? process.env.BENCH_REQUESTS ?? 200),
    concurrency: Number(args.concurrency ?? process.env.BENCH_CONCURRENCY ?? 10),
    warmup: Number(args.warmup ?? process.env.BENCH_WARMUP ?? 5),
    timeoutMs: Number(args.timeout ?? process.env.BENCH_TIMEOUT_MS ?? 30_000),
    json: args.json === true || process.env.BENCH_JSON === '1',
  };
}

// -------- helpers --------
const percentile = (sortedValues: number[], p: number): number => {
  if (sortedValues.length === 0) return 0;
  const rank = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedValues[lower];
  const weight = rank - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
};

const fmtMs = (n: number): string => `${n.toFixed(1)}ms`;

async function fireOne(
  client: AxiosInstance,
  path: string,
): Promise<RequestResult> {
  const start = process.hrtime.bigint();
  try {
    const body = {
      userId: `bench-user-${Math.floor(Math.random() * 1e6)}`,
      nftId: `bench-nft-${Math.floor(Math.random() * 1e6)}`,
    };
    const res = await client.post(path, body, { validateStatus: () => true });
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    return { status: res.status, elapsedMs };
  } catch (err) {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    return {
      status: 0,
      elapsedMs,
      error: (err as Error).message,
    };
  }
}

async function runWorker(
  workerId: number,
  args: CliArgs,
  results: RequestResult[],
): Promise<void> {
  const client = axios.create({
    baseURL: args.url,
    timeout: args.timeoutMs,
    headers: { 'Content-Type': 'application/json' },
  });

  // Each worker drains a share of the request budget. We do this so that
  // runWorker doesn't keep firing forever — there is exactly `requests`
  // total operations across all workers.
  for (let i = workerId; i < args.requests; i += args.concurrency) {
    // eslint-disable-next-line no-await-in-loop
    const result = await fireOne(client, args.path);
    results[i] = result;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.requests <= 0 || args.concurrency <= 0) {
    throw new Error('requests and concurrency must be positive integers');
  }

  // Warmup — discard. Helps eliminate JIT / connection-pool cold-start skew
  // so p95/p99 reflect steady-state behaviour rather than the first request.
  if (args.warmup > 0) {
    const client = axios.create({
      baseURL: args.url,
      timeout: args.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
    });
    for (let i = 0; i < args.warmup; i++) {
      // eslint-disable-next-line no-await-in-loop
      await fireOne(client, args.path);
    }
  }

  const results: RequestResult[] = new Array(args.requests);

  const startedAt = Date.now();
  const workers = Array.from({ length: args.concurrency }, (_, idx) =>
    runWorker(idx, args, results),
  );
  await Promise.all(workers);
  const wallClockMs = Date.now() - startedAt;

  const samples = results
    .filter((r): r is RequestResult => Boolean(r))
    .map((r) => r.elapsedMs)
    .sort((a, b) => a - b);

  const succeeded = results.filter((r) => r && r.status >= 200 && r.status < 300).length;
  const failed = results.length - succeeded;
  const errorBreakdown: Record<string, number> = {};
  for (const r of results) {
    if (!r || (r.status >= 200 && r.status < 300)) continue;
    const key = r.status ? `HTTP ${r.status}` : r.error ?? 'unknown';
    errorBreakdown[key] = (errorBreakdown[key] ?? 0) + 1;
  }

  const stats: Stats = {
    url: args.url,
    path: args.path,
    total: results.length,
    succeeded,
    failed,
    concurrency: args.concurrency,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    min: samples.length ? samples[0] : 0,
    max: samples.length ? samples[samples.length - 1] : 0,
    mean: samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0,
    errorBreakdown,
    ranAt: new Date().toISOString(),
  };

  if (args.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ...stats, wallClockMs }, null, 2));
    return;
  }

  // Markdown-style table — easy to read in CI logs / weekly reports (#108).
  const lines = [
    '# NFT claim latency benchmark (#108)',
    '',
    `- URL:           ${stats.url}${stats.path}`,
    `- Requests:      ${stats.total} (warmup ${args.warmup} discarded)`,
    `- Concurrency:   ${stats.concurrency}`,
    `- Succeeded:     ${stats.succeeded}  /  Failed: ${stats.failed}`,
    `- Wall clock:    ${(wallClockMs / 1000).toFixed(2)}s`,
    '',
    '| metric | value |',
    '|--------|-------|',
    `| p50    | ${fmtMs(stats.p50)} |`,
    `| p95    | ${fmtMs(stats.p95)} |`,
    `| p99    | ${fmtMs(stats.p99)} |`,
    `| min    | ${fmtMs(stats.min)} |`,
    `| max    | ${fmtMs(stats.max)} |`,
    `| mean   | ${fmtMs(stats.mean)} |`,
    '',
    '## Errors',
    '',
  ];
  if (Object.keys(stats.errorBreakdown).length === 0) {
    lines.push('_none_');
  } else {
    lines.push('| error | count |');
    lines.push('|-------|-------|');
    for (const [key, count] of Object.entries(stats.errorBreakdown)) {
      lines.push(`| ${key} | ${count} |`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('bench-mint failed:', err);
  process.exitCode = 1;
});
