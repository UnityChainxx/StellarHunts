# Stellar Extensions — Tests

Tests for features contributed under `stellar-extensions/`.

## Game store (`useGameStore`)

`useGameStore.test.js` covers the extension game store
(`stellar-extensions/frontend/store/useGameStore.js`).

The core `frontend/store/useGameStore.js` is frozen by the extension isolation
rule and has no `setPuzzle`, `updateProgress`, or streak actions. The extension
store implements that documented surface with the same durable-progress model
and its own persist key (`stellar-extensions-game-store:v1`), so it can be
tested and adopted without modifying core frontend state.

Run it from this directory:

```bash
npm test
```

Or from the repository root:

```bash
cd stellar-extensions && ../node_modules/.bin/vitest run --config vitest.config.mjs
```

The suite uses Vitest's `node` environment and a localStorage-compatible
in-memory harness (`tests/setup.js`), so it needs no browser or extra
dependencies.

### Coverage

| Acceptance criterion | Test group |
| -------------------- | ---------- |
| Tests initial state | `useGameStore initial state` |
| Tests set puzzle action | `setPuzzle action` |
| Tests update progress action | `updateProgress action` |
| Tests complete puzzle action | `completePuzzle action` |
| Tests persistence to localStorage | `persistence to localStorage` |
| Tests state reset | `resetProgress action` |
| Tests streak tracking in store | `streak tracking` |

The persistence tests cover both the write side (only durable fields under the
extension key, correct `version`) and the read side (a fresh store rehydrates
the same progress and streak).

## Referral system

`referral/referral.integration.test.ts` wires the real backend referral
services (`backend/src/referral/`) together with in-memory repositories and
covers the full flow:

- referral code / link generation
- attribution on registration
- reward distribution when the referee completes their first puzzle
- multi-level (`A -> B -> C`) referral rewards
- self-referral and duplicate attribution prevention
- referral statistics and pending/processed bonus totals

Run it from the repository root (Jest and ts-jest are already installed at the
root workspace):

```bash
npx jest --config stellar-extensions/tests/jest.config.js
```

## Wallet authentication

`wallet/wallet-auth.integration.test.ts` wires the real backend wallet services
(`backend/src/wallet/wallet.service.ts` and `wallet-auth.service.ts`) together
with in-memory repositories and real ed25519 keypairs. It covers the whole
challenge/signature/session flow without a database or a Nest application:

- challenge generation and validation (including TTL clamping and invalid
  addresses)
- signature verification with valid, wrong-key, tampered and malformed
  signatures
- replay prevention, including the compare-and-set race on nonce consumption
- wallet-session token creation, expiry and `lastSeenAt` refresh
- wallet disconnection via single-session logout, wallet-wide revocation and
  expired-session pruning

Run it from the repository root:

```bash
npx jest --config stellar-extensions/tests/jest.config.js \
  stellar-extensions/tests/wallet/wallet-auth.integration.test.ts
```

The suite exercises every statement, line and function of
`wallet-auth.service.ts`. The Jest config maps the backend-only, ESM-only
`@nestjs/typeorm` package to a decorator stub
(`tests/stubs/nestjs-typeorm.js`) because the tests construct the services
directly.

## Other suites

- `puzzle-solution-checker.spec.ts` — Jest specs for the extension puzzle
  solution checker.
- `wallet/wallet-auth.integration.test.ts` — wallet challenge, signature and
  session suite described above.
- The Jest config matches `*.test.ts` under this directory; the Vitest config
  matches `*.{test,spec}.js`, so the two runners do not pick up each other's
  files.
