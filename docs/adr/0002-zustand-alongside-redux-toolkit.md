# ADR-0002: Use Zustand as the Primary State Manager Alongside Redux Toolkit

**Date:** 2025-07-24  
**Status:** Accepted  
**Deciders:** StellarHunts frontend team

---

## Context

The StellarHunts frontend needs client-side state management for:

1. **Game state** — current puzzle, difficulty level, completed puzzles,
   score, NFT collection. This state must survive page refreshes
   (localStorage persistence) and is mutated frequently during gameplay.
2. **Auth state** — current user, JWT token, wallet address.
3. **Server state** — leaderboard data, puzzle content, referral stats.
   This is cached, stale-while-revalidate data fetched from the NestJS API.

Two popular choices were on the table: **Zustand** and
**Redux Toolkit (RTK)**.

| Criterion | Zustand | Redux Toolkit |
|-----------|---------|---------------|
| Bundle size | ~3 kB | ~20 kB |
| Boilerplate | Minimal (no actions/reducers) | Moderate (slice files) |
| Middleware / devtools | Optional, plugin-based | First-class |
| Persistence | `zustand/middleware` `persist` | `redux-persist` |
| Learning curve | Low | Medium |
| Ecosystem maturity | Stable, wide adoption | Very mature, huge ecosystem |

`@reduxjs/toolkit` is already listed as a production dependency (version
`^2.5.1`) because it was planned for a more complex slice-based state
model. In practice the team converged on Zustand stores for all current
state needs.

## Decision

- **Zustand** is the **primary** state management library for game state,
  auth state, and reward state (see `frontend/store/`).
- **`@reduxjs/toolkit`** remains in `package.json` and should be used if
  future requirements call for complex middleware chains, time-travel
  debugging, or shared state slices that benefit from RTK's code
  generation patterns (e.g., `createEntityAdapter`).
- **TanStack Query** handles all *server state* — API responses, caching,
  background refetching — and is not replaced by either of the above.

## Consequences

### Positive
- Simple, readable store definitions — a store is just a `create()` call
- `persist` middleware handles localStorage serialization out of the box
- Low bundle size contribution
- Devtools integration available via `zustand/middleware` `devtools`

### Negative / Trade-offs
- RTK's advanced features (immer-backed reducers, RTK Query, entity
  adapters) are unavailable unless RTK is wired up in the future
- Two state libraries in `package.json` can confuse new contributors —
  this ADR resolves that ambiguity
- No centralized dispatcher pattern; state mutations are co-located in
  store files, which can scatter business logic
