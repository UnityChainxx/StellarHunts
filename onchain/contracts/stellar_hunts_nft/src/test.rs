#![cfg(test)]

use crate::{StellarHuntsNft, StellarHuntsNftClient};
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

    // Initially no badges.
    let r = recipient(&env);
    assert!(!client.has_level_badge(&r, &crate::Levels::Easy));
}

#[test]
fn test_mint_via_game_contract_then_query() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = admin(&env);

    // Register a "fake game contract" we can use as the minter.
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

    // Mint through the fake game contract — nft.invoker() == game_id.
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

    // Calling mint_level_badge directly (top-level) — invoker is None → panic.
    let attacker = env.register_contract(None, FakeGameContract);
    let attacker_client = StellarHuntsNftClient::new(&env, &attacker);
    let r = recipient(&env);
    let should_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        attacker_client.mint_level_badge(&r, &crate::Levels::Easy);
    }));
    assert!(should_panic.is_err());
}

// ---------------------------------------------------------------------
// Test helper: stand-in "game contract" that simply calls the NFT's
// `mint_level_badge`. This lets unit tests exercise the cross-contract
// invoker pattern without spinning up the full game contract.
// ---------------------------------------------------------------------

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
        StellarHuntsNftClient::new(&env, &nft_contract).mint_level_badge(&recipient, &level);
    }
}
