#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Symbol,
};

// Use the shared `Levels` enum from the types crate so we can compile
// standalone without depending on the game contract (which would create
// a cyclic workspace dependency).
pub use stellar_hunts_types::Levels;

// ---------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum NftDataKey {
    Admin,
    Minters(Address),
    Badge(Address, Levels),
    BaseUri,
    Name,
    Symbol,
}

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotAuthorized = 1,
    AlreadyHasBadge = 2,
    AlreadyInitialized = 3,
}

// ---------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------

#[contract]
pub struct StellarHuntsNft;

#[contractimpl]
impl StellarHuntsNft {
    /// Initialize with admin + a pre-approved game contract minter.
    pub fn init(
        env: Env,
        admin: Address,
        game_contract: Address,
        base_uri: String,
        name: String,
        symbol: String,
    ) {
        if env.storage().instance().has(&NftDataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&NftDataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&NftDataKey::Minters(game_contract.clone()), &true);
        env.storage().instance().set(&NftDataKey::BaseUri, &base_uri);
        env.storage().instance().set(&NftDataKey::Name, &name);
        env.storage().instance().set(&NftDataKey::Symbol, &symbol);

        env.events().publish(
            (Symbol::new(&env, "nft_initialized"),),
            (admin, game_contract),
        );
    }

    /// Mint a single level badge for a recipient. The directly-invoking
    /// contract must be a registered minter (set via `init` or
    /// `grant_minter_role`). In normal operation the invoker is the
    /// StellarHunts game contract.
    pub fn mint_level_badge(env: Env, recipient: Address, level: Levels) {
        let invoker = env
            .invoker()
            .expect("mint_level_badge must be called by a contract");
        if !Self::has_minter_role(env.clone(), invoker.clone()) {
            panic_with_error!(&env, Error::NotAuthorized);
        }

        let badge_key = NftDataKey::Badge(recipient.clone(), level.clone());
        if env.storage().persistent().has(&badge_key) {
            panic_with_error!(&env, Error::AlreadyHasBadge);
        }
        env.storage().persistent().set(&badge_key, &true);

        env.events().publish(
            (Symbol::new(&env, "level_badge_minted"),),
            (recipient, level, invoker),
        );
    }

    pub fn has_level_badge(env: Env, owner: Address, level: Levels) -> bool {
        env.storage()
            .persistent()
            .has(&NftDataKey::Badge(owner, level))
    }

    // -----------------------------------------------------------------
    // Access control — owner / minter management
    // -----------------------------------------------------------------

    pub fn grant_minter_role(env: Env, account: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&NftDataKey::Admin)
            .expect("admin not set");
        admin.require_auth();

        env.storage()
            .instance()
            .set(&NftDataKey::Minters(account), &true);
    }

    pub fn revoke_minter_role(env: Env, account: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&NftDataKey::Admin)
            .expect("admin not set");
        admin.require_auth();

        env.storage()
            .instance()
            .remove(&NftDataKey::Minters(account));
    }

    pub fn has_minter_role(env: Env, account: Address) -> bool {
        env.storage()
            .instance()
            .get(&NftDataKey::Minters(account))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
