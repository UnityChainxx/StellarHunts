# StellarHunts — Frontend

The frontend for StellarHunts, a gamified blockchain application built on **Stellar / Soroban**. This is a [Next.js](https://nextjs.org/) project that provides the user-facing interface for puzzle-solving, NFT rewards, leaderboards, and wallet interactions.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 14 | React framework with App Router and SSR |
| React 18 | UI component library |
| Tailwind CSS | Utility-first styling |
| Zustand | Global state management |
| TanStack Query | Server state and caching |
| `@stellar/freighter-api` | Freighter browser-extension wallet integration |
| `@stellar/stellar-sdk` | Stellar / Soroban transaction building |
| NextAuth.js | Authentication (OAuth, wallet linking) |
| Axios | HTTP client |
| Lucide React | Icon library |

## Features

- **Puzzle interface** — Interactive cryptographic riddles with difficulty tiers (Beginner, Intermediate, Advanced, Expert)
- **Wallet connectivity** — Stellar wallet pairing via Freighter for on-chain interactions
- **NFT showcase** — Minted rewards display with metadata and rarity indicators
- **Leaderboard** — Global rankings with XP progression and achievement tracking
- **Referral system** — Shareable invite links with multi-tier reward bonuses
- **Responsive design** — Fully responsive layout with glassmorphism UI and animated backgrounds
- **Puzzle roadmap** — Timeline-based progression view showing unlocked and upcoming challenges

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- The [Freighter](https://www.freighter.app/) browser extension installed in your browser

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The page auto-updates as you edit files.

### Build

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

## Project Structure

```
frontend/
├── app/                    # Next.js App Router pages and layouts
│   ├── layout.js           # Root layout with metadata and providers
│   ├── page.js             # Homepage
│   ├── invite-friends/     # Referral invitation page
│   ├── ref/[referralId]/   # Referral landing page
│   └── globals.css         # Global styles and CSS custom properties
├── components/             # Reusable React components
│   ├── navbar.jsx          # Navigation bar
│   ├── footer.jsx          # Site footer
│   ├── puzzle/             # Puzzle-related components
│   ├── home/               # Homepage sections
│   └── ui/                 # ShadCN UI primitives
├── hooks/                  # Custom React hooks
│   ├── useReferral.js      # Referral program logic
│   └── usePuzzleReviews.js # Puzzle review data
├── lib/                    # Utilities and configuration
│   ├── data.js             # Terms of service content
│   ├── utils.js            # Helper functions
│   └── authOptions.ts      # NextAuth configuration
├── services/               # API service layer
├── store/                  # Zustand state stores
└── public/                 # Static assets (images, icons, fonts)
```

## Key Dependencies

- **State Management**: Zustand (global), Redux Toolkit (legacy)
- **Forms**: Formik with Yup validation
- **UI Components**: Radix UI primitives, class-variance-authority, tailwind-merge
- **Date Handling**: date-fns
- **Blockchain**: `@stellar/stellar-sdk`, `@stellar/freighter-api`

## Related Resources

- [Root project README](../README.md)
- [Backend README](../backend/README.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Freighter Wallet](https://www.freighter.app/)
