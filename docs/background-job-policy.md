# Background-job and blockchain-operation policy

This policy applies to scheduled backend jobs and outbound Stellar/Soroban operations.

## Retries and backoff

- Retry transient failures at most **three total attempts**.
- Use exponential backoff: the configured base delay, then 2x the base delay.
- Do not retry client/input failures (`BadRequestException`) or other known non-transient errors.
- Log the operation, trigger, attempt number, elapsed time, and error without secrets.

## Deduplication and overlap protection

- A scheduled job must not start a second run while an earlier run is active. The current process uses an in-memory execution guard.
- Blockchain operations must use a stable operation identity (user and NFT for claims) so future durable/idempotency storage can reject duplicate submissions.
- On-chain transaction submission should be idempotent by transaction/request identity before live Soroban submission is enabled.

## Timeouts

- Outbound NFT claims have a 30-second per-attempt timeout.
- A timeout is treated as transient and follows the retry policy.
- Scheduled database work should use the database driver's configured query timeout where available; a failed query is contained and reported rather than crashing the scheduler.

## Failure handling and observability

- Scheduled jobs contain errors after retries, emit an error log, and remain eligible for the next scheduled run.
- Successful and failed operations emit structured key/value fields in log messages: operation, trigger, attempt, duration, retryability, and error.
- Never log private keys, credentials, authorization headers, or complete user secrets.
- If durable queues or distributed workers are introduced, replace the process-local overlap guard with a distributed lock and persist attempt/failure state for alerting and replay.
