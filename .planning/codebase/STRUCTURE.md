# Codebase Structure

**Analysis Date:** 2026-02-15

## Directory Layout

```
src/
├── app/                      # Expo Router file-based routes
│   ├── _layout.tsx          # Root layout with providers
│   ├── index.tsx            # Splash/loading screen
│   ├── login.tsx            # Authentication screen
│   ├── (tabs)/              # Tab-based navigation
│   │   ├── _layout.tsx      # Tab bar configuration
│   │   ├── home/            # Home/continue listening
│   │   ├── library/         # Library browsing
│   │   ├── series/          # Series browsing
│   │   ├── authors/         # Authors browsing
│   │   └── more/            # Settings & info screens
│   └── FullScreenPlayer/    # Modal for full-screen playback
├── components/              # Reusable UI components
│   ├── ui/                  # Generic UI (buttons, progress bars, etc.)
│   ├── library/             # Library-specific (item lists, detail views)
│   ├── player/              # Player controls (mini, full-screen)
│   ├── home/                # Home screen sections
│   ├── icons/               # Custom icon components
│   ├── errors/              # Error boundary, error displays
│   └── diagnostics/         # Debug/diagnostic UI
├── db/                      # Database layer (SQLite + Drizzle)
│   ├── schema/              # Table definitions
│   ├── helpers/             # Entity-specific query & mutation helpers
│   ├── migrations/          # Generated SQL migration files
│   ├── client.ts            # Drizzle client initialization
│   └── README.md            # DB guidelines
├── lib/                     # Utilities and helpers
│   ├── api/                 # API client and endpoints
│   │   ├── api.ts           # apiFetch() wrapper with auth
│   │   └── endpoints.ts     # Typed endpoint functions
│   ├── logger/              # Logging system with tag filtering
│   ├── downloads/           # Download queue utilities
│   ├── helpers/             # Formatters, calculations
│   ├── theme.ts             # Theme colors and styling
│   ├── appSettings.ts       # App configuration
│   ├── asyncStore.ts        # AsyncStorage persistence layer
│   ├── secureStore.ts       # Credential storage
│   ├── fileSystem.ts        # File operations
│   ├── fileLifecycleManager.ts  # Cleanup and caching
│   ├── covers.ts            # Cover image helpers
│   ├── authorImages.ts      # Author image helpers
│   ├── smartRewind.ts       # Smart rewind logic
│   ├── trackPlayerConfig.ts # react-native-track-player setup
│   └── iCloudBackupExclusion.ts # iOS backup exclusion
├── providers/               # React Context providers
│   ├── AuthProvider.tsx     # Authentication context
│   ├── DbProvider.tsx       # Database initialization
│   └── StoreProvider.tsx    # Store initialization
├── services/                # Business logic services
│   ├── PlayerService.ts     # Audio playback control
│   ├── PlayerBackgroundService.ts  # Background audio events
│   ├── ProgressService.ts   # Server progress sync
│   ├── DownloadService.ts   # Download management
│   ├── ApiClientService.ts  # API wrapper (auth, tokens)
│   ├── BundleService.ts     # Dynamic bundle loading
│   ├── libraryItemBatchService.ts  # Batch operations
│   ├── coordinator/         # Service coordination
│   │   ├── PlayerStateCoordinator.ts  # State machine for player
│   │   ├── eventBus.ts      # Pub/sub event system
│   │   └── transitions.ts   # State transition logic
│   ├── __tests__/           # Service tests
│   └── README.md            # Service documentation
├── stores/                  # Zustand state management
│   ├── appStore.ts          # Combined store with all slices
│   ├── slices/              # Domain-specific state slices
│   │   ├── playerSlice.ts   # Playback state
│   │   ├── librarySlice.ts  # Library and items
│   │   ├── authorsSlice.ts  # Authors
│   │   ├── seriesSlice.ts   # Series
│   │   ├── homeSlice.ts     # Home screen sections
│   │   ├── downloadSlice.ts # Download progress
│   │   ├── settingsSlice.ts # App settings
│   │   ├── userProfileSlice.ts # User info
│   │   ├── statisticsSlice.ts  # Library stats
│   │   ├── networkSlice.ts  # Network status
│   │   ├── loggerSlice.ts   # Logger state
│   │   └── __tests__/       # Slice tests
│   ├── utils.ts             # Store utilities
│   └── index.ts             # Store exports
├── types/                   # TypeScript definitions
│   ├── api.ts               # API response types
│   ├── database.ts          # Database entity types
│   ├── store.ts             # Store state types
│   ├── services.ts          # Service interface types
│   ├── player.ts            # Playback-related types
│   ├── components.ts        # Component prop types
│   ├── utils.ts             # Utility types
│   ├── coordinator.ts       # Coordinator types
│   └── index.ts             # Type exports
├── i18n/                    # Internationalization
│   └── locales/             # Translation files (en, es, etc.)
├── hooks/                   # Custom React hooks
├── utils/                   # Miscellaneous utilities
│   └── userHelpers.ts       # User context helpers
├── __tests__/               # App-level tests
│   ├── setup.ts             # Jest configuration
│   ├── mocks/               # Mock implementations
│   └── utils/               # Test utilities
├── index.ts                 # App initialization
└── config/                  # (if present) Configuration files
```

## Directory Purposes

**`src/app/`** (Expo Router)

- Purpose: File-based routing using Expo Router conventions
- Contains: Screen components, layouts, navigation structure
- Key files:
  - `_layout.tsx`: Root stack layout with providers
  - `(tabs)/_layout.tsx`: Tab bar configuration
  - Routes: home, library, series, authors, more, login, FullScreenPlayer
- New routes added as `.tsx` files in this directory

**`src/components/`**

- Purpose: Reusable UI components organized by domain
- Key subdirectories:
  - `ui/`: Generic components (buttons, lists, modals, progress bars)
  - `library/`: Library-specific (item cards, detail views, chapter lists)
  - `player/`: Player UI (floating player, controls, progress)
  - `home/`: Home screen specific components
  - `errors/`: Error boundary and error displays
- Pattern: One component per file, index.ts for exports

**`src/db/`**

- Purpose: Data persistence via SQLite
- Key files:
  - `schema/`: Drizzle table definitions (libraryItems.ts, authors.ts, etc.)
  - `helpers/`: Entity helpers like `libraryItems.ts`, `mediaProgress.ts`
  - `migrations/`: Auto-generated by `npm run drizzle:generate`
- Guidelines: ALL database writes go through helpers (never inline db.insert())

**`src/lib/api/`**

- Purpose: API communication
- Files:
  - `api.ts`: `apiFetch()` function with auth, timeout, error handling
  - `endpoints.ts`: Typed endpoint wrappers (login, getLibraries, getLibraryItem, etc.)
- Pattern: Endpoints call apiFetch, marshal response, optionally persist to DB

**`src/lib/logger/`**

- Purpose: Structured logging with tag-based filtering
- Features:
  - Per-tag log levels (debug, info, warn, error)
  - In-memory log persistence
  - Runtime configuration via deep links
  - Error count tracking

**`src/providers/`**

- Purpose: React Context providers for app initialization
- Files:
  - `AuthProvider.tsx`: Auth state, login/logout, token management
  - `DbProvider.tsx`: Database initialization
  - `StoreProvider.tsx`: Zustand store initialization
- Nesting: Root → DbProvider → AuthProvider → StoreProvider → Routes

**`src/services/`**

- Purpose: Singleton services managing business logic
- Key services:
  - `PlayerService.ts`: Play/pause, seek, playback rate, chapter nav
  - `PlayerBackgroundService.ts`: Listen to player events (bg task)
  - `ProgressService.ts`: Sync progress with server periodically
  - `DownloadService.ts`: Manage downloads with background support
  - `ApiClientService.ts`: Auth tokens, refresh logic
- Pattern: Instantiated once, exported as default instance
- Coordinator: `coordinator/` handles state transitions between services

**`src/stores/`**

- Purpose: Centralized state with Zustand slices
- Structure:
  - `appStore.ts`: Combined store combining all slices
  - `slices/`: Individual domain slices (player, library, etc.)
  - Each slice exports its state interface and actions
- Hooks: `useLibrary()`, `usePlayer()`, `useSettings()`, etc.
- Initialized in `StoreProvider` when API + DB ready

**`src/types/`**

- Purpose: TypeScript type definitions organized by concern
- Files:
  - `api.ts`: API response/request types
  - `database.ts`: Database entity types
  - `player.ts`: Playback types (PlayerTrack, CurrentChapter)
  - `store.ts`: Store slice interfaces
  - `services.ts`: Service interface types

**`src/utils/`**

- Purpose: Pure utility functions (no side effects)
- Example: `userHelpers.ts` for getting current user context

**`src/__tests__/`**

- Purpose: App-level tests
- Files:
  - `setup.ts`: Jest configuration, global mocks
  - `mocks/`: Mock implementations (TrackPlayer, API, etc.)
  - `utils/`: Test helper functions

## Key File Locations

**Entry Points:**

- `src/app/_layout.tsx`: Root layout, app initialization, provider setup
- `src/app/(tabs)/_layout.tsx`: Tab navigation configuration
- `src/app/login.tsx`: Authentication screen
- `src/app/index.tsx`: Splash/loading screen
- `src/index.ts`: App initialization function

**Configuration:**

- `src/lib/appSettings.ts`: App configuration constants
- `src/lib/theme.ts`: Theme colors, styled properties
- `src/lib/trackPlayerConfig.ts`: react-native-track-player setup
- `src/lib/logger/`: Logger tag configuration

**Core Logic:**

- `src/services/PlayerService.ts`: Playback state machine
- `src/services/ProgressService.ts`: Server sync logic
- `src/services/DownloadService.ts`: Download queue management
- `src/services/coordinator/PlayerStateCoordinator.ts`: Service coordination

**API & Data:**

- `src/lib/api/endpoints.ts`: All API endpoints (login, library, items, progress)
- `src/lib/api/api.ts`: HTTP client with auth
- `src/db/helpers/`: Database operations (one file per entity)
- `src/db/schema/`: Table definitions

**State Management:**

- `src/stores/appStore.ts`: Store combination, hook exports
- `src/stores/slices/`: Individual domain slices

## Naming Conventions

**Files:**

- Components: PascalCase (e.g., `LibraryList.tsx`)
- Services: PascalCase (e.g., `PlayerService.ts`)
- Utilities: camelCase (e.g., `fileSystem.ts`)
- Slices: camelCase + "Slice" (e.g., `playerSlice.ts`)
- Tests: Suffix with `.test.ts` or `.spec.ts`

**Directories:**

- Features: kebab-case (e.g., `full-screen-player`)
- Slices folder: `slices`
- Helpers folder: `helpers`
- Tests folder: `__tests__` or `tests`

**Types:**

- Interfaces: PascalCase (e.g., `PlayerSliceState`)
- Union types: PascalCase with vertical bar (e.g., `"idle" | "loading" | "ready"`)
- Type suffixes: `Slice`, `State`, `Actions` (e.g., `PlayerSliceActions`)

**Exports:**

- Store hooks: `use` prefix (e.g., `usePlayer()`, `useLibrary()`)
- Services: Lowercase singleton (e.g., `playerService`)
- Slices: `create` prefix (e.g., `createPlayerSlice()`)

## Where to Add New Code

**New Feature (e.g., Bookmarks):**

1. Create store slice: `src/stores/slices/bookmarksSlice.ts`
2. Add to combined store: `src/stores/appStore.ts` (add import and spread in create)
3. Create hook wrapper: `export function useBookmarks() { ... }`
4. DB schema: `src/db/schema/bookmarks.ts`
5. DB helpers: `src/db/helpers/bookmarks.ts`
6. Service (if needed): `src/services/BookmarkService.ts`
7. Routes: `src/app/(tabs)/more/bookmarks.tsx`
8. Components: `src/components/library/BookmarkList.tsx`, etc.
9. Tests: `src/stores/slices/__tests__/bookmarksSlice.test.ts`

**New Component/Module:**

- Reusable UI: `src/components/ui/[ComponentName].tsx`
- Feature-specific: `src/components/[feature]/[ComponentName].tsx`
- Export from barrel file: `src/components/[feature]/index.ts` or `src/components/ui/index.ts`

**New API Endpoint:**

- Define in `src/lib/api/endpoints.ts`
- Type: Create types in `src/types/api.ts`
- Usage: Call from service or store action

**Utilities:**

- Pure functions: `src/lib/helpers/[name].ts`
- File operations: `src/lib/fileSystem.ts`
- External integrations: `src/lib/[service].ts`

**Tests:**

- Slice tests: `src/stores/slices/__tests__/[sliceName].test.ts`
- Service tests: `src/services/__tests__/[serviceName].test.ts`
- Component tests: `src/components/__tests__/[componentName].test.tsx`
- Setup: `src/__tests__/setup.ts` (Jest, mocks, globals)

## Special Directories

**`src/app/(tabs)/`**

- Purpose: Tab-based screens using Expo Router
- Generated: No (author-managed)
- Committed: Yes
- Pattern: Each tab is a folder with `_layout.tsx` and subroutes

**`src/db/migrations/`**

- Purpose: Generated SQL migrations
- Generated: Yes (by `npm run drizzle:generate`)
- Committed: Yes (migrations are part of codebase history)
- Do NOT manually edit; modify schema and regenerate

**`src/__tests__/mocks/`**

- Purpose: Jest mock implementations
- Generated: No (author-managed)
- Committed: Yes
- Contains: Mock TrackPlayer, AsyncStorage, API, etc.

**`src/services/coordinator/`**

- Purpose: Inter-service communication
- Generated: No (author-managed)
- Committed: Yes
- Pattern: Pub/sub event model for state coordination

**`.planning/codebase/`**

- Purpose: GSD mapping documents (not part of source)
- Generated: Yes (by `/gsd:map-codebase`)
- Committed: Yes (reference documents)
- Consumption: By `/gsd:plan-phase` and `/gsd:execute-phase`

---

_Structure analysis: 2026-02-15_
