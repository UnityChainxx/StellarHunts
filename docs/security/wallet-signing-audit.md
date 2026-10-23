# Wallet Signing Flow — Security Audit (Findings)

**Issue:** UnityChainxx/StellarHunts#782 — *Audit wallet signing flow for phishing risks*
**Status:** Audit complete; the enforceable mitigations ship with this PR.
**Scope:** Everything a user (or the app on their behalf) signs or submits to Stellar / Soroban: the frontend wallet path, the backend NFT-claim handler, and the on-chain contracts that consume those transactions.

## 1. What users sign today

| Surface | Current state |
|---|---|
| Frontend (`frontend/`) | No code imports `@stellar/stellar-sdk` or `@stellar/freighter-api` yet. There is **no live signing path** — wallet UI is placeholder (`GetStartedCTA` handler is a stub) and the Navbar links to a `/connect-wallet` route that does not exist. |
| Backend NFT claim (`backend/src/nft-claim/providers/stellar-handler.service.ts`) | Runs in `STELLAR_MODE=mock` by default; the "live" branch is an unimplemented TODO sketch and always throws. No real transaction is built, signed or submitted today. |
| On-chain contracts (`onchain/contracts/`) | Minting is not user-signed: the game contract calls `mint_level_badge` cross-contract and the NFT contract authorizes via `env.invoker()` against its minter registry. Player answers are SHA-256 hashed on-chain; plaintext answers are never stored. |

## 2. Findings

### F1 — No blind-signing guardrail exists for the future frontend integration (High, fixed in this PR)
Once the frontend starts calling Freighter, the easiest way to get exploited is to hand raw XDR to `signTransaction` and let the user approve an envelope they cannot read. A lookalike dApp or a compromised dependency could swap the operation to a different contract or function and the user would "sign the NFT claim" while actually approving something hostile.

**Mitigation shipped:** `frontend/lib/stellar/signTransaction.js` refuses to sign anything that is not (a) fully decodable into a human-readable summary, (b) a contract call against an allow-listed StellarHunts contract (env: `NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID`, `NEXT_PUBLIC_STELLAR_HUNTS_NFT_CONTRACT_ID`), and (c) an allow-listed function name (default: `submit_answer`, `request_hint`). Every transaction must pass through `signWithConfirmation()`, which requires an explicit user confirmation callback — a missing confirmation step throws instead of silently signing.

### F2 — Summaries must be human-readable, not raw XDR (High, fixed in this PR)
**Mitigation shipped:** `frontend/lib/stellar/txSummary.js` decodes every operation and renders structured lines: fee in stroops and XLM, validity window, memo type, and per-operation "Call `function(args)` on contract `C…`". Operations that cannot be decoded are flagged `readable: false`, which blocks signing entirely. `frontend/components/wallet/TransactionConfirmDialog.jsx` renders this summary behind an explicit "I have read the summary above" checkbox before Confirm/Reject.

### F3 — `/connect-wallet` route does not exist (Medium, open)
`Navbar.jsx` links its "Connect Wallet" buttons to `/connect-wallet`, and `GetStartedCTA`'s connect handler is a `setTimeout` stub. Users cannot actually connect a wallet. When this route is implemented, it must use `requestAccess()` from `@stellar/freighter-api` and route all signing through `signWithConfirmation()` — never call Freighter's signer directly.

### F4 — Server-side custodian signing must never reach the client (Medium, open)
When `StellarHandlerService` implements live minting, the custodian key must stay server-side (`process.env`, injected secret), and the minting transaction should apply the same allow-list discipline (only the registered NFT contract, only `mint_level_badge`, only for users whose level completion the backend has verified). Until then, live mode fails closed (always throws), which is the correct behavior.

### F5 — On-chain surfaces already scoped reasonably (Informational)
- **Answer privacy:** `submit_answer` compares SHA-256 hashes; plaintext answers never hit the chain.
- **Role-gated minting:** `mint_level_badge` verifies `env.invoker()` is in the NFT contract's minter registry (default minter = the game contract), preventing arbitrary users from minting badges.
- **Duplicate prevention:** badge storage is keyed per `(Address, Levels)` so a level badge cannot be minted twice.

### F6 — Env-sourced allowlists need CI parity (Low, open)
The frontend allowlists come from `NEXT_PUBLIC_*` env vars. They are public by design (contract IDs and function names are on-chain facts), but a misconfigured deployment with an empty allowlist should fail closed — `assertInScope` throws when the contract is not in the set, which is the intended behavior. Deployment checklists should verify the variables are set (see README Configuration).

## 3. Signing policy (summary)

1. Build transactions with `buildContractCall()` — no hand-rolled XDR.
2. Summarize with `summarizeTransaction()` — if not readable, stop.
3. Enforce scope with `assertInScope()` — allow-listed contracts and functions only.
4. Confirm with the user via `TransactionConfirmDialog` — explicit, reviewed, cancellable.
5. Sign with Freighter only after all four steps pass.

Anything else is refused by design. There is no code path in this repository that signs an unsummarized or out-of-scope transaction.

## 4. Follow-ups

- [ ] Implement `/connect-wallet` using `requestAccess()` + the signing helper (F3)
- [ ] Implement live `StellarHandlerService` with server-side custodian key and allow-listed mint calls (F4)
- [ ] Add a frontend test that feeds a hostile transaction (unknown contract / unknown function / undecodable op) to `assertInScope` and asserts it throws
- [ ] Extend the allowlist via env when new game functions are introduced, with a note in the changelog
