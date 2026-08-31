// Allow `std` access during `cargo test` so tests can use
// `std::panic::catch_unwind` to assert panic behaviour. The contract itself
// remains `no_std` for the WASM build.
#![cfg_attr(not(test), no_std)]

extern crate alloc;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Symbol,
};
use alloc::string::ToString;

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
    Paused,
    Minters(Address),
    Badge(Address, Levels),
    BadgeData(Address, Levels),
    BaseUri,
    Name,
    Symbol,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BadgeData {
    pub minted_at: u64,
    pub minter: Address,
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
    InvalidBaseUri = 4,
    MetadataTooLarge = 5,
    NotInitialized = 6,
    ContractPaused = 6,
}

const MAX_BASE_URI_LEN: usize = 200;
const MAX_NAME_LEN: usize = 64;
const MAX_SYMBOL_LEN: usize = 16;

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

        let base_uri_text = base_uri.to_string();
        let name_text = name.to_string();
        let symbol_text = symbol.to_string();

        if base_uri_text.len() > MAX_BASE_URI_LEN
            || (!base_uri_text.starts_with("ipfs://")
                && !base_uri_text.starts_with("https://"))
        {
            panic_with_error!(&env, Error::InvalidBaseUri);
        }

        if name_text.len() > MAX_NAME_LEN || symbol_text.len() > MAX_SYMBOL_LEN {
            panic_with_error!(&env, Error::MetadataTooLarge);
        }

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
    pub fn pause(env: Env) {
        let admin: Address = env.storage().instance().get(&NftDataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&NftDataKey::Paused, &true);
    }

    pub fn unpause(env: Env) {
        let admin: Address = env.storage().instance().get(&NftDataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&NftDataKey::Paused, &false);
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&NftDataKey::Paused).unwrap_or(false)
    }

    pub fn mint_level_badge(env: Env, minter: Address, recipient: Address, level: Levels) {
        minter.require_auth();
        if env.storage().instance().get(&NftDataKey::Paused).unwrap_or(false) {
            panic_with_error!(&env, Error::ContractPaused);
        }

        if !Self::has_minter_role(env.clone(), minter.clone()) {
            panic_with_error!(&env, Error::NotAuthorized);
        }

        // Resolve the admin up front so a misconfigured (uninitialized)
        // NFT contract surfaces a structured `NotInitialized` error before
        // any badge state is written. Reading it here also ensures the
        // badge/badge_data writes below can never be left as a partial
        // state change if the contract was never configured.
        let admin: Address = env
            .storage()
            .instance()
            .get(&NftDataKey::Admin)
            .ok_or(Error::NotInitialized)
            .unwrap();

        let badge_key = NftDataKey::Badge(recipient.clone(), level.clone());
        if env.storage().persistent().has(&badge_key) {
            panic_with_error!(&env, Error::AlreadyHasBadge);
        }
        env.storage().persistent().set(&badge_key, &true);

        let badge_data = BadgeData {
            minted_at: env.ledger().timestamp(),
            minter: minter.clone(),
        };
        let badge_data_key = NftDataKey::BadgeData(recipient.clone(), level.clone());
        env.storage().persistent().set(&badge_data_key, &badge_data);

        env.events().publish(
            (Symbol::new(&env, "level_badge_minted"),),
            (recipient, level, minter, admin),
        );
    }

    pub fn has_level_badge(env: Env, owner: Address, level: Levels) -> bool {
        env.storage()
            .persistent()
            .has(&NftDataKey::Badge(owner, level))
    }

    pub fn get_badge_data(env: Env, owner: Address, level: Levels) -> Option<BadgeData> {
        let key = NftDataKey::BadgeData(owner, level);
        env.storage().persistent().get(&key)
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
