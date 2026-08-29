# Zustand Store Conventions

## Persist keys must be unique

Every store that uses Zustand's `persist` middleware writes to `localStorage`
(or another storage backend) under the key passed as `name` in the persist
config. **Two stores must never share a `name`.** If they do, whichever store
hydrates second on mount silently overwrites the other's persisted data —
this happened once already (see issue #053) and cost players their progress.

### Naming convention

Use `<store-name>:v<version>`, where `<store-name>` matches the file/hook
name and `<version>` matches the persist `version` field in that store's
config:

| Store file                             | Hook                   | Persist `name`           |
| -------------------------------------- | ---------------------- | ------------------------ |
| `useGameStore.js`                      | `useGameStore`         | `game-store:v1`          |
| `game-progress/game-progress-store.js` | `useGameProgressStore` | `game-progress-store:v1` |

When you bump a store's `version` (e.g. because you changed the shape of
persisted state and need a migration), bump the `:vN` suffix in `name` too,
so old and new shapes never collide under the same key.

### Adding a new persisted store

1. Pick a `name` following the table format above.
2. Grep the repo for that exact string before committing, to confirm no
   other `persist({ name: ... })` call already uses it:

```bash
   grep -rn "name: ['\"]your-new-key" frontend/store
```

3. Add a row to the table in this README.

### Note on consolidation

Issue #061 proposes merging `useGameStore` and `useGameProgressStore` into a
single store. If/when that lands, this file should be updated to reflect the
single resulting store and its persist key.
