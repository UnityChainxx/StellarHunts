// Allow `std` access during `cargo test` so tests can use
// `std::panic::catch_unwind` to assert panic behaviour. The contract itself
// remains `no_std` for the WASM build.
#![cfg_attr(not(test), no_std)]

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
        env.storage()
            .instance()
            .set(&NftDataKey::BaseUri, &base_uri);
        env.storage().instance().set(&NftDataKey::Name, &name);
        env.storage().instance().set(&NftDataKey::Symbol, &symbol);

        env.events().publish(
            (Symbol::new(&env, "nft_initialized"),),
            (admin, game_contract),
        );
    }

    /// Mint a single level badge for a recipient.
    ///
    /// `minter` must be a registered minter (set via `init` or
    /// `grant_minter_role`). We additionally require `minter.require_auth()`
    /// so that the auth context — propagated from the calling contract —
    /// authorises the mint. This is the v22 replacement for the previous
    /// `env.invoker()`-based check: in normal operation the StellarHunts
    /// game contract passes its own contract address as `minter`.
    pub fn mint_level_badge(env: Env, minter: Address, recipient: Address, level: Levels) {
        minter.require_auth();
        if !Self::has_minter_role(env.clone(), minter.clone()) {
            panic_with_error!(&env, Error::NotAuthorized);
        }

        let badge_key = NftDataKey::Badge(recipient.clone(), level.clone());
        if env.storage().persistent().has(&badge_key) {
            panic_with_error!(&env, Error::AlreadyHasBadge);
        }
        env.storage().persistent().set(&badge_key, &true);

        env.events().publish(
            (Symbol::new(&env, "level_badge_minted"),),
            (recipient, level, minter),
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
