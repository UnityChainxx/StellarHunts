# Contract Storage Versioning

This document defines the migration strategy for on-chain storage used by the
StellarHunts Soroban contracts (`stellar_hunts`, `stellar_hunts_nft`,
`stellar_hunts_receiver`) and the rules for evolving storage keys and
serialized types without breaking existing state.

## Principles

1. **Stable keys.** All persistent/instance storage is addressed through a
   `#[contracttype]` key enum (`DataKey` / `NftDataKey`). The variant name and
   its payloads are part of the serialized key, so renaming a variant creates
   a *new* key and orphans the old data.

2. **Versioned state.** Each contract records its schema version in instance
   storage under `DataKey::SchemaVersion` (set at `init`) and exposes it via
   `get_schema_version()`. A missing key means version `0` (pre-versioning
   legacy deployment).

3. **Never reuse a key for different meaning.** If the meaning of a stored
   value changes, introduce a new key (or a versioned struct) instead of
   overwriting an existing key with a different shape.

4. **Backward compatibility is the default.** Reads must keep working for
   state written by older contract versions; migrations upgrade data lazily
   (on next read) or eagerly (during an admin-maintained migration), never by
   silently dropping or corrupting old state.

## Migration strategy for storage keys

- A key is derived from the enum variant plus its payloads, e.g.
  `Question(u64)` → `Question(question_id)`. The pair
  (variant name, payload types) must stay stable for as long as any deployed
  state may reference it.
- **Renaming a variant** = new key. To migrate: read under the old key, write
  under the new key, then remove the old key (eager migration), or keep both
  and migrate on first access (lazy migration).
- Keep the well-known keys referenced by off-chain integrations and emitted
  events stable:
  - `Question(u64)`, `QuestionCount`, `QuestionPerLevel`,
    `QuestionsByLevel(Levels, u32)`
  - `PlayerProgress(Address)`, `PlayerLevelProgress(Address, Levels)` —
    legacy records still live here; no longer written (see the
    `stellar_hunts` section)
  - `PlayerProgressV2(Address)`, `PlayerLevelProgressV2(Address, Levels)` —
    versioned successors introduced with `CURRENT_SCHEMA_VERSION = 2`
  - `Badge(Address, Levels)`, `BadgeData(Address, Levels)`

## Evolving serialized types

Soroban `#[contracttype]` structs are XDR-serialized: the field layout is
part of the serialization. Two safe ways to evolve a stored struct:

1. **Per-record version field (preferred).** Keep an explicit `version`
   field on the struct itself, e.g. `Question.version`. Writers stamp the
   current version; readers that encounter an older `version` can run the
   appropriate upgrade. This is how `Question` is already handled.
2. **Versioned key suffixes.** When a struct changes incompatibly, store the
   new shape under a new key (e.g. `PlayerProgressV2(Address)`) while the
   reader falls back to the legacy key. Old keys are eventually purged by a
   migration.

### Changing enums

- `Levels` uses **explicit discriminants** (`Easy = 1` … `Master = 4`). The
  numeric value is what is persisted, so discriminants must never be
  reordered or renumbered — append new variants only.
- Changing an enum's *meaning* is a breaking change: bump the schema version
  and migrate any stored state that references the old variant.

### Compatibility checklist

| Change | Allowed? | Requirement |
| --- | --- | --- |
| Add a field to a stored struct | Yes (with care) | Bump `CURRENT_SCHEMA_VERSION`; readers tolerate the previous layout |
| Append a new enum variant | Yes | Never reorder or renumber existing discriminants |
| Reorder/renumber enum variants | No | Breaks existing state |
| Remove a struct field | No | Breaking; migrate stored data first |
| Reuse a key for different data | No | Use a new/versioned key instead |
| Rename a key variant | No | New key; migrate old data explicitly |

## Contract-specific notes

### `stellar_hunts`

- `CURRENT_SCHEMA_VERSION = 2` (bumped from 1 by issue #463), stored under
  `DataKey::SchemaVersion` at `init` and readable via `get_schema_version()`.
- `Question` carries a per-record `version` field stamped with
  `CURRENT_SCHEMA_VERSION` at write time; readers treat an older `version`
  as legacy-format data.
- **Chosen mechanism for `PlayerProgress` / `LevelProgress`: versioned keys
  combined with a per-record `version` field** (the `*V2` variants), not a
  shape change in place under the original keys. Rationale: `Storage::get`
  panics when a stored record does not decode into the requested struct, so
  a record written before the `version` field existed would be unreadable
  if the struct under the same key gained a field. Versioned keys keep the
  legacy records decodable under the legacy shapes.
- Versioned keys: `PlayerProgressV2(Address)` and
  `PlayerLevelProgressV2(Address, Levels)` store `PlayerProgressV2` /
  `LevelProgressV2`, whose last field is `version: u32`.
- **Reader/writer contract:**
  - Every write goes through `write_player_progress` / `write_level_progress`,
    stamps `version = CURRENT_SCHEMA_VERSION` (writers are the single
    authority that stamps the version), stores under the `*V2` keys, and
    removes any pre-versioning record under the original keys.
  - Reads go through `read_player_progress` / `read_level_progress`, which
    prefer the `*V2` record and otherwise decode the pre-versioning record
    (no `version` field) through the legacy `PlayerProgress` /
    `LevelProgress` shapes, surfacing it with
    `version = LEGACY_RECORD_VERSION (1)`. Readers never rewrite storage.
  - Legacy reads are defined and non-panicking for every player address;
    there is no error path for "old record".
- **Migration is lazy (on the player's next write), not eager.** No admin
  migration entry point is needed: the write path is the only place records
  change shape, every migrated record is stamped and moved in the same
  transaction that writes it anyway (so no call can exceed the transaction
  budget on migration alone), untouched legacy records stay readable
  through the fallback forever, and retries after a partial failure are
  naturally idempotent. The cost is that both key families coexist until
  each player's next write.
- **Rule for adding the next field:** add it to `PlayerProgressV2` /
  `LevelProgressV2` (never to the legacy structs), bump
  `CURRENT_SCHEMA_VERSION`, and make the readers of the previous shape
  tolerate the missing field the same way these readers tolerate the
  missing `version` field today — decode the older shape through a
  dedicated legacy struct and default the new field. If the addition is
  not tolerated by the old shape, introduce `*V3` keys instead of changing
  `*V2` in place.
- The original keys `PlayerProgress(Address)` and
  `PlayerLevelProgress(Address, Levels)` remain in the `DataKey` enum
  because live legacy records still live under them; they are no longer
  written by this contract. The legacy structs `PlayerProgress` /
  `LevelProgress` must stay field-for-field identical to the version-1
  layout for the same reason.
- Public views: `get_player_level_progress` keeps the version-1 ABI and
  now reports versioned/legacy records alike; `get_player_level_progress_v2`
  and `get_player_progress_v2` expose the `version` field, with `0`
  signalling "no record exists".
- The default `LevelProgress` synthesized by `get_player_level_progress`
  for an unknown player carries the queried `player` identity
  (issue #449), so the zero-valued default cannot be confused with a
  record belonging to the contract itself.

### `stellar_hunts_nft`
- `CURRENT_SCHEMA_VERSION = 1`, written to `NftDataKey::SchemaVersion` at
  `init` and readable via `get_schema_version()`. A missing key means `0`
  (a deployment that predates versioning), so an operator can detect
  pre-versioning state without re-running `init` (which would otherwise
  fail with `AlreadyInitialized`) — see issue #453.
- `Badge(Address, Levels)` is a presence flag; `BadgeData(Address, Levels)`
  stores `minted_at` + `minter`. Both keys are append-only in practice
  (badges are never unminted), so evolving `BadgeData` by adding fields is
  backward compatible — old rows deserialize with defaults only if the new
  fields are optional; otherwise bump and migrate.

### `stellar_hunts_receiver`
- Stateless mock (no storage). Nothing to version.

## Operational procedure

The migration tooling lives in `scripts/contract-schema.sh`. Credentials are
read **only** from the environment (or the Stellar CLI's configured identity);
no secret is ever committed to the repository.

| Variable | Purpose |
| --- | --- |
| `STELLAR_NETWORK` | `testnet` (default), `futurenet`, or `pubnet`. |
| `STELLAR_SOURCE` / `STELLAR_ACCOUNT` | Stellar CLI identity name used to sign (`--source`). Leave unset to use the CLI default identity. |
| `STELLAR_HUNTS_CONTRACT_ID` | Game contract id. |
| `STELLAR_HUNTS_NFT_CONTRACT_ID` | NFT contract id (inspected once it is versioned). |
| `MIGRATE_FUNCTION` | Entry point to call (default `migrate_schema`). |
| `MIGRATE_BATCH_SIZE` | Records per invocation (default `25`). |

### 1. Inspect

```bash
scripts/contract-schema.sh inspect
```

This prints the deployed `get_schema_version()` next to `CURRENT_SCHEMA_VERSION`
parsed from `onchain/contracts/stellar_hunts/src/lib.rs`, for example:

```
Expected schema version (from source): 1

stellar_hunts          deployed=1 expected=1 OK
stellar_hunts_nft      not configured (set STELLAR_HUNTS_NFT_CONTRACT_ID)
```

A `MISMATCH` line means the deployment and the source disagree; do not migrate
until you understand why.

### 2. Plan

- Confirm the **starting version** (`--from`) is the version currently deployed.
- Choose a `--batch-size` that comfortably fits the per-ledger resource budget
  (start small, e.g. `10`–`25`).
- Confirm the admin identity in `STELLAR_SOURCE` is the contract admin.

### 3. Migrate

```bash
# from the currently deployed version, in bounded batches
scripts/contract-schema.sh migrate --from 0 --batch-size 25
```

The driver **refuses to run** when the deployed version is not the expected
starting version:

```
error: refusing to migrate: deployed version 1 != expected starting version 0
```

Each invocation of the admin entry point is reported per batch:

```
Migrating C... from 0 to 1 in batches of 25 via migrate_schema
batch 1: 1
migration complete: deployed schema version is now 1
```

The contract-side entry point is
`migrate_schema(from_version: u32, batch_size: u32) -> u32`. It is
admin-gated, rejects a `from_version` that does not match the deployed version
(`SchemaVersionMismatch`), stamps `CURRENT_SCHEMA_VERSION` once the version is
confirmed, and is idempotent — re-running it after a completed migration is a
no-op. Struct-level data migrations are tracked separately (see the
progress-struct versioning issue) and would be added as the work performed
inside this entry point.

### 4. Verify

```bash
scripts/contract-schema.sh inspect
```

Expect `deployed=<CURRENT_SCHEMA_VERSION> expected=<CURRENT_SCHEMA_VERSION> OK`.
The contract also emits a `schema_migrated` event carrying the old and new
versions, which can be checked in the transaction result.

## Test expectations

The compatibility suite in `stellar_hunts/src/test.rs` locks in these
guarantees:

- `test_schema_version` / schema-version tests — `get_schema_version()`
  returns `CURRENT_SCHEMA_VERSION` after `init` and `0` for a legacy
  deployment that never wrote the key.
- `test_legacy_question_readable` — a `Question` written with
  `version: 0` (pre-versioning format) is still returned by
  `get_question`, proving reads are backward compatible.
- `test_level_progress_roundtrip_compat` — a `LevelProgress` written in
  the pre-versioning shape under the original key round-trips through
  `get_player_level_progress` field-for-field and is surfaced by
  `get_player_level_progress_v2` with `version = LEGACY_RECORD_VERSION`.
- `test_level_progress_v2_roundtrip` — a `LevelProgressV2` written under
  the versioned key round-trips through `get_player_level_progress_v2`
  field-for-field, so appending a field in the future must preserve all
  existing fields.
- `test_lazy_migration_upgrades_legacy_record_on_write` — a pre-versioning
  record is readable, then after the player's next write it is stamped
  with `CURRENT_SCHEMA_VERSION` under the `*V2` key and the legacy entry
  is removed.
- `test_player_progress_v2_default_for_unknown_player` — the versioned
  views report `version = 0` and zeroed fields for a player with no
  record.
- `test_default_level_progress_uses_queried_player` — the synthesized
  default returned for an unknown player carries the queried `player`,
  never the contract address (issue #449).
- `test_levels_discriminants_stable` — `Levels` numeric discriminants
  (Easy=1, Medium=2, Hard=3, Master=4) never change, protecting both stored
  state and event payloads.
- `stellar_hunts_nft/src/test.rs`: `test_schema_version`,
  `test_schema_version_zero_before_init`, and
  `test_legacy_instance_without_version_key_reports_zero` lock the NFT
  contract's version surface: `CURRENT_SCHEMA_VERSION` after `init`, `0`
  before, and `0` for a legacy instance whose key was never written.
