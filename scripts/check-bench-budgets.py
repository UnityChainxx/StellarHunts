#!/usr/bin/env python3
"""Enforce resource-budget baselines for the onchain contract benchmarks.

Parses the captured `cargo test -- bench_ --nocapture` output (written by
the "Run resource bench" CI step) and fails the job when any measured
metric exceeds its documented baseline in `onchain/bench-baselines.json`,
or when a benchmark produced no measurement at all (which would mean the
bench gate silently stopped running).

Usage:
    python3 scripts/check-bench-budgets.py [path-to-bench-output.txt]
"""

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BASELINES_PATH = REPO_ROOT / "onchain" / "bench-baselines.json"
DEFAULT_OUTPUT_PATH = REPO_ROOT / "onchain" / "bench-output.txt"

# Metrics the bench prints (see onchain/contracts/stellar_hunts/src/bench.rs).
PATTERNS = {
    "submit_answer_cpu": re.compile(
        r"submit_answer budget\s+cpu=(\d+)\s+mem=(\d+) bytes"
    ),
    "submit_answer_mem": re.compile(
        r"submit_answer budget\s+cpu=(\d+)\s+mem=(\d+) bytes"
    ),
    "ten_submit_answers_avg_cpu": re.compile(
        r"10x submit_answer\s+total_cpu=(\d+)\s+avg_cpu=(\d+)"
    ),
}


def main() -> int:
    output_path = (
        Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT_PATH
    )

    if not output_path.exists():
        print(
            f"❌ Bench output not found at {output_path}. "
            "Run the bench first: cargo test --workspace --locked -- bench_ --nocapture",
            file=sys.stderr,
        )
        return 1

    baselines = json.loads(BASELINES_PATH.read_text())["benchmarks"]

    measurements: dict[str, int] = {}
    for line in output_path.read_text().splitlines():
        cpu_match = PATTERNS["submit_answer_cpu"].search(line)
        if cpu_match:
            measurements["submit_answer_cpu"] = int(cpu_match.group(1))
            measurements["submit_answer_mem"] = int(cpu_match.group(2))
            continue

        avg_match = PATTERNS["ten_submit_answers_avg_cpu"].search(line)
        if avg_match:
            measurements["ten_submit_answers_avg_cpu"] = int(avg_match.group(2))

    failures: list[str] = []
    print(f"{'Metric':<28} {'Measured':>14} {'Max':>14}  Status")
    print("-" * 70)
    for metric, baseline in baselines.items():
        max_value = int(baseline["max"])
        measured = measurements.get(metric)
        if measured is None:
            failures.append(
                f"{metric}: no measurement found in bench output"
            )
            print(f"{metric:<28} {'n/a':>14} {max_value:>14}  ❌ MISSING")
            continue
        ok = measured <= max_value
        status = "✅ OK" if ok else "❌ EXCEEDED"
        if not ok:
            failures.append(
                f"{metric}: {measured} > {max_value} ({baseline.get('unit', '')})"
            )
        print(f"{metric:<28} {measured:>14} {max_value:>14}  {status}")
    print("-" * 70)

    if failures:
        print("\nResource budget regression(s) detected:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        print(
            "\nSee onchain/bench-baselines.json for the documented baselines. "
            "Investigate the hot path before raising a ceiling.",
            file=sys.stderr,
        )
        return 1

    print("\n✅ All resource budgets within documented baselines.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
