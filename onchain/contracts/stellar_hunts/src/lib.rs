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
}

// ---------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------

const CURRENT_SCHEMA_VERSION: u32 = 2;

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
    /// Returned when an admin tries to set a per-level cap below the number
    /// of questions already indexed for that level.
    CapBelowExistingIndex = 15,
    /// Returned when an admin tries to set a per-level cap of zero (which
    /// would make the level permanently unreachable).
    CapWouldMakeLevelUnreachable = 16,
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
        set_schema_version(&env);
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
    // Admin actions
    // -----------------------------------------------------------------

    pub fn add_question(env: Env, level: Levels, question: Bytes, answer: Bytes, hint: Bytes) {
        require_admin(&env);

        if question.is_empty() || answer.is_empty() || hint.is_empty() {
            panic_with_error!(&env, Error::EmptyField);
        }

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
        env.storage()
            .instance()
            .set(&DataKey::QuestionPerLevel, &amount);
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
        env.storage().persistent().set(&DataKey::RetiredQuestion(question_id), &true);
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

        let expected_question_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionsByLevel(question.level.clone(), lp.last_question_index))
            .unwrap_or(0u64);
        if expected_question_id != question_id
            || env.storage().persistent().has(&DataKey::RetiredQuestion(question_id))
        {
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

        let hashed: BytesN<32> = env.crypto().sha256(&answer).into();
        let is_correct = hashed == question.hashed_answer;

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

    pub fn request_hint(env: Env, caller: Address, question_id: u64) -> Bytes {
        caller.require_auth();

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
        env.storage().instance().set(&DataKey::Paused, &true);
    }

    pub fn unpause(env: Env) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
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
    for current in index..count - 1 {
        let next: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionsByLevel(level.clone(), current + 1))
            .unwrap_or(0u64);
        env.storage()
            .persistent()
            .set(&DataKey::QuestionsByLevel(level.clone(), current), &next);
    }
    let new_count = count - 1;
    env.storage()
        .persistent()
        .remove(&DataKey::QuestionsByLevel(level.clone(), new_count));
    env.storage()
        .persistent()
        .set(&DataKey::QuestionPerLevelIndex(level), &new_count);
    new_count
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
        let next_qid: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionsByLevel(level.clone(), j + 1))
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
