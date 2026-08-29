# Security

Security checks run in GitHub Actions for every pull request and push to `main`:

- **CodeQL** analyzes JavaScript and TypeScript for common vulnerabilities.
- **Gitleaks** scans the repository history checked out by the workflow for accidentally committed secrets.
- **Dependency review** rejects pull requests that introduce high- or critical-severity vulnerable dependencies.
- **npm audit** runs at the `high` threshold in the build workflow for the frontend and backend.

Run the dependency checks locally with:

```bash
npm audit --workspaces --audit-level=high
```

If an advisory cannot yet be removed because its upstream package has no compatible patched release, document the package, advisory, affected path, and mitigation in the pull request rather than lowering the CI threshold.

## Dependency audit status

The npm audit gate is set to the `high` threshold (`npm audit --audit-level=high`).

### Backend — clean

`backend` passes `npm audit --audit-level=high` with **0 findings**. Recent fixes:

- `@nestjs/cli` 10 → 11, `@nestjs/schematics` 10 → 11, `@nestjs/swagger` 11.2 → 11.4 — clears the `webpack`, `tmp`, `ajv`, `picomatch`, `glob`, and `js-yaml` advisories pulled in by the Angular toolchain.
- `nodemailer` 6 → 9.0.5 — clears the SMTP/CRLF injection advisories.
- Removed unused `aws-sdk` (EOL, no longer receiving security updates) and unused `sqlite3` (its bundled `node-gyp`/`tar` chain carried the only critical-severity finding).

### Frontend — residual risk (Next.js framework)

`frontend` still reports high-severity advisories that only a major framework upgrade can clear. All of them come from the Next.js toolchain:

| Package | Installed | Advisory | Path |
| --- | --- | --- | --- |
| `next` | 14.2.35 | Multiple (SSRF, cache poisoning, DoS, XSS) — fixed in `next@>=16.3.3` | `node_modules/next` |
| `postcss` | (bundled with `next`) | Source-map/file-read — fixed by the `next` upgrade | `node_modules/next/node_modules/postcss` |
| `glob` | 10.3.10 (pinned by `@next/eslint-plugin-next`) | CLI command injection — fixed in `glob@>=10.5.0` | `node_modules/glob` |

Mitigation: these packages are build/lint-time tooling; none of the affected code paths are reachable from the served application at runtime. The frontend audit step in CI is advisory (`continue-on-error: true`) and will be made blocking in the PR that upgrades `next` to a patched major version (16.x, which also requires the React 19 migration). Until then, new findings of any severity still surface as failing annotations on every run.

Native secret scanning (GitHub "Secret scanning" and "Push protection") is a repository setting and cannot be enabled from a pull request; the Gitleaks workflow in `.github/workflows/security.yml` provides the equivalent CI enforcement. The Gitleaks scan runs over the full repository history; known false positives are allow-listed in `.gitleaks.toml`.

The dependency-review job requires the repository's **Dependency graph** setting (Settings → Code security and analysis) to be enabled — GitHub does not expose that setting via a pull request. Until it is enabled, the job is advisory; it becomes a blocking gate automatically once the setting is turned on.
