#!/usr/bin/env node
/**
 * Script: NFT Metadata Generator — issue #1002
 *
 * Generates NFT metadata JSON and SVG images for puzzle achievement NFTs.
 *
 * Usage:
 *   node generate-nft-metadata.js --type completion --rarity common
 *   node generate-nft-metadata.js --type mastery --rarity legendary --out ./nft-output
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

const nftType = getArg('--type', 'completion');
const rarity = getArg('--rarity', 'common');
const outDir = getArg('--out', path.join(__dirname, 'nft-output'));

const VALID_TYPES = ['completion', 'mastery', 'streak', 'referral', 'seasonal'];
const VALID_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

if (!VALID_TYPES.includes(nftType)) {
  console.error(`Error: type must be one of ${VALID_TYPES.join(', ')}`);
  process.exit(1);
}
if (!VALID_RARITIES.includes(rarity)) {
  console.error(`Error: rarity must be one of ${VALID_RARITIES.join(', ')}`);
  process.exit(1);
}

// ── Rarity configuration ──────────────────────────────────────────────────────

const RARITY_CONFIG = {
  common:    { color: '#94a3b8', glow: '#64748b', stars: 1 },
  uncommon:  { color: '#4ade80', glow: '#16a34a', stars: 2 },
  rare:      { color: '#60a5fa', glow: '#2563eb', stars: 3 },
  epic:      { color: '#a78bfa', glow: '#7c3aed', stars: 4 },
  legendary: { color: '#fbbf24', glow: '#d97706', stars: 5 },
};

const TYPE_CONFIG = {
  completion: { icon: '🏆', description: 'Awarded for completing a puzzle challenge' },
  mastery:    { icon: '⭐', description: 'Awarded for mastering all puzzles in a category' },
  streak:     { icon: '🔥', description: 'Awarded for maintaining a daily puzzle streak' },
  referral:   { icon: '🤝', description: 'Awarded for successful referrals' },
  seasonal:   { icon: '🌟', description: 'Limited seasonal achievement badge' },
};

// ── SVG generator ─────────────────────────────────────────────────────────────

function generateSVG(nftType, rarity, tokenId) {
  const rc = RARITY_CONFIG[rarity];
  const tc = TYPE_CONFIG[nftType];

  const stars = Array.from({ length: rc.stars }, (_, i) =>
    `<text x="${15 + i * 18}" y="135" font-size="14" fill="${rc.color}">★</text>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="300" height="300" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f0a1e"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="300" height="300" fill="url(#bg)" rx="16"/>

  <!-- Border -->
  <rect x="4" y="4" width="292" height="292" fill="none" stroke="${rc.color}" stroke-width="2" rx="14" opacity="0.7"/>

  <!-- Glow circle -->
  <circle cx="150" cy="110" r="60" fill="${rc.glow}" opacity="0.15" filter="url(#glow)"/>

  <!-- Icon background -->
  <circle cx="150" cy="110" r="45" fill="${rc.color}" opacity="0.2"/>
  <circle cx="150" cy="110" r="40" fill="none" stroke="${rc.color}" stroke-width="1.5"/>

  <!-- NFT Type icon (emoji rendered as text) -->
  <text x="150" y="125" text-anchor="middle" font-size="40">${tc.icon}</text>

  <!-- Stars (rarity) -->
  <g transform="translate(${150 - (rc.stars * 18) / 2}, 0)">${stars}</g>

  <!-- Title -->
  <text x="150" y="170" text-anchor="middle" font-family="monospace" font-size="13" fill="${rc.color}" font-weight="bold">
    ${nftType.toUpperCase()} BADGE
  </text>

  <!-- Rarity label -->
  <text x="150" y="190" text-anchor="middle" font-family="monospace" font-size="11" fill="${rc.color}" opacity="0.8">
    ${rarity.toUpperCase()}
  </text>

  <!-- Token ID -->
  <text x="150" y="260" text-anchor="middle" font-family="monospace" font-size="9" fill="#64748b">
    #${tokenId.substring(0, 8).toUpperCase()}
  </text>

  <!-- StellarHunts branding -->
  <text x="150" y="280" text-anchor="middle" font-family="monospace" font-size="9" fill="#334155">
    StellarHunts
  </text>
</svg>`;
}

// ── Metadata generator ────────────────────────────────────────────────────────

function generateMetadata(nftType, rarity, tokenId, svgFileName) {
  const tc = TYPE_CONFIG[nftType];
  const rc = RARITY_CONFIG[rarity];

  return {
    name: `StellarHunts ${nftType.charAt(0).toUpperCase() + nftType.slice(1)} Badge`,
    description: tc.description,
    image: `./${svgFileName}`,
    external_url: 'https://stellarhunts.io',
    attributes: [
      { trait_type: 'Type', value: nftType },
      { trait_type: 'Rarity', value: rarity },
      { trait_type: 'Stars', value: rc.stars },
      { trait_type: 'Network', value: 'Stellar' },
      { trait_type: 'Standard', value: 'SEP-39' },
    ],
    token_id: tokenId,
    created_at: new Date().toISOString(),
  };
}

function validateMetadata(metadata) {
  const required = ['name', 'description', 'image', 'attributes', 'token_id'];
  for (const field of required) {
    if (!metadata[field]) throw new Error(`Missing required metadata field: ${field}`);
  }
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tokenId = crypto.randomUUID();
  const svgFileName = `${nftType}-${rarity}-${tokenId.substring(0, 8)}.svg`;
  const metaFileName = `${nftType}-${rarity}-${tokenId.substring(0, 8)}.json`;

  const svg = generateSVG(nftType, rarity, tokenId);
  const metadata = generateMetadata(nftType, rarity, tokenId, svgFileName);

  validateMetadata(metadata);

  fs.writeFileSync(path.join(outDir, svgFileName), svg);
  fs.writeFileSync(path.join(outDir, metaFileName), JSON.stringify(metadata, null, 2));

  console.log(`✓ NFT image   → ${path.join(outDir, svgFileName)}`);
  console.log(`✓ NFT metadata → ${path.join(outDir, metaFileName)}`);
}

main();
