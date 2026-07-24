#![no_std]

// Placeholder test helper. In real Soroban deployments this is used as a
// stand-in recipient that "accepts" badge minting without doing additional
// work. The presence of this contract keeps the test surface compatible
// with the historical game test suite.

use soroban_sdk::{contract, contractimpl, Env, Symbol};

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
