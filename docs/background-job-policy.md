# Background-job and blockchain-operation policy

This policy applies to scheduled backend jobs and outbound Stellar/Soroban operations.

Every control below is labelled either **implemented** (with the file and the
mechanism that provides it) or **not yet implemented** (a requirement that the
codebase does not satisfy today). Nothing in this document is aspirational: if a
claim has no `Source` reference, it is a requirement, not a description of
current behaviour.

`backend/src/docs/background-job-policy.spec.ts` enforces this document against
the code. It fails if a scheduled job is missing from the inventory, if an
inventory row points at a line that no longer holds that job, if a cited path
does not exist, or if a control value drifts from the constant in the code.

## Overlap protection and multiple replicas

Only 2 of the 12 scheduled jobs carry an in-process execution guard, and that
guard is a plain field on a singleton service.

**A process-local guard does not protect against multiple replicas.** Each
backend replica runs its own scheduler, so a guard such as
`private isProcessing = false` only prevents a *second run inside the same
process*. While two replicas are serving traffic, both will execute every
unprotected job on every tick, and the two runs can interleave freely. Overlap
protection for a multi-replica deployment requires a distributed lock — a Redis
lock, a PostgreSQL advisory lock, or a unique constraint that the job's writes
depend on — and no such lock exists today for the 9 jobs that are neither
process-guarded nor database-locked.

Changing a guard from a process-local field to a distributed lock is listed under
[Requirements not yet met](#requirements-not-yet-met).

## Scheduled job inventory

All 12 `@Cron` jobs in `backend/src` are listed. "Overlap protection" records
what actually prevents two concurrent runs; "Errors contained" records whether
the job catches its own failures.

| Job | Source | Schedule | Overlap protection | Errors contained |
| --- | --- | --- | --- | --- |
| `refreshLeaderboard` | `backend/src/analytic/analytic-rollup.service.ts:32` | every minute | process-local guard | yes |
| `scheduledRetentionCleanup` | `backend/src/analytic/analytic.service.ts:364` | daily at midnight | database row lock (`FOR UPDATE SKIP LOCKED`) | no |
| `scheduledRetentionCleanup` | `backend/src/audit-log/audit-log.service.ts:183` | daily at midnight | none | no |
| `rotateDailyChallenges` | `backend/src/game-mechanic/services/rotation.service.ts:12` | daily at midnight | none | yes |
| `rotateWeeklyChallenges` | `backend/src/game-mechanic/services/rotation.service.ts:57` | weekly | none | yes |
| `checkScheduledMaintenance` | `backend/src/maintenance-mode/maintenance-mode.service.ts:193` | every minute | none | yes |
| `processMatchmaking` | `backend/src/multiplayer-queue/multiplayer-queue.service.ts:238` | every 10 seconds | none | no |
| `cleanupOldEntries` | `backend/src/multiplayer-queue/multiplayer-queue.service.ts:490` | daily at midnight | none | no |
| `processOutbox` | `backend/src/outbox/outbox.service.ts:151` | every 10 seconds | process-local guard | yes |
| `scheduledRetentionCleanup` | `backend/src/puzzle-access-log/puzzle-access-log.service.ts:115` | daily at midnight | none | no |
| `cleanupExpiredSessions` | `backend/src/session/session.service.ts:44` | hourly | none | no |
| `scheduledRetentionCleanup` | `backend/src/user-activity-log/user-activity-log.service.ts:95` | daily at midnight | none | no |

Notes on the inventory:

- The only job that is safe across replicas by construction is the analytics
  retention cleanup, which deletes in bounded batches using
  `FOR UPDATE SKIP LOCKED`. Concurrent replicas therefore skip each other's
  locked rows instead of blocking or double-deleting. See *Analytics retention
  row lock*.
- The 3 log-retention jobs (`audit-log`, `puzzle-access-log`,
  `user-activity-log`) use the same bounded-batch shape but select ids with a
  plain `SELECT ... LIMIT` and no row lock, so two replicas can select the same
  ids concurrently.
- `processOutbox` and `refreshLeaderboard` are guarded only inside one process.
  `processOutbox` additionally claims each event before handling it, which
  keeps a *single event* from being handled twice even when several replicas
  drain the same queue. See *Outbox claims an event before handling it*.
- 7 jobs do not catch their own failures. A failing tick in those jobs emits no
  log line from the job itself and is not retried by the job.

## Control values

These values are asserted against the cited source line by
`backend/src/docs/background-job-policy.spec.ts`. Change a constant in code and
this table, in the same commit.

| Control | Identifier | Value | Source | Meaning |
| --- | --- | --- | --- | --- |
| NFT claim attempts | `maxRetries` | `3` | `backend/src/nft-claim/nft-claim.service.ts:14` | total attempts, not extra retries |
| NFT claim base backoff | `retryDelayMs` | `2000` | `backend/src/nft-claim/nft-claim.service.ts:15` | milliseconds before the second attempt |
| NFT claim per-attempt timeout | `operationTimeoutMs` | `90_000` | `backend/src/nft-claim/nft-claim.service.ts:22` | milliseconds |
| Outbox max attempts | `DEFAULT_MAX_ATTEMPTS` | `3` | `backend/src/outbox/outbox.service.ts:10` | events move to `DEAD_LETTER` at this count |
| Outbox base backoff | `DEFAULT_BASE_BACKOFF_MS` | `1000` | `backend/src/outbox/outbox.service.ts:11` | milliseconds |
| Outbox batch size | `DEFAULT_BATCH_SIZE` | `50` | `backend/src/outbox/outbox.service.ts:9` | events per tick |
| Rollup attempts | `maxRetries` | `3` | `backend/src/analytic/analytic-rollup.service.ts:22` | total attempts |
| Rollup base backoff | `retryDelayMs` | `500` | `backend/src/analytic/analytic-rollup.service.ts:23` | milliseconds |

## Mechanism references

Where a control lives, with the token to look for on that exact line.
`backend/src/docs/background-job-policy.spec.ts` asserts each row, and it also
forbids any `file:line` citation anywhere in this document that does not appear
in this table, in the [control values](#control-values) table, or in the
[job inventory](#scheduled-job-inventory). So a line reference cannot rot
unnoticed in prose.

| Mechanism | Token on that line | Source |
| --- | --- | --- |
| Outbox overlap guard field | `private isProcessing = false` | `backend/src/outbox/outbox.service.ts:17` |
| Outbox overlap guard check | `if (this.isProcessing)` | `backend/src/outbox/outbox.service.ts:153` |
| Outbox guard released in `finally` | `this.isProcessing = false` | `backend/src/outbox/outbox.service.ts:185` |
| Outbox claims an event before handling it | `claimEvent(event.id)` | `backend/src/outbox/outbox.service.ts:162` |
| Outbox re-reads a failed event only when due | `nextAttemptAt` | `backend/src/outbox/outbox.service.ts:68` |
| Outbox invokes the registered handler | `handler(event.payload` | `backend/src/outbox/outbox.service.ts:178` |
| Outbox parks an exhausted event | `event.status = OutboxStatus.DEAD_LETTER` | `backend/src/outbox/outbox.service.ts:134` |
| Outbox logs the dead-letter transition at error level | `this.logger.error(` | `backend/src/outbox/outbox.service.ts:136` |
| Outbox handler registration point | `registerHandler` | `backend/src/outbox/outbox.service.ts:28` |
| Outbox branch for an unregistered event type | `if (!handler)` | `backend/src/outbox/outbox.service.ts:168` |
| Rollup overlap guard check | `if (this.running)` | `backend/src/analytic/analytic-rollup.service.ts:45` |
| Analytics retention row lock | `FOR UPDATE SKIP LOCKED` | `backend/src/analytic/analytic.service.ts:340` |
| Claim attempt loop bound | `attempt <= this.maxRetries` | `backend/src/nft-claim/nft-claim.service.ts:31` |
| Claim backoff formula | `2 ** (attempt - 1)` | `backend/src/nft-claim/nft-claim.service.ts:70` |
| Claim rethrows client errors without retrying | `if (error instanceof BadRequestException) throw error` | `backend/src/nft-claim/nft-claim.service.ts:64` |
| Claim operation identity | `claimNFTDto.userId}:${claimNFTDto.nftId` | `backend/src/nft-claim/nft-claim.service.ts:27` |

## Retries and backoff

Implemented:

- The NFT claim path makes at most three total attempts and waits
  `retryDelayMs * 2 ** (attempt - 1)` between them, giving 2s then 4s. See
  *Claim attempt loop bound* and *Claim backoff formula*.
- A `BadRequestException` is rethrown immediately and never retried, so client
  and input errors do not consume the retry budget. See *Claim rethrows client
  errors without retrying*.
- The outbox dispatcher retries a failed event up to `DEFAULT_MAX_ATTEMPTS`
  times with `baseBackoffMs * 2 ** (attempts - 1)` backoff and then parks the
  event in `DEAD_LETTER`. See *Outbox parks an exhausted event*.
- A `FAILED` event is re-read only once `nextAttemptAt` has passed, so a backoff
  is honoured across ticks rather than being restarted on every tick. See *Outbox
  re-reads a failed event only when due*.

Not yet implemented:

- A single shared retry helper. The claim path, the rollup, and the outbox each
  implement their own loop and their own delay formula, so the three can drift.
- Retrying the 10 scheduled jobs that have no retry at all. Today a failed
  retention cleanup or matchmaking tick waits for the next scheduled run, with no
  backoff and no attempt counter.
- Any alerting when an outbox event reaches `DEAD_LETTER`. The transition is
  logged at error level and the event's `attempts` and `lastError` are
  persisted, but nothing pages anyone and there is no replay tool. See *Outbox
  logs the dead-letter transition at error level*.

## Timeouts

Implemented:

- One provider attempt in the NFT claim path is bounded at 90 seconds, as
  recorded in the [control values](#control-values) table. This is deliberately larger
  than the provider's own 60 second submit-and-confirmation deadline; the
  in-code rationale is that a healthy but slow confirmation must not be cut off
  and reported as a transient failure.
- A timed-out attempt is treated as transient and therefore consumes one of the
  three attempts and follows the backoff above.

Not yet implemented:

- Per-attempt timeouts for any other outbound Stellar or Soroban operation. The
  90 second bound is specific to the claim path; other RPC or submit calls are
  bounded only by the HTTP client and driver defaults.
- A database statement timeout for scheduled work. Jobs rely on the driver's
  configured timeouts, so a slow query occupies a scheduler tick for as long as
  the driver allows.

## Deduplication and blockchain-operation identity

Implemented:

- The claim path composes a stable operation identity of
  `${claimNFTDto.userId}:${claimNFTDto.nftId}` and emits it on every log line for that attempt, so retries of one claim
  correlate in logs. See *Claim operation identity*.
- The outbox persists each event's `attempts`, `lastError` and `nextAttemptAt`,
  and claims an event before handling it, so one event is not processed twice by
  two concurrent drains.

Not yet implemented:

- **Durable idempotency for blockchain submissions.** The composed
  `${claimNFTDto.userId}:${claimNFTDto.nftId}` identity is used only for log
  correlation; it is never
  persisted and never compared. Nothing prevents two live Soroban submissions for
  the same user and NFT — no unique constraint backs the claim, so a duplicated
  HTTP request still produces two submissions.
- **Idempotency by transaction or request identity before live submission.** No
  submit path records or reuses a transaction identity, so a retry after an
  ambiguous timeout can duplicate an on-chain effect.
- **A registered outbox handler for any production event type.**
  `registerHandler` (`backend/src/outbox/outbox.service.ts:28`) is called only
  from `backend/src/outbox/outbox.service.spec.ts`. With no production handler
  registered, every real outbox event takes the "no handler registered" branch
  and eventually dead-letters. See *Outbox handler registration point* and *Outbox
  branch for an unregistered event type*.

## Failure handling and observability

Implemented:

- The outbox dispatcher wraps each handler invocation and routes a failure into
  the retry path rather than letting one bad event abort the batch. See *Outbox
  invokes the registered handler*.
- Its own process-local guard is released in a `finally` block, so a throwing tick
  does not leave the guard latched and silently disable the job for the life of
  the process. See *Outbox guard released in `finally`*.
- Claim, rollup, and outbox log structured key/value fields: `operation`,
  `trigger`, `attempt`, `durationMs`, `retryable`, and `error`.
- No private key, credential, authorization header, or user secret is logged;
  log lines carry identifiers and error messages only.

Not yet implemented:

- Error containment for the 7 jobs marked "no" in the inventory. They do not
  catch, log, or report their own failures, so a failing tick produces no
  job-level log entry.
- Emitting a "job skipped because a run is still active" signal for the
  unprotected jobs. Today a second overlapping run is invisible: it simply
  proceeds.
- An attempt counter or last-error record for the 9 unprotected jobs, so repeated
  failures cannot be distinguished from a job that has been failing silently for
  a week.

## Requirements not yet met

Consolidated list of the gaps above. Each is a requirement this document makes
explicit because the current code does not satisfy it.

1. Replace the 2 process-local overlap guards with distributed locks, and give
   the remaining 9 unprotected jobs some form of protection, before the backend
   is run with more than one replica.
2. Add the missing row lock to the 3 log-retention jobs so they match the
   analytics retention job.
3. Add in-method error containment and job-level error logging to the 7 jobs
   listed as "no" in the inventory.
4. Persist a claim idempotency key, backed by a unique constraint, so a repeated
   claim request cannot produce a second on-chain submission.
5. Record a transaction or request identity for each outbound submission and
   reuse it on retry.
6. Register production outbox handlers for the event types the application
   actually emits.
7. Alert on `DEAD_LETTER` outbox events and provide a replay path.
8. Add per-attempt timeouts to outbound Stellar and Soroban operations other than
   the claim path, and a statement timeout for scheduled database work.
9. Extract one shared retry helper with one delay formula, so the claim path, the
   rollup, and the outbox cannot drift apart.

## Keeping this document honest

Run the consistency check with the rest of the backend suite:

```
cd backend && npm test -- background-job-policy
```

The spec re-derives the job inventory from the source tree, so adding a
`@Cron` job without adding a row above fails the build. It also re-reads every
cited source line, so renaming a constant or moving a decorator fails the build
until this document is updated in the same commit.
