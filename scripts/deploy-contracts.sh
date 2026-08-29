#!/usr/bin/env bash
set -euo pipefail

# Bootstrap & deployment script for Soroban smart contracts
NETWORK="${1:-testnet}"
ADMIN_SECRET="${2:-SA...}"

echo "=== StellarHunts Soroban Contract Deployer ==="
echo "Target Network: ${NETWORK}"

CDir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${CDir}/onchain"

echo "Building contracts in release mode..."
cargo build --workspace --target wasm32-unknown-unknown --release

echo "Contract deployment script executed successfully."
