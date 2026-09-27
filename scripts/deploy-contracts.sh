#!/usr/bin/env bash
set -euo pipefail

# Bootstrap & deployment script for Soroban smart contracts
# Toolchain compatibility: stellar-cli 28.0.0 (pinned in .tool-versions) matches soroban-sdk 28.0.0 (Protocol 28).
NETWORK="${1:-testnet}"
ADMIN_SECRET="${2:-SA...}"

echo "=== StellarHunts Soroban Contract Deployer ==="
echo "Target Network: ${NETWORK}"

CDir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${CDir}/onchain"

echo "Building contracts in release mode..."
cargo build --workspace --target wasm32-unknown-unknown --release

# Admin handover is a two-transaction operation on each deployed contract.
# The current admin proposes the new address, then the new address accepts:
#   stellar contract invoke --id <contract-id> --source <old-admin> --network "${NETWORK}" -- propose_admin --new_admin <new-admin>
#   stellar contract invoke --id <contract-id> --source <new-admin> --network "${NETWORK}" -- accept_admin
# Run this sequence for both StellarHunts and StellarHuntsNft. Minter roles,
# including the game's pre-approved NFT minter role, are preserved.

echo "Contract deployment script executed successfully."
