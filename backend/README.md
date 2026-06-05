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

- Node.js 18+
- npm or yarn
- PostgreSQL 13+
- Redis (optional, for caching)

### Installation

```bash
cd backend
npm install
```

### Configuration

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=stellarshunt
DATABASE_SYNC=true
DATABASE_LOAD=true

# API
API_VERSION=v1
```

### Development

```bash
# Start with hot-reload
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The server runs at `http://localhost:3001` (non-default port — ensure your frontend's `FRONTEND_URL` matches).

## API Documentation

Swagger documentation is available at `http://localhost:3001/api/docs` when the server is running. It provides interactive exploration of all endpoints, request schemas, and authentication requirements.

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

The backend is configured to accept requests from `http://localhost:3000` (frontend dev server) with credentials enabled. For production, update `FRONTEND_URL` in your environment configuration.

## Modules

- **Auth** — JWT-based authentication, OAuth account linking (GitHub, Twitter, Discord)
- **Content** — Educational articles and video management
- **Puzzle Category** — Multi-tier puzzle organization with difficulty levels
- **Rewards** — NFT, badge, and XP reward distribution with claim tracking
- **Progress** — User progression, XP calculation, and level advancement
- **Leaderboard** — Global and friend-based ranking systems
- **Referrals** — Invite tracking with tiered reward bonuses
- **Analytics** — Event logging and usage statistics
- **Notifications** — In-app notification delivery
- **NFT Claim** — StarkNet smart contract interaction for on-chain minting
- **User Report Card** — Per-user performance summaries
- **Multiplayer Queue** — Socket.IO-based matchmaking

## Related Resources

- [Root project README](../README.md)
- [Frontend README](../frontend/README.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
