#![cfg(test)]

use crate::{Levels, StellarHunts, StellarHuntsClient};
// Brings `Address::generate` into scope as an extension trait method.
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger;
use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, Bytes, Env, IntoVal};

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
        if self.max_requests_per_day == 0
            || self.max_value_per_day == 0
            || self.chain_daily_limit == 0
        {
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
        let cfg = RateLimitConfig {
            max_requests_per_day: 0,
            ..RateLimitConfig::default()
        };
        assert!(cfg.validate().is_err());
    }
}

fn b(env: &Env, s: &str) -> Bytes {
    Bytes::from_slice(env, s.as_bytes())
}

// ---------------------------------------------------------------------
// Helper: init contract with selective auth for the `init` call
// ---------------------------------------------------------------------

/// Register the contract and authorize the admin's `init` call via
/// `mock_all_auths`. Returns `(admin, contract_address, client)` so
/// callers can run subsequent admin/player flows.
fn init_with_admin(env: &Env) -> (Address, Address, StellarHuntsClient) {
    let admin = new_admin(env);
    // soroban-sdk 22's `register_contract` returns the contract `Address`
    // directly (the old `BytesN<32>` + `Address::from_contract_id` pair is
    // gone).
    let contract_address = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(env, &contract_address);

    env.mock_all_auths();
    client.init(&admin);
    (admin, contract_address, client)
}

/// Register the contract and authorize ONLY the admin's `init` call.
/// Use this in tests that verify admin-gated functions are *not*
/// authorized afterwards (negative auth coverage). The mock entry must
/// carry the exact invocation args of `init` (soroban-sdk 22 matches on
/// them), and each entry authorizes a single call.
fn init_admin_auth_only(env: &Env) -> (Address, Address, StellarHuntsClient) {
    let admin = new_admin(env);
    let contract_address = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(env, &contract_address);

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_address,
            fn_name: "init",
            args: (&admin,).into_val(env),
            sub_invokes: &[],
        },
    }]);

    client.init(&admin);
    (admin, contract_address, client)
}

#[test]
fn test_admin_handover_moves_control_to_new_admin() {
    let env = Env::default();
    let (old_admin, contract_address, client) = init_with_admin(&env);
    let new_admin = new_admin(&env);

    client.propose_admin(&new_admin);
    client.accept_admin();
    client.set_question_per_level(&7);

    env.mock_auths(&[MockAuth {
        address: &old_admin,
        invoke: &MockAuthInvoke {
            contract: &contract_address,
            fn_name: "set_question_per_level",
            args: (&8u32,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let old_admin_call = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_question_per_level(&8);
    }));
    assert!(old_admin_call.is_err());
}

// ---------------------------------------------------------------------
// Positive: admin can set question per level
// ---------------------------------------------------------------------

#[test]
fn test_set_question_per_level_admin_only() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    client.set_question_per_level(&5u32);
    assert_eq!(client.get_question_per_level(), 5);
}

// ---------------------------------------------------------------------
// Negative: non-admin calling set_question_per_level should panic
// ---------------------------------------------------------------------

#[test]
fn test_set_question_per_level_unauthorized() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_admin_auth_only(&env);

    // No mock auth for admin + "set_question_per_level" → require_auth fails.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_question_per_level(&5u32);
    }));
    assert!(
        result.is_err(),
        "non-admin should not be able to set_question_per_level"
    );
}

// ---------------------------------------------------------------------
// Positive: add question and get it back
// ---------------------------------------------------------------------

#[test]
fn test_add_and_get_question() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "What is the capital of France?");
    let answer = b(&env, "Paris");
    let hint = b(&env, "It starts with P");

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
    let (_admin, _contract_address, client) = init_admin_auth_only(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "Should I be here?");
    let answer = b(&env, "No");
    let hint = b(&env, "Only admin can add");

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.add_question(&level, &question, &answer, &hint);
    }));
    assert!(
        result.is_err(),
        "non-admin should not be able to add_question"
    );
}

// ---------------------------------------------------------------------
// Correct answer progresses the player
// ---------------------------------------------------------------------

#[test]
fn test_submit_answer_correct_progresses() {
    let env = Env::default();
    // Non-zero ledger so the initialised `last_attempt_ledger == 0` does
    // not collide with the current ledger (AttemptTooSoon).
    env.ledger().set_sequence_number(100_000);
    let (_admin, _contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "What is 2+2?");
    let answer = b(&env, "4");
    let hint = b(&env, "basic math");

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
    env.ledger().set_sequence_number(100_000);
    let (_admin, _contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "What is 2+2?");
    let answer = b(&env, "4");
    let wrong = b(&env, "5");
    let hint = b(&env, "basic math");

    client.set_question_per_level(&1u32);
    client.add_question(&level, &question, &answer, &hint);

    let ok = client.submit_answer(&player, &1u64, &wrong);
    assert!(!ok);
    // Still on Easy.
    let new_level = client.get_player_level(&player);
    assert_eq!(new_level, crate::Levels::Easy);
}

#[test]
fn test_submit_answer_requires_next_indexed_question() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_sequence_number(100_000);
    let (_admin, _contract_id, client) = init_with_admin(&env);
    let player = user(&env);
    let level = crate::Levels::Easy;
    client.set_question_per_level(&2u32);
    client.add_question(&level, &b(&env, "Q1"), &b(&env, "A1"), &b(&env, "H1"));
    client.add_question(&level, &b(&env, "Q2"), &b(&env, "A2"), &b(&env, "H2"));

    let out_of_order = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.submit_answer(&player, &2u64, &b(&env, "A2"));
    }));
    assert!(out_of_order.is_err());
    assert!(panic_text(&out_of_order).contains("Error(Contract, #14)"));
    assert_eq!(client.get_player_level_progress(&player, &level).last_question_index, 0);

    assert!(client.submit_answer(&player, &1u64, &b(&env, "A1")));
    env.ledger().set_sequence_number(env.ledger().sequence() + 1);
    let duplicate = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.submit_answer(&player, &1u64, &b(&env, "A1"));
    }));
    assert!(duplicate.is_err());
    assert!(panic_text(&duplicate).contains("Error(Contract, #14)"));
    assert_eq!(client.get_player_level_progress(&player, &level).last_question_index, 1);
    assert_eq!(client.get_player_level(&player), level);

    env.ledger().set_sequence_number(env.ledger().sequence() + 1);
    assert!(client.submit_answer(&player, &2u64, &b(&env, "A2")));
    assert_eq!(client.get_player_level(&player), crate::Levels::Medium);
}

#[test]
fn test_retire_question_compacts_level_index_and_answer_order() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_sequence_number(100_000);
    let (_admin, contract_id, client) = init_with_admin(&env);
    let player = user(&env);
    let level = crate::Levels::Easy;
    client.set_question_per_level(&3u32);
    client.add_question(&level, &b(&env, "Q1"), &b(&env, "A1"), &b(&env, "H1"));
    client.add_question(&level, &b(&env, "Q2"), &b(&env, "A2"), &b(&env, "H2"));
    client.add_question(&level, &b(&env, "Q3"), &b(&env, "A3"), &b(&env, "H3"));

    client.retire_question(&1u64);
    assert_eq!(client.get_question_in_level(&level, &0u32), b(&env, "Q2"));
    assert_eq!(client.get_question_in_level(&level, &1u32), b(&env, "Q3"));
    let count: u32 = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&crate::DataKey::QuestionPerLevelIndex(level.clone()))
            .unwrap()
    });
    assert_eq!(count, 2);

    // Compaction can invalidate stored player cursors; fresh progress starts
    // at the new first question and retired question IDs can no longer pass.
    let retired_answer = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.submit_answer(&player, &1u64, &b(&env, "A1"));
    }));
    assert!(retired_answer.is_err());
    assert!(client.submit_answer(&player, &2u64, &b(&env, "A2")));
    env.ledger().set_sequence_number(env.ledger().sequence() + 1);
    assert!(client.submit_answer(&player, &3u64, &b(&env, "A3")));
    assert_eq!(client.get_player_level(&player), crate::Levels::Medium);
}

// ---------------------------------------------------------------------
// Hint request after answering a question
// ---------------------------------------------------------------------

#[test]
fn test_request_hint_after_initialize() {
    let env = Env::default();
    env.ledger().set_sequence_number(100_000);
    let (_admin, _contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    let level = crate::Levels::Easy;
    let q1 = b(&env, "Q1");
    let a1 = b(&env, "A1");
    let h1 = b(&env, "HINT-X");
    let q2 = b(&env, "Q2");
    let a2 = b(&env, "A2");
    let h2 = b(&env, "HINT-Y");

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
    let (_admin, _contract_address, client) = init_with_admin(&env);

    let new_addr = Address::generate(&env);

    client.set_nft_contract_address(&new_addr);
    assert_eq!(client.get_nft_contract_address(), new_addr);
}

// ---------------------------------------------------------------------
// Negative: non-admin calling set_nft_contract_address should panic
// ---------------------------------------------------------------------

#[test]
fn test_set_nft_contract_address_unauthorized() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_admin_auth_only(&env);

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
    let nft_client = stellar_hunts_nft::StellarHuntsNftClient::new(&env, &nft_id);
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
        let lp_key = crate::DataKey::PlayerLevelProgressV2(player.clone(), level.clone());
        let mut lp: crate::LevelProgressV2 = env.storage().persistent().get(&lp_key).unwrap();
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
    env.ledger().set_sequence_number(100_000);

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
    env.ledger().set_sequence_number(100_000);

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
    let (_admin, _contract_address, client) = init_with_admin(&e);

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
// Question retirement is enforced (#447)
// ---------------------------------------------------------------------

#[test]
fn test_retire_question_sets_flag() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    client.set_question_per_level(&5u32);
    client.add_question(
        &crate::Levels::Easy,
        &b(&env, "Retired question"),
        &b(&env, "answer"),
        &b(&env, "hint"),
    );

    assert!(!client.is_question_retired(&1u64));
    client.retire_question(&1u64);
    assert!(client.is_question_retired(&1u64));
}

/// Submitting to a retired question must fail with the dedicated
/// `QuestionRetired` (#14) error rather than grading the answer.
#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_retired_question_cannot_be_answered() {
    let env = Env::default();
    env.ledger().set_sequence_number(100_000);
    let (_admin, _contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    client.set_question_per_level(&1u32);
    client.add_question(
        &crate::Levels::Easy,
        &b(&env, "Q"),
        &b(&env, "A"),
        &b(&env, "H"),
    );
    client.retire_question(&1u64);

    client.submit_answer(&player, &1u64, &b(&env, "A"));
}

/// Retiring a question must not change stored progress and must not
/// complete the level (the core regression from #447).
#[test]
fn test_retired_answer_does_not_change_progress_or_complete_level() {
    let env = Env::default();
    env.ledger().set_sequence_number(100_000);
    let (_admin, _contract_address, client) = init_with_admin(&env);
    let player = user(&env);
    let level = crate::Levels::Easy;

    client.set_question_per_level(&1u32);
    client.add_question(&level, &b(&env, "Q"), &b(&env, "A"), &b(&env, "H"));
    client.retire_question(&1u64);

    let before = client.get_player_level_progress(&player, &level);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.submit_answer(&player, &1u64, &b(&env, "A"));
    }));
    assert!(
        result.is_err(),
        "retired question must not be gradeable (#447)"
    );

    let after = client.get_player_level_progress(&player, &level);
    assert_eq!(after.last_question_index, before.last_question_index);
    assert_eq!(after.attempts, before.attempts);
    assert!(
        !after.is_completed,
        "a retired question must not complete a level"
    );
    assert_eq!(client.get_player_level(&player), level);
}

/// `request_hint` must refuse retired questions instead of returning the hint.
#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_retired_question_hint_denied() {
    let env = Env::default();
    env.ledger().set_sequence_number(100_000);
    let (_admin, _contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    // Keep the level open (5 questions) and give the player one attempt so
    // the retired check is the reason the call fails, not `NotInitialized`.
    client.set_question_per_level(&5u32);
    client.add_question(
        &crate::Levels::Easy,
        &b(&env, "Q"),
        &b(&env, "A"),
        &b(&env, "H"),
    );
    assert!(client.submit_answer(&player, &1u64, &b(&env, "A")));
    client.retire_question(&1u64);

    client.request_hint(&player, &1u64);
}

/// Re-adding the same content creates a new, un-retired question id.
#[test]
fn test_readding_same_content_is_not_retired() {
    let env = Env::default();
    env.ledger().set_sequence_number(100_000);
    let (_admin, _contract_address, client) = init_with_admin(&env);
    let player = user(&env);
    let level = crate::Levels::Easy;

    client.set_question_per_level(&5u32);
    let question = b(&env, "Same question");
    let answer = b(&env, "Same answer");
    let hint = b(&env, "Same hint");

    client.add_question(&level, &question, &answer, &hint); // id 1
    client.retire_question(&1u64);
    client.add_question(&level, &question, &answer, &hint); // id 2, fresh

    assert!(client.is_question_retired(&1u64));
    assert!(!client.is_question_retired(&2u64));
    assert!(client.submit_answer(&player, &2u64, &answer));
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
    env.mock_all_auths();
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

/// A `LevelProgress` written in the pre-versioning (schema version 1)
/// shape — under the original `PlayerLevelProgress` key, without a
/// `version` field — must still be readable by `get_player_level_progress`
/// and `get_player_level_progress_v2` (issue #463).
#[test]
fn test_level_progress_roundtrip_compat() {
    let env = Env::default();
    let admin = new_admin(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    env.mock_all_auths();
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

    // Legacy ABI view round-trips every pre-versioning field.
    let got = client.get_player_level_progress(&player, &level);
    assert_eq!(got.player, player);
    assert_eq!(got.level, level);
    assert_eq!(got.last_question_index, 3);
    assert!(got.is_completed);
    assert_eq!(got.attempts, 5);
    assert!(got.nft_minted);
    assert_eq!(got.last_attempt_ledger, 12345);

    // Versioned view surfaces the legacy record with the legacy version.
    let got_v2 = client.get_player_level_progress_v2(&player, &level);
    assert_eq!(got_v2.version, crate::LEGACY_RECORD_VERSION);
    assert_eq!(got_v2.attempts, 5);
    assert!(got_v2.nft_minted);
}

/// A `LevelProgressV2` written under the versioned key round-trips
/// field-for-field through `get_player_level_progress_v2`, mirroring
/// `test_legacy_question_readable` for the versioned shapes (issue #463).
#[test]
fn test_level_progress_v2_roundtrip() {
    let env = Env::default();
    let admin = new_admin(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    env.mock_all_auths();
    client.init(&admin);

    let player = user(&env);
    let level = crate::Levels::Hard;

    let lp = crate::LevelProgressV2 {
        player: player.clone(),
        level: level.clone(),
        last_question_index: 2,
        is_completed: true,
        attempts: 7,
        nft_minted: false,
        last_attempt_ledger: 999,
        version: crate::CURRENT_SCHEMA_VERSION,
    };

    env.as_contract(&contract_id, || {
        env.storage().persistent().set(
            &crate::DataKey::PlayerLevelProgressV2(player.clone(), level.clone()),
            &lp,
        );
    });

    let got = client.get_player_level_progress_v2(&player, &level);
    assert_eq!(got.player, player);
    assert_eq!(got.level, level);
    assert_eq!(got.last_question_index, 2);
    assert!(got.is_completed);
    assert_eq!(got.attempts, 7);
    assert!(!got.nft_minted);
    assert_eq!(got.last_attempt_ledger, 999);
    assert_eq!(got.version, crate::CURRENT_SCHEMA_VERSION);

    // The legacy view still surfaces the same record.
    let legacy_view = client.get_player_level_progress(&player, &level);
    assert_eq!(legacy_view.attempts, 7);
    assert!(legacy_view.is_completed);
}

/// Writing a versioned record after touching a pre-versioning record must
/// stamp `CURRENT_SCHEMA_VERSION`, store it under the `*V2` key, and remove
/// the legacy entry (lazy migration, issue #463).
#[test]
fn test_lazy_migration_upgrades_legacy_record_on_write() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_sequence_number(100_000);
    let (_admin, contract_id, client) = init_with_admin(&env);
    assert_eq!(client.get_schema_version(), crate::CURRENT_SCHEMA_VERSION);

    let player = user(&env);
    let level = crate::Levels::Easy;
    client.set_question_per_level(&5u32);
    client.add_question(&level, &b(&env, "Q?"), &b(&env, "A"), &b(&env, "H"));

    // First attempt writes versioned records.
    assert!(!client.submit_answer(&player, &1u64, &b(&env, "wrong")));

    // Replace the versioned record with a pre-versioning one under the
    // legacy key, exactly as a version-1 deployment would have left it.
    env.as_contract(&contract_id, || {
        let legacy = crate::LevelProgress {
            player: player.clone(),
            level: level.clone(),
            last_question_index: 0,
            is_completed: false,
            attempts: 4,
            nft_minted: false,
            last_attempt_ledger: 99,
        };
        let legacy_key = crate::DataKey::PlayerLevelProgress(player.clone(), level.clone());
        env.storage().persistent().set(&legacy_key, &legacy);
        env.storage()
            .persistent()
            .remove(&crate::DataKey::PlayerLevelProgressV2(
                player.clone(),
                level.clone(),
            ));
    });

    // The legacy record is readable before migration.
    let before = client.get_player_level_progress_v2(&player, &level);
    assert_eq!(before.version, crate::LEGACY_RECORD_VERSION);
    assert_eq!(before.attempts, 4);

    // Next write migrates lazily.
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + 1);
    assert!(!client.submit_answer(&player, &1u64, &b(&env, "wrong")));

    env.as_contract(&contract_id, || {
        // Legacy entry is gone.
        assert!(!env
            .storage()
            .persistent()
            .has(&crate::DataKey::PlayerLevelProgress(
                player.clone(),
                level.clone()
            )));
        // Versioned entry carries the current schema version and the
        // legacy attempt count plus the new attempt.
        let migrated: crate::LevelProgressV2 = env
            .storage()
            .persistent()
            .get(&crate::DataKey::PlayerLevelProgressV2(
                player.clone(),
                level.clone(),
            ))
            .unwrap();
        assert_eq!(migrated.version, crate::CURRENT_SCHEMA_VERSION);
        assert_eq!(migrated.attempts, 5);
    });

    // The top-level record is initialized under the versioned key.
    let pp = client.get_player_progress_v2(&player);
    assert!(pp.is_initialized);
    assert_eq!(pp.version, crate::CURRENT_SCHEMA_VERSION);
    assert_eq!(pp.address, player);
}

/// The versioned and legacy views agree for a player with no record
/// (issue #463).
#[test]
fn test_player_progress_v2_default_for_unknown_player() {
    let env = Env::default();
    let admin = new_admin(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    env.mock_all_auths();
    client.init(&admin);

    let player = user(&env);
    let pp = client.get_player_progress_v2(&player);
    assert_eq!(pp.address, player);
    assert!(!pp.is_initialized);
    assert_eq!(pp.current_level, crate::Levels::Easy);
    assert_eq!(pp.version, 0);

    let lp = client.get_player_level_progress_v2(&player, &crate::Levels::Easy);
    assert_eq!(lp.player, player);
    assert_eq!(lp.version, 0);
    assert_eq!(lp.attempts, 0);
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
    // Authorize ONLY the admin's `init` call, so the later non-admin
    // `add_question` attempt hits `require_admin` without a mocked auth and
    // panics (issue #265-style negative auth coverage).
    let (_admin, _contract_id, client) = init_admin_auth_only(&env);

    // Call as normal user
    let should_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.add_question(
            &crate::Levels::Easy,
            &Bytes::from_slice(&env, b"q"),
            &Bytes::from_slice(&env, b"a"),
            &Bytes::from_slice(&env, b"h"),
        );
    }));
    assert!(should_panic.is_err());
}

// ---------------------------------------------------------------------
// Overflow and boundary behavior (issue #265)
//
// The contract uses checked arithmetic for every counter increment
// (question ids, per-level indices, attempts, last_question_index) and
// panics with `Error::ArithmeticOverflow` (#12) rather than silently
// wrapping. These tests drive each counter to its boundary and assert
// the defined panic behaviour.
// ---------------------------------------------------------------------

fn panic_text(result: &std::result::Result<(), Box<dyn std::any::Any + Send>>) -> String {
    result
        .as_ref()
        .err()
        .and_then(|e| {
            e.downcast_ref::<String>()
                .cloned()
                .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
        })
        .unwrap_or_default()
}

#[test]
fn test_add_question_overflows_at_max_question_count() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, contract_id, client) = init_with_admin(&env);

    // Push QuestionCount to u64::MAX so the next question id cannot be
    // represented.
    env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .set(&crate::DataKey::QuestionCount, &u64::MAX);
    });

    let level = crate::Levels::Easy;
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.add_question(&level, &b(&env, "Q"), &b(&env, "A"), &b(&env, "H"));
    }));

    assert!(result.is_err(), "add_question must panic on id overflow");
    assert!(
        panic_text(&result).contains("Error(Contract, #12)"),
        "expected ArithmeticOverflow panic, got: {}",
        panic_text(&result)
    );
}

#[test]
fn test_question_per_level_boundary_respected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    let level = crate::Levels::Easy;
    client.set_question_per_level(&1u32);
    client.add_question(&level, &b(&env, "Q1"), &b(&env, "A1"), &b(&env, "H1"));

    // A second question exceeds the per-level budget and must be rejected
    // with QuestionPerLevelLimit rather than overflowing the index.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.add_question(&level, &b(&env, "Q2"), &b(&env, "A2"), &b(&env, "H2"));
    }));

    assert!(result.is_err(), "adding beyond per-level limit must panic");
    assert!(
        panic_text(&result).contains("Error(Contract, #8)"),
        "expected QuestionPerLevelLimit panic, got: {}",
        panic_text(&result)
    );
}

#[test]
fn test_submit_answer_attempts_overflow_panics() {
    let env = Env::default();
    env.mock_all_auths();
    // Non-zero ledger so the initialisation-time `last_attempt_ledger == 0`
    // does not collide with the current ledger.
    env.ledger().set_sequence_number(100_000);
    let (_admin, contract_id, client) = init_with_admin(&env);

    let player = user(&env);
    let level = crate::Levels::Easy;
    client.set_question_per_level(&5u32);
    client.add_question(&level, &b(&env, "Q?"), &b(&env, "A"), &b(&env, "H"));

    // Initialise the player with one (wrong) attempt.
    let ok = client.submit_answer(&player, &1u64, &b(&env, "wrong"));
    assert!(!ok);

    // Push attempts to u32::MAX directly.
    env.as_contract(&contract_id, || {
        let key = crate::DataKey::PlayerLevelProgressV2(player.clone(), level.clone());
        let mut lp: crate::LevelProgressV2 = env.storage().persistent().get(&key).unwrap();
        lp.attempts = u32::MAX;
        env.storage().persistent().set(&key, &lp);
    });

    // Advance the ledger so `AttemptTooSoon` does not fire first.
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + 1);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.submit_answer(&player, &1u64, &b(&env, "wrong"));
    }));

    assert!(result.is_err(), "attempts increment must panic at u32::MAX");
    assert!(
        panic_text(&result).contains("Error(Contract, #12)"),
        "expected ArithmeticOverflow panic, got: {}",
        panic_text(&result)
    );
}

#[test]
fn test_submit_answer_last_question_index_overflow_panics() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_sequence_number(100_000);
    let (_admin, contract_id, client) = init_with_admin(&env);

    let player = user(&env);
    let level = crate::Levels::Easy;
    client.set_question_per_level(&5u32);
    client.add_question(&level, &b(&env, "Q?"), &b(&env, "A"), &b(&env, "H"));

    // Initialise the player.
    let ok = client.submit_answer(&player, &1u64, &b(&env, "wrong"));
    assert!(!ok);

    // Push last_question_index to u32::MAX directly.
    env.as_contract(&contract_id, || {
        let key = crate::DataKey::PlayerLevelProgressV2(player.clone(), level.clone());
        let mut lp: crate::LevelProgressV2 = env.storage().persistent().get(&key).unwrap();
        lp.last_question_index = u32::MAX;
        env.storage().persistent().set(&key, &lp);
    });

    env.ledger()
        .set_sequence_number(env.ledger().sequence() + 1);

    // A correct answer increments last_question_index -> overflow.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.submit_answer(&player, &1u64, &b(&env, "A"));
    }));

    assert!(
        result.is_err(),
        "correct answer must panic when last_question_index is at max"
    );
    assert!(
        panic_text(&result).contains("Error(Contract, #12)"),
        "expected ArithmeticOverflow panic, got: {}",
        panic_text(&result)
    );
}

// ---------------------------------------------------------------------
// Level index integrity tests (issue #464)
// ---------------------------------------------------------------------

#[test]
fn test_update_question_move_level_updates_indices() {
    let env = Env::default();
    let (_admin, contract_id, client) = init_with_admin(&env);

    client.set_question_per_level(&10u32);
    client.add_question(
        &Levels::Easy,
        &b(&env, "Q1"),
        &b(&env, "A1"),
        &b(&env, "H1"),
    );
    client.add_question(
        &Levels::Easy,
        &b(&env, "Q2"),
        &b(&env, "A2"),
        &b(&env, "H2"),
    );
    client.add_question(
        &Levels::Easy,
        &b(&env, "Q3"),
        &b(&env, "A3"),
        &b(&env, "H3"),
    );

    // Move Q2 from Easy to Medium
    client.update_question(
        &2u64,
        &b(&env, "Q2-updated"),
        &b(&env, "A2"),
        &Levels::Medium,
        &b(&env, "H2"),
    );

    env.as_contract(&contract_id, || {
        let easy_count: u32 = env
            .storage()
            .persistent()
            .get(&crate::DataKey::QuestionPerLevelIndex(Levels::Easy))
            .unwrap();
        assert_eq!(easy_count, 2);

        let q_e0: u64 = env
            .storage()
            .persistent()
            .get(&crate::DataKey::QuestionsByLevel(Levels::Easy, 0))
            .unwrap();
        let q_e1: u64 = env
            .storage()
            .persistent()
            .get(&crate::DataKey::QuestionsByLevel(Levels::Easy, 1))
            .unwrap();
        assert_eq!(q_e0, 1);
        assert_eq!(q_e1, 3);
        assert!(!env
            .storage()
            .persistent()
            .has(&crate::DataKey::QuestionsByLevel(Levels::Easy, 2)));

        let med_count: u32 = env
            .storage()
            .persistent()
            .get(&crate::DataKey::QuestionPerLevelIndex(Levels::Medium))
            .unwrap();
        assert_eq!(med_count, 1);

        let q_m0: u64 = env
            .storage()
            .persistent()
            .get(&crate::DataKey::QuestionsByLevel(Levels::Medium, 0))
            .unwrap();
        assert_eq!(q_m0, 2);
    });
}

#[test]
fn test_property_index_contains_each_question_exactly_once_after_interleaved_ops() {
    let env = Env::default();
    let (_admin, contract_id, client) = init_with_admin(&env);

    client.set_question_per_level(&20u32);

    let levels = [Levels::Easy, Levels::Medium, Levels::Hard];

    let assert_index_invariants = |expected_questions: &[(u64, Levels)]| {
        env.as_contract(&contract_id, || {
            let mut all_found_qids: std::vec::Vec<u64> = std::vec::Vec::new();

            for lvl in levels.iter() {
                let count: u32 = env
                    .storage()
                    .persistent()
                    .get(&crate::DataKey::QuestionPerLevelIndex(lvl.clone()))
                    .unwrap_or(0u32);

                let expected_for_lvl: std::vec::Vec<u64> = expected_questions
                    .iter()
                    .filter(|(_, l)| l == lvl)
                    .map(|(q, _)| *q)
                    .collect();

                assert_eq!(
                    count as usize,
                    expected_for_lvl.len(),
                    "Count mismatch for level {:?}",
                    lvl
                );

                let mut lvl_qids: std::vec::Vec<u64> = std::vec::Vec::new();
                for i in 0..count {
                    let qid: u64 = env
                        .storage()
                        .persistent()
                        .get(&crate::DataKey::QuestionsByLevel(lvl.clone(), i))
                        .expect("Missing question entry at valid index");
                    assert!(
                        !lvl_qids.contains(&qid),
                        "Duplicate question {} found at index {} in level {:?}",
                        qid,
                        i,
                        lvl
                    );
                    lvl_qids.push(qid);
                    all_found_qids.push(qid);
                }

                // Check that slot `count` is cleared
                assert!(
                    !env.storage()
                        .persistent()
                        .has(&crate::DataKey::QuestionsByLevel(lvl.clone(), count)),
                    "Trailing slot at index {} must be vacant for level {:?}",
                    count,
                    lvl
                );
            }

            // Assert each stored question id appears exactly once across all levels
            assert_eq!(all_found_qids.len(), expected_questions.len());
            for (q, _) in expected_questions.iter() {
                assert!(
                    all_found_qids.contains(q),
                    "Question {} missing from all level indices",
                    q
                );
            }
        });
    };

    // 1. Interleaved adds
    client.add_question(
        &Levels::Easy,
        &b(&env, "Q1"),
        &b(&env, "A1"),
        &b(&env, "H1"),
    ); // 1 -> Easy
    client.add_question(
        &Levels::Easy,
        &b(&env, "Q2"),
        &b(&env, "A2"),
        &b(&env, "H2"),
    ); // 2 -> Easy
    client.add_question(
        &Levels::Medium,
        &b(&env, "Q3"),
        &b(&env, "A3"),
        &b(&env, "H3"),
    ); // 3 -> Medium
    client.add_question(
        &Levels::Easy,
        &b(&env, "Q4"),
        &b(&env, "A4"),
        &b(&env, "H4"),
    ); // 4 -> Easy
    client.add_question(
        &Levels::Hard,
        &b(&env, "Q5"),
        &b(&env, "A5"),
        &b(&env, "H5"),
    ); // 5 -> Hard

    let mut state = std::vec![
        (1u64, Levels::Easy),
        (2u64, Levels::Easy),
        (3u64, Levels::Medium),
        (4u64, Levels::Easy),
        (5u64, Levels::Hard),
    ];
    assert_index_invariants(&state);

    // 2. Interleaved moves
    // Move Q2 from Easy to Medium
    client.update_question(
        &2u64,
        &b(&env, "Q2"),
        &b(&env, "A2"),
        &Levels::Medium,
        &b(&env, "H2"),
    );
    state[1].1 = Levels::Medium;
    assert_index_invariants(&state);

    // Move Q3 from Medium to Hard
    client.update_question(
        &3u64,
        &b(&env, "Q3"),
        &b(&env, "A3"),
        &Levels::Hard,
        &b(&env, "H3"),
    );
    state[2].1 = Levels::Hard;
    assert_index_invariants(&state);

    // Add Q6 to Easy
    client.add_question(
        &Levels::Easy,
        &b(&env, "Q6"),
        &b(&env, "A6"),
        &b(&env, "H6"),
    ); // 6 -> Easy
    state.push((6u64, Levels::Easy));
    assert_index_invariants(&state);

    // Move Q1 from Easy to Hard
    client.update_question(
        &1u64,
        &b(&env, "Q1"),
        &b(&env, "A1"),
        &Levels::Hard,
        &b(&env, "H1"),
    );
    state[0].1 = Levels::Hard;
    assert_index_invariants(&state);

    // Move Q4 from Easy to Medium
    client.update_question(
        &4u64,
        &b(&env, "Q4"),
        &b(&env, "A4"),
        &Levels::Medium,
        &b(&env, "H4"),
    );
    state[3].1 = Levels::Medium;
    assert_index_invariants(&state);

    // Add Q7 to Medium
    client.add_question(
        &Levels::Medium,
        &b(&env, "Q7"),
        &b(&env, "A7"),
        &b(&env, "H7"),
    ); // 7 -> Medium
    state.push((7u64, Levels::Medium));
    assert_index_invariants(&state);

    // Move Q5 from Hard to Easy
    client.update_question(
        &5u64,
        &b(&env, "Q5"),
        &b(&env, "A5"),
        &Levels::Easy,
        &b(&env, "H5"),
    );
    state[4].1 = Levels::Easy;
    assert_index_invariants(&state);
}
