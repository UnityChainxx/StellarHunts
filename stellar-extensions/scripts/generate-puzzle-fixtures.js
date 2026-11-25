#!/usr/bin/env node
/**
 * Script: Generate Puzzle Fixtures from Templates — issue #999
 *
 * Usage:
 *   node generate-puzzle-fixtures.js --count 10 --difficulty easy
 *   node generate-puzzle-fixtures.js --count 5 --difficulty hard --out ./output
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── CLI parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag, defaultValue) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
};

const count = parseInt(getArg('--count', '5'), 10);
const difficulty = getArg('--difficulty', 'medium');
const outDir = getArg('--out', path.join(__dirname, 'fixtures-output'));

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
if (!VALID_DIFFICULTIES.includes(difficulty)) {
  console.error(`Error: difficulty must be one of ${VALID_DIFFICULTIES.join(', ')}`);
  process.exit(1);
}
if (isNaN(count) || count < 1 || count > 1000) {
  console.error('Error: --count must be a number between 1 and 1000');
  process.exit(1);
}

// ── Puzzle template definitions ───────────────────────────────────────────────

const CATEGORIES = ['Blockchain Basics', 'Smart Contracts', 'Soroban', 'NFTs', 'DeFi'];

const TEMPLATES = {
  easy: [
    {
      question: 'What does XLM stand for?',
      answer: 'Stellar Lumens',
      xpReward: 10,
      hints: ['It is the native currency of Stellar', 'XLM is to Stellar what ETH is to Ethereum'],
    },
    {
      question: 'What blockchain does StellarHunts run on?',
      answer: 'Stellar',
      xpReward: 10,
      hints: ['It is a layer-1 blockchain', 'Its smart contract platform is called Soroban'],
    },
  ],
  medium: [
    {
      question: 'What programming language is used to write Soroban smart contracts?',
      answer: 'Rust',
      xpReward: 25,
      hints: ['It is a systems language known for memory safety', 'Its mascot is a crab'],
    },
    {
      question: 'What is the maximum ledger close time on Stellar?',
      answer: '5 seconds',
      xpReward: 25,
      hints: ['It is measured in seconds', 'It is much faster than Bitcoin'],
    },
  ],
  hard: [
    {
      question: 'What Soroban SDK function creates a new contract instance?',
      answer: 'env.deployer().upload_contract_wasm()',
      xpReward: 50,
      hints: ['It is part of the Env struct', 'It takes a Bytes argument'],
    },
  ],
  expert: [
    {
      question: 'What is the XDR type for a Soroban contract invocation result?',
      answer: 'InvokeHostFunctionResult',
      xpReward: 100,
      hints: ['It is defined in the Stellar XDR schema', 'It wraps ScVal'],
    },
  ],
};

// ── Generator ─────────────────────────────────────────────────────────────────

function generatePuzzle(index, difficulty) {
  const templates = TEMPLATES[difficulty];
  const template = templates[index % templates.length];
  const category = CATEGORIES[index % CATEGORIES.length];
  const id = crypto.randomUUID();

  return {
    id,
    title: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Puzzle #${index + 1}`,
    description: template.question,
    difficulty,
    category,
    answer: template.answer,
    xpReward: template.xpReward,
    hints: template.hints,
    createdAt: new Date().toISOString(),
    isActive: true,
    version: 1,
  };
}

function validateFixture(puzzle) {
  const required = ['id', 'title', 'description', 'difficulty', 'category', 'answer', 'xpReward'];
  for (const field of required) {
    if (!puzzle[field]) throw new Error(`Missing required field: ${field}`);
  }
  if (!VALID_DIFFICULTIES.includes(puzzle.difficulty)) {
    throw new Error(`Invalid difficulty: ${puzzle.difficulty}`);
  }
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const puzzles = [];
  for (let i = 0; i < count; i++) {
    const puzzle = generatePuzzle(i, difficulty);
    validateFixture(puzzle);
    puzzles.push(puzzle);
  }

  const outFile = path.join(outDir, `puzzles-${difficulty}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ puzzles, count, difficulty, generatedAt: new Date().toISOString() }, null, 2));

  console.log(`✓ Generated ${count} ${difficulty} puzzle fixture(s) → ${outFile}`);
}

main();
