# StellarHunt

A gamified blockchain application built on StarkNet that combines educational puzzles with NFT rewards. Players solve cryptographic riddles and blockchain-related challenges to earn unique NFTs while learning about web3 technologies.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | NestJS, TypeORM, PostgreSQL |
| Smart Contracts | Cairo, StarkNet, OpenZeppelin |
| State Management | Zustand, Redux Toolkit |
| Auth | NextAuth.js, Passport (JWT) |
| Real-time | Socket.IO, Redis |

## Architecture

This monorepo contains three primary components:

- **`frontend/`** — Next.js application with server-side rendering, responsive UI components, and StarkNet wallet integration
- **`backend/`** — NestJS API server handling authentication, puzzle management, rewards, leaderboards, and user progression
- **`onchain/`** — Cairo smart contracts deployed on StarkNet for NFT minting, level badges, and scavenger hunt logic

## Features

- **Puzzle-based gameplay** — Cryptographic riddles and challenges that test blockchain knowledge across multiple difficulty tiers
- **NFT reward system** — Earn unique NFTs as achievement badges, with ERC-1155 contracts managing minting and ownership
- **Progressive difficulty** — Puzzles organized into categories (Blockchain Basics, Smart Contracts, StarkNet, NFTs, DeFi) with increasing complexity
- **Global leaderboard** — Competitive ranking system with XP tracking and milestone achievements
- **Referral program** — Invite friends to earn bonus XP, rare NFTs, and exclusive badges
- **Wallet integration** — Connect any StarkNet-compatible wallet to participate, claim rewards, and track on-chain assets
- **Multiplayer support** — Queue-based matchmaking for collaborative puzzle-solving sessions

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- StarkNet wallet (e.g., Argent X, Braavos)

### Installation

```bash
# Clone the repository
git clone https://github.com/UnityChainx/StellarHunt.git
cd StellarHunt

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
DATABASE_NAME=stellarshunt
DATABASE_SYNC=true
NODE_ENV=development
```

### Development

```bash
# Start the backend (API server on port 3001)
cd backend && npm run start:dev

# Start the frontend (dev server on port 3000)
cd frontend && npm run dev
```

## Project Structure

```
StellarHunt/
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
└── onchain/                 # StarkNet smart contracts (Cairo)
    ├── src/contracts/       # Contract implementations
    └── tests/               # Contract tests
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
