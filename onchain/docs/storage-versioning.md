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
  - `PlayerProgress(Address)`, `PlayerLevelProgress(Address, Levels)`
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
- `CURRENT_SCHEMA_VERSION = 1`, stored under `DataKey::SchemaVersion` at
  `init` and readable via `get_schema_version()`.
- `Question` carries a per-record `version` field stamped with
  `CURRENT_SCHEMA_VERSION` at write time; readers treat an older `version`
  as legacy-format data.
- `PlayerProgress` and `LevelProgress` currently have no version field —
  adding one (or switching to `PlayerProgressV2`/`LevelProgressV2` keys)
  requires a schema-version bump and a migration that seeds the new field
  from existing state.

### `stellar_hunts_nft`
- `Badge(Address, Levels)` is a presence flag; `BadgeData(Address, Levels)`
  stores `minted_at` + `minter`. Both keys are append-only in practice
  (badges are never unminted), so evolving `BadgeData` by adding fields is
  backward compatible — old rows deserialize with defaults only if the new
  fields are optional; otherwise bump and migrate.

### `stellar_hunts_receiver`
- Stateless mock (no storage). Nothing to version.

## Test expectations

The compatibility suite in `stellar_hunts/src/test.rs` locks in these
guarantees:

- `test_schema_version` / schema-version tests — `get_schema_version()`
  returns `CURRENT_SCHEMA_VERSION` after `init` and `0` for a legacy
  deployment that never wrote the key.
- `test_legacy_question_readable` — a `Question` written with
  `version: 0` (pre-versioning format) is still returned by
  `get_question`, proving reads are backward compatible.
- `test_level_progress_roundtrip_compat` — a `LevelProgress` written
  directly to storage round-trips through `get_player_level_progress`
  field-for-field, so appending a field in the future must preserve all
  existing fields.
- `test_levels_discriminants_stable` — `Levels` numeric discriminants
  (Easy=1, Medium=2, Hard=3, Master=4) never change, protecting both stored
  state and event payloads.
