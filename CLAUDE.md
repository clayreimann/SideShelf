# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React Native app built with Expo for Audiobookshelf — a self-hosted audiobook/podcast server. Provides offline downloads, audio playback, and progress synchronization.

## Agent Commands

```bash
npm test                                    # Run all tests
jest path/to/file.test.ts                  # Run single test file
jest --findRelatedTests path/to/file.ts    # Run tests related to a file
npm run drizzle:generate                   # Generate migrations after schema changes
npm run lint                               # Run ESLint
npx dpdm --circular src/services/X.ts     # Check for circular import cycles
```

## Architecture

### Layers (top → bottom, no reverse imports)

| Layer       | Location                      | Purpose                                                                                       |
| ----------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| Routes / UI | `src/app/`, `src/components/` | Screens, navigation, components                                                               |
| State       | `src/stores/`                 | Zustand slices — read by UI, mutated by services                                              |
| Services    | `src/services/`               | Business logic singletons (PlayerService, ProgressService, DownloadService, ApiClientService) |
| Providers   | `src/providers/`              | React context: DbProvider → AuthProvider → StoreProvider                                      |
| Data Access | `src/db/`                     | Drizzle/SQLite helpers — called only by services and slices                                   |
| Lib / Utils | `src/lib/`, `src/utils/`      | API client, logger, formatters, file system — no business logic                               |

### Project Structure

```
src/
├── app/              # Expo Router file-based routes
│   ├── (tabs)/       # Tab screens (home, library, series, authors, more)
│   ├── FullScreenPlayer/
│   └── _layout.tsx   # Root layout — provider hierarchy + app init
├── components/       # UI: ui/, library/, player/, home/, errors/, diagnostics/
├── db/               # schema/, helpers/, migrations/, client.ts
├── lib/              # api/ (api.ts + endpoints.ts), logger/, fileSystem.ts, theme.ts
├── providers/        # AuthProvider, DbProvider, StoreProvider
├── services/         # Service singletons + coordinator/
├── stores/           # appStore.ts + slices/
├── types/            # api.ts, database.ts, player.ts, store.ts, coordinator.ts
└── i18n/             # locales/
```

## Key Patterns

### Database (Important!)

- **ALL database writes and queries go through helpers in `src/db/helpers/`** — never inline `db.insert()` or `db.update()` in UI or services
- One helper file per entity (e.g., `users.ts`, `libraries.ts`, `mediaProgress.ts`)
- Helpers export: `marshal...FromApi()` (pure transform), `upsert...()`, `insert...()`, `get...()`, and `...Tx()` transaction variants
- When adding a column to an existing table: always include `.default()` in the schema — SQLite's `ALTER TABLE ADD COLUMN NOT NULL` without a default fails on existing rows

### No Circular Imports (Important!)

Circular imports cause uninitialized values at runtime. Never allow them:

- **Never import from `@/db/helpers` barrel inside `src/services/`** — import from the specific file (e.g., `@/db/helpers/tokens`)
- When splitting a service, helpers must take explicit arguments — never call `ServiceClass.getInstance()` inside a helper (creates a hidden singleton cycle)
- Verify with `npx dpdm --circular src/services/PlayerService.ts` before and after any service file split
- Use `await import()` only as a last resort for mutual service dependencies; document the reason

### Zustand Slices

- Slice pattern: `createXSlice(set, get)` combined in `appStore.ts`
- **Always use `get()` inside action bodies to read current state** — closure variables capture initial state and go stale
- **Never use object-returning selectors** — they create a new reference on every render and re-trigger on every store tick (including 1Hz position updates from player)

  ```typescript
  // BAD — re-renders every position tick
  const { a, b } = useAppStore((state) => ({ a: state.x.a, b: state.x.b }));

  // GOOD — individual selectors
  const a = useAppStore((state) => state.x.a);
  const b = useAppStore((state) => state.x.b);
  ```

- Use existing `use*()` hooks from `appStore.ts` (`usePlayer()`, `useLibrary()`, `useSettings()`, etc.) instead of writing new selectors inline
- Use `subscribeWithSelector` for side-effect subscriptions outside React

### Services

- Singleton pattern: exported as lowercase instance (`playerService`, `progressService`, `downloadService`)
- `PlayerStateCoordinator` in `src/services/coordinator/` manages state machine; dispatch events via `dispatchPlayerEvent()` from `eventBus.ts` — never call TrackPlayer directly from UI
- `eventBus.ts` is a leaf node — safe to import anywhere without creating cycles

### TypeScript & Imports

- Use `@/` for all imports (maps to `src/`) — never relative paths
- Strict mode enabled — no `any` without a comment explaining why
- File naming: Services → PascalCase + `Service.ts`; slices → camelCase + `Slice.ts`; DB helpers → camelCase plural; components → PascalCase
- Type naming: `{Domain}SliceState`, `{Domain}SliceActions`, `{Entity}Row`, `Api{Action}{Entity}`
- Private service methods: underscore prefix (`_setCurrentTrack`)
- Constants: `UPPER_SNAKE_CASE`

### Logging

Always use tagged logger — never `console.log`:

```typescript
const log = logger.forTag("FileName");
log.info("[functionName] description");
```

### API Endpoints

- Define typed endpoint functions in `src/lib/api/endpoints.ts` using `apiFetch()`
- All authenticated requests go through `ApiClientService`
- API docs: https://api.audiobookshelf.org/

## Testing

- Jest + React Native Testing Library; `jest-expo` preset
- Test files: co-located in `__tests__/` subdirectories, suffix `.test.ts` / `.integration.test.ts`
- Global setup: `src/__tests__/setup.ts` (mocks TrackPlayer, AsyncStorage, file system)
- Test fixtures: `src/__tests__/fixtures/index.ts`
- Test DB helper: `src/__tests__/utils/testDb.ts` — always use for DB helper tests
- Mock external dependencies; do **not** mock the logic under test
- Coverage excludes `src/app/` and `src/components/` (routes and components tested separately)

## Development Workflow

1. Read existing code before proposing changes — make one change at a time
2. Write tests for expected behavior; ensure they fail first
3. Implement the change
4. Run `npm test` and ensure all tests pass
5. Follow existing patterns — do not add features beyond what was requested

## Adding New Code

**New feature (e.g., Bookmarks):**

1. DB schema: `src/db/schema/bookmarks.ts`
2. DB helpers: `src/db/helpers/bookmarks.ts`
3. Store slice: `src/stores/slices/bookmarksSlice.ts`
4. Register in: `src/stores/appStore.ts`
5. Service (if needed): `src/services/BookmarkService.ts`
6. Route: `src/app/(tabs)/more/bookmarks.tsx`
7. Tests: `src/stores/slices/__tests__/bookmarksSlice.test.ts`

**New API endpoint:** add to `src/lib/api/endpoints.ts`; types in `src/types/api.ts`

**New utility:** pure functions in `src/lib/helpers/`; file operations in `src/lib/fileSystem.ts`

## Documentation

- Architecture docs → `docs/architecture/`
- Investigation reports → `docs/investigation/`
- Code-level advice → JSDoc comments, not markdown
- Clean up intermediate investigation files after the feature is complete
