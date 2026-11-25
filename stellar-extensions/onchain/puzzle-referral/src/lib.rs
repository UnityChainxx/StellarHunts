//! Puzzle Referral Tracking Contract — issue #969
//!
//! Tracks referral relationships on-chain and distributes referral rewards
//! when a referee solves their first puzzle.
#![cfg_attr(not(test), no_std)]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Map, Symbol, Vec,
};

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// referee → referrer mapping
    ReferrerOf(Address),
    /// referrer → list of referees (level 1)
    Referees(Address),
    /// Set of addresses that have already been referred (anti-abuse)
    AlreadyReferred,
    /// referrer → XLM reward balance (stroop units)
    Rewards(Address),
    Admin,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct PuzzleReferralContract;

#[contractimpl]
impl PuzzleReferralContract {
    /// One-time initialisation.
    pub fn init(env: Env, admin: Address) {
        env.storage().persistent().set(&DataKey::Admin, &admin);
    }

    /// Register a referral relationship.  
    /// One referral per address (anti-abuse).
    pub fn register_referral(env: Env, referrer: Address, referee: Address) {
        referrer.require_auth();

        // Anti-abuse: each address may only be referred once.
        let mut referred: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::AlreadyReferred)
            .unwrap_or(Vec::new(&env));

        for addr in referred.iter() {
            if addr == referee {
                panic!("address already referred");
            }
        }
        // Prevent self-referral
        if referrer == referee {
            panic!("cannot refer yourself");
        }

        referred.push_back(referee.clone());
        env.storage()
            .persistent()
            .set(&DataKey::AlreadyReferred, &referred);

        // referee → referrer
        env.storage()
            .persistent()
            .set(&DataKey::ReferrerOf(referee.clone()), &referrer.clone());

        // referrer → [referees]
        let mut referees: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Referees(referrer.clone()))
            .unwrap_or(Vec::new(&env));
        referees.push_back(referee);
        env.storage()
            .persistent()
            .set(&DataKey::Referees(referrer), &referees);
    }

    /// Called when a referee solves their first puzzle.
    /// Distributes reward to the referrer (and up to 2 more levels).
    pub fn on_first_puzzle_solved(env: Env, referee: Address, _reward_amount: i128) {
        // Resolve referral chain (up to 3 levels)
        let mut current = referee.clone();
        let multipliers: [i128; 3] = [100, 50, 25]; // basis points of reward
        let base_reward: i128 = 1_000_000; // 0.1 XLM in stroops

        for multiplier in multipliers {
            let referrer_opt: Option<Address> = env
                .storage()
                .persistent()
                .get(&DataKey::ReferrerOf(current.clone()));

            match referrer_opt {
                None => break,
                Some(referrer) => {
                    let payout = base_reward * multiplier / 10_000;
                    let mut bal: i128 = env
                        .storage()
                        .persistent()
                        .get(&DataKey::Rewards(referrer.clone()))
                        .unwrap_or(0);
                    bal += payout;
                    env.storage()
                        .persistent()
                        .set(&DataKey::Rewards(referrer.clone()), &bal);
                    current = referrer;
                }
            }
        }
    }

    /// Query pending reward balance for an address.
    pub fn get_reward_balance(env: Env, referrer: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Rewards(referrer))
            .unwrap_or(0)
    }

    /// Query the referral tree (level-1 referees) for an address.
    pub fn get_referees(env: Env, referrer: Address) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Referees(referrer))
            .unwrap_or(Vec::new(&env))
    }

    /// Query who referred a given address.
    pub fn get_referrer(env: Env, referee: Address) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::ReferrerOf(referee))
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_register_and_query_referral() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PuzzleReferralContract, ());
        let client = PuzzleReferralContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let referrer = Address::generate(&env);
        let referee = Address::generate(&env);

        client.init(&admin);
        client.register_referral(&referrer, &referee);

        let referees = client.get_referees(&referrer);
        assert_eq!(referees.len(), 1);
        assert_eq!(referees.get(0).unwrap(), referee);

        let stored_referrer = client.get_referrer(&referee).unwrap();
        assert_eq!(stored_referrer, referrer);
    }

    #[test]
    fn test_on_first_puzzle_solved_rewards_referrer() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PuzzleReferralContract, ());
        let client = PuzzleReferralContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let referrer = Address::generate(&env);
        let referee = Address::generate(&env);

        client.init(&admin);
        client.register_referral(&referrer, &referee);
        client.on_first_puzzle_solved(&referee, &1_000_000);

        let balance = client.get_reward_balance(&referrer);
        assert!(balance > 0);
    }

    #[test]
    #[should_panic(expected = "already referred")]
    fn test_anti_abuse_double_referral() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PuzzleReferralContract, ());
        let client = PuzzleReferralContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let referrer1 = Address::generate(&env);
        let referrer2 = Address::generate(&env);
        let referee = Address::generate(&env);

        client.init(&admin);
        client.register_referral(&referrer1, &referee);
        // second attempt should panic
        client.register_referral(&referrer2, &referee);
    }

    #[test]
    #[should_panic(expected = "cannot refer yourself")]
    fn test_self_referral_blocked() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PuzzleReferralContract, ());
        let client = PuzzleReferralContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        client.init(&admin);
        client.register_referral(&user, &user);
    }
}
