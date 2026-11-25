# stellar-extensions

Extensions contributed by program participants. All changes live exclusively inside this directory.

## Taylor-Kay — Issues #988, #999, #1002, #1004

| Folder | Purpose |
| --- | --- |
| `backend/src/ws-auth/` | WebSocket connection auth guard: JWT / session token validation, token refresh, per-IP rate limiting, audit logging, expiry disconnect. |
| `backend/src/puzzle-collaboration/` | Collaborative puzzle sections, comments and locks. |
| `backend/src/puzzle-difficulty-auto-adjustment/` | Automatic puzzle difficulty analysis. |
| `backend/src/puzzle-submission-throttle/` | Submission throttling guard and interceptor. |
| `backend/src/puzzle-version-comparison/` | Puzzle version comparison and history. |
| `backend/src/maintenance-mode/` | Maintenance-mode HTTP guard. |

## judithJn — Issues #917, #929, #965, #981

| Issue | Description | Path |
|-------|-------------|------|
| #917  | useStreakStatus hook | `frontend/hooks/useStreakStatus.ts` |
| #929  | Puzzle Hint System Module | `backend/puzzle-hint/` |
| #965  | Puzzle Reward Escrow Contract | `onchain/puzzle-reward-escrow/` |
| #981  | Unit Tests for useWalletConnection | `tests/useWalletConnection.test.tsx` |
