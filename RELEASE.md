# Release Process

StellarHunts uses [Semantic Versioning](https://semver.org/) and tags to trigger releases.

## Cutting a release

1. Decide the next version: bump **MAJOR** for breaking changes, **MINOR** for new
   features, **PATCH** for bug fixes.
2. Create and push the annotated tag:
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```
3. The [`Release`](.github/workflows/release.yml) workflow will automatically:
   - Build the frontend, backend, and on-chain (Soroban) artifacts
   - Generate a release changelog from conventional-commit messages
   - Attach the compiled `.wasm` contract files to a GitHub Release

## Conventional commits

Commit messages prefixed with `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `ci:`,
`chore:`, or `style:` are grouped under those headings in the release notes.

## Hotfixes

For urgent patches, branch from the latest tag, fix, and tag a new `PATCH` version.
