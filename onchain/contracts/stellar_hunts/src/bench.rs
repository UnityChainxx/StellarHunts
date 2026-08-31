#![cfg(test)]

// Resource fee / budget benchmark for `submit_answer`.
// Uses `env.cost_estimate()` and `env.budget()` to assert that the per-call
// CPU and memory cost of a typical `submit_answer` stays within bounds,
// catching accidental storage or computation blow-ups early.
//
// The test is included in the normal `cargo test --workspace --locked` run
// so it gates on every CI push. If you need to see live budget numbers
// interactively run with:
//   cargo test --workspace --locked -- bench_ --nocapture

use crate::{StellarHunts, StellarHuntsClient};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Bytes, Env};

fn b(env: &Env, s: &str) -> Bytes {
    Bytes::from_slice(env, s.as_bytes())
}

/// Full lifecycle: init → 1 question → correct answer.
///
/// Asserts that the CPU instruction cost of `submit_answer` (including
/// first-call player-initialization side effects) stays below a generous
/// ceiling of 5 million instructions — any non-trivial logic regression
/// will be caught by this gate.
#[test]
fn bench_submit_answer_cpu_budget() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    client.init(&admin);

    client.set_question_per_level(&1u32);
    let level = crate::Levels::Easy;
    let question = b(&env, "Bench question");
    let answer = b(&env, "Bench answer");
    let hint = b(&env, "Bench hint");
    client.add_question(&level, &question, &answer, &hint);

    let player = Address::generate(&env);

    // Reset the budget so we only measure the submit_answer call itself.
    let mut budget = env.budget();
    budget.reset_default();

    let ok = client.submit_answer(&player, &1u64, &answer);
    assert!(ok);

    let cpu = budget.cpu_instruction_cost();
    let mem = budget.memory_bytes_cost();

    // Log diagnostics when run with --nocapture.
    eprintln!(
        "submit_answer budget  cpu={}  mem={} bytes",
        cpu, mem
    );

    // Budget ceiling: 5M CPU instructions is generous for a single
    // submit_answer call (typical is ~200-500k). If this ever trips,
    // investigate what storage or crypto work is being done on the hot
    // path.
    assert!(
        cpu < 5_000_000,
        "submit_answer CPU budget exceeded: {} instructions (max 5_000_000)",
        cpu
    );

    // Memory ceiling: 128 KB.
    assert!(
        mem < 131_072,
        "submit_answer memory budget exceeded: {} bytes (max 131_072)",
        mem
    );
}

/// Ten consecutive correct answers to measure amortised cost.
/// The per-call average should stay well under the ceiling.
#[test]
fn bench_ten_submit_answers_amortised() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    client.init(&admin);

    let per_level: u32 = 10;
    client.set_question_per_level(&per_level);

    let level = crate::Levels::Easy;
    for i in 0..per_level {
        let q = b(&env, &format!("Q{}", i));
        let a = b(&env, &format!("A{}", i));
        let h = b(&env, &format!("H{}", i));
        client.add_question(&level, &q, &a, &h);
    }

    let player = Address::generate(&env);
    let mut budget = env.budget();
    budget.reset_default();

    for i in 0..per_level {
        let answer = b(&env, &format!("A{}", i));
        let ok = client.submit_answer(&player, &((i as u64) + 1), &answer);
        assert!(ok);
    }

    let total_cpu = budget.cpu_instruction_cost();
    let avg_cpu = total_cpu / (per_level as u64);

    eprintln!(
        "10x submit_answer  total_cpu={}  avg_cpu={}",
        total_cpu, avg_cpu
    );

    assert!(
        avg_cpu < 5_000_000,
        "amortised submit_answer CPU budget exceeded: {} avg instructions",
        avg_cpu
    );

    #[test]
fn bench_submit_answer_cpu_budget() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    client.init(&admin);

    client.set_question_per_level(&1u32);
    let level = crate::Levels::Easy;
    let question = b(&env, "Bench question");
    let answer = b(&env, "Bench answer");
    let hint = b(&env, "Bench hint");
    client.add_question(&level, &question, &answer, &hint);

    let player = Address::generate(&env);

    // Reset the budget so we only measure the submit_answer call itself.
    let mut budget = env.budget();
    budget.reset_default();

    let ok = client.submit_answer(&player, &1u64, &answer);
    assert!(ok);

    let cpu = budget.cpu_instruction_cost();
    let mem = budget.memory_bytes_cost();

    // Log diagnostics when run with --nocapture.
    eprintln!(
        "submit_answer budget  cpu={}  mem={} bytes",
        cpu, mem
    );

    // Budget ceiling: 5M CPU instructions is generous for a single
    // submit_answer call (typical is ~200-500k). If this ever trips,
    // investigate what storage or crypto work is being done on the hot
    // path.
    assert!(
        cpu < 5_000_000,
        "submit_answer CPU budget exceeded: {} instructions (max 5_000_000)",
        cpu
    );

    // Memory ceiling: 128 KB.
    assert!(
        mem < 131_072,
        "submit_answer memory budget exceeded: {} bytes (max 131_072)",
        mem
    );
}
}
