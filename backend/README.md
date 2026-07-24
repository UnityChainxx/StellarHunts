# StellarHunt — Backend

The backend for StellarHunt, built with [NestJS](https://nestjs.com/). This API server handles authentication, puzzle and reward management, leaderboard rankings, user progression, and blockchain interaction orchestration.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| NestJS | Application framework |
| TypeScript | Type-safe development |
| PostgreSQL | Primary database |
| TypeORM | Database ORM and migrations |
| Redis / ioredis | Caching and session storage |
| Passport (JWT) | Authentication and authorization |
| Socket.IO | Real-time multiplayer matchmaking |
| Swagger | API documentation |
| Jest | Unit and E2E testing |
| Prettier | Code formatting |

## Architecture

The backend follows NestJS's modular architecture — each domain concern is encapsulated in its own module with a controller, service, and entities:

```
src/
├── auth/                  # JWT authentication, OAuth, session management
├── content/               # Educational articles, videos, and resources
├── puzzle-category/       # Puzzle categorization and CRUD
├── rewards/               # NFT, token, and badge reward distribution
├── progress/              # User progress tracking and XP calculation
├── analytics/             # Event tracking and usage metrics
├── user-activity-log/     # Audit trail for user actions
├── user-report-card/      # Performance summaries per user
├── user-settings/         # User preferences and configuration
├── multiplayer-queue/     # Matchmaking for collaborative play
├── rate-limiter/          # Request rate limiting and throttling
├── session/               # Session lifecycle management
├── daily-reward/          # Daily login bonuses
├── streak/                # Consecutive activity tracking
├── milestone/             # Achievement milestone definitions
├── referral/              # Referral program logic
├── geostats/              # Geographic player statistics
├── promo-code/            # Promotional code redemption
├── reports/               # Reporting and moderation
├── maintenance-mode/      # Service status controls
└── main.ts                # Application entry point
```

## Getting Started

### Prerequisites

- **Node.js 18+** (matches the engines expected by `backend/`)
- **npm** (or yarn / pnpm) — examples below use `npm`
- **PostgreSQL 13+** — required for the primary data store
- **Redis (optional)** — recommended for caching and rate limiting

### Install

```bash
# From the repository root
make install-backend       # preferred — uses the monorepo Makefile
# — or —
cd backend && npm install
```

### Environment Variables (`.env` Contract)

All runtime configuration is read from environment variables. The values
are surfaced via `backend/config/app.config.ts` and
`backend/config/database.config.ts`.

Create a `.env` file in the `backend/` directory before starting the
server:

```env
# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
API_VERSION=v1
```

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=stellarshunt
DATABASE_SYNC=true
DATABASE_LOAD=true

# Auth (required in production)
JWT_SECRET=replace-with-a-long-random-string
```

#### Variable Reference

| Variable           | Required | Default                  | Source                       | Purpose                                                        |
|--------------------|----------|--------------------------|------------------------------|----------------------------------------------------------------|
| `PORT`             | No       | `3001` (this repo's convention) | runtime / shell flag     | TCP port the HTTP server binds to. The sample `.env` above sets it to 3001. |
| `NODE_ENV`         | No       | `development`            | `backend/src/main.ts`        | Toggle between dev / test / prod behaviour.                     |
| `FRONTEND_URL`     | No       | `http://localhost:3000`  | `config/app.config.ts`       | Origin allowed by CORS (`origin` field).                       |
| `API_VERSION`      | No       | _unset_                  | `config/app.config.ts`       | API versioning prefix used by the NestJS setup.                |
| `DATABASE_HOST`    | Yes (DB) | `localhost`              | `config/database.config.ts`  | PostgreSQL host.                                               |
| `DATABASE_PORT`    | No       | `5432`                   | `config/database.config.ts`  | PostgreSQL TCP port.                                           |
| `DATABASE_USER`    | Yes (DB) | _unset_                  | `config/database.config.ts`  | PostgreSQL username.                                           |
| `DATABASE_PASSWORD`| Yes (DB) | _unset_                  | `config/database.config.ts`  | PostgreSQL password.                                           |
| `DATABASE_NAME`    | Yes (DB) | _unset_                  | `config/database.config.ts`  | PostgreSQL database name (default: `stellarshunt`).            |
| `DATABASE_SYNC`    | No       | `false`                  | `config/database.config.ts`  | Set `true` in dev to auto-sync TypeORM entities (never in prod).|
| `DATABASE_LOAD`    | No       | `false`                  | `config/database.config.ts`  | Set `true` to auto-load entities on boot.                      |
| `JWT_SECRET`       | Yes (prod)| _unset_                 | `src/auth/*`                 | HMAC secret for signing JWT access tokens.                     |
| `STARKNET_MODE`    | No       | _unset_                  | `src/*`                      | `mainnet` / `sepolia` / `devnet` switch for on-chain calls.    |

> The `.env` file is `.gitignore`d — never commit secrets to git.

### Scripts

| Script               | Command                    | Purpose                                              |
|----------------------|----------------------------|------------------------------------------------------|
| `npm run start`      | `nest start`               | Start the backend once.                              |
| `npm run start:dev`  | `nest start --watch`       | Start with hot-reload on file changes. (default dev) |
| `npm run start:debug`| `nest start --debug --watch` | Start with `--inspect` for the Node debugger.       |
| `npm run start:prod` | `node dist/main`           | Run the compiled output (after `npm run build`).     |
| `npm run build`      | `nest build`               | Compile TypeScript to `dist/`.                       |
| `npm run lint`       | `eslint ... --fix`         | Lint (`src/`, `apps/`, `libs/`, `test/`) and autofix.|
| `npm run format`     | `prettier --write ...`     | Format with Prettier.                                |
| `npm test`           | `jest`                     | Run the unit tests.                                  |
| `npm run test:watch` | `jest --watch`             | Re-run unit tests on file change.                    |
| `npm run test:cov`   | `jest --coverage`          | Unit tests with coverage report.                     |
| `npm run test:e2e`   | `jest --config ./test/jest-e2e.json` | Run the E2E test suite.                |

### Run Modes

The backend exposes three runtime modes so you can pick the right
trade-off between overhead and observability:

| Mode           | Command               | Use it when…                                                                            |
|----------------|-----------------------|-----------------------------------------------------------------------------------------|
| **Dev**        | `npm run start:dev`   | Iterating locally — file watcher recompiles on save, fast feedback loop.                |
| **Debug**      | `npm run start:debug` | Investigating a bug — Node Inspector is enabled, attach Chrome DevTools / VS Code.        |
| **Production** | `npm run start:prod`  | After `npm run build`. Runs the compiled `dist/main.js` with no watch / dev overhead.  |

> Want the full-stack experience? From the repo root run
> `make dev` to launch the backend **and** the Next.js frontend.

## Configuration Defaults

The defaults wired up in `config/` are sensible for local development,
but you should always override them in production:

- `FRONTEND_URL` must point at your deployed frontend (CORS origin).
- `JWT_SECRET` must be set to a long, random string in production.
- `DATABASE_SYNC` should be `false` outside of development — use
  TypeORM migrations for schema management instead.

## Development

```bash
# Start with hot-reload (uses the run mode above)
npm run start:dev

# Production build + run
npm run build
npm run start:prod
```

The server runs at `http://localhost:3001` (note: not the NestJS
default — ensure your frontend's `FRONTEND_URL` matches `3001` if you
override it).

## API Documentation

Swagger documentation is available at `http://localhost:3001/api/docs`
when the server is running. It provides interactive exploration of all
endpoints, request schemas, and authentication requirements.

## Testing

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

## Code Quality

```bash
# Lint
npm run lint

# Format
npm run format
```

## CORS Configuration

The backend is configured to accept requests from
`http://localhost:3000` (frontend dev server) with credentials enabled.
For production, update `FRONTEND_URL` in your environment configuration.

## Modules

- **Auth** — JWT-based authentication, OAuth account linking (GitHub,
  Twitter, Discord).
- **Content** — Educational articles and video management.
- **Puzzle Category** — Multi-tier puzzle organization with
  difficulty levels.
- **Rewards** — NFT, badge, and XP reward distribution with claim
  tracking.
- **Progress** — User progression, XP calculation, and level
  advancement.
- **Leaderboard** — Global and friend-based ranking systems.
- **Referrals** — Invite tracking with tiered reward bonuses.
- **Analytics** — Event logging and usage statistics.
- **Notifications** — In-app notification delivery.
- **NFT Claim** — StarkNet smart contract interaction for on-chain
  minting.
- **User Report Card** — Per-user performance summaries.
- **Multiplayer Queue** — Socket.IO-based matchmaking.

## Related Resources

- [Root project README](../README.md)
- [Frontend README](../frontend/README.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
