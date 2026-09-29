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

## Dependency Policy

This monorepo has **three npm workspaces** (root, `frontend/`, `backend/`) and
one Rust workspace (`onchain/`). Each workspace owns its own dependencies and
its own lockfile.

### Workspace ownership

| Workspace | `package.json` | Lockfile |
|-----------|---------------|----------|
| Root      | `package.json` | `package-lock.json` |
| Backend   | `backend/package.json` | `backend/package-lock.json` |
| Frontend  | `frontend/package.json` | `frontend/package-lock.json` |
| Onchain   | `onchain/Cargo.toml` (workspace) | `onchain/Cargo.lock` |

All four lockfiles are **committed and authoritative**. A PR that modifies a
`package.json` must include the regenerated lockfile for that workspace.

> **Known issue — self-referential root dependency:**
> The root `package.json` carries `"backend": "file:"` in its dependencies,
> a leftover from an earlier monorepo experiment. This entry is intentionally
> kept for backwards compatibility with existing tooling scripts that resolve
> the `backend` package by name; it does not affect `npm install` or CI.
> The root `package-lock.json` therefore shows a local-path entry for
> `backend` — this is expected and not a mistake.

### Adding a dependency

Always add dependencies to the specific workspace that uses them. Do **not**
add application dependencies to the root workspace.

```bash
# Add a production dependency to the backend
npm install --workspace backend <package>

# Add a dev dependency to the frontend
npm install --workspace frontend --save-dev <package>

# Add a dependency to the root (tooling only, e.g. Husky, commitlint)
npm install --save-dev <package>

# Add a Rust dependency to a specific onchain crate
# (edit onchain/contracts/<crate>/Cargo.toml, then run:)
cargo update --manifest-path onchain/Cargo.toml
```

After installing, verify the correct lockfile was updated:

```bash
# Confirm only the expected lockfile changed
git diff --name-only | grep package-lock
```

### Updating a dependency

```bash
# Update a single package in a workspace
npm update --workspace backend <package>

# Update all packages in a workspace (respects semver ranges)
npm update --workspace frontend

# Check for outdated packages
npm outdated --workspace backend
```

### Dependabot grouping

Dependabot opens weekly PRs against **four directories** (`/`, `/frontend`,
`/backend`, `onchain/`). Related packages are grouped to reduce PR noise:

| Group | Patterns | Workspace |
|-------|---------|-----------|
| `nestjs` | `@nestjs/*` | root |
| `react` | `react`, `react-dom`, `@types/react*` | root |
| `stellar` | `@stellar/*` | root |
| `soroban` | `soroban-*` | onchain (Cargo) |

When reviewing a Dependabot PR, check that:
1. Only the expected lockfile(s) changed.
2. No new `src/`-absolute imports were introduced.
3. `npm run build` and `npm test` pass in the affected workspace.
4. The advisory column in [SECURITY.md](SECURITY.md) is current (for security
   bumps).

### Reviewer checklist for dependency PRs

- [ ] Dependency is added to the correct workspace.
- [ ] The correct lockfile(s) are regenerated and committed.
- [ ] No version ranges are widened without justification.
- [ ] `npm run build` passes in the affected workspace.
- [ ] `npm test` passes in the affected workspace.
- [ ] Security advisories (if any) are noted in the PR description and in
      `SECURITY.md` if they cannot be resolved immediately.
- [ ] The self-referential `backend` root entry has not been removed — it is
      intentional (see note above).

---

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
  - Every DTO bound with `@Body()` (a request DTO) must decorate its required
    fields (`@IsString`, `@IsInt`, `@IsUUID`, …) so the global `ValidationPipe`
    (`whitelist: true`, `forbidNonWhitelisted: true`) can enforce types and
    reject unknown properties instead of silently stripping them (issue #529).
  - Response-only DTOs (shapes returned to clients, never bound as a request
    body) must start with the marker comment `// Response-only DTO` and carry
    no validation decorators by design.
  - `update-*` DTOs should extend their decorated `create-*` base via
    `PartialType` so the whitelisted properties are inherited.
- **API docs**: Use Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`) for all endpoints

### Onchain (Soroban / Rust)

- **Formatting**: Run `cargo fmt --all -- --check` in the `onchain/` directory
- **Contracts**: Follow the established patterns in `contracts/`
- **Storage**: Use the `#[contracttype]` enum pattern for storage keys
- **Errors**: Use a `#[contracterror]` enum with stable error codes (do not use `panic!("string")`)
- **Authorization**: Use `require_auth()` on top-level callers; rely on `env.invoker()` to gate cross-contract calls
- **Testing**: Write `#[test]` cases for all contract methods using `Env::default()` and `env.mock_all_auths()`

### Testing Strategies & Watch Mode Guide

All changes should include appropriate tests. Run the relevant test suite before submitting a PR.

#### Watch Mode & Path Filtering
When working on specific modules, run Jest in watch mode or filter by file path to speed up iteration:

```bash
# Filter backend tests by path pattern
cd backend && npm test -- --testPathPattern=auth

# Watch mode for a specific test file
cd backend && npm run test:watch -- src/auth/auth.service.spec.ts

# Filter frontend Vitest tests by filename
cd frontend && npm test -- puzzleReviewService
```

Tests live in `frontend/tests/` and use `.test.js` (or `.test.jsx`) extensions.

### Backend E2E Tests

The backend e2e specs live in `backend/test/` and run against a real PostgreSQL
instance (plus Redis). Jest config: `backend/test/jest-e2e.json`.

```bash
# Run the backend e2e suite (requires PostgreSQL + Redis)
cd backend && npm run test:e2e

# Or via the Makefile (from the repository root)
make test-backend-e2e

# Run a single e2e spec by name
cd backend && npm run test:e2e -- security-headers
```

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

### Running the full check suite

CI enforces more than the contract checks. The commands below reproduce every
workflow check locally; each is marked **required** (CI blocks the PR) or
**advisory** (CI reports it but does not block).

```bash
# Everything CI runs, in one command (from the repository root)
make ci

# Backend unit tests (required — .github/workflows/build.yml)
cd backend && npm test

# Backend e2e suite — backend/test/*.e2e-spec.ts, config backend/test/jest-e2e.json
# (required; the workflow provisions Postgres + Redis service containers first)
cd backend && npm run test:e2e
# same as: make test-backend-e2e

# Onchain contract checks (required — .github/workflows/build.yml)
cd onchain && cargo fmt --all -- --check
cd onchain && cargo build --workspace --release
cd onchain && cargo test --workspace

# Onchain dependency/supply-chain audit (required — .github/workflows/build.yml)
cd onchain && cargo deny --locked check advisories licenses bans sources

# npm dependency audit in frontend and backend (critical = required, high = advisory)
cd backend  && npm audit --audit-level=critical
cd frontend && npm audit --audit-level=high   # advisory; see SECURITY.md

# Secret scanning (advisory — .github/workflows/security.yml)
gitleaks git --redact --no-banner --exit-code=1 \
  --report-format sarif --report-path gitleaks.sarif
```

Security scanning jobs — **CodeQL** (JavaScript/TypeScript analysis),
**Gitleaks** (secret scanning) and **dependency review** — run from
`.github/workflows/security.yml` and cannot all be reproduced locally; CodeQL
needs the GitHub Actions runner. The local equivalents of what can be run are
the `npm audit` / `cargo deny` commands above. See [SECURITY.md](SECURITY.md)
for the current advisory-versus-required status of every security gate.

### One command before you open a PR

Before opening a pull request, run the full check suite locally with a
single command from the repository root:

```bash
make ci
```

The equivalent npm entry point is `npm run ci`. Both delegate to the same
per-workspace scripts (backend lint + tests, frontend lint + tests, onchain
format + tests, and both production builds), so running either one locally
is equivalent to what CI enforces. The root `npm test`, `npm run lint` and
`npm run build` scripts map to the corresponding `make test`, `make lint`
and `make build` targets if you only want part of the suite.

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
