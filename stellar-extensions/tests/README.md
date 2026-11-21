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

## Reward service

`reward/reward.test.ts` exercises the real reward, prize-pool, seasonal
schedule and time-trial services with in-memory repositories. It covers reward
distribution and accounting, seasonal multipliers/halvings, top-N prize pool
payouts, insufficient/empty/locked pools, duplicate claim prevention (pre-check,
idempotent dedupe retry, unique-index race), time-trial rewards, reward caps
and the remaining reward-service surface.

| Acceptance criterion | Test group |
| -------------------- | ---------- |
| Basic reward distribution | `RewardService` distribution specs |
| Seasonal reward multiplier | `SeasonalScheduleService` |
| Prize pool distribution to top N | `PrizePoolService` |
| Insufficient reward pool handling | `PrizePoolService` pool-state specs |
| Duplicate reward prevention | `RewardService` duplicate specs |
| Reward for time-trial mode | `awards a time-trial reward once per completed trial` |
| Reward cap enforcement | `lets different users claim the same capped reward…` |

Coverage of `backend/src/reward/reward.service.ts` is 100% statements, lines and
functions (constructor decorator metadata accounts for the remaining branch
entries).

Run it from the repository root:

```bash
npx jest --config stellar-extensions/tests/jest.config.js
```

`@nestjs/typeorm` and `@nestjs/config` v12 are pure ESM and cannot be required
by Jest, so `tests/support/` provides minimal CommonJS shims for their
decorator/token surface.

## Other suites

- `puzzle-solution-checker.spec.ts` — Jest specs for the extension puzzle
  solution checker.
- The Jest config matches `*.test.ts` under this directory; the Vitest config
  matches `*.{test,spec}.js`, so the two runners do not pick up each other's
  files.
