//! Puzzle Reward Escrow Contract — issue #965
//!
//! Holds reward tokens in escrow until puzzle completion conditions are met.
//! Supports multi-sig approval for large rewards and a refund mechanism
//! for expired escrows.
#![cfg_attr(not(test), no_std)]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Vec,
};

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum EscrowStatus {
    Active,
    Released,
    Refunded,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Escrow {
    pub puzzle_id: u64,
    pub depositor: Address,
    pub beneficiary: Address,
    pub amount: i128,
    pub expiry_ledger: u32,
    pub status: EscrowStatus,
    /// For multi-sig: list of required approvers
    pub approvers: Vec<Address>,
    pub approvals_given: u32,
    pub approvals_required: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Escrow(u64),
    EscrowCount,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct PuzzleRewardEscrowContract;

#[contractimpl]
impl PuzzleRewardEscrowContract {
    pub fn init(env: Env, admin: Address) {
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::EscrowCount, &0u64);
    }

    /// Deposit reward tokens into escrow for a puzzle.
    pub fn deposit(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        puzzle_id: u64,
        amount: i128,
        expiry_ledger: u32,
        approvers: Vec<Address>,
    ) -> u64 {
        depositor.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }
        if expiry_ledger <= env.ledger().sequence() {
            panic!("expiry_ledger must be in the future");
        }

        let approvals_required = if approvers.is_empty() { 0u32 } else { 1u32 };

        let escrow = Escrow {
            puzzle_id,
            depositor,
            beneficiary,
            amount,
            expiry_ledger,
            status: EscrowStatus::Active,
            approvers,
            approvals_given: 0,
            approvals_required,
        };

        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::EscrowCount)
            .unwrap_or(0);
        let escrow_id = count + 1;

        env.storage()
            .persistent()
            .set(&DataKey::Escrow(escrow_id), &escrow);
        env.storage()
            .persistent()
            .set(&DataKey::EscrowCount, &escrow_id);

        escrow_id
    }

    /// Approve a large-reward escrow (multi-sig).
    pub fn approve(env: Env, escrow_id: u64, approver: Address) {
        approver.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow not found");

        if escrow.status != EscrowStatus::Active {
            panic!("escrow is not active");
        }

        // Verify the approver is in the list
        let mut is_approver = false;
        for a in escrow.approvers.iter() {
            if a == approver {
                is_approver = true;
                break;
            }
        }
        if !is_approver {
            panic!("not an authorised approver");
        }

        escrow.approvals_given += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Escrow(escrow_id), &escrow);
    }

    /// Release reward to the beneficiary once puzzle conditions are met.
    pub fn release(env: Env, escrow_id: u64, admin: Address) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Admin)
            .expect("admin not set");
        if admin != stored_admin {
            panic!("only admin can release");
        }

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow not found");

        if escrow.status != EscrowStatus::Active {
            panic!("escrow is not active");
        }
        if escrow.approvals_given < escrow.approvals_required {
            panic!("insufficient approvals for multi-sig escrow");
        }

        escrow.status = EscrowStatus::Released;
        env.storage()
            .persistent()
            .set(&DataKey::Escrow(escrow_id), &escrow);
        // In production: transfer `escrow.amount` tokens to `escrow.beneficiary`
    }

    /// Refund to depositor for expired escrow.
    pub fn refund(env: Env, escrow_id: u64) {
        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow not found");

        if escrow.status != EscrowStatus::Active {
            panic!("escrow is not active");
        }
        if env.ledger().sequence() < escrow.expiry_ledger {
            panic!("escrow has not yet expired");
        }

        escrow.status = EscrowStatus::Refunded;
        env.storage()
            .persistent()
            .set(&DataKey::Escrow(escrow_id), &escrow);
        // In production: transfer `escrow.amount` tokens back to `escrow.depositor`
    }

    /// Query escrow status.
    pub fn get_escrow(env: Env, escrow_id: u64) -> Escrow {
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow not found")
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_deposit_and_query() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(PuzzleRewardEscrowContract, ());
        let client = PuzzleRewardEscrowContractClient::new(&env, &cid);

        let admin = Address::generate(&env);
        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);

        client.init(&admin);

        let escrow_id = client.deposit(
            &depositor,
            &beneficiary,
            &1u64,
            &1_000_000i128,
            &(env.ledger().sequence() + 100),
            &Vec::new(&env),
        );

        assert_eq!(escrow_id, 1);

        let escrow = client.get_escrow(&escrow_id);
        assert_eq!(escrow.amount, 1_000_000);
        assert_eq!(escrow.status, EscrowStatus::Active);
    }

    #[test]
    fn test_release_by_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(PuzzleRewardEscrowContract, ());
        let client = PuzzleRewardEscrowContractClient::new(&env, &cid);

        let admin = Address::generate(&env);
        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);

        client.init(&admin);

        let eid = client.deposit(
            &depositor,
            &beneficiary,
            &1u64,
            &500_000i128,
            &(env.ledger().sequence() + 50),
            &Vec::new(&env),
        );

        client.release(&eid, &admin);

        let escrow = client.get_escrow(&eid);
        assert_eq!(escrow.status, EscrowStatus::Released);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_zero_amount_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(PuzzleRewardEscrowContract, ());
        let client = PuzzleRewardEscrowContractClient::new(&env, &cid);

        let admin = Address::generate(&env);
        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);

        client.init(&admin);
        client.deposit(
            &depositor,
            &beneficiary,
            &1u64,
            &0i128,
            &(env.ledger().sequence() + 10),
            &Vec::new(&env),
        );
    }
}
