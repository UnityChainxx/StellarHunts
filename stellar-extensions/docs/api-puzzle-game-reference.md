# API Reference: Puzzle and Game Endpoints

> **Source:** Derived from `docs/api.md` and `docs/openapi.json`.
> This document covers the Puzzle and Game-related API endpoints in detail,
> including request/response examples, authentication requirements, error
> codes, and rate-limit information.
>
> **Base URL:** `/api/v1`
>
> **Authentication:** Routes marked `JWT` require `Authorization: Bearer <jwt>`.
> `JWT + Admin` additionally requires an admin role. `Public` routes accept
> anonymous requests.

---

## Contents

- [Puzzles (Game)](#puzzles-game)
- [Puzzles (Admin CRUD)](#puzzles-admin-crud)
- [Puzzle Submission](#puzzle-submission)
- [Puzzle Categories](#puzzle-categories)
- [Puzzle Dependencies](#puzzle-dependencies)
- [Puzzle Translations](#puzzle-translations)
- [Time Trial](#time-trial)
- [Challenges](#challenges)
- [Streaks](#streaks)
- [Achievements](#achievements)
- [Leaderboard / User Ranking](#leaderboard--user-ranking)
- [Error Responses](#error-responses)
- [Rate Limits](#rate-limits)

---

## Puzzles (Game)

Endpoints used by players during active gameplay.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/puzzles/active` | Public | List all active puzzles |
| POST | `/puzzles/submit` | JWT | Submit an answer for a puzzle |
| POST | `/puzzles/hint` | JWT | Request a hint for the current puzzle |
| GET | `/puzzles/progress` | JWT | Get the authenticated user's puzzle progress |
| GET | `/puzzles/rate-limit-status` | JWT | Check current rate-limit status for submissions |

### `GET /puzzles/active`

Returns all puzzles that are currently published and available to players.

**Response — `200 OK`**

```json
[
  {
    "id": "puzzle-abc123",
    "title": "Hash the Message",
    "category": "cryptography",
    "difficulty": "easy",
    "description": "Compute the SHA-256 hash of the given input.",
    "timeLimit": 60,
    "points": 100
  }
]
```

---

### `POST /puzzles/submit`

Submit an answer for an active puzzle. Subject to rate limiting (see [Rate Limits](#rate-limits)).

**Request body**

```json
{
  "puzzleId": "puzzle-abc123",
  "answer": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `puzzleId` | string | yes | ID of the puzzle being answered |
| `answer` | string | yes | The player's answer |

**Response — `200 OK`**

```json
{
  "correct": true,
  "points": 100,
  "message": "Correct! Well done.",
  "nextPuzzleId": "puzzle-def456"
}
```

**Response — `200 OK` (incorrect answer)**

```json
{
  "correct": false,
  "points": 0,
  "message": "Incorrect. Try again.",
  "attemptsRemaining": 2
}
```

**Errors**

| Status | Meaning |
|--------|---------|
| `400` | Missing or invalid fields |
| `401` | Missing or invalid JWT |
| `404` | Puzzle not found |
| `429` | Rate limit exceeded |

---

### `POST /puzzles/hint`

Request a hint for the puzzle the authenticated user is currently attempting.
Hints reduce the final point award for a successful submission.

**Request body**

```json
{
  "puzzleId": "puzzle-abc123"
}
```

**Response — `200 OK`**

```json
{
  "hint": "Think about the hexadecimal encoding of the hash output.",
  "pointPenalty": 20
}
```

**Errors**

| Status | Meaning |
|--------|---------|
| `400` | No active attempt for this puzzle |
| `404` | Puzzle not found |

---

### `GET /puzzles/progress`

Returns the authenticated user's overall progress across all puzzles.

**Response — `200 OK`**

```json
{
  "totalPuzzles": 50,
  "completed": 12,
  "inProgress": 3,
  "points": 1200,
  "rank": 42
}
```

---

### `GET /puzzles/rate-limit-status`

Returns the current submission rate-limit window for the authenticated user.

**Response — `200 OK`**

```json
{
  "limit": 10,
  "remaining": 7,
  "resetAt": "2026-11-25T14:00:00Z"
}
```

---

## Puzzles (Admin CRUD)

Administrative endpoints for managing the puzzle catalogue. All require `JWT + Admin`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/puzzles` | JWT + Admin | List all puzzles (admin view) |
| POST | `/admin/puzzles` | JWT + Admin | Create a new puzzle |
| GET | `/admin/puzzles/{id}` | JWT + Admin | Get a puzzle by ID (admin view) |
| PATCH | `/admin/puzzles/{id}` | JWT + Admin | Update a puzzle |
| DELETE | `/admin/puzzles/{id}` | JWT + Admin | Delete a puzzle |

### `POST /admin/puzzles`

**Request body**

```json
{
  "title": "Merkle Tree Proof",
  "category": "cryptography",
  "difficulty": "hard",
  "description": "Construct a Merkle tree and prove leaf inclusion.",
  "answer": "a1b2c3...",
  "hints": ["Start from the leaf nodes.", "Hash pairs bottom-up."],
  "points": 300,
  "timeLimit": 90
}
```

**Response — `201 Created`**

```json
{
  "id": "puzzle-xyz789",
  "title": "Merkle Tree Proof",
  "createdAt": "2026-11-25T10:00:00Z"
}
```

---

## Puzzle Submission

An alternative submission route that records a full submission entity.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/puzzle-submission` | JWT | Submit a puzzle answer |

**Request body**

```json
{
  "puzzleId": "puzzle-abc123",
  "answer": "2cf24dba..."
}
```

**Response — `201 Created`**

```json
{
  "id": "sub-001",
  "puzzleId": "puzzle-abc123",
  "userId": "user-456",
  "correct": true,
  "submittedAt": "2026-11-25T12:30:00Z"
}
```

---

## Puzzle Categories

Endpoints for browsing and managing puzzle categories.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/puzzle-categories/categories` | Public | List all categories |
| GET | `/puzzle-categories/categories/{id}` | Public | Get a category by ID |
| GET | `/puzzle-categories/categories/slug/{slug}` | Public | Get a category by slug |
| POST | `/puzzle-categories/categories` | JWT + Admin | Create a category |
| PUT | `/puzzle-categories/categories/{id}` | JWT + Admin | Update a category |
| DELETE | `/puzzle-categories/categories/{id}` | JWT + Admin | Delete a category |
| GET | `/puzzle-categories/puzzles` | Public | List all categorised puzzles |
| POST | `/puzzle-categories/puzzles` | JWT + Admin | Add a puzzle to a category |
| GET | `/puzzle-categories/puzzles/{id}` | Public | Get a categorised puzzle by ID |
| PUT | `/puzzle-categories/puzzles/{id}` | JWT + Admin | Update a puzzle's category assignment |
| DELETE | `/puzzle-categories/puzzles/{id}` | JWT + Admin | Remove a puzzle from a category |
| GET | `/puzzle-categories/categories/{id}/puzzles` | Public | Get all puzzles in a category |
| GET | `/puzzle-categories/puzzles-by-category` | Public | Get puzzles grouped by category |
| GET | `/puzzle-categories/puzzles/difficulty/{difficulty}` | Public | Filter puzzles by difficulty |
| GET | `/puzzle-categories/puzzles/search` | Public | Search puzzles |
| POST | `/puzzle-categories/seed-categories` | JWT + Admin | Seed default categories |

### `GET /puzzle-categories/puzzles/search`

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search term (matches title and description) |
| `category` | string | Filter by category slug |
| `difficulty` | string | `easy`, `medium`, `hard`, or `master` |
| `page` | number | Page number (default `1`) |
| `limit` | number | Results per page (default `20`, max `100`) |

**Response — `200 OK`**

```json
{
  "data": [
    {
      "id": "puzzle-abc123",
      "title": "Hash the Message",
      "category": "cryptography",
      "difficulty": "easy"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

## Puzzle Dependencies

Control which puzzles must be completed before others are unlocked.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/puzzle-dependencies` | JWT | List all dependencies |
| POST | `/puzzle-dependencies` | JWT + Admin | Create a dependency |
| GET | `/puzzle-dependencies/{id}` | JWT | Get a dependency by ID |
| PATCH | `/puzzle-dependencies/{id}` | JWT + Admin | Update a dependency |
| DELETE | `/puzzle-dependencies/{id}` | JWT + Admin | Delete a dependency |
| GET | `/puzzle-dependencies/puzzle/{puzzleId}` | JWT | Get dependencies for a puzzle |
| DELETE | `/puzzle-dependencies/puzzle/{puzzleId}` | JWT + Admin | Remove all dependencies for a puzzle |
| POST | `/puzzle-dependencies/check-eligibility` | JWT | Check if a user is eligible to attempt a puzzle |
| POST | `/puzzle-dependencies/mark-completed` | JWT | Mark a dependency as completed |
| GET | `/puzzle-dependencies/user/{userId}/completed` | JWT | List completed dependencies for a user |
| GET | `/puzzle-dependencies/user/{userId}/unlocked` | JWT | List unlocked puzzles for a user |
| GET | `/puzzle-dependencies/chain/{puzzleId}` | JWT | Get the full prerequisite chain for a puzzle |
| GET | `/puzzle-dependencies/stats/{puzzleId}` | JWT | Get dependency stats for a puzzle |

### `POST /puzzle-dependencies/check-eligibility`

**Request body**

```json
{
  "userId": "user-456",
  "puzzleId": "puzzle-xyz789"
}
```

**Response — `200 OK`**

```json
{
  "eligible": true,
  "unmetDependencies": []
}
```

If prerequisites are missing:

```json
{
  "eligible": false,
  "unmetDependencies": ["puzzle-abc123", "puzzle-def456"]
}
```

---

## Puzzle Translations

Multi-language support for puzzle content.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/puzzle-translations/{puzzleId}` | Public | Get all translations for a puzzle |
| GET | `/puzzle-translations/{puzzleId}/lang` | Public | Get a translation in a specific language |
| POST | `/puzzle-translations` | JWT + Admin | Create a translation |
| PUT | `/puzzle-translations/{id}` | JWT + Admin | Update a translation |

### `GET /puzzle-translations/{puzzleId}/lang`

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `lang` | string | BCP 47 language tag, e.g. `fr`, `pt-BR` |

**Response — `200 OK`**

```json
{
  "puzzleId": "puzzle-abc123",
  "lang": "fr",
  "title": "Hacher le message",
  "description": "Calculez le hachage SHA-256 de l'entrée donnée."
}
```

---

## Time Trial

Speed-solving puzzles with a countdown timer.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/time-trial/start` | JWT | Start a timed puzzle attempt |
| POST | `/time-trial/submit/{id}` | JWT | Submit an answer for a time trial |
| GET | `/time-trial/results/{userId}` | JWT | Get time trial results for a user |
| GET | `/time-trial/leaderboard/{puzzleId}` | Public | Time trial leaderboard for a puzzle |

### `POST /time-trial/start`

**Request body**

```json
{
  "userId": "user-456",
  "puzzleId": "puzzle-abc123"
}
```

**Response — `201 Created`**

```json
{
  "id": "trial-001",
  "puzzleId": "puzzle-abc123",
  "startTime": "2026-11-25T12:00:00Z",
  "timeLimitSeconds": 60
}
```

---

### `POST /time-trial/submit/{id}`

Submit the answer for an active time trial. The server checks whether
`now - startTime` exceeds `timeLimitSeconds` before accepting.

**Path parameter:** `id` — the time trial ID returned by `start`.

**Request body**

```json
{
  "answer": "2cf24dba..."
}
```

**Response — `200 OK`**

```json
{
  "correct": true,
  "elapsedSeconds": 23,
  "timeLimitSeconds": 60,
  "points": 300
}
```

**Errors**

| Status | Meaning |
|--------|---------|
| `400` | Time limit exceeded or answer missing |
| `404` | Time trial not found |

---

### `GET /time-trial/leaderboard/{puzzleId}`

Returns the top 10 fastest correct completions for a puzzle.

**Response — `200 OK`**

```json
[
  {
    "rank": 1,
    "userId": "user-789",
    "username": "stellarspeed",
    "elapsedSeconds": 11,
    "completedAt": "2026-11-20T09:15:00Z"
  }
]
```

---

## Challenges

Time-boxed puzzle collections with leaderboards and rewards.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/challenges` | JWT | List all challenges |
| GET | `/challenges/available` | JWT | List challenges available to the user |
| GET | `/challenges/daily` | JWT | Get today's daily challenge |
| GET | `/challenges/weekly` | JWT | Get the current weekly challenge |
| GET | `/challenges/{id}` | JWT | Get a challenge by ID |
| GET | `/challenges/{id}/stats` | JWT | Get stats for a challenge |
| POST | `/challenges` | JWT + Admin | Create a challenge |
| PATCH | `/challenges/{id}` | JWT + Admin | Update a challenge |
| DELETE | `/challenges/{id}` | JWT + Admin | Delete a challenge |

### `GET /challenges/daily`

**Response — `200 OK`**

```json
{
  "id": "challenge-daily-001",
  "title": "Daily Hash Sprint",
  "puzzleIds": ["puzzle-abc123", "puzzle-def456"],
  "endsAt": "2026-11-25T23:59:59Z",
  "rewardPoints": 500
}
```

---

## Streaks

Track consecutive-day activity and reward consistency.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/streaks/activity` | JWT | Record a streak activity event |
| GET | `/streaks/my-streak` | JWT | Get the authenticated user's streak |
| GET | `/streaks/user/{userId}` | JWT | Get streak data for a user |
| GET | `/streaks/history` | JWT | Authenticated user's streak history |
| GET | `/streaks/user/{userId}/history` | JWT | Streak history for a user |
| GET | `/streaks/leaderboard` | JWT | Streak leaderboard |
| GET | `/streaks/active` | JWT | List users with active streaks |
| POST | `/streaks/recalculate` | JWT + Admin | Recalculate streaks |
| POST | `/streaks/reset` | JWT + Admin | Reset streaks |
| GET | `/public/streaks/user/{userId}` | Public | Get streak data for a user (public) |
| GET | `/public/streaks/leaderboard` | Public | Public streak leaderboard |
| GET | `/public/streaks/stats` | Public | Global streak statistics |

### `GET /streaks/my-streak`

**Response — `200 OK`**

```json
{
  "currentStreak": 7,
  "longestStreak": 21,
  "lastActivityDate": "2026-11-24",
  "streakBonusMultiplier": 1.5
}
```

---

## Achievements

Milestone rewards earned by completing specific goals.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/achievements/{playerId}` | JWT | Get all achievements for a player |

### `GET /achievements/{playerId}`

**Response — `200 OK`**

```json
[
  {
    "id": "ach-001",
    "name": "First Solve",
    "description": "Complete your first puzzle.",
    "earnedAt": "2026-11-01T08:00:00Z",
    "badgeUrl": "https://cdn.stellarhunts.io/badges/first-solve.png"
  }
]
```

---

## Leaderboard / User Ranking

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/{id}/rank` | JWT | Get a user's ranking information |

### `GET /users/{id}/rank`

**Response — `200 OK`**

```json
{
  "userId": "user-456",
  "rank": 42,
  "points": 1200,
  "totalPlayers": 5000,
  "percentile": 99.2
}
```

---

## Error Responses

All endpoints return standard HTTP status codes. Error bodies follow the NestJS default shape:

| Status | Meaning |
|--------|---------|
| `200` | OK |
| `201` | Created |
| `400` | Bad Request — validation failed |
| `401` | Unauthorized — missing or invalid JWT |
| `403` | Forbidden — insufficient role |
| `404` | Not Found |
| `409` | Conflict |
| `429` | Too Many Requests — rate limited |
| `500` | Internal Server Error |

```json
{
  "statusCode": 400,
  "message": ["puzzleId must not be empty"],
  "error": "Bad Request"
}
```

---

## Rate Limits

The puzzle submission endpoints (`POST /puzzles/submit` and `POST /puzzle-submission`)
enforce a per-user sliding-window rate limit. Use `GET /puzzles/rate-limit-status`
to check the current window before submitting.

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /puzzles/submit` | 10 requests | 1 minute |
| `POST /puzzle-submission` | 10 requests | 1 minute |

When the limit is exceeded the API returns `429 Too Many Requests` with a
`Retry-After` header indicating when the window resets.

```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "retryAfter": "2026-11-25T14:01:00Z"
}
```
