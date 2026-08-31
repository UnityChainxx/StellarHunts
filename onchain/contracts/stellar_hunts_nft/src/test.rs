#![cfg(test)]

use crate::{StellarHuntsNft, StellarHuntsNftClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

fn admin(env: &Env) -> Address {
    Address::generate(env)
}

fn recipient(env: &Env) -> Address {
    Address::generate(env)
}

#[test]
fn test_init_and_has_level_badge() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = admin(&env);
    let game = recipient(&env);

    let contract_id = env.register_contract(None, StellarHuntsNft);
    let client = StellarHuntsNftClient::new(&env, &contract_id);

    client.init(
        &admin,
        &game,
        &String::from_str(&env, "ipfs://placeholder/"),
        &String::from_str(&env, "StellarHuntsBadge"),
        &String::from_str(&env, "SHB"),
    );

    let r = recipient(&env);
    assert!(!client.has_level_badge(&r, &crate::Levels::Easy));
}

#[test]
fn test_mint_via_game_contract_then_query() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = admin(&env);

    let game_id = env.register_contract(None, FakeGameContract);
    let nft_id = env.register_contract(None, StellarHuntsNft);

    let nft = StellarHuntsNftClient::new(&env, &nft_id);
    nft.init(
        &admin,
        &game_id,
        &String::from_str(&env, "ipfs://placeholder/"),
        &String::from_str(&env, "StellarHuntsBadge"),
        &String::from_str(&env, "SHB"),
    );

    let game_client = FakeGameContractClient::new(&env, &game_id);
    let recipient_addr = recipient(&env);
    game_client.mint(&nft_id, &recipient_addr, &crate::Levels::Easy);

    assert!(nft.has_level_badge(&recipient_addr, &crate::Levels::Easy));
    assert!(!nft.has_level_badge(&recipient_addr, &crate::Levels::Medium));
}

#[test]
fn test_double_mint_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = admin(&env);

    let game_id = env.register_contract(None, FakeGameContract);
    let nft_id = env.register_contract(None, StellarHuntsNft);

    let nft = StellarHuntsNftClient::new(&env, &nft_id);
    nft.init(
        &admin,
        &game_id,
        &String::from_str(&env, "ipfs://placeholder/"),
        &String::from_str(&env, "StellarHuntsBadge"),
        &String::from_str(&env, "SHB"),
    );

    let game = FakeGameContractClient::new(&env, &game_id);
    let r = recipient(&env);

    game.mint(&nft_id, &r, &crate::Levels::Easy);
    // Second mint must fail (already-has-badge error).
    let should_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        game.mint(&nft_id, &r, &crate::Levels::Easy);
    }));
    assert!(should_panic.is_err());
}

#[test]
fn test_mint_uninitialized_is_structured_and_leaves_no_partial_state() {
    let env = Env::default();
    env.mock_all_auths();

    let game_id = env.register_contract(None, FakeGameContract);
    let nft_id = env.register_contract(None, StellarHuntsNft);

    // NOTE: `init` is intentionally NOT called — the NFT contract is
    // uninitialized. The game contract calls `mint_level_badge` directly.
    let game = FakeGameContractClient::new(&env, &game_id);
    let r = recipient(&env);

    // The call must fail with a *structured* error rather than an opaque
    // `expect("admin not set")` panic.
    let should_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        game.mint(&nft_id, &r, &crate::Levels::Easy);
    }));
    assert!(should_panic.is_err());

    // The admin read happens *before* any storage write, so the failed
    // mint must not leave any partial badge state behind.
    let nft = StellarHuntsNftClient::new(&env, &nft_id);
    assert!(!nft.has_level_badge(&r, &crate::Levels::Easy));
    assert!(nft.get_badge_data(&r, &crate::Levels::Easy).is_none());
}

#[test]
fn test_random_cannot_mint() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = admin(&env);

    let game_id = env.register_contract(None, FakeGameContract);
    let nft_id = env.register_contract(None, StellarHuntsNft);
    let nft = StellarHuntsNftClient::new(&env, &nft_id);
    nft.init(
        &admin,
        &game_id,
        &String::from_str(&env, "ipfs://placeholder/"),
        &String::from_str(&env, "StellarHuntsBadge"),
        &String::from_str(&env, "SHB"),
    );

    let attacker = env.register_contract(None, FakeGameContract);
    let attacker_client = StellarHuntsNftClient::new(&env, &attacker);
    let r = recipient(&env);
    let should_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        attacker_client.mint_level_badge(&attacker, &r, &crate::Levels::Easy);
    }));
    assert!(should_panic.is_err());
}

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct FakeGameContract;

#[contractimpl]
impl FakeGameContract {
    pub fn mint(
        env: Env,
        nft_contract: soroban_sdk::Address,
        recipient: soroban_sdk::Address,
        level: crate::Levels,
    ) {
        StellarHuntsNftClient::new(&env, &nft_contract).mint_level_badge(
            &env.current_contract_address(),
            &recipient,
            &level,
        );
    }
}
