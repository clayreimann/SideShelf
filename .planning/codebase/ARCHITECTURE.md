# Architecture

**Analysis Date:** 2026-02-15

## Pattern Overview

**Overall:** Service + Store + Route composition with React Context providers

**Key Characteristics:**

- Expo Router for file-based navigation with stack and tab routing
- Zustand slice pattern for state management with `subscribeWithSelector` middleware
- Service layer handling business logic (PlayerService, ProgressService, DownloadService, etc.)
- Context providers for dependency injection (AuthProvider, DbProvider, StoreProvider)
- React Native with custom background audio support via react-native-track-player

## Layers

**Presentation Layer (UI/Routes):**

- Purpose: User-facing screens and components, navigation routing
- Location: `src/app/` (Expo Router), `src/components/`
- Contains: Screen components, tab navigation, modal routes, UI components
- Depends on: Zustand stores (hooks), services (side effects), providers
- Used by: End users through app navigation

**State Management Layer:**

- Purpose: Centralized application state using Zustand slices
- Location: `src/stores/` (appStore.ts and slices)
- Contains: Domain slices (player, library, authors, series, downloads, etc.)
- Depends on: Nothing directly; receives updates from services
- Used by: UI components via useAppStore hooks, services for state mutations

**Service Layer:**

- Purpose: Business logic, coordination, external communication, background tasks
- Location: `src/services/`
- Contains:
  - `PlayerService.ts` - Audio playback control
  - `PlayerBackgroundService.ts` - Background audio event handling
  - `ProgressService.ts` - Progress sync with server
  - `DownloadService.ts` - Download management
  - `ApiClientService.ts` - API authentication wrapper
  - `coordinator/` - Event coordination between services
- Depends on: API client, database helpers, Zustand store (mutations only)
- Used by: Routes, providers, and background tasks

**Provider Layer (Dependency Injection):**

- Purpose: Initialize services, manage app-level context
- Location: `src/providers/`
- Contains:
  - `AuthProvider.tsx` - Authentication state and login
  - `DbProvider.tsx` - Database initialization
  - `StoreProvider.tsx` - Zustand store initialization
- Depends on: Services, stores, context
- Used by: Root layout as wrapping hierarchy

**Data Access Layer:**

- Purpose: Database operations and SQL queries
- Location: `src/db/`
- Contains:
  - `schema/` - Drizzle table definitions
  - `helpers/` - Entity-specific helper functions (queries, marshalling, upserts)
  - `migrations/` - Generated SQL migrations
- Depends on: Drizzle ORM, SQLite via expo-sqlite
- Used by: Services and stores when persisting/loading data

**Utility/Library Layer:**

- Purpose: Helpers, API client, logger, theming, i18n
- Location: `src/lib/`, `src/utils/`
- Contains: `api/`, `logger/`, `theme.ts`, `helpers/`, file system utilities, async storage
- Depends on: External packages, React Native APIs
- Used by: All other layers

## Data Flow

**Playback Flow:**

1. User initiates playback from UI (route/component)
2. Component calls `playerService.playTrack(itemId)`
3. PlayerService loads track, configures react-native-track-player
4. PlayerBackgroundService monitors playback state (position, playing, chapter)
5. Store updates via `updatePosition()`, `updatePlayingState()`, etc.
6. Component re-renders via Zustand selector hooks
7. ProgressService periodically syncs position with server

**Library Discovery Flow:**

1. User navigates to library/authors/series tab
2. StoreProvider initializes respective slices when auth + db are ready
3. Slice actions fetch from API via helpers in `src/db/helpers/`
4. Results are marshalled and stored in state + database
5. Components subscribe to store via `useLibrary()`, `useAuthors()`, `useSeries()`
6. Pagination/sorting via `setSortConfig()` updates both state and queries

**Download Flow:**

1. User initiates download from item detail
2. DownloadService queues download via @kesha-antonov/react-native-background-downloader
3. Service updates store with progress via `updateDownloadProgress()`
4. UI displays progress from store
5. On completion, calls `completeDownload()`, marks item as downloaded
6. File lifecycle manager handles caching and cleanup

**Authentication Flow:**

1. User logs in via login screen
2. AuthProvider calls `login(serverUrl, username, password)`
3. ApiClientService stores credentials in secure storage
4. AuthProvider initializes and broadcasts auth state changes
5. Services and providers depend on `isAuthenticated` to enable functionality
6. On logout, auth state is cleared, UI routes to login screen

**State Management:**

- Stores are initialized lazily in providers when dependencies (API, DB) are ready
- Services mutate store state via actions (internal mutators prefixed with `_`)
- Components read state via selector hooks that memoize to prevent unnecessary re-renders
- `subscribeWithSelector` middleware allows granular subscriptions to prevent re-render cascades

## Key Abstractions

**Service Singletons:**

- Purpose: Manage lifecycle of long-lived operations (playback, sync, downloads)
- Examples: `playerService`, `progressService`, `downloadService`, `apiClientService`
- Pattern: Exported as singletons at module level in service file
- Usage: Injected into providers and called directly from components/stores

**Store Slices:**

- Purpose: Organize state by domain concern
- Examples: `librarySlice`, `playerSlice`, `downloadSlice`, `settingsSlice`
- Pattern: Each slice is a function that receives Zustand `(set, get)` and returns state + actions
- Usage: Combined in `appStore.ts`, accessed via hook wrappers like `useLibrary()`, `usePlayer()`

**DB Helpers:**

- Purpose: Encapsulate all database access and marshalling
- Examples: `libraryItems.ts`, `mediaProgress.ts`, `users.ts` in `src/db/helpers/`
- Pattern: Export marshal functions (pure transforms), upsert functions (DB writes), query functions
- Usage: Called by services and slices to persist/fetch data

**Routes with Parameters:**

- Purpose: Navigate to detail screens with context
- Examples: `src/app/(tabs)/library/[item]/index.tsx` for item details
- Pattern: Expo Router file-based routing with dynamic segments `[param]`
- Usage: Router.push with pathname and params

**API Endpoints:**

- Purpose: Centralized endpoint definitions and typed wrappers
- Location: `src/lib/api/endpoints.ts`
- Pattern: Functions that use `apiFetch()` with built-in auth, error handling, type safety
- Usage: Services call endpoints, which handle marshalling and DB writes

**Coordinator/EventBus:**

- Purpose: Coordinate state transitions between services (PlayerService ↔ ProgressService)
- Location: `src/services/coordinator/`
- Contains: `PlayerStateCoordinator`, `eventBus`, `transitions`
- Pattern: Pub/sub event model for cross-service communication
- Usage: Services dispatch events, coordinator handles state consistency

## Entry Points

**App Root:**

- Location: `src/app/_layout.tsx`
- Triggers: App startup via Expo
- Responsibilities:
  - Initialize fonts and logger
  - Set up provider hierarchy (DbProvider → AuthProvider → StoreProvider)
  - Handle AppState changes (background/foreground)
  - Deep link handling for logger configuration
  - Player state reconciliation on resume

**Tab Navigation:**

- Location: `src/app/(tabs)/_layout.tsx`
- Triggers: After authentication
- Responsibilities:
  - Configure bottom tab bar (iOS native tabs or Expo Router tabs)
  - Show/hide tabs based on user settings
  - Initialize DownloadService
  - Display error badge on "more" tab

**Login Screen:**

- Location: `src/app/login.tsx`
- Triggers: When not authenticated
- Responsibilities: Credential entry, API connection test, auth state update

**Full-screen Player:**

- Location: `src/app/FullScreenPlayer/_layout.tsx`
- Triggers: User taps floating player
- Responsibilities: Display large player UI with controls, chapter list, seeking

**Home Screen:**

- Location: `src/app/(tabs)/home/index.tsx`
- Triggers: App load / home tab selected
- Responsibilities: Display continue listening, downloaded, listen again sections

## Error Handling

**Strategy:**

- Errors are logged with context tags for filtering
- Services catch errors and mutate state to track loading failures
- UI displays error states via loading flags in store
- User-facing errors show toasts/alerts
- Unrecoverable errors trigger fallback behavior or navigation to safe state

**Patterns:**

- Try/catch in services with `log.error()` calls
- Error boundary components wrap major routes and player
- API errors trigger token refresh or session expiry messages
- Database errors logged but don't crash app (graceful degradation)
- Background service failures (download, progress sync) retry on next opportunity

## Cross-Cutting Concerns

**Logging:**

- `logger` module in `src/lib/logger/` with tag-based filtering
- Tags enable runtime configuration via deep links: `side-shelf://logger?level[TAG]=warn`
- Logs persisted in-memory with configurable max lines
- Error count tracked in store for badge display

**Validation:**

- Input validation at API endpoint wrappers (type-safe)
- Marshalling functions validate and transform API responses
- DB helpers validate state before writes (transactions)

**Authentication:**

- ApiClientService manages token lifecycle (refresh, expiry)
- AuthProvider broadcasts auth changes
- Services check `isAuthenticated` before API calls
- Secure storage holds credentials

**Background Audio:**

- react-native-track-player with remote commands
- PlayerBackgroundService listens to TrackPlayer events
- State sync between store and TrackPlayer on app foreground
- PlayerStateCoordinator prevents inconsistencies

**Persistence:**

- AsyncStorage for player state and app settings
- SQLite via Drizzle ORM for library data, progress, bookmarks
- Secure storage for credentials
- File system for downloaded audio files

---

_Architecture analysis: 2026-02-15_
