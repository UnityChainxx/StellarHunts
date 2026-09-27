#!/usr/bin/env bash
#
# Contract storage schema tooling for StellarHunts.
#
# Reports the deployed schema version of the Soroban contracts and drives the
# documented admin migration entry point with bounded batches.
#
# Usage:
#   scripts/contract-schema.sh inspect
#   scripts/contract-schema.sh migrate --from <version> [--batch-size N]
#                                                  [--function NAME]
#                                                  [--contract <contract-id>]
#
# Configuration (environment, never committed secrets):
#   STELLAR_NETWORK                testnet (default) | pubnet | futurenet
#   STELLAR_SOURCE / STELLAR_ACCOUNT
#                                  Stellar CLI identity name to sign with.
#                                  If unset, the Stellar CLI default identity
#                                  is used. Never pass a raw secret key here.
#   STELLAR_HUNTS_CONTRACT_ID      game contract id
#   STELLAR_HUNTS_NFT_CONTRACT_ID  nft contract id (inspected once it exists)
#   MIGRATE_FUNCTION               entry point to call (default: migrate_schema)
#   MIGRATE_BATCH_SIZE             records per invocation (default: 25)
#
# See onchain/docs/storage-versioning.md for the full operational procedure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

NETWORK="${STELLAR_NETWORK:-testnet}"
SOURCE_IDENTITY="${STELLAR_SOURCE:-${STELLAR_ACCOUNT:-}}"
HUNTS_CONTRACT_ID="${STELLAR_HUNTS_CONTRACT_ID:-}"
NFT_CONTRACT_ID="${STELLAR_HUNTS_NFT_CONTRACT_ID:-}"
MIGRATE_FUNCTION="${MIGRATE_FUNCTION:-migrate_schema}"
MIGRATE_BATCH_SIZE="${MIGRATE_BATCH_SIZE:-25}"

SCHEMA_SOURCE="${ROOT_DIR}/onchain/contracts/stellar_hunts/src/lib.rs"

die() {
  echo "error: $*" >&2
  exit 1
}

# Reads the expected schema version straight from the crate source so a
# deployed/expected mismatch is obvious.
source_schema_version() {
  [[ -f "${SCHEMA_SOURCE}" ]] || die "cannot find ${SCHEMA_SOURCE}"
  sed -nE 's/.*CURRENT_SCHEMA_VERSION: u32 = ([0-9]+).*/\1/p' "${SCHEMA_SOURCE}" \
    | head -n 1
}

# run_invoke <contract-id> <fn> [args...]
run_invoke() {
  local contract_id="$1"
  shift
  local -a cmd=(stellar contract invoke --id "${contract_id}" --network "${NETWORK}")
  if [[ -n "${SOURCE_IDENTITY}" ]]; then
    cmd+=(--source "${SOURCE_IDENTITY}")
  fi
  cmd+=(-- "$@")
  "${cmd[@]}"
}

deployed_version() {
  local contract_id="$1"
  [[ -n "${contract_id}" ]] || die "no contract id configured"
  run_invoke "${contract_id}" get_schema_version
}

# inspect_contract <label> <contract-id> <expected>
inspect_contract() {
  local label="$1"
  local contract_id="$2"
  local expected="$3"

  printf '%-22s ' "${label}"

  if [[ -z "${contract_id}" ]]; then
    echo "not configured (set the matching *_CONTRACT_ID env var)"
    return 0
  fi

  local deployed
  if ! deployed="$(run_invoke "${contract_id}" get_schema_version 2>/dev/null)"; then
    echo "unavailable (get_schema_version invoke failed)"
    return 1
  fi

  if [[ "${deployed}" == "${expected}" ]]; then
    echo "deployed=${deployed} expected=${expected} OK"
  else
    echo "deployed=${deployed} expected=${expected} MISMATCH"
    return 2
  fi
}

cmd_inspect() {
  local expected
  expected="$(source_schema_version)"
  [[ -n "${expected}" ]] || die "could not read CURRENT_SCHEMA_VERSION from source"

  echo "Expected schema version (from source): ${expected}"
  echo

  local status=0
  inspect_contract "stellar_hunts" "${HUNTS_CONTRACT_ID}" "${expected}" || status=$?

  # The NFT contract has no schema version yet; report it as such rather than
  # failing the whole inspect run.
  printf '%-22s ' "stellar_hunts_nft"
  if [[ -z "${NFT_CONTRACT_ID}" ]]; then
    echo "not configured (set STELLAR_HUNTS_NFT_CONTRACT_ID)"
  else
    echo "not versioned yet"
  fi

  return "${status}"
}

cmd_migrate() {
  local from=""
  local batch="${MIGRATE_BATCH_SIZE}"
  local function_name="${MIGRATE_FUNCTION}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --from)
        from="${2:-}"
        shift 2
        ;;
      --batch-size)
        batch="${2:-}"
        shift 2
        ;;
      --function)
        function_name="${2:-}"
        shift 2
        ;;
      --contract)
        HUNTS_CONTRACT_ID="${2:-}"
        shift 2
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
  done

  [[ -n "${from}" ]] || die "--from <version> is required"
  [[ "${from}" =~ ^[0-9]+$ ]] || die "--from must be a number"
  [[ "${batch}" =~ ^[1-9][0-9]*$ ]] || die "--batch-size must be a positive integer"
  [[ -n "${HUNTS_CONTRACT_ID}" ]] || die "set STELLAR_HUNTS_CONTRACT_ID or pass --contract"

  local expected
  expected="$(source_schema_version)"

  local deployed
  deployed="$(deployed_version "${HUNTS_CONTRACT_ID}")"

  if [[ "${deployed}" != "${from}" ]]; then
    die "refusing to migrate: deployed version ${deployed} != expected starting version ${from}"
  fi

  echo "Migrating ${HUNTS_CONTRACT_ID} from ${from} to ${expected} in batches of ${batch} via ${function_name}"

  local batch_no=0
  while true; do
    batch_no=$((batch_no + 1))

    local result
    if ! result="$(run_invoke "${HUNTS_CONTRACT_ID}" "${function_name}" \
      --from_version "${from}" --batch_size "${batch}" 2>&1)"; then
      die "batch ${batch_no} failed: ${result}"
    fi
    echo "batch ${batch_no}: ${result}"

    local now
    now="$(deployed_version "${HUNTS_CONTRACT_ID}" 2>/dev/null || echo "${deployed}")"

    if [[ "${now}" == "${expected}" ]]; then
      echo "migration complete: deployed schema version is now ${now}"
      return 0
    fi

    if [[ "${now}" == "${deployed}" ]]; then
      die "migration did not advance the schema version (still ${now}); aborting to avoid a loop"
    fi

    deployed="${now}"
  done
}

usage() {
  cat <<'EOF'
Usage:
  scripts/contract-schema.sh inspect
  scripts/contract-schema.sh migrate --from <version> [--batch-size N]
                                                 [--function NAME]
                                                 [--contract <contract-id>]
EOF
}

case "${1:-}" in
  inspect)
    shift
    cmd_inspect "$@"
    ;;
  migrate)
    shift
    cmd_migrate "$@"
    ;;
  "" | -h | --help | help)
    usage
    ;;
  *)
    die "unknown command: $1"
    ;;
esac
