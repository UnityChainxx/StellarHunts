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
    pub last_question_index: u32,
    pub is_completed: bool,
    pub attempts: u32,
    pub nft_minted: bool,
}

// ---------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    NftContract,
    QuestionCount,
    QuestionPerLevel,
    Question(u64),
    QuestionsByLevel(Levels, u32),
    QuestionPerLevelIndex(Levels),
    PlayerProgress(Address),
    PlayerLevelProgress(Address, Levels),
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
        let question_id = count + 1;
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
        };
        env.storage()
            .persistent()
            .set(&DataKey::Question(question_id), &q);

        let per_level: u32 = env
            .storage()
            .instance()
            .get(&DataKey::QuestionPerLevel)
            .unwrap_or(0u32);
        let idx: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionPerLevelIndex(level.clone()))
            .unwrap_or(0u32);

        if per_level == 0 || idx >= per_level {
            panic_with_error!(&env, Error::QuestionPerLevelLimit);
        }

        env.storage()
            .persistent()
            .set(&DataKey::QuestionsByLevel(level.clone(), idx), &question_id);
        env.storage()
            .persistent()
            .set(&DataKey::QuestionPerLevelIndex(level.clone()), &(idx + 1));

        env.events()
            .publish((Symbol::new(&env, "question_added"),), (question_id, level));
    }

    pub fn update_question(
        env: Env,
        question_id: u64,
        question: Bytes,
        answer: Bytes,
        _level: Levels,
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

        let hashed: BytesN<32> = env.crypto().sha256(&answer).into();
        let updated = Question {
            question_id,
            question,
            hashed_answer: hashed,
            level: existing.level.clone(),
            hint,
        };
        env.storage().persistent().set(&existing_key, &updated);

        env.events().publish(
            (Symbol::new(&env, "question_updated"),),
            (question_id, existing.level),
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
                });
        lp.attempts += 1;

        let hashed: BytesN<32> = env.crypto().sha256(&answer).into();
        let is_correct = hashed == question.hashed_answer;

        if is_correct {
            lp.last_question_index += 1;
            let per_level: u32 = env
                .storage()
                .instance()
                .get(&DataKey::QuestionPerLevel)
                .unwrap_or(0u32);
            if per_level == 0 {
                panic_with_error!(&env, Error::QuestionPerLevelLimit);
            }
            if lp.last_question_index >= per_level {
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

        if pp.current_level != q.level {
            panic_with_error!(&env, Error::WrongLevel);
        }

        env.events().publish(
            (Symbol::new(&env, "hint_requested"),),
            (caller.clone(), question_id, q.level.clone()),
        );
        q.hint
    }

    pub fn claim_level_completion_nft(env: Env, caller: Address, level: Levels) {
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
        env.storage()
            .persistent()
            .get(&DataKey::Question(question_id))
            .ok_or(Error::QuestionNotFound)
            .unwrap()
    }

    pub fn get_question_per_level(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::QuestionPerLevel)
            .unwrap_or(0u32)
    }

    pub fn get_question_in_level(env: Env, level: Levels, index: u32) -> Bytes {
        let question_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::QuestionsByLevel(level, index))
            .unwrap_or(0u64);
        let q: Question = env
            .storage()
            .persistent()
            .get(&DataKey::Question(question_id))
            .unwrap();
        q.question
    }

    pub fn get_player_level(env: Env, player: Address) -> Levels {
        let pp_key = DataKey::PlayerProgress(player);
        if !env.storage().persistent().has(&pp_key) {
            return Levels::Easy;
        }
        let pp: PlayerProgress = env.storage().persistent().get(&pp_key).unwrap();
        pp.current_level
    }

    pub fn get_nft_contract_address(env: Env) -> Address {
        env.storage().instance().get(&DataKey::NftContract).unwrap()
    }

    pub fn get_player_level_progress(env: Env, player: Address, level: Levels) -> LevelProgress {
        let key = DataKey::PlayerLevelProgress(player, level.clone());
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or(LevelProgress {
                player: env.current_contract_address(),
                level,
                last_question_index: 0,
                is_completed: false,
                attempts: 0,
                nft_minted: false,
            })
    }

    pub fn next_level(_env: Env, level: Levels) -> Levels {
        level.next()
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

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

fn require_admin(env: &Env) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("admin not set");
    admin.require_auth();
}

#[cfg(test)]
mod test;
