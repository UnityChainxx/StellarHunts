#![no_std]

// Placeholder test helper. In real Soroban deployments this is used as a
// stand-in recipient that "accepts" badge minting without doing additional
// work. The presence of this contract keeps the test surface compatible
// with the historical game test suite.

use soroban_sdk::{contract, contractimpl, Address, Env, String, Symbol};

#[cfg(test)]
use stellar_hunts_nft::{StellarHuntsNft, StellarHuntsNftClient};

#[cfg(test)]
use stellar_hunts_types::Levels;

#[cfg(test)]
use soroban_sdk::testutils::Address as _;

#[contract]
pub struct MockReceiver;

#[contractimpl]
impl MockReceiver {
    pub fn accept(_env: Env, recipient: soroban_sdk::Address, level: soroban_sdk::Symbol) {
        // Intentionally a no-op. The point of this contract is to exist as
        // an Address target in tests; nothing else happens at runtime.
        let _ = (recipient, level);
    }

    pub fn ping(env: Env) -> Symbol {
        Symbol::new(&env, "pong")
    }
}


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
    assert!(!client.has_level_badge(&r, &Levels::Easy));
}
