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
    Question(u64),
    RetiredQuestion(u64),
    QuestionsByLevel(Levels, u32),
    QuestionPerLevelIndex(Levels),
    PlayerProgress(Address),
    PlayerLevelProgress(Address, Levels),
    SchemaVersion,
    Paused,
}

// ---------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------

const CURRENT_SCHEMA_VERSION: u32 = 1;

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

        let per_level: u32 = env
            .storage()
            .instance()
            .get(&DataKey::QuestionPerLevel)
            .unwrap_or(5u32);
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
            let per_level: u32 = env
                .storage()
                .instance()
                .get(&DataKey::QuestionPerLevel)
                .unwrap_or(0u32);
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

        if !env
            .storage()
            .persistent()
            .has(&DataKey::PlayerProgress(caller.clone()))
        {
            Self::initialize_player_progress(env.clone(), caller.clone());
        }

        let key = DataKey::Question(question_id);
        let question: Question = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::QuestionNotFound)
            .unwrap();

        // Retired questions are inert: reject the submission before any
        // progress is written so a leaked/invalid question cannot be graded
        // or advance the player (#447).
        if env
            .storage()
            .persistent()
            .has(&DataKey::RetiredQuestion(question_id))
        {
            panic_with_error!(&env, Error::QuestionRetired);
        }

        let lp_key = DataKey::PlayerLevelProgress(caller.clone(), question.level.clone());
        let mut lp: LevelProgress =
            env.storage()
                .persistent()
                .get(&lp_key)
                .unwrap_or(LevelProgress {
                    player: caller.clone(),
                    level: question.level.clone(),
                    last_question_index: 0,
                    is_completed: false,
                    attempts: 0,
                    nft_minted: false,
                    last_attempt_ledger: 0,
                });

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
            let active_questions: u32 = env
                .storage()
                .persistent()
                .get(&DataKey::QuestionPerLevelIndex(question.level.clone()))
                .unwrap_or(0u32);
            if lp.last_question_index >= active_questions {
                lp.is_completed = true;
                let next = question.level.next();
                let pp = PlayerProgress {
                    address: caller.clone(),
                    current_level: next.clone(),
                    is_initialized: true,
                };
                env.storage()
                    .persistent()
                    .set(&DataKey::PlayerProgress(caller.clone()), &pp);

                env.events().publish(
                    (Symbol::new(&env, "level_completed"),),
                    (caller.clone(), question.level.clone(), next),
                );
            }
        }

        env.storage().persistent().set(&lp_key, &lp);

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

        let pp: PlayerProgress = env
            .storage()
            .persistent()
            .get(&DataKey::PlayerProgress(caller.clone()))
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

        let lp_key = DataKey::PlayerLevelProgress(caller.clone(), q.level.clone());
        let lp: LevelProgress = env
            .storage()
            .persistent()
            .get(&lp_key)
            .unwrap_or(LevelProgress {
                player: caller.clone(),
                level: q.level.clone(),
                last_question_index: 0,
                is_completed: false,
                attempts: 0,
                nft_minted: false,
                last_attempt_ledger: 0,
            });

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

        if !env
            .storage()
            .persistent()
            .has(&DataKey::PlayerProgress(caller.clone()))
        {
            Self::initialize_player_progress(env.clone(), caller.clone());
        }

        let lp_key = DataKey::PlayerLevelProgress(caller.clone(), level.clone());
        let lp: LevelProgress = env
            .storage()
            .persistent()
            .get(&lp_key)
            .ok_or(Error::NotInitialized)
            .unwrap();
        if !lp.is_completed {
            panic_with_error!(&env, Error::LevelNotCompleted);
        }

        Self::mint_level_badge(env, caller, level);
    }

    fn mint_level_badge(env: Env, player: Address, level: Levels) {
        let lp_key = DataKey::PlayerLevelProgress(player.clone(), level.clone());
        let mut lp: LevelProgress = env.storage().persistent().get(&lp_key).unwrap();
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
        env.storage().persistent().set(&lp_key, &lp);

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
        let pp_key = DataKey::PlayerProgress(player);
        if !env.storage().persistent().has(&pp_key) {
            return Levels::Easy;
        }
        let pp: PlayerProgress = match env.storage().persistent().get(&pp_key) {
            Some(pp) => pp,
            None => panic_with_error!(&env, Error::NotInitialized),
        };
        pp.current_level
    }

    pub fn get_nft_contract_address(env: Env) -> Address {
        match env.storage().instance().get(&DataKey::NftContract) {
            Some(addr) => addr,
            None => panic_with_error!(&env, Error::MissingNftContract),
        }
    }

    pub fn get_player_level_progress(env: Env, player: Address, level: Levels) -> LevelProgress {
        let key = DataKey::PlayerLevelProgress(player.clone(), level.clone());
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or(LevelProgress {
                // Issue #449: the default for a player with no stored record
                // must carry the queried `player` identity, not the contract
                // address, so callers can key caches and cross-check the
                // response against the request.
                player,
                level,
                last_question_index: 0,
                is_completed: false,
                attempts: 0,
                nft_minted: false,
                last_attempt_ledger: 0,
            })
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
        let pp = PlayerProgress {
            address: player.clone(),
            current_level: Levels::Easy,
            is_initialized: true,
        };
        env.storage()
            .persistent()
            .set(&DataKey::PlayerProgress(player.clone()), &pp);

        let lp = LevelProgress {
            player: player.clone(),
            level: Levels::Easy,
            last_question_index: 0,
            is_completed: false,
            attempts: 0,
            nft_minted: false,
            last_attempt_ledger: 0,
        };
        env.storage().persistent().set(
            &DataKey::PlayerLevelProgress(player.clone(), Levels::Easy),
            &lp,
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
