# Data Retention Policy for Append-Only Records

This document defines the lifecycle, retention windows, and cleanup mechanisms for high-volume, append-only operational tables in StellarHunts.

---

## Retention Policy Matrix

| Table | Module | Retention Window | Primary Purpose | Classification | Reason & Handling of User-Facing Records |
|---|---|---|---|---|---|
| `analytics_events` | `analytic` | 90 days | Puzzle solve telemetry & metrics | Operational Telemetry | Global leaderboard rankings are pre-aggregated and preserved in `puzzle_stats_mv`. User puzzle solve history for recent engagement (last 90 days) remains active. Telemetry older than 90 days is expired in bounded batches. |
| `audit_logs` | `audit-log` | 90 days (default) | Administrative and moderation trail | Compliance / Audit Obligation | Regulatory and dispute-resolution audit trail. Append-only with no user mutation endpoints; purged only by scheduled cron or authorized administrative retention endpoints. |
| `activity_logs` | `user-activity-log` | 30 days | User interaction debugging & telemetry | Operational Telemetry | High-frequency telemetry (e.g. `PUZZLE_ATTEMPT`, `QUIZ_SUBMISSION`). Permanent player progress, rewards, and achievements are stored in normalized domain entities (`user_progress`, `user_milestones`, `token_history`) and are never deleted by this job. |
| `puzzle_access_logs` | `puzzle-access-log` | 14 days | Puzzle view & popularity trend analysis | Operational Telemetry | Used exclusively for 7-day trend aggregations (`getTimeBasedTrends`). No user-facing history or compliance dependencies. |

---

## Bounded Batch Deletion Mechanism

To avoid long-lived database locks, replication lag, and exceeding transaction budgets, all retention cleanup jobs implement **bounded batch deletion**:

1. **Row Count Bounding:** Deletions operate in configurable chunks (500 to 1,000 rows per batch) up to a maximum number of batches per run (e.g. 20 batches).
2. **Time Bounding:** Cleanup runs yield after processing their batch allowance, ensuring background jobs complete within milliseconds without exhausting pool connections.
3. **Concurrency & Overlap Safety:**
   - In PostgreSQL, queries utilize `FOR UPDATE SKIP LOCKED` or batch ID chunking so that if multiple replicas run the cleanup job concurrently, instances process non-overlapping slices without blocking, deadlocking, or double-deleting.
   - Jobs are idempotent and safe to execute across distributed pods.

---

## Observability and Alerting

Each retention execution emits structured logs including:
- Target table name
- Number of rows deleted
- Duration in milliseconds
- Batch count

Example log output:
```text
[AnalyticService] Analytics retention cleanup: purged 1000 events older than 90 days in 42ms (1 batches)
[AuditLogService] AuditLog retention cleanup: purged 250 records older than 90 days in 18ms (1 batches)
[UserActivityLogService] ActivityLog retention cleanup: purged 500 records older than 30 days in 24ms (1 batches)
[PuzzleAccessLogService] PuzzleAccessLog retention cleanup: purged 120 records older than 14 days in 12ms (1 batches)
```

Jobs execute daily at midnight via `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)`.
