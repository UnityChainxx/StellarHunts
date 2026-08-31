# StellarHunts Architecture

## System Overview

StellarHunts is a three-tier gamified blockchain application. The system consists of a Next.js frontend, a NestJS API backend, and Soroban smart contracts deployed on the Stellar network. Players solve cryptographic puzzles through the web interface, with progress tracked server-side and NFT rewards minted on-chain.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Next.js Frontend (Port 3000)             │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────────┐   │   │
│  │  │ App     │  │ Zustand  │  │ TanStack Query     │   │   │
│  │  │ Router  │  │ (State)  │  │ (Server State)     │   │   │
│  │  └─────────┘  └──────────┘  └────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────────┐ │   │
│  │  │ Freighter Wallet (via @stellar/freighter-api)    │ │   │
│  │  └──────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP / WebSocket
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 NestJS Backend (Port 3001)                   │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ Auth       │  │ Puzzle     │  │ Rewards / NFT Claim  │  │
│  │ Module     │  │ Modules    │  │ (StellarHandlerSvc)  │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ Progress   │  │ Multiplayer│  │ In-App Notifications │  │
│  │ Module     │  │ (Socket)   │  │ Module               │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
│                        │                                    │
│            ┌───────────┴───────────┐                        │
│            ▼                       ▼                        │
│     ┌──────────┐           ┌──────────┐                    │
│     │PostgreSQL│           │  Redis   │                    │
│     └──────────┘           └──────────┘                    │
└─────────────────────────────────────────────────────────────┘
                        │ Soroban RPC
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Stellar / Soroban Network                  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  StellarHunts        │  │  StellarHunts NFT            │ │
│  │  - Question Lifecycle│  │  - Level Badges              │ │
│  │  - SHA256 Validation │  │  - Role-gated Minting        │ │
│  │  - Level Progression │  │  - Badge Ownership Track     │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
StellarHunts/
│
├── frontend/                    Next.js 14 application
├── backend/                     NestJS API server
└── onchain/                     Soroban smart contracts (Rust)
```

## Frontend Architecture

### Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | Next.js 14 (App Router) | Server-side rendering, file-based routing |
| UI | React 18 + Tailwind CSS | Component rendering, utility-first styling |
| State (Global) | Zustand | Game state, user session, progress tracking |
| State (Server) | TanStack Query | API caching, optimistic updates |
| Auth | NextAuth.js | OAuth, wallet linking, JWT sessions |
| Blockchain | `@stellar/stellar-sdk` + `@stellar/freighter-api` | Wallet connection, contract invocation |
| HTTP | Axios | API client with interceptors |
| UI Components | Radix UI + shadcn/ui | Accessible primitives, design system |

### Routes

```
/                                   Homepage
/game                               Puzzle game interface
/puzzles/roadmap                    Puzzle progression timeline
/invite-friends                     Referral program
/ref/[referralId]                   Referral landing page
/admin/puzzle-review                Admin puzzle management
/admin/puzzle-submission            Admin puzzle creation
/api/auth/[...nextauth]             Auth API routes
/api/referrals/*                    Referral API routes
```

### State Management

Application state is split across two concerns:

**Zustand** — Persisted to localStorage for game-specific state:
- User authentication status
- Current puzzle difficulty and progress
- Completed puzzles and difficulty levels
- Score tracking and NFT collection

> `@reduxjs/toolkit` is listed as a dependency but is not currently wired up.
> See [ADR-0002](adr/0002-zustand-alongside-redux-toolkit.md) for the rationale.

**TanStack Query** — Server state caching for:
- Puzzle content
- Referral statistics
- API-driven data with automatic invalidation

### Data Flow (Game Loop)

```
1. User connects Stellar wallet via Freighter
2. NextAuth.js creates session (JWT)
3. Frontend loads puzzles via API (TanStack Query)
4. User submits answers → API validates → Score updated
5. On level completion → Backend triggers on-chain Soroban NFT mint
6. Zustand store persists updated progress locally
```

## Backend Architecture

### Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | NestJS | Modular Node.js server |
| Language | TypeScript | Type safety |
| Database ORM | TypeORM | Entity management, migrations |
| Database | PostgreSQL | Primary data store |
| Cache | Redis (ioredis) | Session caching, rate limiting |
| Auth | Passport (JWT) | Authentication guards |
| Real-time | Socket.IO | Multiplayer matchmaking |
| API Docs | Swagger / OpenAPI | Endpoint documentation |
| Testing | Jest + Supertest | Unit and E2E tests |
| Validation | class-validator | DTO input validation |

### Module Architecture

NestJS modules are organized by domain concern. Each module encapsulates its controller, service, entities, DTOs, and tests.

The table below lists modules that are **actually registered** in `app.module.ts`. Modules present in `backend/src/` but not yet wired into AppModule are noted separately.

**Core / Infrastructure**
- `ConfigModule` — Environment configuration loading
- `TypeOrmModule` — Database connection and entity registration
- `AnalyticsModule` — Event tracking and usage metrics

**Authentication & Users**
- `AuthModule` — JWT authentication, registration, login, wallet linking
- `UserReportCardModule` — Per-user performance summaries
- `UserActivityLogModule` — Audit trail for user actions
- `UserRankingModule` — Ranking calculations
- `UserInventoryModule` — NFT and badge ownership tracking

**Puzzle & Content**
- `PuzzleModule` — Core puzzle CRUD and game logic
- `PuzzleSubmissionModule` — Answer submission handling
- `PuzzleDependencyModule` — Prerequisite puzzle management
- `PuzzleTranslationModule` — Multi-language support
- `ContentModule` — Educational articles and resources
- `ContentRatingModule` — User content ratings

**Gamification & Rewards**
- `RewardsModule` — Reward distribution and claim tracking
- `RewardShopModule` — Reward marketplace
- `NFTClaimModule` — On-chain Soroban NFT minting orchestration (StellarHandlerService)
- `TimeTrialModule` — Timed challenge mode

**Social & Multiplayer**
- `MultiplayerQueueModule` — Socket.IO matchmaking
- `ReportsModule` — User reporting and moderation
- `InAppNotificationsModule` — Notification delivery
- `ActivityModule` — Social activity feed
- `UserReactionModule` — Emoji/like reactions

**Progress & Integrations**
- `ProgressModule` — User progression tracking
- `ApiKeyModule` — API key management for integrations

**Modules present in `backend/src/` but not yet registered in AppModule**

The following directories exist and may be under active development:
`AuditLogModule`, `BadgeModule`, `DailyRewardModule`, `FeedbackModule`,
`GeostatsModule`, `HintModule`, `MaintenanceModeModule`, `MigrationModule`,
`MilestoneModule`, `NFTMarketplaceStubModule`, `PromoCodeModule`,
`PuzzleAccessLogModule`, `PuzzleCategoryModule`, `PuzzleCommentModule`,
`PuzzleDraftModule`, `PuzzleForkModule`, `PuzzleReviewModule`,
`PuzzleTestCaseModule`, `PuzzleVersioningModule`, `QuizModule`,
`ReferralModule`, `SessionModule`, `StreakModule`,
`TokenVerificationModule`, `UserModule`, `UserSettingsModule`,
`UserTokenHistoryModule`, `WalletModule`, `AdminModule`.

> There is **no** `LeaderboardModule` in the source tree. The leaderboard
> endpoint lives inside `StreakModule` (`GET /streaks/leaderboard`).

### Database

Primary database: **PostgreSQL** managed through TypeORM with code-first entity definitions.

Key entities: `User`, `Puzzle`, `Category`, `Reward`, `RewardClaim`, `TimeTrial`, `Progress`.

Configuration via environment variables:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=stellarshunts
DATABASE_SYNC=true       # Auto-sync entities (dev only)
DATABASE_LOAD=true       # Auto-load entities
```

### API Design

- **RESTful** endpoints organized by resource (no global prefix — e.g., `/puzzle-categories`, `/rewards`, `/auth`)
- **Authentication** via JWT tokens (Bearer header)
- **Swagger** documentation at `http://localhost:3001/api/docs`
- **Rate limiting** applied to auth and claim endpoints
- **WebSocket** connections for multiplayer queue via Socket.IO

See [`docs/api.md`](api.md) for the full endpoint reference table.

## Onchain Architecture

### Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | Rust (soroban-sdk 22.x) | Smart contract development |
| Framework | Soroban | Stellar smart contract runtime |
| Build | Cargo workspace | Multi-crate workspace |
| Testing | `cargo test` | Native Rust unit tests |
| CLI | Stellar CLI | Deploy / invoke helpers |

### Contracts

**StellarHunts** (`stellar_hunts/src/lib.rs`)
The core game contract managing:
- Question lifecycle (add, get, update)
- Answer submission with SHA256-hashed validation
- Player level progression (Easy → Medium → Hard → Master)
- Hint requests per question
- Level completion tracking and NFT minting triggers
- NFT contract address configuration (admin)

Key state:
```rust
struct Question {
    question_id: u64,
    question: Bytes,
    hashed_answer: BytesN<32>,
    level: Levels,
    hint: Bytes,
}

struct PlayerProgress {
    address: Address,
    current_level: Levels,
    is_initialized: bool,
}

struct LevelProgress {
    player: Address,
    level: Levels,
    last_question_index: u8,
    is_completed: bool,
    attempts: u32,
    nft_minted: bool,
}
```

**StellarHunts NFT** (`stellar_hunts_nft/src/lib.rs`)
Per-level badge ownership contract:
- Four level variants mapped to token positions (Easy, Medium, Hard, Master)
- Admin + minter registry (default minter = the StellarHunts game contract)
- Badge ownership query via `has_level_badge`
- Mint authorization enforced cross-contract via `env.invoker()` check

**Mock Receiver** (`stellar_hunts_receiver/src/lib.rs`)
Test helper for integration tests.

### Utility Functions

- **answer hashing** — Soroban `env.crypto().sha256(&Bytes)` returns `BytesN<32>` for on-chain answer verification without storing plaintext answers.

### Data Flow (Minting)

```
1. Player submits correct answer → StellarHunts.submit_answer()
2. Contract validates SHA256 hash, updates LevelProgress
3. If level complete → cross-contract call to StellarHuntsNFT.mint_level_badge()
4. NFT contract verifies env.invoker() == registered minter, mints badge
5. Player receives a per-level badge entry in NFT contract storage
```

## Authentication Flow

```
┌──────────┐         ┌──────────┐        ┌──────────┐
│  Browser │         │  NextAuth │        │  NestJS  │
└────┬─────┘         └─────┬────┘        └────┬─────┘
     │                     │                   │
     │  1. Connect Wallet  │                   │
     │────────────────────►│                   │
     │                     │  2. Verify JWT    │
     │                     │──────────────────►│
     │                     │                   │
     │                     │  3. Session Token │
     │                     │◄──────────────────│
     │  4. Session Cookie  │                   │
     │◄────────────────────│                   │
     │                     │                   │
     │  5. API Request (+JWT)                  │
     │────────────────────────────────────────►│
     │                     │                   │
     │  6. Response        │                   │
     │◄────────────────────────────────────────│
```

## Security Considerations

- **Answer Privacy** — Puzzle answers are SHA256-hashed on-chain; plaintext never stored
- **JWT Authentication** — All API routes (except auth endpoints) require valid JWT
- **Rate Limiting** — Configurable throttling on auth, claim, and submission endpoints
- **Duplicate Prevention** — Badge storage is keyed per `(Address, Levels)` preventing double-mint
- **Role-Gated Minting** — NFT contract verifies `env.invoker()` is in its minter registry before minting
- **Input Validation** — All API inputs validated via class-validator decorators

## Development Workflow

```bash
# Start full stack locally
cd backend && npm run start:dev    # API → localhost:3001
cd frontend && npm run dev         # UI  → localhost:3000

# Test onchain contracts
cd onchain && cargo test --workspace

# Run backend tests
cd backend && npm test

# API documentation
# Open http://localhost:3001/api/docs after starting backend
```
