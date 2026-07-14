# Contributing to StellarHunts

Thank you for your interest in contributing to StellarHunts. This document outlines the development workflow, coding standards, and pull request process for this monorepo.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Harassment, discriminatory language, and personal attacks are not tolerated.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- PostgreSQL 13+
- Rust toolchain (stable) + Soroban / Stellar CLI 22.x

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/UnityChainx/StellarHunts.git
cd StellarHunts

# Install frontend dependencies
cd frontend && npm install

# Install backend dependencies
cd ../backend && npm install

# Configure environment (backend)
# See backend/README.md for the required environment variables

# Start backend
npm run start:dev     # API at http://localhost:3001

# In a separate terminal, start frontend
cd frontend
npm run dev           # UI at http://localhost:3000
```

## Branching Strategy

- **`main`** — Stable, production-ready code. All commits must pass CI.
- **Feature branches** — Create from `main` using the naming convention below.
- **Bug fixes** — Prefix with `fix/` (e.g., `fix/puzzle-timer-overflow`).
- **Features** — Prefix with `feat/` (e.g., `feat/daily-challenge`).
- **Refactoring** — Prefix with `refactor/` (e.g., `refactor/leaderboard-query`).
- **Documentation** — Prefix with `docs/` (e.g., `docs/api-endpoints`).

```bash
git checkout -b feat/your-feature-name
```

## Commit Messages

Use clear, descriptive commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]
```

### Types

| Type | Usage |
|------|-------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `style` | Formatting, missing semicolons, etc. |
| `docs` | Documentation only changes |
| `test` | Adding or updating tests |
| `chore` | Build process, tooling, or dependency changes |
| `ci` | CI configuration and scripts |

### Examples

```
feat(puzzles): add difficulty-based scoring multiplier

fix(auth): handle expired tokens in middleware

docs(api): document rewards claim endpoint
```

## Code Style

### Frontend (Next.js / React)

- **Linting**: Run `npm run lint` in the `frontend/` directory (ESLint with `eslint-config-next`)
- **Components**: Use functional components with hooks. Prefer composition over inheritance.
- **Styling**: Use Tailwind CSS utility classes. Avoid inline styles where possible.
- **State**: Use Zustand for global state, React state/hooks for local state.
- **Imports**: Order imports by: 1) external libraries, 2) internal components, 3) styles

### Backend (NestJS / TypeScript)

- **Linting**: Run `npm run lint` in the `backend/` directory (ESLint + TypeScript)
- **Formatting**: Run `npm run format` (Prettier) before committing
- **Modules**: Follow NestJS modular architecture — each feature gets its own module with `controller`, `service`, and `entity` files
- **DTOs**: Validate all inputs using `class-validator` decorators
- **API docs**: Use Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`) for all endpoints

### Onchain (Soroban / Rust)

- **Formatting**: Run `cargo fmt --all -- --check` in the `onchain/` directory
- **Contracts**: Follow the established patterns in `contracts/`
- **Storage**: Use the `#[contracttype]` enum pattern for storage keys
- **Errors**: Use a `#[contracterror]` enum with stable error codes (do not use `panic!("string")`)
- **Authorization**: Use `require_auth()` on top-level callers; rely on `env.invoker()` to gate cross-contract calls
- **Testing**: Write `#[test]` cases for all contract methods using `Env::default()` and `env.mock_all_auths()`

## Testing

All changes should include appropriate tests. Run the relevant test suite before submitting a PR.

### Backend Tests

```bash
# Unit tests
cd backend && npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

### Frontend Tests

Currently, the frontend does not have a dedicated test suite configured. Ensure any UI changes are manually verified in the browser before submitting a pull request.

### Onchain Tests

```bash
cd onchain && cargo test --workspace

# Format check
cargo fmt --all -- --check
```

### CI Pipeline

The CI workflow (`.github/workflows/build.yml`) runs automatically on push to `main` and on pull requests:
- **Format**: `cargo fmt --all -- --check`
- **Build**: `cargo build --workspace --release`
- **Test**: `cargo test --workspace`

All checks must pass before a pull request can be merged.

## Pull Request Process

1. **Create a feature branch** from `main` using the naming convention above
2. **Make your changes** following the code style and testing guidelines
3. **Run linting and tests** locally to verify nothing is broken
4. **Push your branch** to the remote repository
5. **Open a pull request** against `main` with a clear title and description
6. **Respond to review feedback** — address all comments before the PR can be approved
7. **Merge** — once approved, use squash merge or rebase merge to maintain a clean history

### PR Checklist

Before submitting, confirm:

- [ ] Code follows the project's style guidelines
- [ ] Linting passes without errors
- [ ] New and existing tests pass
- [ ] Added tests for new functionality
- [ ] Documentation is updated (README, API docs, etc.)
- [ ] Commit messages follow Conventional Commits
- [ ] Branch is up to date with `main` (rebased if needed)

A PR template is available at `.github/PULL_REQUEST_TEMPLATE.md` and will auto-populate when you open a new pull request.

## Smart Contract Contributions

For contributions to the `onchain/` directory:

- Contract changes must include corresponding tests
- Run `cargo build --workspace --release` before committing to ensure compilation succeeds
- Be mindful of contract size and gas (resource) costs
- Document any state changes or new storage variables
- Follow the existing access-control patterns (`require_auth`, env-level admin, `env.invoker()` checks for cross-contract calls)

## Questions?

If you have questions about the contribution process, open a discussion or issue in the repository. For urgent matters, contact the development team directly.
