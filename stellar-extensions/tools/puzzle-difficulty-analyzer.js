#!/usr/bin/env node
/**
 * Tool: Puzzle Difficulty Analyzer — issue #1004
 *
 * Analyzes puzzle difficulty based on solve rates, time-to-solve distribution,
 * and abandonment rates. Suggests difficulty reclassification.
 *
 * Usage:
 *   node puzzle-difficulty-analyzer.js --all
 *   node puzzle-difficulty-analyzer.js --puzzle-id abc123
 */

'use strict';

const args = process.argv.slice(2);
const getArg = (flag, defaultValue) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
};

const puzzleId = getArg('--puzzle-id', null);
const analyzeAll = args.includes('--all');

if (!puzzleId && !analyzeAll) {
  console.error('Usage: puzzle-difficulty-analyzer.js [--all | --puzzle-id <id>]');
  process.exit(1);
}

// ── Statistical helpers ───────────────────────────────────────────────────────

function median(sorted) {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Difficulty classifier ─────────────────────────────────────────────────────

/**
 * Suggests a difficulty label based on:
 * - solve rate  (% of attempts that result in a correct answer)
 * - median solve time (seconds)
 * - abandonment rate (% of starts with no submission)
 */
function classifyDifficulty(solveRate, medianTimeSec, abandonRate) {
  if (solveRate >= 80 && medianTimeSec <= 120) return 'easy';
  if (solveRate >= 60 && medianTimeSec <= 300) return 'medium';
  if (solveRate >= 30 && medianTimeSec <= 600) return 'hard';
  return 'expert';
}

// ── Analyzer ──────────────────────────────────────────────────────────────────

function analyzePuzzle(puzzle) {
  const { attempts, solves, abandonments, solveTimes } = puzzle;

  const solveRate = attempts > 0 ? (solves / attempts) * 100 : 0;
  const abandonRate = attempts > 0 ? (abandonments / attempts) * 100 : 0;

  const sortedTimes = [...solveTimes].sort((a, b) => a - b);
  const medianTime = median(sortedTimes);
  const p90Time = percentile(sortedTimes, 90);

  const suggestedDifficulty = classifyDifficulty(solveRate, medianTime, abandonRate);
  const needsReclassification = suggestedDifficulty !== puzzle.currentDifficulty;

  return {
    id: puzzle.id,
    title: puzzle.title,
    currentDifficulty: puzzle.currentDifficulty,
    suggestedDifficulty,
    needsReclassification,
    stats: {
      attempts,
      solves,
      abandonments,
      solveRate: solveRate.toFixed(1) + '%',
      abandonRate: abandonRate.toFixed(1) + '%',
      medianSolveTimeSec: medianTime,
      p90SolveTimeSec: p90Time,
    },
  };
}

function generateReport(results) {
  const lines = [
    '# Puzzle Difficulty Analysis Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Total puzzles analyzed: ${results.length}`,
    `Puzzles needing reclassification: ${results.filter((r) => r.needsReclassification).length}`,
    '',
    '---',
    '',
  ];

  for (const r of results) {
    lines.push(`## Puzzle: ${r.title} (\`${r.id}\`)`);
    lines.push('');
    lines.push(`- **Current difficulty**: ${r.currentDifficulty}`);
    lines.push(`- **Suggested difficulty**: ${r.suggestedDifficulty}`);
    if (r.needsReclassification) {
      lines.push(`- ⚠️  **Reclassification recommended**: ${r.currentDifficulty} → ${r.suggestedDifficulty}`);
    }
    lines.push('');
    lines.push('### Stats');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    for (const [key, val] of Object.entries(r.stats)) {
      lines.push(`| ${key} | ${val} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Sample data (replace with real API/DB calls in production) ────────────────

const SAMPLE_PUZZLES = [
  {
    id: 'puzzle-001',
    title: 'What is XLM?',
    currentDifficulty: 'medium',
    attempts: 500,
    solves: 490,
    abandonments: 5,
    solveTimes: Array.from({ length: 490 }, () => Math.floor(Math.random() * 60) + 10),
  },
  {
    id: 'puzzle-002',
    title: 'Write a Soroban contract',
    currentDifficulty: 'easy',
    attempts: 200,
    solves: 40,
    abandonments: 100,
    solveTimes: Array.from({ length: 40 }, () => Math.floor(Math.random() * 1200) + 300),
  },
  {
    id: 'puzzle-003',
    title: 'DeFi liquidity pools',
    currentDifficulty: 'hard',
    attempts: 300,
    solves: 150,
    abandonments: 50,
    solveTimes: Array.from({ length: 150 }, () => Math.floor(Math.random() * 400) + 100),
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  let puzzlesToAnalyze = SAMPLE_PUZZLES;

  if (puzzleId) {
    const found = SAMPLE_PUZZLES.find((p) => p.id === puzzleId);
    if (!found) {
      console.error(`Puzzle "${puzzleId}" not found in dataset.`);
      process.exit(1);
    }
    puzzlesToAnalyze = [found];
  }

  const results = puzzlesToAnalyze.map(analyzePuzzle);
  const report = generateReport(results);

  console.log(report);
}

main();
