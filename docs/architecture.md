# StellarHunt Architecture

## System Overview

StellarHunt is a three-tier gamified blockchain application. The system consists of a Next.js frontend, a NestJS API backend, and Cairo smart contracts deployed on StarkNet. Players solve cryptographic puzzles through the web interface, with progress tracked server-side and NFT rewards minted on-chain.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Next.js Frontend (Port 3000)             │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────────┐   │   │
│  │  │ App     │  │ Zustand  │  │ TanStack Query     │   │   │
│  │  │ Router  │  │ (State)  │  │ (Server State)     │   │   │
│  │  └─────────┘  └──────────┘  └────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP / WebSocket
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 NestJS Backend (Port 3001)                   │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ Auth       │  │ Puzzle     │  │ Rewards / NFT Claim  │  │
│  │ Module     │  │ Modules    │  │ Modules              │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ Progress   │  │ Leaderboard│  │ Multiplayer (Socket) │  │
│  │ Module     │  │ Module     │  │ Module               │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
│                        │                                    │
│            ┌───────────┴───────────┐                        │
│            ▼                       ▼                        │
│     ┌──────────┐           ┌──────────┐                    │
│     │PostgreSQL│           │  Redis   │                    │
│     └──────────┘           └──────────┘                    │
└─────────────────────────────────────────────────────────────┘
                        │ StarkNet RPC
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   StarkNet (L2)                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  ScavengerHunt       │  │  ScavengerHuntNFT           │ │
│  │  - Questions/Levels  │  │  - ERC-1155 Badges          │ │
│  │  - Answer Validation │  │  - Level-Based Minting      │ │
│  │  - Progress Tracking │  │  - Metadata Management      │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
StellarHunt/
│
├── frontend/                    Next.js 14 application
├── backend/                     NestJS API server
└── onchain/                     Cairo smart contracts
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
| Forms | Formik + Yup | Form state management and validation |
| Blockchain | starknet.js + get-starknet | Wallet connection, contract interaction |
| HTTP | Axios | API client with interceptors |
| UI Components | Radix UI + shadcn/ui | Accessible primitives, design system |

### Routes

```
/                                   Homepage
/game                               Puzzle game interface
/leaderboard                        Global rankings
/puzzles/roadmap                    Puzzle progression timeline
/invite-friends                     Referral program
/ref/[referralId]                   Referral landing page
/admin/puzzle-review                Admin puzzle management
/admin/puzzle-submission            Admin puzzle creation
/faq                                Frequently asked questions
/terms                              Terms of service
/privacy                            Privacy policy
/about                              About page
/profile                            User profile
/api/auth/[...nextauth]             Auth API routes
/api/referrals/*                    Referral API routes
```

### State Management

Application state is split across two concerns:

**Zustand (useGameStore)** — Persisted to localStorage for game-specific state:
- User authentication status
- Current puzzle difficulty and progress
- Completed puzzles and difficulty levels
- Score tracking and NFT collection

**TanStack Query** — Server state caching for:
- Leaderboard data
- Puzzle content
- Referral statistics
- API-driven data with automatic invalidation

### Data Flow (Game Loop)

```
1. User connects StarkNet wallet via get-starknet
2. NextAuth.js creates session (JWT)
3. Frontend loads puzzles via API (TanStack Query)
4. User submits answers → API validates → Score updated
5. On level completion → API triggers on-chain NFT minting
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

**Core / Infrastructure**
- `ConfigModule` — Environment configuration loading
- `TypeOrmModule` — Database connection and entity registration
- `RateLimiterModule` — Request throttling with Redis-backed guards
- `AnalyticsModule` — Event tracking and usage metrics
- `MaintenanceModeModule` — Service availability control
- `MigrationModule` — Database migration orchestration
- `AuditLogModule` — System audit logging
- `TokenVerificationModule` — Token validation utilities

**Authentication & Users**
- `AuthModule` — JWT authentication, registration, login, wallet linking
- `UserModule` — User CRUD and profile management
- `UserSettingsModule` — User preferences
- `UserActivityLogModule` — Audit trail for user actions
- `UserReportCardModule` — Per-user performance summaries
- `UserInventoryModule` — NFT and badge ownership tracking
- `UserRankingModule` — Ranking calculations
- `WalletModule` — StarkNet wallet address management

**Puzzle & Content**
- `PuzzleModule` — Core puzzle CRUD and game logic
- `PuzzleCategoryModule` — Puzzle categorization and grouping
- `PuzzleSubmissionModule` — Answer submission handling
- `PuzzleDependencyModule` — Prerequisite puzzle management
- `PuzzleDraftModule` — Puzzle authoring workflow
- `PuzzleVersioningModule` — Puzzle revision history
- `PuzzleReviewModule` — Admin review workflow
- `PuzzleTranslationModule` — Multi-language support
- `PuzzleCommentModule` — User discussion on puzzles
- `PuzzleAccessLogModule` — Access tracking
- `PuzzleTestCaseModule` — Test case management
- `PuzzleForkModule` — Puzzle forking and remixing
- `ContentModule` — Educational articles and resources
- `ContentRatingModule` — User content ratings
- `QuizModule` — Quiz-style challenges

**Gamification & Rewards**
- `RewardsModule` — Reward distribution and claim tracking
- `RewardShopModule` — Reward marketplace
- `NFTClaimModule` — On-chain NFT minting orchestration
- `NFTMarketplaceStubModule` — Mock marketplace for testing
- `AchievementsModule` — Achievement definitions and tracking
- `BadgeModule` — Badge management
- `MilestoneModule` — Milestone progression
- `StreakModule` — Daily/consecutive activity tracking
- `DailyRewardModule` — Login bonus system
- `TimeTrialModule` — Timed challenge mode
- `PromoCodeModule` — Promotional code redemption

**Social & Multiplayer**
- `MultiplayerQueueModule` — Socket.IO matchmaking
- `ReferralModule` — Referral program tracking
- `ReportsModule` — User reporting and moderation
- `FeedbackModule` — User feedback collection
- `InAppNotificationsModule` — Notification delivery
- `ActivityModule` — Social activity feed
- `UserReactionModule` — Emoji/like reactions
- `GeostatsModule` — Geographic player statistics

**Progress & Analytics**
- `ProgressModule` — User progression tracking
- `SessionModule` — Session lifecycle
- `HintModule` — Puzzle hint management
- `ApiKeyModule` — API key management for integrations
- `AdminModule` — Admin dashboard backend

### Database

Primary database: **PostgreSQL** managed through TypeORM with code-first entity definitions.

Key entities: `User`, `Puzzle`, `Category`, `Reward`, `RewardClaim`, `TimeTrial`, `Session`, `Progress`, `Hint`, `Achievement`, `Badge`, `Streak`, `Referral`, `Notification`, `UserActivityLog`.

Configuration via environment variables:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=stellarshunt
DATABASE_SYNC=true       # Auto-sync entities (dev only)
DATABASE_LOAD=true        # Auto-load entities
```

### API Design

- **RESTful** endpoints organized by resource (no global prefix — e.g., `/puzzle-categories`, `/rewards`, `/auth`)
- **Authentication** via JWT tokens (Bearer header) or session cookies
- **Swagger** documentation at `http://localhost:3001/api/docs`
- **Rate limiting** applied to auth and claim endpoints
- **WebSocket** connections for multiplayer queue via Socket.IO

## Onchain Architecture

### Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | Cairo 2.8.4 | Smart contract development |
| Framework | StarkNet | L2 blockchain |
| Standards | OpenZeppelin (ERC-1155) | NFT implementation |
| Testing | StarkNet Foundry (snforge) | Contract testing |
| Build | Scarb | Package manager and build tool |

### Contracts

**ScavengerHunt** (`scavenger_hunt.cairo`)
The core game contract managing:
- Question lifecycle (add, get, update)
- Answer submission with Poseidon-hashed validation
- Player level progression (Easy → Medium → Hard → Master)
- Hint requests per question
- Level completion tracking and NFT minting triggers
- NFT contract address configuration

Key state:
```cairo
struct Question {
    question_id: u64,
    question: ByteArray,
    hashed_answer: felt252,
    level: Levels,
    hint: ByteArray,
}

struct PlayerProgress {
    address: ContractAddress,
    current_level: Levels,
    is_initialized: bool,
}

struct LevelProgress {
    player: ContractAddress,
    level: Levels,
    last_question_index: u8,
    is_completed: bool,
    attempts: u32,
    nft_minted: bool,
}
```

**ScavengerHuntNFT** (`scavenger_hunt_nft.cairo`)
ERC-1155 implementation for level-based badge NFTs:
- Four token IDs mapped to levels (1=Easy, 2=Medium, 3=Hard, 4=Master)
- Role-based access control for minting (only ScavengerHunt contract)
- Metadata URI management
- Level badge query functions

**Mock1155Receiver** (`mock_1155_receiver.cairo`)
Test helper contract implementing the ERC-1155 receiver interface for safe transfer validation.

### Interfaces

The `IScavengerHunt` interface defines the public API surface for the main contract, including question management, answer submission, player progress queries, and NFT claiming.

### Utility Functions

- **hash_byte_array()** — Deterministic Poseidon hashing of `ByteArray` inputs for on-chain answer verification without storing plaintext answers.

### Data Flow (Minting)

```
1. Player submits correct answer → ScavengerHunt.submit_answer()
2. Contract validates hash, updates LevelProgress
3. If level complete → ScavengerHuntNFT.mint_level_badge() called
4. Player receives ERC-1155 token with level-specific ID
5. NFT metadata reflects difficulty tier and completion stats
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

- **Answer Privacy** — Puzzle answers are Poseidon-hashed on-chain; plaintext never stored
- **JWT Authentication** — All API routes (except auth endpoints) require valid JWT
- **Rate Limiting** — Configurable throttling on auth, claim, and submission endpoints
- **Duplicate Prevention** — Unique constraints prevent double claims on rewards
- **Soft Deletes** — Entities use `isActive` flags rather than hard deletion
- **Role-Based Access** — Admin endpoints are guarded with role checks
- **Input Validation** — All API inputs validated via class-validator decorators

## Development Workflow

```bash
# Start full stack locally
cd backend && npm run start:dev    # API → localhost:3001
cd frontend && npm run dev         # UI  → localhost:3000

# Test onchain contracts
cd onchain && snforge test

# Run backend tests
cd backend && npm test

# API documentation
# Open http://localhost:3001/api/docs after starting backend
```
