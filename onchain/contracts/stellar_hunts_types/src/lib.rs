#![no_std]

use soroban_sdk::contracttype;

// ---------------------------------------------------------------------
// Shared game types
// ---------------------------------------------------------------------
// Only types that BOTH the game contract and the NFT contract need to
// import live in this crate. Putting them here breaks the otherwise cyclic
// workspace dependency that would result from contracts importing each
// other directly.
// ---------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Levels {
    Easy = 1,
    Medium = 2,
    Hard = 3,
    Master = 4,
}

impl Levels {
    pub fn next(&self) -> Levels {
        match self {
            Levels::Easy => Levels::Medium,
            Levels::Medium => Levels::Hard,
            Levels::Hard => Levels::Master,
            Levels::Master => Levels::Master,
        }
    }
}

/// Stable u32 token IDs for off-chain integrations (e.g. event indexes,
/// indexing pipelines). Mirrors `Levels` ordering 1:1.
pub fn level_to_token_id(level: &Levels) -> u32 {
    match level {
        Levels::Easy => 1,
        Levels::Medium => 2,
        Levels::Hard => 3,
        Levels::Master => 4,
    }
}
