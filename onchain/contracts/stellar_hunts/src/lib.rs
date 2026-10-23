// Allow `std` access during `cargo test` so tests can use
// `std::panic::catch_unwind` to assert panic behaviour. The contract itself
// remains `no_std` for the WASM build.
#![cfg_attr(not(test), no_std)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, Symbol,
};

// Make the NFT crate's generated `Client` available for cross-contract calls.
pub use stellar_hunts_nft;

// Shared types live in a separate crate so we don't form a cyclic workspace
// dependency between this contract and the NFT contract (both depend on
// `stellar-hunts-types`, neither depends on the other).
pub use stellar_hunts_types::Levels;

#[contracttype]
#[derive(Clone, Debug)]
pub struct Question {
    pub question_id: u64,
    pub question: Bytes,
    pub hashed_answer: BytesN<32>,
    pub level: Levels,
    pub hint: Bytes,
    pub version: u32,
}

// ---------------------------------------------------------------------
// Pre-versioning (legacy) record shapes (issue #463)
//
// These structs describe the storage layout written before schema
// version 2. They are no longer written by this contract, but they must
// stay byte-for-byte identical to the deployed V1 layout: the V2 readers
// decode legacy records through these types before migrating them.
// Do NOT add fields here — add them to the V2 structs below and bump
// CURRENT_SCHEMA_VERSION.
// ---------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug)]
pub struct PlayerProgress {
    pub address: Address,
    pub current_level: Levels,
    pub is_initialized: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct LevelProgress {
    pub player: Address,
    pub level: Levels,
    // u8 is not a valid Soroban Val in soroban-sdk 22 — the smallest
    // native unsigned integer is `u32`.
    /// Index of the next question in `QuestionsByLevel` that the player must
    /// answer. Retiring or moving a question compacts that index; because
    /// progress records are not enumerable, those administrative changes may
    /// invalidate an existing cursor, which must then be reset by the player.
    pub last_question_index: u32,
    pub is_completed: bool,
    pub attempts: u32,
    pub nft_minted: bool,
    pub last_attempt_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct HuntEvent {
    pub event_id: u64,
    pub start_time: u64,
    pub end_time: u64,
    pub multiplier_bps: u32,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BadgeStake {
    pub player: Address,
    pub event_id: u64,
    pub level: Levels,
    pub staked_at: u64,
    pub is_slashed: bool,
}

// ---------------------------------------------------------------------
// Versioned (V2) record shapes (issue #463)
//
// `PlayerProgress` and `LevelProgress` originally had no version field,
// so any field addition would have been a breaking storage change with
// no upgrade path. The V2 shapes carry a per-record `version` stamped
// with CURRENT_SCHEMA_VERSION at write time and live under the versioned
// keys `DataKey::PlayerProgressV2` / `DataKey::PlayerLevelProgressV2`,
// so the pre-versioning records stored under the original keys remain
// readable through the legacy shapes above.
// ---------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug)]
pub struct PlayerProgressV2 {
    pub address: Address,
    pub current_level: Levels,
    pub is_initialized: bool,
    pub version: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct LevelProgressV2 {
    pub player: Address,
    pub level: Levels,
    // u8 is not a valid Soroban Val in soroban-sdk 22 — the smallest
    // native unsigned integer is `u32`.
    pub last_question_index: u32,
    pub is_completed: bool,
    pub attempts: u32,
    pub nft_minted: bool,
    pub last_attempt_ledger: u32,
    pub version: u32,
}

// ---------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PendingAdmin,
    Upgrader,
    NftContract,
    QuestionCount,
    QuestionPerLevel,
    /// Per-level question cap. When set for a level, overrides `QuestionPerLevel`
    /// for that level only. Falls back to `QuestionPerLevel` when unset.
    QuestionCapByLevel(Levels),
    Question(u64),
    RetiredQuestion(u64),
    QuestionsByLevel(Levels, u32),
    QuestionPerLevelIndex(Levels),
    // Pre-versioning keys. Still readable (legacy records migrate on
    // their next write) but no longer written by this contract.
    PlayerProgress(Address),
    PlayerLevelProgress(Address, Levels),
    // Versioned keys introduced with schema version 2 (issue #463).
    PlayerProgressV2(Address),
    PlayerLevelProgressV2(Address, Levels),
    SchemaVersion,
    Paused,
    /// Whether `Address` currently holds `Role`. Present and set to `true`
    /// only while the role is granted; revoked roles are removed.
    Role(Address, Role),
    Event(u64),
    BadgeStake(Address, u64, Levels),
    RewardToken,
    DefaultRewardAmount,
    PuzzleRewardAmount(u64),
    CompletedPuzzle(Address, u64),
}

// ---------------------------------------------------------------------
// Role-based access control (issue #676)
//
// Roles layer on top of the single `Admin` address: the admin implicitly
// holds every role. `Minter` may mint level badges and `Upgrader` may run
// schema upgrades, so those privileged entrypoints can be delegated
// without transferring full admin control.
// ---------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Role {
    Minter,
    Upgrader,
}

// ---------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------

const CURRENT_SCHEMA_VERSION: u32 = 2;
// Keep user supplied payloads bounded so hashing, storage, and transaction
// resource use stay predictable. Soroban Bytes::len() returns u32.
const MAX_QUESTION_LEN: u32 = 4_096;
const MAX_ANSWER_LEN: u32 = 1_024;
const MAX_HINT_LEN: u32 = 2_048;
const MAX_QUESTIONS_PER_LEVEL: u32 = 1_000;

fn get_schema_version(e: &Env) -> u32 {
    e.storage()
        .persistent()
        .get(&DataKey::SchemaVersion)
        .unwrap_or(0)
}

fn set_schema_version(e: &Env) {
    e.storage()
        .persistent()
        .set(&DataKey::SchemaVersion, &CURRENT_SCHEMA_VERSION);
}

/// Schema version stamped onto records that were written before
/// per-record versioning existed (issue #463). Their layout is the one
/// `CURRENT_SCHEMA_VERSION = 1` defined.
const LEGACY_RECORD_VERSION: u32 = 1;

// ---------------------------------------------------------------------
// Player progress record reads/writes (issue #463)
//
// Reader/writer contract:
// - Every write goes through `write_player_progress` /
//   `write_level_progress`, stamps `CURRENT_SCHEMA_VERSION`, stores the
//   record under the versioned `*V2` keys, and removes any pre-versioning
//   record under the original keys (lazy migration).
// - Reads go through `read_player_progress` / `read_level_progress`, which
//   prefer the versioned record and fall back to decoding the
//   pre-versioning layout (no `version` field) through the legacy struct
//   shapes. Legacy records are surfaced with
//   `version == LEGACY_RECORD_VERSION`; they are never rewritten on read.
// - Migration is lazy (on the player's next write) rather than eager: no
//   admin entry point is needed, no call can exceed the transaction
//   budget, and a record that is never touched again stays readable
//   through the fallback forever. See onchain/docs/storage-versioning.md.
// ---------------------------------------------------------------------

fn read_player_progress(e: &Env, player: &Address) -> Option<PlayerProgressV2> {
    if let Some(v2) = e
        .storage()
        .persistent()
        .get(&DataKey::PlayerProgressV2(player.clone()))
    {
        return Some(v2);
    }
    let legacy: Option<PlayerProgress> = e
        .storage()
        .persistent()
        .get(&DataKey::PlayerProgress(player.clone()));
    legacy.map(|pp| PlayerProgressV2 {
        address: pp.address,
        current_level: pp.current_level,
        is_initialized: pp.is_initialized,
        version: LEGACY_RECORD_VERSION,
    })
}

fn write_player_progress(e: &Env, pp: &PlayerProgressV2) {
    // Writers are the single authority that stamps the schema version:
    // anything stored under a V2 key carries the current version, even if
    // the value was read out of a legacy record moments earlier.
    let mut stamped = pp.clone();
    stamped.version = CURRENT_SCHEMA_VERSION;
    e.storage().persistent().set(
        &DataKey::PlayerProgressV2(stamped.address.clone()),
        &stamped,
    );
    // Lazy migration: drop the pre-versioning entry, if any.
    e.storage()
        .persistent()
        .remove(&DataKey::PlayerProgress(stamped.address.clone()));
}

fn read_level_progress(e: &Env, player: &Address, level: &Levels) -> Option<LevelProgressV2> {
    if let Some(v2) = e
        .storage()
        .persistent()
        .get(&DataKey::PlayerLevelProgressV2(
            player.clone(),
            level.clone(),
        ))
    {
        return Some(v2);
    }
    let legacy: Option<LevelProgress> = e
        .storage()
        .persistent()
        .get(&DataKey::PlayerLevelProgress(player.clone(), level.clone()));
    legacy.map(|lp| LevelProgressV2 {
        player: lp.player,
        level: lp.level,
        last_question_index: lp.last_question_index,
        is_completed: lp.is_completed,
        attempts: lp.attempts,
        nft_minted: lp.nft_minted,
        last_attempt_ledger: lp.last_attempt_ledger,
        version: LEGACY_RECORD_VERSION,
    })
}

fn write_level_progress(e: &Env, player: &Address, level: &Levels, lp: &LevelProgressV2) {
    // Writers stamp the current version (see write_player_progress).
    let mut stamped = lp.clone();
    stamped.version = CURRENT_SCHEMA_VERSION;
    e.storage().persistent().set(
        &DataKey::PlayerLevelProgressV2(player.clone(), level.clone()),
        &stamped,
    );
    // Lazy migration: drop the pre-versioning entry, if any.
    e.storage()
        .persistent()
        .remove(&DataKey::PlayerLevelProgress(player.clone(), level.clone()));
}

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAuthorized = 1,
    EmptyField = 2,
    QuestionNotFound = 3,
    LevelNotCompleted = 4,
    AlreadyMinted = 5,
    NotInitialized = 6,
    WrongLevel = 7,
    QuestionPerLevelLimit = 8,
    MissingNftContract = 9,
    AttemptTooSoon = 10,
    LevelImmutable = 11,
    ArithmeticOverflow = 12,
    ContractPaused = 13,
    SchemaVersionMismatch = 14,
    QuestionRetired = 15,
    WrongQuestion = 16,
    EventNotFound = 17,
    EventNotActive = 18,
    EventExpired = 19,
    AlreadyStaked = 20,
    StakeNotFound = 21,
    StakeSlashed = 22,
    BadgeNotOwned = 23,
    // Appended for the retirement-semantics guard (#447): submitting or
    // requesting a hint for a retired question, and submitting a question
    // other than the one the player's level cursor expects. New variants
    // go at the end so existing discriminants stay stable.
    InvalidInput = 24,
    InputTooLarge = 25,
    CapWouldMakeLevelUnreachable = 26,
    CapBelowExistingIndex = 27,
    HashMismatch = 28,
    AlreadyCompleted = 29,
    RewardTransferFailed = 30,
    MissingRewardToken = 31,
}

// ---------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------

#[contract]
pub struct StellarHunts;

#[contractimpl]
impl StellarHunts {
    /// Initializes the contract with an admin.
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::NotAuthorized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Upgrader, &admin);
        set_schema_version(&env);
        env.events().publish(
            (Symbol::new(&env, "game_initialized"),),
            (admin, CURRENT_SCHEMA_VERSION),
        );
    }

    pub fn set_upgrader(env: Env, upgrader: Address) {
        require_admin(&env);
        env.storage()
            .instance()
            .set(&DataKey::Upgrader, &upgrader);
        env.events().publish(
            (Symbol::new(&env, "upgrader_updated"),),
            (upgrader,),
        );
    }

    pub fn get_upgrader(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Upgrader)
            .or_else(|| env.storage().instance().get(&DataKey::Admin))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    /// WASM contract upgrade guarded by upgrader role check (#678).
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let upgrader = Self::get_upgrader(env.clone());
        upgrader.require_auth();

        env.events().publish(
            (Symbol::new(&env, "contract_upgraded"),),
            (upgrader, new_wasm_hash.clone()),
        );

        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn propose_admin(env: Env, new_admin: Address) {
        require_admin(&env);
        let current_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        env.events().publish(
            (Symbol::new(&env, "admin_transfer_proposed"),),
            (current_admin, new_admin),
        );
    }

    pub fn accept_admin(env: Env) {
        let pending_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotAuthorized));
        pending_admin.require_auth();

        let previous_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        env.storage()
            .instance()
            .set(&DataKey::Admin, &pending_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.events().publish(
            (Symbol::new(&env, "admin_transfer_accepted"),),
            (previous_admin, pending_admin),
        );
    }

    // -----------------------------------------------------------------
    // Role management (issue #676)
    // -----------------------------------------------------------------

    /// Grants `role` to `account`. Only the current admin may call this.
    /// Granting an already-held role is a no-op re-grant but still emits
    /// an event so off-chain indexers observe the intent.
    pub fn grant_role(env: Env, account: Address, role: Role) {
        require_admin(&env);
        env.storage()
            .persistent()
            .set(&DataKey::Role(account.clone(), role), &true);
        env.events()
            .publish((Symbol::new(&env, "role_granted"),), (account, role));
    }

    /// Revokes `role` from `account`. Only the current admin may call this.
    /// Revoking a role that is not held simply leaves it absent and emits
    /// an event.
    pub fn revoke_role(env: Env, account: Address, role: Role) {
        require_admin(&env);
        env.storage()
            .persistent()
            .remove(&DataKey::Role(account.clone(), role));
        env.events()
            .publish((Symbol::new(&env, "role_revoked"),), (account, role));
    }

    /// Returns whether `account` holds `role`. The admin implicitly holds
    /// every role.
    pub fn has_role(env: Env, account: Address, role: Role) -> bool {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        if account == admin {
            return true;
        }
        env.storage()
            .persistent()
            .get(&DataKey::Role(account, role))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------
    // Admin actions
    // -----------------------------------------------------------------

    pub fn add_question(env: Env, level: Levels, question: Bytes, answer: Bytes, hint: Bytes) {
        require_admin(&env);

        if question.is_empty() || answer.is_empty() || hint.is_empty() {
            panic_with_error!(&env, Error::EmptyField);
        }
        validate_question_input(&env, &question, &answer, &hint);

        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::QuestionCount)
            .unwrap_or(0u64);
        // Explicit checked arithmetic: at u64::MAX the next question id
        // cannot be represented, so the call fails with a defined error
        // instead of silently wrapping.
        let question_id = count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage()
            .instance()
            .set(&DataKey::QuestionCount, &question_id);

        let hashed: BytesN<32> = env.crypto().sha256(&answer).into();
        let q = Question {
            question_id,
            question: question.clone(),
            hashed_answer: hashed,
            level: level.clone(),
            hint: hint.clone(),
            version: CURRENT_SCHEMA_VERSION,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Question(question_id), &q);

        let per_level: u32 = get_cap_for_level(&env, &level);
        let idx = index_count(&env, &level);

        if idx >= per_level {
            panic_with_error!(&env, Error::QuestionPerLevelLimit);
        }

        index_append(&env, &level, question_id).unwrap_or_else(|e| panic_with_error!(&env, e));

        env.events()
            .publish((Symbol::new(&env, "question_added"),), (question_id, level));
    }

    /// Adds a question with a precomputed solution hash (issue #683).
    pub fn add_question_with_hash(
        env: Env,
        level: Levels,
        question: Bytes,
        hashed_answer: BytesN<32>,
        hint: Bytes,
    ) -> u64 {
        require_admin(&env);

        if question.is_empty() || hint.is_empty() {
            panic_with_error!(&env, Error::EmptyField);
        }
        if question.len() > MAX_QUESTION_LEN || hint.len() > MAX_HINT_LEN {
            panic_with_error!(&env, Error::InputTooLarge);
        }

        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::QuestionCount)
            .unwrap_or(0u64);
        let question_id = count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage()
            .instance()
            .set(&DataKey::QuestionCount, &question_id);

        let q = Question {
            question_id,
            question: question.clone(),
            hashed_answer,
            level: level.clone(),
            hint: hint.clone(),
            version: CURRENT_SCHEMA_VERSION,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Question(question_id), &q);

        let per_level: u32 = get_cap_for_level(&env, &level);
        let idx = index_count(&env, &level);

        if idx >= per_level {
            panic_with_error!(&env, Error::QuestionPerLevelLimit);
        }

        index_append(&env, &level, question_id).unwrap_or_else(|e| panic_with_error!(&env, e));

        env.events()
            .publish((Symbol::new(&env, "question_added"),), (question_id, level));

        question_id
    }

    pub fn update_question(
        env: Env,
        question_id: u64,
        question: Bytes,
        answer: Bytes,
        level: Levels,
        hint: Bytes,
    ) {
        require_admin(&env);

        if question_id == 0 {
            panic_with_error!(&env, Error::QuestionNotFound);
        }
        if question.is_empty() || answer.is_empty() || hint.is_empty() {
            panic_with_error!(&env, Error::EmptyField);
        }
        validate_question_input(&env, &question, &answer, &hint);

        let existing_key = DataKey::Question(question_id);
        let existing: Question = env
            .storage()
            .persistent()
            .get(&existing_key)
            .ok_or(Error::QuestionNotFound)
            .unwrap();

        let old_level = existing.level.clone();

        let is_retired = env
            .storage()
            .persistent()
            .has(&DataKey::RetiredQuestion(question_id));
        if old_level != level && !is_retired {
            let per_level: u32 = get_cap_for_level(&env, &level);
            if per_level == 0 {
                panic_with_error!(&env, Error::QuestionPerLevelLimit);
            }

            let new_idx = index_count(&env, &level);

            if new_idx >= per_level {
                panic_with_error!(&env, Error::QuestionPerLevelLimit);
            }

            index_append(&env, &level, question_id).unwrap_or_else(|e| panic_with_error!(&env, e));

            let removed = index_remove_by_id(&env, &old_level, question_id)
                .unwrap_or_else(|e| panic_with_error!(&env, e));
            if !removed {
                panic_with_error!(&env, Error::QuestionNotFound);
            }
        }

        let hashed: BytesN<32> = env.crypto().sha256(&answer).into();
        let updated = Question {
            question_id,
            question,
            hashed_answer: hashed,
            level: level.clone(),
            hint,
            version: existing.version,
        };
        env.storage().persistent().set(&existing_key, &updated);

        env.events().publish(
            (Symbol::new(&env, "question_updated"),),
            (question_id, level),
        );
    }

    pub fn set_question_per_level(env: Env, amount: u32) {
        require_admin(&env);
        if amount == 0 {
            panic_with_error!(&env, Error::EmptyField);
        }
        if amount > MAX_QUESTIONS_PER_LEVEL {
            panic_with_error!(&env, Error::InvalidInput);
        }
        env.storage()
            .instance()
            .set(&DataKey::QuestionPerLevel, &amount);
        env.events().publish(
            (Symbol::new(&env, "question_per_level_updated"),),
            (amount,),
        );
    }

    /// Set a question cap for a specific level (issue #467).
    ///
    /// The cap must be ≥ the current `QuestionPerLevelIndex` for that level
    /// (i.e. it cannot be set below the number of questions already indexed).
    /// A cap of zero would make the level permanently unreachable and is rejected.
    ///
    /// After setting, completion for players in this level is measured against
    /// this cap, not the global `QuestionPerLevel`. Levels with no per-level cap
    /// fall back to the global value (default 5).
    pub fn set_question_cap_for_level(env: Env, level: Levels, cap: u32) {
        require_admin(&env);
        if cap == 0 {
            panic_with_error!(&env, Error::CapWouldMakeLevelUnreachable);
        }
        if cap > MAX_QUESTIONS_PER_LEVEL {
            panic_with_error!(&env, Error::InvalidInput);
        }
        // Reject caps below the existing question index so the level remains
        // completable for players already in progress.
        let existing_index = index_count(&env, &level);
        if cap < existing_index {
            panic_with_error!(&env, Error::CapBelowExistingIndex);
        }
        env.storage()
            .instance()
            .set(&DataKey::QuestionCapByLevel(level), &cap);
    }

    /// Returns the effective question cap for `level`.
    ///
    /// Returns the per-level cap if one has been set, otherwise the global
    /// `QuestionPerLevel` value (default 5 when neither is configured).
    pub fn get_question_cap_for_level(env: Env, level: Levels) -> u32 {
        get_cap_for_level(&env, &level)
    }

    pub fn retire_question(env: Env, question_id: u64) {
        require_admin(&env);
        let key = DataKey::Question(question_id);
        if !env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::QuestionNotFound);
        }
        let question: Question = env.storage().persistent().get(&key).unwrap();
        remove_question_from_level(&env, question.level.clone(), question_id);
        env.storage()
            .persistent()
            .set(&DataKey::RetiredQuestion(question_id), &true);
        env.events()
            .publish((Symbol::new(&env, "question_retired"),), (question_id,));
    }

    pub fn set_nft_contract_address(env: Env, new_address: Address) {
        require_admin(&env);
        let old: Option<Address> = env.storage().instance().get(&DataKey::NftContract);
        env.storage()
            .instance()
            .set(&DataKey::NftContract, &new_address);
        env.events().publish(
            (Symbol::new(&env, "nft_contract_updated"),),
            (old, new_address),
        );
    }

    /// Sets the reward token contract address for reward payouts (issue #680).
    pub fn set_reward_token(env: Env, token: Address) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::RewardToken, &token);
        env.events().publish(
            (Symbol::new(&env, "reward_token_updated"),),
            (token,),
        );
    }

    /// Gets the configured reward token contract address (issue #680).
    pub fn get_reward_token(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::RewardToken)
    }

    /// Sets the default reward token payout amount for puzzle completions (issue #680).
    pub fn set_default_reward_amount(env: Env, amount: i128) {
        require_admin(&env);
        if amount < 0 {
            panic_with_error!(&env, Error::InvalidInput);
        }
        env.storage().instance().set(&DataKey::DefaultRewardAmount, &amount);
    }

    /// Sets a puzzle-specific reward token payout amount (issue #680).
    pub fn set_puzzle_reward_amount(env: Env, puzzle_id: u64, amount: i128) {
        require_admin(&env);
        if amount < 0 {
            panic_with_error!(&env, Error::InvalidInput);
        }
        env.storage().instance().set(&DataKey::PuzzleRewardAmount(puzzle_id), &amount);
    }

    /// Gets the reward amount for a given puzzle (issue #680).
    pub fn get_puzzle_reward_amount(env: Env, puzzle_id: u64) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::PuzzleRewardAmount(puzzle_id))
            .or_else(|| env.storage().instance().get(&DataKey::DefaultRewardAmount))
            .unwrap_or(0i128)
    }

    // -----------------------------------------------------------------
    // Player actions
    // -----------------------------------------------------------------

    pub fn submit_answer(env: Env, caller: Address, question_id: u64, answer: Bytes) -> bool {
        if env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::ContractPaused);
        }
        caller.require_auth();
        if question_id == 0 {
            panic_with_error!(&env, Error::QuestionNotFound);
        }
        if answer.is_empty() {
            panic_with_error!(&env, Error::EmptyField);
        }
        if answer.len() > MAX_ANSWER_LEN {
            panic_with_error!(&env, Error::InputTooLarge);
        }

        if read_player_progress(&env, &caller).is_none() {
            Self::initialize_player_progress(env.clone(), caller.clone());
        }

        let key = DataKey::Question(question_id);
        let question: Question = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::QuestionNotFound)
            .unwrap();

        let mut lp: LevelProgressV2 = match read_level_progress(&env, &caller, &question.level) {
            Some(lp) => lp,
            None => LevelProgressV2 {
                player: caller.clone(),
                level: question.level.clone(),
                last_question_index: 0,
                is_completed: false,
                attempts: 0,
                nft_minted: false,
                last_attempt_ledger: 0,
                version: CURRENT_SCHEMA_VERSION,
            },
        };

        if lp.last_question_index == u32::MAX {
            panic_with_error!(&env, Error::ArithmeticOverflow);
        }

        if env
            .storage()
            .persistent()
            .has(&DataKey::RetiredQuestion(question_id))
        {
            panic_with_error!(&env, Error::QuestionRetired);
        }

        let expected_question_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionsByLevel(
                question.level.clone(),
                lp.last_question_index,
            ))
            .unwrap_or(0u64);
        if expected_question_id != question_id {
            panic_with_error!(&env, Error::WrongQuestion);
        }

        let current_ledger = env.ledger().sequence();
        if lp.last_attempt_ledger == current_ledger {
            panic_with_error!(&env, Error::AttemptTooSoon);
        }
        lp.last_attempt_ledger = current_ledger;
        lp.attempts = lp
            .attempts
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));

        let is_correct = if answer.len() == 32 {
            let mut arr = [0u8; 32];
            answer.copy_into_slice(&mut arr);
            let submitted_hash = BytesN::from_array(&env, &arr);
            submitted_hash == question.hashed_answer
        } else {
            let hashed: BytesN<32> = env.crypto().sha256(&answer).into();
            hashed == question.hashed_answer
        };

        if is_correct {
            lp.last_question_index = lp
                .last_question_index
                .checked_add(1)
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
            // Completion is determined by the level-specific cap so that each
            // level can require a different number of correct answers. Falls back
            // to the global cap (issue #467).
            let level_cap: u32 = get_cap_for_level(&env, &question.level);
            if lp.last_question_index >= level_cap {
                lp.is_completed = true;
                let next = question.level.next();
                write_player_progress(
                    &env,
                    &PlayerProgressV2 {
                        address: caller.clone(),
                        current_level: next.clone(),
                        is_initialized: true,
                        version: CURRENT_SCHEMA_VERSION,
                    },
                );

                env.events().publish(
                    (Symbol::new(&env, "level_completed"),),
                    (caller.clone(), question.level.clone(), next),
                );
            }
        }

        write_level_progress(&env, &caller, &question.level, &lp);

        env.events().publish(
            (Symbol::new(&env, "answer_submitted"),),
            (
                caller.clone(),
                question_id,
                question.level.clone(),
                is_correct,
            ),
        );
        is_correct
    }

    /// Records puzzle completion on-chain and validates solution hash (issues #670, #683, #680).
    ///
    /// Validates submitted solution by comparing hash with stored hashed_answer.
    /// Rejects hash mismatch with Error::HashMismatch.
    /// Rejects duplicate completions with Error::AlreadyCompleted.
    /// Emits `puzzle_completed` event with (player, puzzle_id).
    /// Integrates reward token payout if reward token is configured.
    pub fn complete_puzzle(
        env: Env,
        caller: Address,
        puzzle_id: u64,
        solution_hash: BytesN<32>,
    ) -> bool {
        if env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::ContractPaused);
        }
        caller.require_auth();

        if puzzle_id == 0 {
            panic_with_error!(&env, Error::QuestionNotFound);
        }

        let key = DataKey::Question(puzzle_id);
        let question: Question = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::QuestionNotFound));

        if env
            .storage()
            .persistent()
            .has(&DataKey::RetiredQuestion(puzzle_id))
        {
            panic_with_error!(&env, Error::QuestionRetired);
        }

        // Verify submitted solution by comparing hashes (#683)
        if solution_hash != question.hashed_answer {
            panic_with_error!(&env, Error::HashMismatch);
        }

        let completion_key = DataKey::CompletedPuzzle(caller.clone(), puzzle_id);
        if env.storage().persistent().has(&completion_key) {
            panic_with_error!(&env, Error::AlreadyCompleted);
        }

        // Record puzzle completion on-chain (#670)
        env.storage().persistent().set(&completion_key, &true);

        // Cross-contract call to token contract for reward payouts (#680)
        Self::try_payout_reward(&env, &caller, puzzle_id);

        // Emit event with player address and puzzle id (#670)
        env.events().publish(
            (Symbol::new(&env, "puzzle_completed"),),
            (caller, puzzle_id),
        );

        true
    }

    /// Verifies if a solution hash matches a question's stored hash (issue #683).
    pub fn verify_solution_hash(env: Env, puzzle_id: u64, solution_hash: BytesN<32>) -> bool {
        if puzzle_id == 0 {
            panic_with_error!(&env, Error::QuestionNotFound);
        }
        let key = DataKey::Question(puzzle_id);
        let question: Question = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::QuestionNotFound));
        question.hashed_answer == solution_hash
    }

    /// Checks if a player has recorded completion for a puzzle (issue #670).
    pub fn is_puzzle_completed(env: Env, player: Address, puzzle_id: u64) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::CompletedPuzzle(player, puzzle_id))
    }

    /// Allows claiming reward payout for an already completed puzzle (issue #680).
    pub fn claim_puzzle_reward(env: Env, caller: Address, puzzle_id: u64) {
        if env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::ContractPaused);
        }
        caller.require_auth();

        if !Self::is_puzzle_completed(env.clone(), caller.clone(), puzzle_id) {
            panic_with_error!(&env, Error::QuestionNotFound);
        }

        Self::try_payout_reward(&env, &caller, puzzle_id);
    }

    /// Claims an NFT badge reward for a completed puzzle (issue #671).
    pub fn claim_puzzle_nft(
        env: Env,
        caller: Address,
        puzzle_id: u64,
        puzzle_name: soroban_sdk::String,
        difficulty: soroban_sdk::String,
    ) {
        if env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::ContractPaused);
        }
        caller.require_auth();

        if !Self::is_puzzle_completed(env.clone(), caller.clone(), puzzle_id) {
            panic_with_error!(&env, Error::QuestionNotFound);
        }

        let nft_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::NftContract)
            .ok_or(Error::MissingNftContract)
            .unwrap();

        stellar_hunts_nft::StellarHuntsNftClient::new(&env, &nft_contract).mint_puzzle_reward_nft(
            &env.current_contract_address(),
            &caller,
            &puzzle_id,
            &puzzle_name,
            &difficulty,
        );

        env.events().publish(
            (Symbol::new(&env, "puzzle_nft_claimed"),),
            (caller, puzzle_id),
        );
    }

    /// Helper for cross-contract call to token contract for reward payouts (issue #680).
    fn try_payout_reward(env: &Env, recipient: &Address, puzzle_id: u64) {
        if let Some(token_address) = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::RewardToken)
        {
            let amount: i128 = env
                .storage()
                .instance()
                .get(&DataKey::PuzzleRewardAmount(puzzle_id))
                .or_else(|| env.storage().instance().get(&DataKey::DefaultRewardAmount))
                .unwrap_or(0i128);

            if amount > 0 {
                let token_client = soroban_sdk::token::Client::new(env, &token_address);
                let contract_address = env.current_contract_address();
                let transfer_result =
                    token_client.try_transfer(&contract_address, recipient, &amount);
                match transfer_result {
                    Ok(Ok(())) => {
                        env.events().publish(
                            (Symbol::new(env, "reward_paid"),),
                            (recipient.clone(), puzzle_id, amount),
                        );
                    }
                    _ => {
                        panic_with_error!(env, Error::RewardTransferFailed);
                    }
                }
            }
        }
    }

    pub fn request_hint(env: Env, caller: Address, question_id: u64) -> Bytes {
        caller.require_auth();
        if question_id == 0 {
            panic_with_error!(&env, Error::QuestionNotFound);
        }

        let pp = read_player_progress(&env, &caller)
            .ok_or(Error::NotInitialized)
            .unwrap();
        if !pp.is_initialized {
            panic_with_error!(&env, Error::NotInitialized);
        }

        let q: Question = env
            .storage()
            .persistent()
            .get(&DataKey::Question(question_id))
            .ok_or(Error::QuestionNotFound)
            .unwrap();

        if env
            .storage()
            .persistent()
            .has(&DataKey::RetiredQuestion(question_id))
        {
            panic_with_error!(&env, Error::QuestionRetired);
        }

        if pp.current_level != q.level {
            panic_with_error!(&env, Error::WrongLevel);
        }

        let lp: LevelProgressV2 = match read_level_progress(&env, &caller, &q.level) {
            Some(lp) => lp,
            None => LevelProgressV2 {
                player: caller.clone(),
                level: q.level.clone(),
                last_question_index: 0,
                is_completed: false,
                attempts: 0,
                nft_minted: false,
                last_attempt_ledger: 0,
                version: CURRENT_SCHEMA_VERSION,
            },
        };

        if lp.attempts == 0 {
            panic_with_error!(&env, Error::NotInitialized);
        }

        env.events().publish(
            (Symbol::new(&env, "hint_requested"),),
            (caller.clone(), question_id, q.level.clone()),
        );
        q.hint
    }

    pub fn claim_level_completion_nft(env: Env, caller: Address, level: Levels) {
        if env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::ContractPaused);
        }
        caller.require_auth();

        if read_player_progress(&env, &caller).is_none() {
            Self::initialize_player_progress(env.clone(), caller.clone());
        }

        let lp = read_level_progress(&env, &caller, &level)
            .ok_or(Error::NotInitialized)
            .unwrap();
        if !lp.is_completed {
            panic_with_error!(&env, Error::LevelNotCompleted);
        }

        Self::mint_level_badge(env, caller, level);
    }

    fn mint_level_badge(env: Env, player: Address, level: Levels) {
        let mut lp: LevelProgressV2 = read_level_progress(&env, &player, &level).unwrap();
        if !lp.is_completed {
            panic_with_error!(&env, Error::LevelNotCompleted);
        }
        if lp.nft_minted {
            panic_with_error!(&env, Error::AlreadyMinted);
        }

        let nft_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::NftContract)
            .ok_or(Error::MissingNftContract)
            .unwrap();

        // Cross-contract call to the NFT contract. We pass our own contract
        // address as the minter; the NFT contract verifies the caller is a
        // registered minter via `minter.require_auth()` +
        // `has_minter_role(minter)`. The auth context from this contract
        // satisfies `minter.require_auth()`.
        stellar_hunts_nft::StellarHuntsNftClient::new(&env, &nft_contract).mint_level_badge(
            &env.current_contract_address(),
            &player,
            &level,
        );

        lp.nft_minted = true;
        write_level_progress(&env, &player, &level, &lp);

        env.events()
            .publish((Symbol::new(&env, "level_badge_minted"),), (player, level));
    }

    // -----------------------------------------------------------------
    // View fns
    // -----------------------------------------------------------------

    pub fn get_question(env: Env, question_id: u64) -> Question {
        if question_id == 0 {
            panic_with_error!(&env, Error::QuestionNotFound);
        }
        match env
            .storage()
            .persistent()
            .get(&DataKey::Question(question_id))
        {
            Some(q) => q,
            None => panic_with_error!(&env, Error::QuestionNotFound),
        }
    }

    pub fn get_question_per_level(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::QuestionPerLevel)
            .unwrap_or(0u32)
    }

    /// Whether `question_id` was retired by an admin (#447).
    ///
    /// `get_question` still returns the question body so clients can show
    /// what was retired, but the flag lets them grey it out and explains the
    /// `QuestionRetired` error raised by `submit_answer` / `request_hint`.
    pub fn is_question_retired(env: Env, question_id: u64) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::RetiredQuestion(question_id))
    }

    pub fn get_question_in_level(env: Env, level: Levels, index: u32) -> Bytes {
        if index >= index_count(&env, &level) {
            panic_with_error!(&env, Error::QuestionNotFound);
        }
        let question_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionsByLevel(level, index))
            .unwrap_or(0u64);
        let q: Question = match env
            .storage()
            .persistent()
            .get(&DataKey::Question(question_id))
        {
            Some(q) => q,
            None => panic_with_error!(&env, Error::QuestionNotFound),
        };
        q.question
    }

    pub fn get_player_level(env: Env, player: Address) -> Levels {
        match read_player_progress(&env, &player) {
            Some(pp) => pp.current_level,
            None => Levels::Easy,
        }
    }

    pub fn get_nft_contract_address(env: Env) -> Address {
        match env.storage().instance().get(&DataKey::NftContract) {
            Some(addr) => addr,
            None => panic_with_error!(&env, Error::MissingNftContract),
        }
    }

    /// Read-only view over a player's per-level progress (legacy ABI).
    /// Reads the versioned V2 record first, then falls back to any
    /// pre-versioning record under the original key. The identity fields
    /// of a synthesized default carry the queried player and level
    /// (issue #449). Views never migrate; migration happens lazily on the
    /// player's next write (issue #463).
    pub fn get_player_level_progress(env: Env, player: Address, level: Levels) -> LevelProgress {
        match read_level_progress(&env, &player, &level) {
            Some(v2) => LevelProgress {
                player: v2.player,
                level: v2.level,
                last_question_index: v2.last_question_index,
                is_completed: v2.is_completed,
                attempts: v2.attempts,
                nft_minted: v2.nft_minted,
                last_attempt_ledger: v2.last_attempt_ledger,
            },
            None => LevelProgress {
                player,
                level,
                last_question_index: 0,
                is_completed: false,
                attempts: 0,
                nft_minted: false,
                last_attempt_ledger: 0,
            },
        }
    }

    /// Versioned variant of `get_player_level_progress` (issue #463).
    /// Returns the record including the schema `version` it was written
    /// under: `LEGACY_RECORD_VERSION` for pre-versioning records,
    /// `CURRENT_SCHEMA_VERSION` for versioned records, and `0` for a
    /// synthesized default (player has no record at all).
    pub fn get_player_level_progress_v2(
        env: Env,
        player: Address,
        level: Levels,
    ) -> LevelProgressV2 {
        match read_level_progress(&env, &player, &level) {
            Some(v2) => v2,
            None => LevelProgressV2 {
                player,
                level,
                last_question_index: 0,
                is_completed: false,
                attempts: 0,
                nft_minted: false,
                last_attempt_ledger: 0,
                version: 0,
            },
        }
    }

    /// Versioned view over a player's top-level progress record
    /// (issue #463). Same version semantics as
    /// `get_player_level_progress_v2`.
    pub fn get_player_progress_v2(env: Env, player: Address) -> PlayerProgressV2 {
        match read_player_progress(&env, &player) {
            Some(pp) => pp,
            None => PlayerProgressV2 {
                address: player.clone(),
                current_level: Levels::Easy,
                is_initialized: false,
                version: 0,
            },
        }
    }

    pub fn next_level(_env: Env, level: Levels) -> Levels {
        level.next()
    }

    pub fn pause(env: Env) {
        require_admin(&env);
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        env.storage().instance().set(&DataKey::Paused, &true);
        env.events().publish(
            (Symbol::new(&env, "contract_paused"),),
            (admin,),
        );
    }

    pub fn unpause(env: Env) {
        require_admin(&env);
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        env.storage().instance().set(&DataKey::Paused, &false);
        env.events().publish(
            (Symbol::new(&env, "contract_unpaused"),),
            (admin,),
        );
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------
    // Staking for score multipliers (#675)
    // -----------------------------------------------------------------

    /// Creates a hunt event with an active time window and a multiplier (in basis points, e.g. 150 = 1.5x).
    pub fn create_event(
        env: Env,
        event_id: u64,
        start_time: u64,
        end_time: u64,
        multiplier_bps: u32,
    ) {
        require_admin(&env);
        if start_time >= end_time || multiplier_bps < 100 {
            panic_with_error!(&env, Error::EmptyField);
        }
        let event = HuntEvent {
            event_id,
            start_time,
            end_time,
            multiplier_bps,
            active: true,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Event(event_id), &event);
        env.events().publish(
            (Symbol::new(&env, "event_created"),),
            (event_id, start_time, end_time, multiplier_bps),
        );
    }

    pub fn get_event(env: Env, event_id: u64) -> HuntEvent {
        env.storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .ok_or(Error::EventNotFound)
            .unwrap()
    }

    /// Stake a level badge NFT to activate a score multiplier for an active event (#675).
    pub fn stake_badge(env: Env, player: Address, event_id: u64, level: Levels) {
        if env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::ContractPaused);
        }
        player.require_auth();

        let event = Self::get_event(env.clone(), event_id);
        let now = env.ledger().timestamp();
        if !event.active || now < event.start_time || now > event.end_time {
            panic_with_error!(&env, Error::EventNotActive);
        }

        let nft_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::NftContract)
            .ok_or(Error::MissingNftContract)
            .unwrap();

        let has_badge = stellar_hunts_nft::StellarHuntsNftClient::new(&env, &nft_contract)
            .has_level_badge(&player, &level);
        if !has_badge {
            panic_with_error!(&env, Error::BadgeNotOwned);
        }

        let stake_key = DataKey::BadgeStake(player.clone(), event_id, level.clone());
        if env.storage().persistent().has(&stake_key) {
            panic_with_error!(&env, Error::AlreadyStaked);
        }

        let stake = BadgeStake {
            player: player.clone(),
            event_id,
            level: level.clone(),
            staked_at: now,
            is_slashed: false,
        };
        env.storage().persistent().set(&stake_key, &stake);

        env.events().publish(
            (Symbol::new(&env, "badge_staked"),),
            (player, event_id, level),
        );
    }

    /// Unstake a badge NFT after or during an active event (#675).
    pub fn unstake_badge(env: Env, player: Address, event_id: u64, level: Levels) {
        player.require_auth();

        let stake_key = DataKey::BadgeStake(player.clone(), event_id, level.clone());
        let stake: BadgeStake = env
            .storage()
            .persistent()
            .get(&stake_key)
            .ok_or(Error::StakeNotFound)
            .unwrap();

        if stake.is_slashed {
            panic_with_error!(&env, Error::StakeSlashed);
        }

        env.storage().persistent().remove(&stake_key);

        env.events().publish(
            (Symbol::new(&env, "badge_unstaked"),),
            (player, event_id, level),
        );
    }

    /// Slashing logic for stakes in expired events (#675).
    pub fn slash_expired_stake(env: Env, player: Address, event_id: u64, level: Levels) {
        let event = Self::get_event(env.clone(), event_id);
        let now = env.ledger().timestamp();
        if now <= event.end_time {
            panic_with_error!(&env, Error::EventNotActive);
        }

        let stake_key = DataKey::BadgeStake(player.clone(), event_id, level.clone());
        let mut stake: BadgeStake = env
            .storage()
            .persistent()
            .get(&stake_key)
            .ok_or(Error::StakeNotFound)
            .unwrap();

        if stake.is_slashed {
            return;
        }

        stake.is_slashed = true;
        env.storage().persistent().set(&stake_key, &stake);

        env.events().publish(
            (Symbol::new(&env, "stake_slashed"),),
            (player, event_id, level),
        );
    }

    /// Returns the active score multiplier in basis points (100 = 1.0x).
    /// Multiplier applies only within the active event window (#675).
    pub fn get_player_multiplier(
        env: Env,
        player: Address,
        event_id: u64,
        level: Levels,
    ) -> u32 {
        let event: HuntEvent = match env.storage().persistent().get(&DataKey::Event(event_id)) {
            Some(e) => e,
            None => return 100,
        };
        let now = env.ledger().timestamp();
        if !event.active || now < event.start_time || now > event.end_time {
            return 100;
        }

        let stake_key = DataKey::BadgeStake(player, event_id, level);
        match env.storage().persistent().get::<DataKey, BadgeStake>(&stake_key) {
            Some(stake) if !stake.is_slashed => event.multiplier_bps,
            _ => 100,
        }
    }

    /// Inspect a player's badge stake.
    pub fn get_stake(
        env: Env,
        player: Address,
        event_id: u64,
        level: Levels,
    ) -> Option<BadgeStake> {
        let stake_key = DataKey::BadgeStake(player, event_id, level);
        env.storage().persistent().get(&stake_key)
    }

    pub fn get_schema_version(e: Env) -> u32 {
        get_schema_version(&e)
    }

    /// Admin migration entry point driven by `scripts/contract-schema.sh`.
    ///
    /// The off-chain driver refuses to run unless the deployed version equals
    /// the expected starting version; this contract-side check is a second
    /// guard. Once the starting version is confirmed, the recorded schema
    /// version is stamped to `CURRENT_SCHEMA_VERSION` so the operation is
    /// idempotent and repeatable across batches. Struct-level data migrations
    /// are tracked separately (see onchain/docs/storage-versioning.md).
    ///
    /// `batch_size` bounds the amount of work a single invocation performs;
    /// it must be non-zero so the driver can never loop without progressing.
    pub fn migrate_schema(env: Env, from_version: u32, batch_size: u32) -> u32 {
        require_admin(&env);

        if batch_size == 0 {
            panic_with_error!(&env, Error::EmptyField);
        }

        let deployed = get_schema_version(&env);
        if deployed != from_version {
            panic_with_error!(&env, Error::SchemaVersionMismatch);
        }

        if deployed != CURRENT_SCHEMA_VERSION {
            set_schema_version(&env);
            env.events().publish(
                (Symbol::new(&env, "schema_migrated"),),
                (deployed, CURRENT_SCHEMA_VERSION),
            );
        }

        CURRENT_SCHEMA_VERSION
    }

    // -----------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------

    fn initialize_player_progress(env: Env, player: Address) {
        write_player_progress(
            &env,
            &PlayerProgressV2 {
                address: player.clone(),
                current_level: Levels::Easy,
                is_initialized: true,
                version: CURRENT_SCHEMA_VERSION,
            },
        );

        write_level_progress(
            &env,
            &player,
            &Levels::Easy,
            &LevelProgressV2 {
                player: player.clone(),
                level: Levels::Easy,
                last_question_index: 0,
                is_completed: false,
                attempts: 0,
                nft_minted: false,
                last_attempt_ledger: 0,
                version: CURRENT_SCHEMA_VERSION,
            },
        );

        env.events().publish(
            (Symbol::new(&env, "player_initialized"),),
            (player, Levels::Easy),
        );
    }
}

/// Removes a question from its level index and compacts subsequent entries.
/// Returns the new number of questions in that level.
fn remove_question_from_level(env: &Env, level: Levels, question_id: u64) -> u32 {
    let count: u32 = env
        .storage()
        .persistent()
        .get(&DataKey::QuestionPerLevelIndex(level.clone()))
        .unwrap_or(0u32);
    if count == 0 {
        return 0;
    }
    let Some(index) = (0..count).find(|index| {
        env.storage()
            .persistent()
            .get::<DataKey, u64>(&DataKey::QuestionsByLevel(level.clone(), *index))
            == Some(question_id)
    }) else {
        return count;
    };
    let Some(last) = count.checked_sub(1) else {
        return 0;
    };
    for current in index..last {
        let next: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionsByLevel(level.clone(), current + 1))
            .unwrap_or(0u64);
        env.storage()
            .persistent()
            .set(&DataKey::QuestionsByLevel(level.clone(), current), &next);
    }
    let new_count = last;
    env.storage()
        .persistent()
        .remove(&DataKey::QuestionsByLevel(level.clone(), new_count));
    env.storage()
        .persistent()
        .set(&DataKey::QuestionPerLevelIndex(level), &new_count);
    new_count
}

fn validate_question_input(env: &Env, question: &Bytes, answer: &Bytes, hint: &Bytes) {
    if question.len() > MAX_QUESTION_LEN
        || answer.len() > MAX_ANSWER_LEN
        || hint.len() > MAX_HINT_LEN
    {
        panic_with_error!(env, Error::InputTooLarge);
    }
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

fn require_admin(env: &Env) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
    admin.require_auth();
}

// ---------------------------------------------------------------------
// Level question index helpers and invariant (issue #464)
// ---------------------------------------------------------------------
//
// Index Invariant:
// 1. `QuestionPerLevelIndex(level)` stores the total count `N` of active questions at `level`.
// 2. For every `i` in `0..N`, `QuestionsByLevel(level, i)` contains the `i`-th live question ID.
// 3. The entries at indices `0..N` contain each live question ID for that level exactly once.
// 4. Slots at index `>= N` are cleared/unmapped (no trailing stale entries).
// 5. Appending increments `N` and writes at index `N_old`.
// 6. Removing by ID shifts all subsequent entries down by 1 to maintain contiguous indices `0..N-1`,
//    removes slot `N-1`, and decrements `N`.

/// Returns the effective question cap for `level`.
///
/// If a per-level cap has been set via `set_question_cap_for_level` it is
/// returned. Otherwise the global `QuestionPerLevel` value is used, defaulting
/// to 5 when neither has been configured. This matches the existing
/// `unwrap_or(5u32)` behaviour in `add_question`.
pub fn get_cap_for_level(env: &Env, level: &Levels) -> u32 {
    // Per-level cap takes precedence.
    if let Some(cap) = env
        .storage()
        .instance()
        .get::<DataKey, u32>(&DataKey::QuestionCapByLevel(level.clone()))
    {
        return cap;
    }
    // Fall back to the global cap (default 5 if unset).
    env.storage()
        .instance()
        .get(&DataKey::QuestionPerLevel)
        .unwrap_or(5u32)
}

fn index_count(env: &Env, level: &Levels) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::QuestionPerLevelIndex(level.clone()))
        .unwrap_or(0u32)
}

fn index_append(env: &Env, level: &Levels, question_id: u64) -> Result<u32, Error> {
    let idx = index_count(env, level);
    let next_index = idx.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
    env.storage()
        .persistent()
        .set(&DataKey::QuestionsByLevel(level.clone(), idx), &question_id);
    env.storage()
        .persistent()
        .set(&DataKey::QuestionPerLevelIndex(level.clone()), &next_index);
    Ok(idx)
}

fn index_remove_by_id(env: &Env, level: &Levels, question_id: u64) -> Result<bool, Error> {
    let count = index_count(env, level);
    if count == 0 {
        return Ok(false);
    }

    let mut found_idx: Option<u32> = None;
    for i in 0..count {
        let qid: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionsByLevel(level.clone(), i))
            .unwrap_or(0u64);
        if qid == question_id {
            found_idx = Some(i);
            break;
        }
    }

    let Some(i) = found_idx else {
        return Ok(false);
    };

    let last_idx = count.checked_sub(1).ok_or(Error::ArithmeticOverflow)?;

    for j in i..last_idx {
        let Some(next_index) = j.checked_add(1) else {
            return Err(Error::ArithmeticOverflow);
        };
        let next_qid: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionsByLevel(level.clone(), next_index))
            .unwrap_or(0u64);
        env.storage()
            .persistent()
            .set(&DataKey::QuestionsByLevel(level.clone(), j), &next_qid);
    }

    env.storage()
        .persistent()
        .remove(&DataKey::QuestionsByLevel(level.clone(), last_idx));

    env.storage()
        .persistent()
        .set(&DataKey::QuestionPerLevelIndex(level.clone()), &last_idx);

    Ok(true)
}

#[cfg(test)]
mod test;

#[cfg(test)]
mod bench;
