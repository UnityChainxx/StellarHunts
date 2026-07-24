# StellarHunt — Monorepo Makefile
# --------------------------
# Use `make help` to list all targets.
# New contributors should be able to use these targets exclusively for
# day-to-day development. See CONTRIBUTING.md for full workflow details.

# ---------- Configuration ----------
# Allow overrides from the environment, e.g.:
#   make install NODE_VERSION=20
NODE_VERSION     ?= 18
FRONTEND_DIR     := frontend
BACKEND_DIR      := backend
ONCHAIN_DIR      := onchain

# Default shell (override with `SHELL=/bin/bash make ...` if needed)
SHELL            := /bin/bash

# ---------- Phony declaration ----------
# Every target in this Makefile is phony (it doesn't produce a file
# named after the target). Declaring them here keeps `make` fast and
# avoids accidental name collisions with files in the repo.
.PHONY: help install install-frontend install-backend \
        dev dev-backend dev-frontend dev-all dev-stop \
        test test-frontend test-backend test-backend-e2e \
        contracts.build contracts.test contracts.fmt contracts.fmt-check \
        lint lint-frontend lint-backend \
        fmt fmt-backend \
        build build-frontend build-backend \
        clean clean-frontend clean-backend clean-onchain \
        ci

# ---------- Help ----------
help: ## Show this help message
	@echo "StellarHunt — available make targets:"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "  %-22s %s\n", "TARGET", "DESCRIPTION"} \
		/^[a-zA-Z_.-]+:.*?##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' \
		$(MAKEFILE_LIST)
	@echo ""
	@echo "Examples:"
	@echo "  make install         Install all monorepo dependencies"
	@echo "  make dev             Start backend + frontend together"
	@echo "  make test            Run all tests (backend units + onchain)"
	@echo "  make contracts.test  Run only the Cairo contract test suite"

# ---------- Install ----------
install: install-backend install-frontend ## Install backend + frontend deps
	@echo "✓ All monorepo dependencies installed."

install-backend: ## Install backend (NestJS) dependencies
	cd $(BACKEND_DIR) && npm install

install-frontend: ## Install frontend (Next.js) dependencies
	cd $(FRONTEND_DIR) && npm install

# ---------- Development ----------
dev: dev-all ## Start backend + frontend in parallel (default)

dev-all: ## Start backend + frontend together (foreground parallel)
	@trap 'kill 0' EXIT INT TERM; \
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend: ## Start NestJS backend in watch mode (port 3001)
	cd $(BACKEND_DIR) && npm run start:dev

dev-frontend: ## Start Next.js frontend in dev mode (port 3000)
	cd $(FRONTEND_DIR) && npm run dev

dev-stop: ## Best-effort stop of dev processes started by `make dev`
	@pkill -f "$(BACKEND_DIR)/node_modules/.bin/nest start" 2>/dev/null || true
	@pkill -f "$(FRONTEND_DIR)/node_modules/.bin/next" 2>/dev/null || true
	@echo "✓ Stopped dev processes launched by this repo."

# ---------- Tests ----------
test: test-backend contracts.test ## Run backend + onchain test suites

test-frontend: ## Run frontend tests (currently no suite — manual)
	@echo "No automated frontend test suite is configured. Verify UI in the browser."

test-backend: ## Run NestJS unit tests
	cd $(BACKEND_DIR) && npm test

test-backend-e2e: ## Run NestJS E2E tests
	cd $(BACKEND_DIR) && npm run test:e2e

# ---------- Contracts ----------
contracts.build: ## Compile Cairo contracts with Scarb
	cd $(ONCHAIN_DIR) && scarb build

contracts.test: ## Run Cairo contract tests with snforge
	cd $(ONCHAIN_DIR) && snforge test

contracts.fmt: ## Run `scarb fmt` and write changes
	cd $(ONCHAIN_DIR) && scarb fmt

contracts.fmt-check: ## Verify Cairo formatting (CI-friendly)
	cd $(ONCHAIN_DIR) && scarb fmt --check

# ---------- Lint & Format ----------
lint: lint-frontend lint-backend ## Run all lint checks

lint-frontend: ## Lint the Next.js frontend
	cd $(FRONTEND_DIR) && npm run lint

lint-backend: ## Lint the NestJS backend (with autofix)
	cd $(BACKEND_DIR) && npm run lint

fmt: fmt-backend ## Run all formatters

# Frontend has no `format` script in package.json and no Prettier dep, so
# the canonical formatter target only covers the backend today.
fmt-backend: ## Format the NestJS backend (Prettier)
	cd $(BACKEND_DIR) && npm run format

# ---------- Build ----------
build: build-backend build-frontend ## Build everything

build-frontend: ## Build the Next.js frontend for production
	cd $(FRONTEND_DIR) && npm run build

build-backend: ## Build the NestJS backend for production
	cd $(BACKEND_DIR) && npm run build

# ---------- Cleanup ----------
clean: clean-backend clean-frontend clean-onchain ## Remove build artefacts
	@echo "✓ Cleaned build artefacts."

clean-backend: ## Remove backend build artefacts
	rm -rf $(BACKEND_DIR)/dist $(BACKEND_DIR)/coverage

clean-frontend: ## Remove frontend build artefacts + .next
	rm -rf $(FRONTEND_DIR)/.next $(FRONTEND_DIR)/out

clean-onchain: ## Remove Scarb build artefacts
	rm -rf $(ONCHAIN_DIR)/target

# ---------- CI ----------
ci: contracts.fmt-check contracts.test ## Targets used by CI pipeline
	@echo "✓ CI checks passed locally."
