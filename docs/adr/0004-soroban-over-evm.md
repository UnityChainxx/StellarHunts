# ADR-0004: Use Soroban (Stellar) Over EVM-Compatible Chains

**Date:** 2025-07-24  
**Status:** Accepted  
**Deciders:** StellarHunts core team

---

## Context

StellarHunts awards on-chain NFT badges when players complete puzzle
levels. The team needed to select a smart-contract platform to host:

1. **Game contract** — question lifecycle, answer validation (SHA-256),
   player level progression.
2. **NFT badge contract** — per-level badge minting with role-gated
   authorization.

The two primary candidates were **Soroban on Stellar** and an
**EVM-compatible chain** (Ethereum mainnet, Polygon, or Base).

| Criterion | Soroban / Stellar | EVM (Ethereum / Polygon) |
|-----------|-------------------|--------------------------|
| Transaction fees | Sub-cent on Stellar | Variable (gwei spikes on mainnet; low on L2s) |
| Finality | ~5 s (Stellar consensus) | ~12 s ETH / ~2 s Polygon |
| Smart contract language | Rust (soroban-sdk) | Solidity / Vyper |
| Tooling maturity | Growing (Stellar CLI, soroban-cli) | Very mature (Hardhat, Foundry, OpenZeppelin) |
| NFT standards | Custom (no ERC-721 equivalent yet) | ERC-721 / ERC-1155 well established |
| Wallet ecosystem | Freighter, Lobstr, Albedo | MetaMask, WalletConnect (broad) |
| Developer community | Smaller, niche | Large, extensive resources |
| Educational alignment | Matches project's Stellar-learning theme | Generic blockchain knowledge |

The project's **educational mission** is to teach players about
blockchain technology — specifically the Stellar ecosystem. Using Soroban
keeps the on-chain layer consistent with the subject matter being taught.

## Decision

StellarHunts uses **Soroban smart contracts on the Stellar network** for
all on-chain game logic and NFT badge minting.

- Contracts are written in **Rust** using `soroban-sdk 22.x`.
- The workspace lives in `onchain/` with a Cargo workspace manifest.
- Two production contracts exist:
  - `stellar_hunts` — game logic
  - `stellar_hunts_nft` — badge minting
- Local development and CI use Stellar Testnet;
  `STELLAR_MODE=mock` allows the backend to run without a live network.
- Answer privacy is preserved on-chain via `env.crypto().sha256()` —
  no plaintext answers are stored in contract state.

## Consequences

### Positive
- Aligns with the project's educational goal of teaching Stellar/Soroban
- Very low and predictable transaction fees
- Fast finality reduces wait time after puzzle completion
- Rust's type system and Soroban's sandboxed WASM runtime provide strong
  safety guarantees
- `STELLAR_MODE=mock` lets the backend be developed and tested without
  a live network dependency

### Negative / Trade-offs
- Smaller developer community means fewer tutorials and third-party
  tooling compared to EVM
- No standardized NFT interface (ERC-721) — badge ownership queries use
  a custom `has_level_badge` function
- Freighter wallet has less browser/mobile coverage than MetaMask's
  ecosystem
- Team members with an EVM background need to learn Rust and the Soroban
  execution model
