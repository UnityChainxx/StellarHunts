#![cfg(test)]

use crate::{StellarHunts, StellarHuntsClient};
// Brings `Address::generate` into scope as an extension trait method.
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger;
use soroban_sdk::{Address, Bytes, BytesN, Env};
use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};

/// Generate a fresh admin address (distinct from the destructured binding
/// returned by `init_with_admin`).
fn new_admin(env: &Env) -> Address {
    Address::generate(env)
}

fn user(env: &Env) -> Address {
    Address::generate(env)
}


#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RateLimitConfig {
    pub max_requests_per_day: u32,
    pub max_value_per_day: u128,
    pub chain_daily_limit: u128,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            max_requests_per_day: 10,
            max_value_per_day: 1_000_000_000_000_000_000,
            chain_daily_limit: 10_000_000_000_000_000_000,
        }
    }
}

impl RateLimitConfig {
    /// Validates that a proposed update keeps all limits positive.
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.max_requests_per_day == 0 || self.max_value_per_day == 0 || self.chain_daily_limit == 0 {
            return Err("rate limit values must be positive");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_current_hardcoded_values() {
        let cfg = RateLimitConfig::default();
        assert_eq!(cfg.max_requests_per_day, 10);
        assert_eq!(cfg.max_value_per_day, 1_000_000_000_000_000_000);
    }

    #[test]
    fn rejects_zeroed_limits() {
        let cfg = RateLimitConfig { max_requests_per_day: 0, ..RateLimitConfig::default() };
        assert!(cfg.validate().is_err());
    }
}


fn b(env: &Env, s: &str) -> Bytes {
    Bytes::from_slice(env, s.as_bytes())
}

// ---------------------------------------------------------------------
// Helper: init contract with selective auth for the `init` call
// ---------------------------------------------------------------------

/// Register the contract, grant admin auth specifically for `init`, then
/// call `init`.  Returns `(admin, contract_address, client)` so callers
/// can set up further `mock_auths` for subsequent admin/player calls.
fn init_with_admin(env: &Env) -> (Address, Address, StellarHuntsClient) {
    let admin = new_admin(env);
    let contract_id: BytesN<32> = env.register_contract(None, StellarHunts);
    let contract_address = Address::from_contract_id(env, &contract_id);
    let client = StellarHuntsClient::new(env, &contract_id);

    // Grant admin auth **only** for the `init` call.
    env.mock_auths(&[MockAuth {
        address: admin.clone(),
        invoke: MockAuthInvoke {
            contract: contract_address.clone(),
            fn_name: "init",
            args: Vec::new(env),
            sub_invokes: Vec::new(env),
        },
    }]);

    client.init(&admin);
    (admin, contract_address, client)
}

// ---------------------------------------------------------------------
// Positive: admin can set question per level
// ---------------------------------------------------------------------

#[test]
fn test_set_question_per_level_admin_only() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = init_with_admin(&env);
    let (admin, contract_address, client) = init_with_admin(&env);

    env.mock_auths(&[MockAuth {
        address: admin.clone(),
        invoke: MockAuthInvoke {
            contract: contract_address.clone(),
            fn_name: "set_question_per_level",
            args: Vec::new(env),
            sub_invokes: Vec::new(env),
        },
    }]);

    client.set_question_per_level(&5u32);
    assert_eq!(client.get_question_per_level(), 5);
}

// ---------------------------------------------------------------------
// Negative: non-admin calling set_question_per_level should panic
// ---------------------------------------------------------------------

#[test]
fn test_set_question_per_level_unauthorized() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    // No mock auth for admin + "set_question_per_level" → require_auth fails.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_question_per_level(&5u32);
    }));
    assert!(result.is_err(), "non-admin should not be able to set_question_per_level");
}

// ---------------------------------------------------------------------
// Positive: add question and get it back
// ---------------------------------------------------------------------

#[test]
fn test_add_and_get_question() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = init_with_admin(&env);
    let (admin, contract_address, client) = init_with_admin(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "What is the capital of France?");
    let answer = b(&env, "Paris");
    let hint = b(&env, "It starts with P");

    // Set up admin auth for both admin-only calls.
    env.mock_auths(&[
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "set_question_per_level",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "add_question",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
    ]);

    client.set_question_per_level(&5u32);
    client.add_question(&level, &question, &answer, &hint);

    let got = client.get_question(&1u64);
    assert_eq!(got.question_id, 1);
}

// ---------------------------------------------------------------------
// Negative: non-admin calling add_question should panic
// ---------------------------------------------------------------------

#[test]
fn test_add_question_unauthorized() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "Should I be here?");
    let answer = b(&env, "No");
    let hint = b(&env, "Only admin can add");

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.add_question(&level, &question, &answer, &hint);
    }));
    assert!(result.is_err(), "non-admin should not be able to add_question");
}

// ---------------------------------------------------------------------
// Correct answer progresses the player
// ---------------------------------------------------------------------

#[test]
fn test_submit_answer_correct_progresses() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "What is 2+2?");
    let answer = b(&env, "4");
    let hint = b(&env, "basic math");

    // Set up auths for admin (setup) and player (submit_answer).
    env.mock_auths(&[
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "set_question_per_level",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "add_question",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: player.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "submit_answer",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
    ]);

    client.set_question_per_level(&1u32);
    client.add_question(&level, &question, &answer, &hint);

    let ok = client.submit_answer(&player, &1u64, &answer);
    assert!(ok);
    // After 1 of 1 correct answers, level complete and progression to Medium.
    let new_level = client.get_player_level(&player);
    assert_eq!(new_level, crate::Levels::Medium);
}

// ---------------------------------------------------------------------
// Incorrect answer does NOT progress the player
// ---------------------------------------------------------------------

#[test]
fn test_submit_answer_incorrect_does_not_progress() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "What is 2+2?");
    let answer = b(&env, "4");
    let wrong = b(&env, "5");
    let hint = b(&env, "basic math");

    env.mock_auths(&[
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "set_question_per_level",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "add_question",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: player.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "submit_answer",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
    ]);

    client.set_question_per_level(&1u32);
    client.add_question(&level, &question, &answer, &hint);

    let ok = client.submit_answer(&player, &1u64, &wrong);
    assert!(!ok);
    // Still on Easy.
    let new_level = client.get_player_level(&player);
    assert_eq!(new_level, crate::Levels::Easy);
}

// ---------------------------------------------------------------------
// Hint request after answering a question
// ---------------------------------------------------------------------

#[test]
fn test_request_hint_after_initialize() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    let level = crate::Levels::Easy;
    let q1 = b(&env, "Q1");
    let a1 = b(&env, "A1");
    let h1 = b(&env, "HINT-X");
    let q2 = b(&env, "Q2");
    let a2 = b(&env, "A2");
    let h2 = b(&env, "HINT-Y");

    env.mock_auths(&[
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "set_question_per_level",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "add_question",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: player.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "submit_answer",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: player.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "request_hint",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
    ]);

    // Two questions per level — answering the first keeps the player on
    // Easy, so a hint request for question 1 remains valid.
    client.set_question_per_level(&2u32);
    client.add_question(&level, &q1, &a1, &h1);
    client.add_question(&level, &q2, &a2, &h2);
    client.submit_answer(&player, &1u64, &a1);

    let hint = client.request_hint(&player, &1u64);
    assert_eq!(hint, h1);
}

// ---------------------------------------------------------------------
// Positive: admin can set NFT contract address
// ---------------------------------------------------------------------

#[test]
fn test_set_nft_contract_address_admin_only() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);

    let new_addr = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: admin.clone(),
        invoke: MockAuthInvoke {
            contract: contract_address.clone(),
            fn_name: "set_nft_contract_address",
            args: Vec::new(env),
            sub_invokes: Vec::new(env),
        },
    }]);

    client.set_nft_contract_address(&new_addr);
    assert_eq!(client.get_nft_contract_address(), new_addr);
}

// ---------------------------------------------------------------------
// Negative: non-admin calling set_nft_contract_address should panic
// ---------------------------------------------------------------------

#[test]
fn test_set_nft_contract_address_unauthorized() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    let new_addr = Address::generate(&env);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_nft_contract_address(&new_addr);
    }));
    assert!(
        result.is_err(),
        "non-admin should not be able to set_nft_contract_address"
    );
}

// ---------------------------------------------------------------------
// View function — no auth gates
// ---------------------------------------------------------------------

#[test]
fn test_next_level_logic() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    assert_eq!(
        client.next_level(&crate::Levels::Easy),
        crate::Levels::Medium
    );
    assert_eq!(
        client.next_level(&crate::Levels::Medium),
        crate::Levels::Hard
    );
    assert_eq!(
        client.next_level(&crate::Levels::Hard),
        crate::Levels::Master
    );
    assert_eq!(
        client.next_level(&crate::Levels::Master),
        crate::Levels::Master
    );
}

// ---------------------------------------------------------------------
// Calling any admin function before init must panic with NotInitialized
// ---------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_require_admin_not_initialized() {
    let env = Env::default();
    // Register the contract WITHOUT calling init — admin key is unset.
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);

    // Calling any admin-gated function should panic with Error::NotInitialized (#6).
    // No mock auth needed: `require_admin` panics (NotInitialized) before
    // reaching `admin.require_auth()`.
    client.set_question_per_level(&5u32);
}

#[test]
fn test_claim_level_completion_nft_retry_safe_on_nft_panic() {
    let env = Env::default();
    env.mock_all_auths();
    // Set a non-zero ledger so the `last_attempt_ledger == current_ledger`
    // check in `submit_answer` (which initialises `last_attempt_ledger` to 0)
    // does not trigger an `AttemptTooSoon` panic.
    env.ledger().set_sequence_number(100_000);

    let admin = new_admin(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    client.init(&admin);

    let player = user(&env);

    // Register and initialise the NFT contract, granting the game
    // contract the minter role.
    let nft_id = env.register_contract(None, stellar_hunts_nft::StellarHuntsNft);
    let nft_client =
        stellar_hunts_nft::StellarHuntsNftClient::new(&env, &nft_id);
    nft_client.init(
        &admin,
        &contract_id,
        &soroban_sdk::String::from_str(&env, "ipfs://placeholder/"),
        &soroban_sdk::String::from_str(&env, "StellarHuntsBadge"),
        &soroban_sdk::String::from_str(&env, "SHB"),
    );

    // Wire the game contract to the NFT contract.
    client.set_nft_contract_address(&nft_id);

    // Setup: 1 question per level so the player can complete Easy quickly.
    client.set_question_per_level(&1u32);
    let level = crate::Levels::Easy;
    client.add_question(&level, &b(&env, "Q?"), &b(&env, "A"), &b(&env, "H"));

    // Player completes Easy level.
    assert!(client.submit_answer(&player, &1u64, &b(&env, "A")));

    // ---- First mint: success ----
    client.claim_level_completion_nft(&player, &level);
    assert!(nft_client.has_level_badge(&player, &level));

    // Verify the game contract recorded the mint.
    let lp = client.get_player_level_progress(&player, &level);
    assert!(lp.nft_minted);

    // ---- Simulate out-of-sync state ----
    // The NFT contract still holds the badge, but we reset the game
    // contract's nft_minted flag as if a previous cross-contract call
    // was interrupted before the storage write.
    env.as_contract(&contract_id, || {
        let lp_key = crate::DataKey::PlayerLevelProgress(player.clone(), level.clone());
        let mut lp: crate::LevelProgress =
            env.storage().persistent().get(&lp_key).unwrap();
        lp.nft_minted = false;
        env.storage().persistent().set(&lp_key, &lp);
    });

    // Confirm the flag was reset.
    let lp_reset = client.get_player_level_progress(&player, &level);
    assert!(!lp_reset.nft_minted);

    // ---- Second mint attempt: should panic ----
    // The game contract sees nft_minted == false and proceeds to call
    // the NFT contract, which already has the badge -> AlreadyHasBadge.
    let should_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.claim_level_completion_nft(&player, &level);
    }));
    assert!(
        should_panic.is_err(),
        "expected AlreadyHasBadge panic from NFT contract"
    );

    // ---- Retry-safe assertion ----
    // Because the game contract writes lp.nft_minted = true AFTER the
    // cross-contract call, a panic in the NFT contract means the write
    // never executes. The flag must remain false so the player (or an
    // off-chain retry loop) can safely retry the claim.
    let lp_final = client.get_player_level_progress(&player, &level);
    assert!(
        !lp_final.nft_minted,
        "nft_minted must remain false so claim_level_completion_nft is retry-safe"
    );
}

// ---------------------------------------------------------------------
// Summary of negative-auth coverage added:
//   • test_set_question_per_level_unauthorized
//   • test_add_question_unauthorized
//   • test_set_nft_contract_address_unauthorized
//
// Each verifies that calling an admin-gated function without authorizing
// the admin address for that exact function name causes a panic.
// ---------------------------------------------------------------------
#[test]
fn test_cross_contract_full_happy_path_nft_registered_first() {
    let env = Env::default();
    env.mock_all_auths();

    // Register the NFT contract first, then the game contract — exercises
    // the "NFT deployed before the game" ordering. This works because
    // `env.register_contract` only needs a contract *registered* (not
    // initialized) to hand back its Address, so the NFT's `init` can take
    // the game contract's id as its pre-approved minter up front.
    let nft_admin = new_admin(&env);
    let nft_contract_id = env.register_contract(None, stellar_hunts_nft::StellarHuntsNft);
    let nft_client = stellar_hunts_nft::StellarHuntsNftClient::new(&env, &nft_contract_id);

    let game_admin = new_admin(&env);
    let game_contract_id = env.register_contract(None, StellarHunts);
    let game_client = StellarHuntsClient::new(&env, &game_contract_id);

    nft_client.init(
        &nft_admin,
        &game_contract_id,
        &soroban_sdk::String::from_str(&env, "https://example.com/badge/"),
        &soroban_sdk::String::from_str(&env, "StellarHunts Badge"),
        &soroban_sdk::String::from_str(&env, "SHB"),
    );
    assert!(nft_client.has_minter_role(&game_contract_id));

    game_client.init(&game_admin);
    game_client.set_nft_contract_address(&nft_contract_id);
    assert_eq!(game_client.get_nft_contract_address(), nft_contract_id);

    // Player answers their way through Easy (1 question) and claims the badge.
    let player = user(&env);
    game_client.set_question_per_level(&1u32);
    let level = crate::Levels::Easy;
    let question = b(&env, "What is 2+2?");
    let answer = b(&env, "4");
    let hint = b(&env, "basic math");
    game_client.add_question(&level, &question, &answer, &hint);

    let correct = game_client.submit_answer(&player, &1u64, &answer);
    assert!(correct);
    assert_eq!(game_client.get_player_level(&player), crate::Levels::Medium);

    let progress = game_client.get_player_level_progress(&player, &level);
    assert!(progress.is_completed);
    assert!(!progress.nft_minted);

    game_client.claim_level_completion_nft(&player, &level);

    assert!(nft_client.has_level_badge(&player, &level));
    let badge_data = nft_client.get_badge_data(&player, &level).unwrap();
    assert_eq!(badge_data.minter, game_contract_id);

    let progress_after = game_client.get_player_level_progress(&player, &level);
    assert!(progress_after.nft_minted);
}

#[test]
fn test_cross_contract_full_happy_path_game_registered_first() {
    let env = Env::default();
    env.mock_all_auths();

    // Reverse order: game contract registered before the NFT contract.
    let game_admin = new_admin(&env);
    let game_contract_id = env.register_contract(None, StellarHunts);
    let game_client = StellarHuntsClient::new(&env, &game_contract_id);

    let nft_admin = new_admin(&env);
    let nft_contract_id = env.register_contract(None, stellar_hunts_nft::StellarHuntsNft);
    let nft_client = stellar_hunts_nft::StellarHuntsNftClient::new(&env, &nft_contract_id);

    // Model the case where the game contract's identity isn't the one
    // baked into `init` — initialize with a throwaway address, then grant
    // the real game contract minter rights explicitly.
    let placeholder_minter = new_admin(&env);
    nft_client.init(
        &nft_admin,
        &placeholder_minter,
        &soroban_sdk::String::from_str(&env, "https://example.com/badge/"),
        &soroban_sdk::String::from_str(&env, "StellarHunts Badge"),
        &soroban_sdk::String::from_str(&env, "SHB"),
    );
    assert!(!nft_client.has_minter_role(&game_contract_id));
    nft_client.grant_minter_role(&game_contract_id);
    assert!(nft_client.has_minter_role(&game_contract_id));

    game_client.init(&game_admin);
    game_client.set_nft_contract_address(&nft_contract_id);

    let player = user(&env);
    game_client.set_question_per_level(&1u32);
    let level = crate::Levels::Easy;
    let question = b(&env, "Capital of Japan?");
    let answer = b(&env, "Tokyo");
    let hint = b(&env, "island nation");
    game_client.add_question(&level, &question, &answer, &hint);

    let correct = game_client.submit_answer(&player, &1u64, &answer);
    assert!(correct);

    game_client.claim_level_completion_nft(&player, &level);

    assert!(nft_client.has_level_badge(&player, &level));
    let badge_data = nft_client.get_badge_data(&player, &level).unwrap();
    assert_eq!(badge_data.minter, game_contract_id);
}

// ---------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------

#[test]
fn test_schema_version() {
    let e = Env::default();
    let contract_id = e.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&e, &contract_id);

    let admin = new_admin(&e);
    client.init(&admin);

    assert_eq!(client.get_schema_version(), crate::CURRENT_SCHEMA_VERSION);
}

/// A legacy deployment that never wrote the SchemaVersion key must report
/// version 0 so tooling can detect pre-versioning state.
#[test]
fn test_schema_version_zero_before_init() {
    let env = Env::default();
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);

    assert_eq!(client.get_schema_version(), 0);
}

// ---------------------------------------------------------------------
// Storage compatibility (see onchain/docs/storage-versioning.md)
// ---------------------------------------------------------------------

/// State written by a pre-versioning deployment (Question.version == 0)
/// must still be readable by the current contract.
#[test]
fn test_legacy_question_readable() {
    let env = Env::default();
    let admin = new_admin(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    client.init(&admin);

    // Write a Question exactly as an old (unversioned) contract would have:
    // version field = 0, question stored under DataKey::Question(7).
    env.as_contract(&contract_id, || {
        let legacy = crate::Question {
            question_id: 7,
            question: b(&env, "Legacy question?"),
            hashed_answer: env.crypto().sha256(&b(&env, "legacy-answer")).into(),
            level: crate::Levels::Easy,
            hint: b(&env, "legacy hint"),
            version: 0,
        };
        env.storage()
            .persistent()
            .set(&crate::DataKey::Question(7), &legacy);
    });

    let got = client.get_question(&7u64);
    assert_eq!(got.question_id, 7);
    assert_eq!(got.version, 0);
    assert_eq!(got.question, b(&env, "Legacy question?"));
    assert_eq!(got.level, crate::Levels::Easy);
}

/// `LevelProgress` values written to storage must round-trip field-for-field
/// through the public view. Appending a field in a future schema version
/// must preserve every existing field (documented in
/// onchain/docs/storage-versioning.md).
#[test]
fn test_level_progress_roundtrip_compat() {
    let env = Env::default();
    let admin = new_admin(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    client.init(&admin);

    let player = user(&env);
    let level = crate::Levels::Medium;

    let lp = crate::LevelProgress {
        player: player.clone(),
        level: level.clone(),
        last_question_index: 3,
        is_completed: true,
        attempts: 5,
        nft_minted: true,
        last_attempt_ledger: 12345,
    };

    env.as_contract(&contract_id, || {
        env.storage().persistent().set(
            &crate::DataKey::PlayerLevelProgress(player.clone(), level.clone()),
            &lp,
        );
    });

    let got = client.get_player_level_progress(&player, &level);
    assert_eq!(got.player, player);
    assert_eq!(got.level, level);
    assert_eq!(got.last_question_index, 3);
    assert!(got.is_completed);
    assert_eq!(got.attempts, 5);
    assert!(got.nft_minted);
    assert_eq!(got.last_attempt_ledger, 12345);
}

/// The numeric discriminants of `Levels` are persisted in storage and in
/// event payloads, so they must never be reordered or renumbered.
#[test]
fn test_levels_discriminants_stable() {
    assert_eq!(crate::Levels::Easy as u32, 1);
    assert_eq!(crate::Levels::Medium as u32, 2);
    assert_eq!(crate::Levels::Hard as u32, 3);
    assert_eq!(crate::Levels::Master as u32, 4);
}

#[test]
fn test_unauthorized_add_question_fails() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    client.init(&admin);

    env.mock_all_auths();
    // Call as normal user
    let should_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.add_question(&Levels::Easy, &Bytes::from_slice(&env, b"q"), &Bytes::from_slice(&env, b"a"), &Bytes::from_slice(&env, b"h"));
    }));
    assert!(should_panic.is_err());
}
