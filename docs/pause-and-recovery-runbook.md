# Contract Pause and Recovery Operator Runbook

> **Note:** The canonical version of this document is maintained at [`onchain/docs/pause-and-recovery-runbook.md`](../onchain/docs/pause-and-recovery-runbook.md).

This runbook defines the incident-response procedures for pausing and recovering the StellarHunts smart contracts and backend services during security incidents, upgrades, or scheduled maintenance.

---

## 1. Decision Guide

StellarHunts employs three independent halt mechanisms. Because each control operates at a different layer of the stack, choosing the right control (or combination of controls) is essential for effective incident containment.

### Control Capabilities

| Control | Mechanism | Target Functions / Scope | Error / Result | Bypassed By |
|---|---|---|---|---|
| **Game Contract Pause** | On-chain instance storage (`DataKey::Paused`) in `stellar_hunts` | `submit_answer`<br>`claim_level_completion_nft` | `Error(Contract, #13)` (`ContractPaused`) | Direct NFT minting; off-chain API routes (auth, stats) |
| **NFT Contract Pause** | On-chain instance storage (`NftDataKey::Paused`) in `stellar_hunts_nft` | `mint_level_badge` | `Error(Contract, #7)` (`ContractPaused`) | Game contract gameplay; answer submission; level completion |
| **Backend Maintenance Mode** | Database config flag in `maintenance_config` | Public API HTTP requests (`blockApiRoutes: true`) | HTTP `503 Service Unavailable` | Direct on-chain Soroban RPC transactions submitted from wallets |

### Why One Control Is Insufficient

- **Backend Maintenance Mode alone is insufficient** because tech-savvy players or attackers can invoke Soroban contracts directly via Soroban RPC endpoints, bypassing the web frontend and API gateway entirely.
- **Game Contract Pause alone is insufficient** if the incident involves an NFT contract vulnerability, compromised minter address, or unauthorized badge minting.
- **NFT Contract Pause alone is insufficient** if the incident involves invalid puzzle answers, rate-limit bypassing, or level state manipulation, which occur exclusively in the game contract.

### Incident Classification & Action Matrix

| Incident Type | Immediate Action | Secondary Action |
|---|---|---|
| **Answer Exploit / Logic Bug** | Pause Game Contract | Enable Backend Maintenance Mode |
| **Unauthorized Badge Minting** | Pause NFT Contract | Pause Game Contract |
| **Full Emergency / Critical Exploit** | Pause Game Contract & NFT Contract | Enable Backend Maintenance Mode |
| **Database / Backend Migration** | Enable Backend Maintenance Mode | Optionally Pause Game Contract if off-chain checks sync |

---

## 2. Emergency Pause Procedure

### Step 1: Execute Contract Pause

Ensure you have the admin secret key configured in your environment (`ADMIN_SECRET_KEY`) and the contract IDs for the target network.

#### Option A: Pause the Game Contract
```bash
stellar contract invoke \
  --id "$GAME_CONTRACT_ID" \
  --source-account "$ADMIN_SECRET_KEY" \
  --network "$STELLAR_NETWORK" \
  -- pause
```
**Expected Output:** Transaction hash and status `SUCCESS`.

#### Option B: Pause the NFT Contract
```bash
stellar contract invoke \
  --id "$NFT_CONTRACT_ID" \
  --source-account "$ADMIN_SECRET_KEY" \
  --network "$STELLAR_NETWORK" \
  -- pause
```
**Expected Output:** Transaction hash and status `SUCCESS`.

### Step 2: Enable Backend Maintenance Mode

Call the maintenance administration endpoint using an authorized Admin JWT:

```bash
curl -X POST "$BACKEND_URL/maintenance/enable" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Security incident containment",
    "message": "StellarHunts is temporarily paused for incident response. Please check Discord/Twitter for updates."
  }'
```
**Expected Output:** HTTP `200 OK` with payload:
```json
{
  "isMaintenanceMode": true,
  "maintenanceMessage": "StellarHunts is temporarily paused for incident response...",
  "reason": "Security incident containment"
}
```

### Step 3: Verify the Halt

Before initiating investigation, confirm that all halted layers are actively rejecting requests:

1. **Verify Game Contract Pause State:**
   ```bash
   stellar contract invoke \
     --id "$GAME_CONTRACT_ID" \
     --network "$STELLAR_NETWORK" \
     -- is_paused
   ```
   **Expected Output:** `true`

2. **Verify NFT Contract Pause State:**
   ```bash
   stellar contract invoke \
     --id "$NFT_CONTRACT_ID" \
     --network "$STELLAR_NETWORK" \
     -- is_paused
   ```
   **Expected Output:** `true`

3. **Verify Game Rejection:** Attempt a test answer submission. It must fail with Soroban contract error 13 (`ContractPaused`).

4. **Verify API Rejection:**
   ```bash
   curl -i "$BACKEND_URL/puzzles/active"
   ```
   **Expected Output:** HTTP `503 Service Unavailable`.

5. **Verify Admin/Health Accessibility:**
   ```bash
   curl -i "$BACKEND_URL/health/live"
   ```
   **Expected Output:** HTTP `200 OK`.

---

## 3. Recovery and Resumption Procedure

### Preconditions for Resuming

Do **not** unpause until the following preconditions are satisfied:
1. Root cause is identified and patched (via contract upgrade or backend fix).
2. On-chain state integrity has been audited:
   - Check `LevelProgress` for corrupted levels.
   - Verify total badges minted in `stellar_hunts_nft` against valid completions.
3. In-flight operations have been identified for reconciliation.

### Handling In-Flight Claims and Interrupted Submissions

#### Interrupted Submissions
- When the game contract is paused, `submit_answer` calls abort before any persistent state changes are saved.
- **Reconciliation:** No ledger state corruption occurs. Affected users simply re-submit their answer once the contract is unpaused.

#### In-Flight NFT Claims
- If `claim_level_completion_nft` was invoked during or right before a pause:
  - If the transaction reverted due to `Error::ContractPaused`, the player's level remains `is_completed: true` and `nft_minted: false`.
  - **Reconciliation:** The player does not lose their progress. Once unpaused, calling `claim_level_completion_nft` will succeed and mint the badge.
  - To inspect a player's level progress prior to unpause:
    ```bash
    stellar contract invoke \
      --id "$GAME_CONTRACT_ID" \
      --network "$STELLAR_NETWORK" \
      -- get_player_level_progress \
      --player "$PLAYER_ADDRESS" \
      --level "Easy"
    ```

### Resumption Steps

Follow this strict ordering to avoid race conditions:

#### Step 1: Unpause the NFT Contract (if paused)
```bash
stellar contract invoke \
  --id "$NFT_CONTRACT_ID" \
  --source-account "$ADMIN_SECRET_KEY" \
  --network "$STELLAR_NETWORK" \
  -- unpause
```
Verify:
```bash
stellar contract invoke --id "$NFT_CONTRACT_ID" --network "$STELLAR_NETWORK" -- is_paused
# Returns: false
```

#### Step 2: Unpause the Game Contract (if paused)
```bash
stellar contract invoke \
  --id "$GAME_CONTRACT_ID" \
  --source-account "$ADMIN_SECRET_KEY" \
  --network "$STELLAR_NETWORK" \
  -- unpause
```
Verify:
```bash
stellar contract invoke --id "$GAME_CONTRACT_ID" --network "$STELLAR_NETWORK" -- is_paused
# Returns: false
```

#### Step 3: Disable Backend Maintenance Mode
```bash
curl -X POST "$BACKEND_URL/maintenance/disable" \
  -H "Authorization: Bearer $ADMIN_JWT"
```
**Expected Output:** HTTP `200 OK` with `"isMaintenanceMode": false`.

#### Step 4: Post-Resumption Monitoring
1. Verify public endpoints return HTTP 200 (`curl -i $BACKEND_URL/puzzles/active`).
2. Monitor application logs for spike in 5xx errors or Soroban error returns.
3. Assist players with pending NFT claims to verify badge receipt.
