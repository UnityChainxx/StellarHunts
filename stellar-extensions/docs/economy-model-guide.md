# Guide: Economy Model and Token Distribution

This guide explains the token economy model in StellarHunts: how rewards are
generated, how they flow to players, what mechanisms keep the economy balanced,
and how to run simulations to verify that balance.

---

## Contents

- [Overview](#overview)
- [Token Economy Model](#token-economy-model)
- [Reward Calculation by Difficulty](#reward-calculation-by-difficulty)
- [Seasonal Reward Pools and Multipliers](#seasonal-reward-pools-and-multipliers)
- [Daily Rewards and Streak Bonuses](#daily-rewards-and-streak-bonuses)
- [Referral Reward Distribution](#referral-reward-distribution)
- [Inflation Control Mechanisms](#inflation-control-mechanisms)
- [Economic Simulation Guide](#economic-simulation-guide)

---

## Overview

StellarHunts uses an on-chain token (issued on the Stellar network) as its
primary reward currency. Players earn tokens by solving puzzles, maintaining
streaks, completing challenges, and referring new players. Tokens can be spent
in the Reward Shop or redeemed for NFT badges.

The economy is designed around three principles:

1. **Earned, not airdropped** — tokens enter circulation only through verified
   in-game actions.
2. **Demand-matched supply** — the total emission rate adjusts when pool
   balances fall outside target ranges.
3. **Transparent sinks** — every shop purchase and NFT mint records a
   verifiable on-chain burn or escrow event.

---

## Token Economy Model

### Reward sources (emission)

| Source | Description | Emission trigger |
|--------|-------------|-----------------|
| Puzzle completion | Tokens awarded for a correct first-attempt solve | Backend `POST /puzzles/submit` → `correct: true` |
| Challenge completion | Bonus tokens for finishing a daily or weekly challenge | Challenge marked completed |
| Streak milestone | Multiplied tokens at 7-day, 30-day, and 90-day streak checkpoints | Streak service milestone event |
| Referral | One-time bonus when a referred user completes their first puzzle | Referral service completion hook |
| Season end | Distribution from the seasonal pool to top-ranked players | Scheduled season-close job |

### Reward sinks (destruction / escrow)

| Sink | Description |
|------|-------------|
| Reward Shop purchase | Tokens deducted from player balance on item redemption |
| NFT badge mint | Tokens burned on-chain when `POST /nft-claim/claim` succeeds |
| Hint usage | Small token deduction per hint requested |
| Season pool contribution | A percentage of every puzzle reward is routed to the season pool before the net amount reaches the player |

### Balance sheet invariant

At any point in time:

```
circulating_supply = total_emitted - total_burned - season_pool_balance
```

The backend enforces this identity through double-entry ledger records; every
reward transaction has a corresponding debit and credit entry.

---

## Reward Calculation by Difficulty

Base token amounts scale with puzzle difficulty. The multipliers below are
applied to the configured `base_reward` value in `config/economy.config.json`.

| Difficulty | Base multiplier | First-attempt bonus | Example (base = 100) |
|------------|----------------|---------------------|----------------------|
| `easy` | 1.0× | +0% | 100 tokens |
| `medium` | 2.0× | +10% | 220 tokens |
| `hard` | 4.0× | +20% | 480 tokens |
| `master` | 8.0× | +30% | 1 040 tokens |

**First-attempt bonus** is applied only when the player answers correctly on
their first submission with no hints used. Subsequent attempts or hint usage
reduce the payout:

```
payout = base_reward
       × difficulty_multiplier
       × (1 + first_attempt_bonus if eligible else 0)
       × (1 - hint_penalty_per_hint × hints_used)
       × streak_multiplier
```

The minimum payout for any correct answer is `base_reward × 0.1` (10% of
base); the formula never produces a negative reward.

---

## Seasonal Reward Pools and Multipliers

Each season runs for a fixed calendar period (typically 30 days). A season pool
accumulates contributions from puzzle rewards throughout the season and is
distributed to top-ranked players at season close.

### Pool contribution

For every puzzle reward `R` paid to a player, `season_contribution_rate × R`
(default: 5%) is deducted from `R` and credited to the active season pool.
The player receives `R × (1 - season_contribution_rate)`.

### Season multipliers

Season-wide difficulty multipliers can be configured per season to increase or
decrease overall emission:

| Season state | Multiplier applied to all payouts |
|--------------|-----------------------------------|
| Normal | 1.0× |
| Boost week | 1.5× (admin-configured) |
| Final countdown (last 48 h) | 2.0× |

Multipliers are set in the season record and are applied server-side before
payout is credited.

### Distribution at season close

The pool is split among the top `N` players by season score using a weighted
share model:

```
player_share = season_pool × (player_season_score / sum_of_top_N_scores)
```

`N` defaults to 100. Players below the cutoff receive no season distribution
but keep all tokens earned during the season.

---

## Daily Rewards and Streak Bonuses

### Daily login reward

A fixed daily reward (`daily_reward` in `economy.config.json`, default: 10
tokens) is credited to any player who completes at least one puzzle on a
calendar day. This reward does not stack with streak bonuses; it is replaced by
the streak bonus once a streak is active.

### Streak bonus schedule

| Streak length | Daily bonus multiplier |
|---------------|----------------------|
| 1–6 days | 1.0× (base daily reward) |
| 7–13 days | 1.5× |
| 14–29 days | 2.0× |
| 30–89 days | 3.0× |
| 90+ days | 5.0× |

The streak multiplier applies only to the daily reward amount, not to individual
puzzle payouts. Breaking a streak resets the multiplier to 1.0×.

### Streak grace period

A player may miss one calendar day per 7-day window without breaking their
streak. The grace period is consumed automatically and does not need to be
claimed. Missing two consecutive days always breaks the streak.

---

## Referral Reward Distribution

The referral programme distributes a one-time bonus when a new player (the
invitee) completes their first puzzle after joining through a referral link.

### Distribution breakdown

| Recipient | Amount | Trigger |
|-----------|--------|---------|
| Referrer | `referral_referrer_bonus` (default: 200 tokens) | Invitee completes first puzzle |
| Invitee | `referral_invitee_bonus` (default: 100 tokens) | Same event |

Both bonuses are credited atomically in the same backend transaction to avoid
partial distributions.

### Anti-abuse rules

- Each Stellar wallet address may only appear as an invitee once; subsequent
  referral attempts for the same wallet are ignored.
- Self-referral (using your own code) is rejected with `400`.
- Referral bonuses are not subject to the season pool contribution deduction.

---

## Inflation Control Mechanisms

Left unchecked, an open-ended emission model inflates the token supply and
devalues rewards over time. StellarHunts uses several mechanisms to keep supply
growth predictable.

### 1. Season pool contribution

As described above, 5% of every puzzle reward is routed into the season pool
rather than into immediate circulation. This creates a natural velocity cap on
how fast tokens reach player wallets.

### 2. Adaptive emission cap

If the weekly moving average of total emission exceeds `weekly_emission_cap`
(configured in `economy.config.json`), all puzzle base rewards are scaled down
by a `cap_dampening_factor` (default: 0.9) until the average returns below the
cap. The dampening applies multiplicatively each adjustment cycle (daily) until
corrected.

### 3. Shop sinks

Reward Shop items are priced in tokens. All items purchased are either:
- **Burned** — tokens are removed from circulation on-chain.
- **Recycled** — tokens re-enter the season pool at a 50% rate (cosmetic items
  that the shop restocks).

Shop prices are reviewed and adjusted by the economy team at the start of each
season to ensure meaningful token demand.

### 4. NFT burn

Every NFT badge mint via `POST /nft-claim/claim` burns a configured token
amount (`nft_mint_burn_amount`) on-chain. This is the strongest deflationary
force because NFT mints are permanent and irreversible.

### 5. Idle-balance expiry

Token balances that remain completely inactive (no earn, spend, or transfer)
for more than `balance_expiry_days` (default: 365 days) are reclaimed into the
season pool. Players receive an email warning 30 days before expiry.

---

## Economic Simulation Guide

The simulation script (`scripts/simulate_economy.py`) models the token economy
over a configurable time horizon and reports projected supply, sink rates, and
player balance distributions.

### Prerequisites

- Python 3.10+
- Dependencies: `pip install -r scripts/requirements.txt`
- A copy of `config/economy.config.json` in the project root (or pass a custom
  path with `--config`).

### Running a basic simulation

```bash
python scripts/simulate_economy.py \
  --days 90 \
  --players 1000 \
  --output reports/simulation-90d.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `--days` | `30` | Simulation horizon in calendar days |
| `--players` | `500` | Simulated active player count |
| `--config` | `config/economy.config.json` | Path to economy config |
| `--seed` | `42` | Random seed for reproducibility |
| `--output` | stdout | Write JSON report to file |

### Interpreting the output

The script produces a JSON report with the following top-level keys:

```json
{
  "summary": {
    "totalEmitted": 4820000,
    "totalBurned": 241000,
    "netCirculating": 4579000,
    "seasonPoolBalance": 241000,
    "weeklyEmissionAvg": 536000,
    "weeklyEmissionCapExceeded": false
  },
  "playerBalancePercentiles": {
    "p50": 1200,
    "p90": 8400,
    "p99": 42000
  },
  "dailyEmission": [ /* array of daily totals */ ]
}
```

If `weeklyEmissionCapExceeded` is `true`, the adaptive dampening mechanism
would have triggered. Adjust `weekly_emission_cap` or `base_reward` in the
config and re-run until it stays `false` under realistic player growth
assumptions.

### Scenario testing

Pass `--scenario boost-week` to inject a 7-day boost-week multiplier mid-way
through the simulation and observe the emission spike and subsequent dampening
response:

```bash
python scripts/simulate_economy.py --days 60 --scenario boost-week
```

### Validating balance invariants

After any change to `economy.config.json`, run:

```bash
python scripts/simulate_economy.py --days 365 --players 5000 --validate-invariants
```

The `--validate-invariants` flag causes the script to assert that
`circulating_supply = total_emitted - total_burned - season_pool_balance`
holds at every daily step. A failure here indicates a misconfiguration that
would create tokens from nowhere or silently destroy them.
