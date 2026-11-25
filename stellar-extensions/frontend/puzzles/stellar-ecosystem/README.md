# Stellar Ecosystem Puzzle Set

This directory contains ten **medium** puzzles that cover how StellarHunts
interacts with the wider Stellar ecosystem: anchors and their SEPs, path
payments and multi-hop conversion, SEP-10 authentication, SEP-38 quotes, and
Soroban integration through RPC and the Stellar Asset Contract.

The set follows `schemas/puzzle-template.schema.json` for every shared field.
The shared schema does not define `testCases`, so this directory ships
[`puzzle-template.schema.json`](./puzzle-template.schema.json), which extends
the shared template with a required `testCases` collection of 3–5 entries. The
shared schema itself is not modified.

## Puzzle index

| # | File | Topic | Correct answer |
| - | ---- | ----- | -------------- |
| 1 | `eco-anchor-role.json` | Anchor role | On/off ramp between Stellar assets and off-chain value |
| 2 | `eco-anchor-hosted-transfer.json` | Hosted transfers | `SEP-24` |
| 3 | `eco-path-payment-strict-send.json` | Path payment modes | `Path Payment Strict Send` |
| 4 | `eco-path-payment-hops.json` | Multi-hop conversion | `3` conversions (USDC → XLM → BTC → EURC) |
| 5 | `eco-sep10-challenge.json` | SEP-10 challenge | Sign the challenge and return the signed XDR |
| 6 | `eco-sep10-token.json` | SEP-10 session | `JWT` |
| 7 | `eco-sep38-purpose.json` | SEP-38 scope | Quote API for off-chain and on-chain assets |
| 8 | `eco-sep38-firm-quote.json` | Firm quotes | `expires_at` |
| 9 | `eco-soroban-rpc.json` | Soroban access | `Soroban RPC` |
| 10 | `eco-soroban-sac.json` | Asset bridge | Built-in contract exposing an issued asset to smart contracts |

## Coverage

- **Anchors (1–2):** what an anchor does, and how SEP-24 differs from the
  programmatic SEP-6 flow.
- **Path payments (3–4):** strict send versus strict receive, and counting the
  conversions described by an intermediate asset path.
- **SEP-10 (5–6):** the challenge/response exchange and the JWT that follows it.
- **SEP-38 (7–8):** what the quote API standardizes and how a firm quote
  expires.
- **Soroban (9–10):** the RPC surface used to invoke contracts and the Stellar
  Asset Contract that exposes issued assets to them.

Every puzzle includes a hint with a link to the relevant Stellar developer
documentation, a points reward, and 3–5 test cases.

## Test case format

Each puzzle carries 3–5 `testCases` entries:

```json
{
  "title": "SEP-24 is the hosted flow",
  "validationMode": "exact_match",
  "input": { "selectedIndex": 2 },
  "expectedOutput": { "correct": true }
}
```

`input` describes a submission (`answer` for text/number/code puzzles,
`selectedIndex` for multiple choice) and `expectedOutput` describes the
expected grading result. The accepted `validationMode` values are
`exact_match`, `numeric_tolerance`, `regex`, and `custom`.

## Validating

From the repository root:

```bash
node stellar-extensions/scripts/validate-puzzle-content.js \
  --dir stellar-extensions/frontend/puzzles/stellar-ecosystem \
  --schema stellar-extensions/frontend/puzzles/stellar-ecosystem/puzzle-template.schema.json
```

The validator checks the shared schema requirements, difficulty values,
duplicate puzzle ids across files, and test case structure, and reports each
issue with its file and line number. It exits with status 1 when any issue is
found.

## Documentation references

- Anchors — https://developers.stellar.org/docs/learn/fundamentals/anchors
- Anchor integration / SEP overview — https://developers.stellar.org/docs/category/anchor-integration
- Path payments — https://developers.stellar.org/docs/build/guides/transactions/path-payments
- SEP-10 authentication — https://developers.stellar.org/docs/platforms/anchor-platform/sep-guide/sep10
- SEP-38 quotes — https://developers.stellar.org/docs/build/apps/wallet/sep38
- Soroban overview — https://developers.stellar.org/docs/build/smart-contracts/overview
- Stellar Asset Contract — https://developers.stellar.org/docs/tokens/stellar-asset-contract
