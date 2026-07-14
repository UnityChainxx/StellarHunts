# StellarHunts

A gamified blockchain application built on **Stellar / Soroban** that combines educational puzzles with NFT rewards. Players solve cryptographic riddles and blockchain-related challenges to earn unique on-chain NFTs while learning about web3 technologies.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | NestJS, TypeORM, PostgreSQL |
| Smart Contracts | Rust, Soroban SDK, Stellar |
| Wallet | Freighter (`@stellar/freighter-api`), `@stellar/stellar-sdk` |
| State Management | Zustand, Redux Toolkit |
| Auth | NextAuth.js, Passport (JWT) |
| Real-time | Socket.IO, Redis |

## Architecture

This monorepo contains three primary components:

- **`frontend/`** — Next.js application with server-side rendering, responsive UI components, and Freighter wallet integration
- **`backend/`** — NestJS API server handling authentication, puzzle management, rewards, leaderboards, and user progression
- **`onchain/`** — Soroban smart contracts deployed on the Stellar network for NFT badge minting, level progression, and game logic

## Features

- **Puzzle-based gameplay** — Cryptographic riddles that test blockchain knowledge across multiple difficulty tiers
- **On-chain NFT reward system** — Earn unique NFTs as achievement badges via Soroban smart contracts
- **Progressive difficulty** — Puzzles organized into categories (Blockchain Basics, Smart Contracts, Soroban, NFTs, DeFi) with increasing complexity
- **Global leaderboard** — Competitive ranking system with XP tracking and milestone achievements
- **Referral program** — Invite friends to earn bonus XP, rare NFTs, and exclusive badges
- **Wallet integration** — Connect any Stellar-compatible wallet (Freighter, Lobstr, Albedo) to participate, claim rewards, and track on-chain assets
- **Multiplayer support** — Queue-based matchmaking for collaborative puzzle-solving sessions

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Rust + Soroban / Stellar CLI
- A Stellar wallet (Freighter recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/UnityChainx/StellarHunts.git
cd StellarHunts

# Install frontend dependencies
cd frontend && npm install

# Install backend dependencies
cd ../backend && npm install
```

### Configuration

Create a `.env` file in the `backend/` directory with the following variables:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=stellarshunts
DATABASE_SYNC=true
NODE_ENV=development

# Stellar / Soroban
STELLAR_MODE=mock
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HUNTS_CONTRACT_ID=...
STELLAR_HUNTS_NFT_CONTRACT_ID=...
```

### Development

```bash
# Start the backend (API server on port 3001)
cd backend && npm run start:dev

# Start the frontend (dev server on port 3000)
cd frontend && npm run dev

# Build & test onchain contracts
cd onchain && cargo test --workspace
```

## Project Structure

```
StellarHunts/
├── frontend/                # Next.js web application
│   ├── app/                 # App router pages and layouts
│   ├── components/          # Reusable UI components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities and configuration
│   ├── services/            # API service layer
│   └── store/               # State management (Zustand)
├── backend/                 # NestJS API server
│   ├── src/                 # Source code
│   │   ├── auth/            # Authentication and authorization
│   │   ├── content/         # Educational content management
│   │   ├── puzzle-category/ # Puzzle categorization and management
│   │   ├── rewards/         # NFT and token reward distribution
│   │   ├── progress/        # User progress tracking
│   │   ├── leaderboard/     # Competitive ranking system
│   │   ├── referrals/       # Referral program logic
│   │   ├── sessions/        # Session management
│   │   └── analytics/       # Event tracking and metrics
│   └── test/                # E2E tests
└── onchain/                 # Soroban smart contracts (Rust)
    ├── contracts/
    │   ├── stellar_hunts/         # Game contract (Rust)
    │   ├── stellar_hunts_nft/     # NFT badge contract (Rust)
    │   └── stellar_hunts_receiver/# Test helper
    └── Cargo.toml            # Workspace manifest
```

## Contributing

1. Fork the repository and create a feature branch from `main`
2. Make your changes following the existing code conventions
3. Ensure tests pass and linting is clean
4. Submit a pull request with a clear description of the changes

All contributions are reviewed for code quality, test coverage, and alignment with project goals.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Support

For questions, bug reports, or feature requests, please open an issue on GitHub or contact the development team.
