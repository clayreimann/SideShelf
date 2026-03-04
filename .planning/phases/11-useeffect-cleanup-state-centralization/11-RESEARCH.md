# Phase 11: useEffect Cleanup + State Centralization - Research

**Researched:** 2026-03-03
**Domain:** Zustand state management, React Native component patterns, useEffect elimination
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**viewMode persistence**

- Persists across app restarts — backed by AsyncStorage via Zustand persist middleware
- Global preference — one viewMode setting for all library screens (not per-library)
- Default value for new installs: list view
- Migration from existing AsyncStorage: start fresh — do NOT read the old value; existing users reset to list view on first upgrade

**State reset boundaries**

- Explicit logout: clear all user-specific Zustand slice data (userId, library items, progress entries, series/author data) AND wipe the backing SQLite tables (media items, progress, etc.) — keep preferences (viewMode)
- Server switch: same reset behavior as explicit logout
- Token expiry / forced re-login: do NOT clear slice data — preserve existing state so the user is back in their session after re-authenticating
- DB wipe on logout happens asynchronously — navigate to login screen first, then clean up in the background
- There is an existing logout flow in the app; hook the new slice resets and DB wipe into it

**Cached data freshness (stale-while-revalidate pattern)**

- Series progress data, tags data, and other slice-backed queries all follow the same pattern: show cached data immediately, fire a background re-fetch on every navigation to the relevant screen
- No time-based staleness threshold — refresh on every navigation
- Author/series navigation IDs: Claude decides the error handling (data is expected to be present locally from library sync)
- Background fetch triggers on every screen navigation — no time-gating

**Hydration failure handling**

- viewMode AsyncStorage failure: silently fall back to list view default — log the error, do not surface to user
- userId unavailable at startup: redirect to login (follow existing auth guard pattern)
- DB-backed slice data (library items, progress, series): show a loading/skeleton state until the initial DB query completes — treat unknown as loading, not empty
- Whether slice data is guaranteed available before component render: Claude decides based on root layout and store initialization structure

**Cold-start / navigation rehydration**

- Goal: screens that used to re-fetch on every mount should instead read from their slice (showing cached DB data) and fire a background stale-while-revalidate network fetch if needed
- Screens manage their own loading state — no pre-population of slices before routing begins
- Pattern to establish across all affected screens: load cached DB data → show immediately → background refresh if network fetch exists
- True deep-link support (URL → specific screen) is a deferred goal, not a requirement for this phase

### Claude's Discretion

- Author/series navigation ID error handling (data is expected to be present locally from library sync)
- Whether slice data is guaranteed available before component render

### Deferred Ideas (OUT OF SCOPE)

- True deep-link support (open app from URL to specific book/series) — future phase; this phase focuses on cold-start rehydration only
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID        | Description                                                                                                                                       | Research Support                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STATE-01  | `viewMode` preference in library index moved to `settingsSlice` (persisted preference, not per-mount local state)                                 | settingsSlice already has pattern for AsyncStorage-backed preferences; `viewMode` maps naturally alongside `homeLayout`                                                                                                           |
| STATE-02  | SeriesDetailScreen `progressMap` replaced with bulk store action (eliminates N+1 per-book DB fetch in component)                                  | `seriesSlice` needs a `progressMap` state field + `fetchSeriesProgress(seriesId, userId)` action; DB helper `getMediaProgressForLibraryItem` called per-item today, needs batch variant                                           |
| STATE-03  | AuthorDetailScreen author lookup replaced with `getAuthorById` store action (cache-miss DB fetch lives in slice, not component)                   | `authorsSlice` needs a `getOrFetchAuthorById(authorId)` action; current component uses `getAuthorById` DB helper directly in a useEffect                                                                                          |
| EFFECT-01 | `ConsolidatedPlayerControls` jump interval AsyncStorage reads replaced with `useSettings()` hook                                                  | `useSettings()` hook already exists and exposes `jumpForwardInterval`/`jumpBackwardInterval`; this is a direct hook substitution removing the useEffect                                                                           |
| EFFECT-02 | `LibraryItemDetail` mount-time `fetchServerProgress()` removed (already triggered by home screen focus and app foreground)                        | Removing the `progressService.fetchServerProgress()` call from LibraryItemDetail's useEffect; home screen and AuthProvider already trigger this                                                                                   |
| EFFECT-03 | `userId` added to `useAuth()` to eliminate `getUserByUsername()` DB reads scattered across 5+ components                                          | `AuthProvider` currently exposes `username` but not `userId`; `userProfile.user.id` is already stored in `userProfileSlice`; need to pipe `userId` through `useAuth()` or add it as a derived value                               |
| EFFECT-04 | Author/series navigation IDs moved into `libraryItemDetailsSlice.fetchItemDetails` (currently a separate component-level useEffect per item open) | `fetchItemDetails` in `libraryItemDetailsSlice` calls `_fetchItemData` which already fetches media metadata; `getMediaAuthors` and `getMediaSeries` DB helpers exist; extend `CachedItemDetails` to include `authorId`/`seriesId` |
| EFFECT-05 | `MoreScreen` app version reads converted to synchronous module-scope constants (no useEffect or useState needed)                                  | `DeviceInfo.getVersion()` and `DeviceInfo.getBuildNumber()` are confirmed synchronous (use `getSupportedPlatformInfoSync`); safe to call at module scope                                                                          |
| EFFECT-06 | `getAllTags()` consolidated into `loggerSlice.availableTags` (currently fetched independently in both LogsScreen and LoggerSettingsScreen)        | `loggerSlice` exists but has no `availableTags` field today; `getAllTags()` is synchronous (reads in-memory SQLite); add field + `refreshAvailableTags()` action                                                                  |

</phase_requirements>

---

## Summary

Phase 11 eliminates nine instances of redundant state initialization spread across components. The work falls into two categories: (1) moving per-component AsyncStorage/DB reads into the Zustand slices where they belong, and (2) removing duplicate data fetches that are already triggered elsewhere.

The codebase has a mature Zustand slice architecture. Every needed slice already exists — the work is additive within existing slices, not creating new ones. The `settingsSlice` pattern (AsyncStorage-backed preferences, `initialized` flag, `isLoading` flag, optimistic updates) is the template for STATE-01 (`viewMode`). The `seriesSlice` is the natural home for series progress data (STATE-02). The `libraryItemDetailsSlice` already fetches related data in `_fetchItemData` and just needs two more fields (EFFECT-04).

The `userId` problem (EFFECT-03) has a clean solution: `userProfileSlice` already stores the full `UserRow` which includes `id`. The `AuthProvider` and `useAuth()` hook need a `userId` getter that reads from the store, eliminating the pattern of calling `getUserByUsername()` in components just to get the ID.

**Primary recommendation:** Follow the existing slice patterns exactly. Do not introduce new patterns. Each requirement maps to a specific slice — add fields and actions there, then update consumers to use the hook.

## Standard Stack

### Core (already in use — no new dependencies)

| Library                                   | Version | Purpose                       | Why Standard                                   |
| ----------------------------------------- | ------- | ----------------------------- | ---------------------------------------------- |
| zustand                                   | ~5.x    | Slice-based state management  | Already the app state layer                    |
| @react-native-async-storage/async-storage | ~2.x    | Persisting preferences        | Used by all existing settings in settingsSlice |
| drizzle-orm                               | ~0.40.x | DB queries for batch progress | Used throughout db/helpers                     |
| react-native-device-info                  | present | Synchronous app version       | Already imported in MoreScreen                 |

### No New Packages

This phase does not require any new npm packages. All patterns, hooks, and DB helpers are extensions of existing infrastructure.

## Architecture Patterns

### Recommended Pattern: Extend Existing Slices

Each requirement maps 1:1 to an existing slice. The planner should treat each requirement as a targeted slice extension.

**Pattern: settingsSlice extension for STATE-01 (viewMode)**

```typescript
// In settingsSlice.ts — add to SettingsSliceState.settings:
viewMode: 'list' | 'grid';

// Add to initializeSettings() parallel load:
getViewMode(),  // new helper in appSettings.ts

// Add action:
updateViewMode: (mode: 'list' | 'grid') => Promise<void>

// In library/index.tsx — replace useState:
// Before: const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
// After:  const { viewMode, updateViewMode } = useSettings();
```

**Pattern: seriesSlice extension for STATE-02 (progress map)**

```typescript
// In seriesSlice.ts — add to SeriesSliceState.series:
progressMap: Record<string, MediaProgressRow>; // keyed by libraryItemId
progressMapSeriesId: string | null; // which series the map is for

// Add action:
fetchSeriesProgress: (seriesId: string, userId: string) => Promise<void>;

// In series/[seriesId]/index.tsx — replace useEffect + useState:
// Before: const [progressMap, setProgressMap] = useState<Map<...>>(new Map());
//         + useEffect calling getUserByUsername then per-book getMediaProgressForLibraryItem
// After:  const { progressMap } = useSeries();
//         useFocusEffect: fetchSeriesProgress(seriesId, userId)
```

**Pattern: authorsSlice extension for STATE-03 (author cache miss)**

```typescript
// In authorsSlice.ts — add action:
getOrFetchAuthorById: (authorId: string) => Promise<AuthorRow | null>;
// Uses existing authors list first, falls back to getAuthorById DB helper

// In authors/[authorId]/index.tsx — replace useEffect + setState:
// Before: useEffect calling getAuthorById directly
// After:  call getOrFetchAuthorById in useFocusEffect or on mount
```

**Pattern: userId in useAuth() for EFFECT-03**

```typescript
// Option A (recommended): Add userId getter to AuthProvider.tsx
// AuthProvider already has access to userProfileSlice via store
// Add userId to AuthContextValue and expose via useAuth():
type AuthContextValue = {
  // existing fields...
  userId: string | null; // NEW
};
// In AuthProvider: const userId = useAppStore(state => state.userProfile.user?.id ?? null);

// In LibraryItemDetail.tsx:
// Before: const user = username ? await getUserByUsername(username) : null;
//         const userId = user?.id;
// After:  const { userId } = useAuth();
```

**Pattern: libraryItemDetailsSlice extension for EFFECT-04 (authorId/seriesId)**

```typescript
// In libraryItemDetailsSlice.ts — extend CachedItemDetails:
export interface CachedItemDetails {
  // existing fields...
  authorId: string | null;  // NEW — first author's ID for navigation
  seriesId: string | null;  // NEW — first series ID for navigation
}

// In _fetchItemData — add parallel fetches:
const [genres, tags, chapters, audioFiles, progress, authors, seriesList] = await Promise.all([
  // existing...
  metadata ? getMediaAuthors(metadata.id) : [],
  metadata ? getMediaSeries(metadata.id) : [],
]);
// Derive:
authorId: authors[0]?.authorId || null,
seriesId: seriesList[0] || null,

// In LibraryItemDetail.tsx:
// Remove the entire 3rd useEffect (fetchRelationIds)
// Replace: const [authorId, setAuthorId] = useState<string | null>(null);
// With:    const authorId = cachedData?.authorId ?? null;
```

**Pattern: module-scope constant for EFFECT-05 (app version)**

```typescript
// In more/index.tsx — at module scope, before component:
import DeviceInfo from "react-native-device-info";
const APP_VERSION = `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`;

// Remove: const [appVersion, setAppVersion] = useState<string>("");
// Remove: the useEffect that called loadVersionInfo
// Replace appVersion usage with APP_VERSION constant
```

**Pattern: loggerSlice extension for EFFECT-06 (availableTags)**

```typescript
// In loggerSlice.ts — add to LoggerSliceState.logger:
availableTags: string[];

// Add to initialize():
const tags = getAllTags();  // synchronous
// set logger.availableTags = tags

// Add action:
refreshAvailableTags: () => void  // synchronous, calls getAllTags()

// In LogsScreen.tsx and LoggerSettingsScreen.tsx:
// Before: const [availableTags, setAvailableTags] = useState<string[]>([]);
//         useEffect calling getAllTags()
// After:  const availableTags = useAppStore(state => state.logger.availableTags);
//         call refreshAvailableTags() on focus instead of useEffect
```

### Logout Flow Hook Pattern

The existing logout is in `AuthProvider.logout()`. The `MoreScreen` calls `logout()` then `router.replace("/login")`. The hook point for async DB wipe is:

1. Navigate to login immediately (synchronous)
2. In background: call each slice's reset method + wipe SQLite tables

```typescript
// In AuthProvider.logout():
const logout = useCallback(async () => {
  await apiClientService.clearTokens();
  await persistUsername(null);
  setState((s: AuthState) => ({ ...s, username: null }));

  // NEW: background cleanup
  // Do NOT await — navigate first
  void (async () => {
    // Reset user-specific slices (not settings)
    useAppStore.getState().resetLibrary();
    useAppStore.getState().resetSeries();
    useAppStore.getState().resetAuthors();
    useAppStore.getState().resetItemDetails();
    useAppStore.getState().resetUserProfile();
    useAppStore.getState().resetHome();
    // DB wipe: clear media items, progress tables
    await wipeUserData(); // new helper in db/helpers
  })();
}, []);
```

### Anti-Patterns to Avoid

- **Creating a new slice for this phase:** All state has a natural home in existing slices. Adding a new slice adds coordination overhead.
- **Using Zustand `persist` middleware:** The existing `settingsSlice` does NOT use persist middleware — it uses explicit `appSettings.ts` helpers that wrap AsyncStorage. Follow this same pattern for `viewMode`. The CONTEXT.md says "backed by AsyncStorage via Zustand persist middleware" but the existing architecture uses a manual pattern. Use the manual pattern to match the codebase.
- **Batch-fetching ALL series progress at startup:** Only fetch progress when the user navigates to a specific series screen.
- **Replacing `getUserByUsername` calls in services (PlayerService, ProgressService, coordinator):** EFFECT-03 scope is components only. Services are Phase 12 (DECOMP-01/02) territory.

## Don't Hand-Roll

| Problem                            | Don't Build                 | Use Instead                                        | Why                                                              |
| ---------------------------------- | --------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Batch DB query for series progress | Custom SQL                  | Drizzle `inArray` operator in mediaProgress helper | Drizzle handles parameterization safely                          |
| viewMode persistence               | Custom AsyncStorage wrapper | Pattern from existing appSettings.ts helpers       | Already battle-tested with error handling                        |
| Synchronous app version            | useEffect + useState        | Module-scope const with `DeviceInfo.getVersion()`  | DeviceInfo uses `getSupportedPlatformInfoSync` — guaranteed sync |

**Key insight:** `getAllTags()` is already synchronous (reads from in-memory SQLite). `getVersion()` is already synchronous. The useEffect/useState wrappers around these calls are unnecessary defensive code.

## Common Pitfalls

### Pitfall 1: viewMode reset concern

**What goes wrong:** `settingsSlice.initializeSettings()` guards against re-initialization with `if (state.settings.initialized) return`. If `viewMode` is added to the settings init, users who already initialized settings will NOT get the new field populated.
**Why it happens:** Initialization guard runs before `viewMode` default is set.
**How to avoid:** Add `viewMode` to `DEFAULT_SETTINGS` constant with default `'list'`. The guard only prevents re-running the async load — the default is set synchronously in initial state. New field will be populated on next fresh init after update.
**Warning signs:** `viewMode` shows as `undefined` in components.

### Pitfall 2: userId unavailable at component render

**What goes wrong:** `userProfileSlice` initializes asynchronously. If a component reads `userId` from `useAuth()` before `initializeUserProfile` completes, it gets `null` and skips userId-dependent queries.
**Why it happens:** `StoreProvider` calls `useUserProfileStoreInitializer(username)` which guards with `!initialized`, but initialization is async.
**How to avoid:** Components that need `userId` should treat `null` as "loading" not "unauthenticated". The existing pattern in `LibraryItemDetail` already handles this: `fetchItemDetails(itemId, userId)` accepts `userId` as optional.
**Warning signs:** Progress never loads on first launch.

### Pitfall 3: seriesSlice progressMap stale across series navigations

**What goes wrong:** User views Series A, then navigates to Series B. If `progressMap` in the slice isn't keyed by series, it shows stale data.
**Why it happens:** One flat `progressMap` would cover all series and be populated by the most recent fetch.
**How to avoid:** Track `progressMapSeriesId` alongside `progressMap`. In `useFocusEffect`, always call `fetchSeriesProgress(seriesId, userId)` — this follows the "background refresh on every navigation" decision.
**Warning signs:** Wrong books show progress in a different series.

### Pitfall 4: Removing EFFECT-02 breaks progress display

**What goes wrong:** Removing the `progressService.fetchServerProgress()` call from `LibraryItemDetail`'s useEffect causes progress to be stale when opening an item directly.
**Why it happens:** EFFECT-02 says to remove the call because it's triggered by home screen focus and app foreground — but those triggers only fire on home screen, not detail screen directly.
**How to avoid:** Verify that the `AuthProvider` `AppState.addEventListener` for `"active"` fires `fetchServerProgress()` on any foreground. This is confirmed in `AuthProvider.tsx` line 99. Progress on detail screen is covered by foreground trigger. EFFECT-02 is safe to remove.
**Warning signs:** Progress appears correct on home but stale on item detail after backgrounding.

### Pitfall 5: `getAllTags()` called before logger DB is ready

**What goes wrong:** Moving `getAllTags()` into `loggerSlice.initialize()` runs it earlier in the app lifecycle.
**Why it happens:** `loggerSlice.initialize()` is called from StoreProvider, which runs before full app init completes.
**How to avoid:** `getAllTags()` reads from in-memory SQLite which is available as soon as DbProvider initializes. `loggerSlice` initialization already happens after `dbInitialized`. Safe.
**Warning signs:** Empty tags list in both screens.

### Pitfall 6: Token-expiry vs. logout slice reset confusion

**What goes wrong:** `apiClientService.subscribe()` fires when token expires. If this triggers slice resets, users lose cached library data on expiry.
**Why it happens:** Auth state change handler in `AuthProvider` doesn't distinguish expiry from explicit logout.
**How to avoid:** The subscription callback should NOT trigger slice resets. Only the explicit `logout()` function should reset user-specific slices. The subscription already sets `loginMessage: "Session expired"` — that's its only job.
**Warning signs:** User's library state disappears when token expires mid-session.

## Code Examples

### Batch progress query for STATE-02

```typescript
// New helper in src/db/helpers/mediaProgress.ts
// Source: drizzle-orm inArray operator — already used in libraryItems.ts
import { inArray } from "drizzle-orm";

export async function getMediaProgressForItems(
  libraryItemIds: string[],
  userId: string
): Promise<Record<string, MediaProgressRow>> {
  if (libraryItemIds.length === 0) return {};

  const results = await db
    .select()
    .from(mediaProgress)
    .where(
      and(eq(mediaProgress.userId, userId), inArray(mediaProgress.libraryItemId, libraryItemIds))
    )
    .orderBy(desc(mediaProgress.lastUpdate));

  // Deduplicate: keep most recent per libraryItemId
  const map: Record<string, MediaProgressRow> = {};
  for (const row of results) {
    if (!map[row.libraryItemId]) {
      map[row.libraryItemId] = row;
    }
  }
  return map;
}
```

### viewMode in appSettings.ts

```typescript
// Add to SETTINGS_KEYS:
viewMode: "@app/viewMode",

// Add getter:
export async function getViewMode(): Promise<'list' | 'grid'> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.viewMode);
    if (value === 'grid') return 'grid';
    return 'list';  // Default: list view
  } catch (error) {
    log.error('[AppSettings] Failed to get viewMode:', error);
    return 'list';
  }
}

// Add setter:
export async function setViewMode(mode: 'list' | 'grid'): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.viewMode, mode);
  } catch (error) {
    log.error('[AppSettings] Failed to set viewMode:', error);
    throw error;
  }
}
```

### userId in AuthProvider

```typescript
// In AuthProvider.tsx — add to AuthContextValue:
type AuthContextValue = {
  // existing fields...
  userId: string | null;
};

// In AuthProvider component:
const userId = useAppStore((state) => state.userProfile.user?.id ?? null);

// In value useMemo:
const value = useMemo<AuthContextValue>(
  () => ({
    // existing...
    userId,
  }),
  [, /* existing deps */ userId]
);

// Note: AuthProvider is inside StoreProvider's tree per _layout.tsx structure —
// WAIT: _layout.tsx shows AuthProvider WRAPS StoreProvider. userId from store
// won't be available via AuthProvider.
// Alternative: userId comes from userProfile.user stored during login.
// Store userId in AuthProvider local state during login, and load from
// userProfileSlice when initialized. See Open Questions section.
```

### Module-scope app version (EFFECT-05)

```typescript
// In src/app/(tabs)/more/index.tsx — at module scope:
import DeviceInfo from "react-native-device-info";

// Call synchronous APIs once at module load time
const APP_VERSION = `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`;

// Inside MoreScreen component — remove useState and useEffect entirely
// Replace all appVersion references with APP_VERSION
```

## State of the Art

| Old Approach                         | Current Approach                    | When Changed                       | Impact                                  |
| ------------------------------------ | ----------------------------------- | ---------------------------------- | --------------------------------------- |
| Per-component AsyncStorage reads     | settingsSlice with initialized flag | v1.1 (jump intervals, home layout) | Pattern is proven — extend it           |
| Per-component DB reads for user data | userProfileSlice.user               | v1.1                               | userId already stored, just not exposed |
| N+1 DB fetches for series progress   | (not yet centralized)               | Phase 11 target                    | Batch query replaces loop               |
| Per-component author DB lookup       | (not yet centralized)               | Phase 11 target                    | authorsSlice.getOrFetchAuthorById       |

## Open Questions

1. **userId routing through AuthProvider**
   - What we know: `AuthProvider` wraps `StoreProvider` in `_layout.tsx` (line 319). This means `AuthProvider` cannot read from the Zustand store via `useAppStore` hook — the store context is not available inside `AuthProvider`.
   - What's unclear: The cleanest way to expose `userId` from `useAuth()` given this provider ordering constraint.
   - Recommendation: Option A — Store `userId` directly in `AuthProvider` local state. It's populated during `login()` (the user ID is in the login response). It persists via the `userHelpers.upsertUser(user)` call. Add `userId` to `AuthState`, populate from `userHelpers.marshalUserFromAuthResponse(response).id`, and load on initialize from `getUserByUsername(username).id`. This keeps the data in one place and avoids any store dependency order issues.
   - Option B (if A is too invasive): Move `userId` to a new `useUserId()` hook that reads from `userProfileSlice` directly. Consumers call `useUserId()` instead of `useAuth()`. This requires updating more call sites.
   - **Planner should choose Option A for AUTH-03** unless there is a reason to prefer Option B.

2. **DB wipe on logout — which tables**
   - What we know: Decision is to wipe media items, progress, etc. on explicit logout, but keep preferences.
   - What's unclear: Exact table list for the wipe.
   - Recommendation: Wipe `media_progress`, `library_items`, `media_metadata`, `audio_files`, `chapters`, `authors`, `series`, `media_genres`, `media_tags`, `media_authors`, `media_series_join`. Keep `users` table (needed for re-login). Keep logger tables.

3. **loggerSlice actions namespace**
   - What we know: `loggerSlice` uses a nested namespace: `state.logger.updateErrorCounts()` (actions inside state object). This is different from other slices where actions are at the top level.
   - What's unclear: Whether `availableTags` and `refreshAvailableTags` should follow the nested pattern or the flat pattern.
   - Recommendation: Follow existing `loggerSlice` pattern — put both inside the `logger` namespace object.

## Validation Architecture

### Test Framework

| Property           | Value                                         |
| ------------------ | --------------------------------------------- | ----------- | ----------- | ------------ | ------------------------------------------- |
| Framework          | Jest + React Native Testing Library           |
| Config file        | jest.config.js (project root)                 |
| Quick run command  | `npm test -- --testPathPattern="settingsSlice | seriesSlice | loggerSlice | authorsSlice | libraryItemDetailsSlice" --passWithNoTests` |
| Full suite command | `npm test`                                    |

### Phase Requirements → Test Map

| Req ID    | Behavior                                                                                              | Test Type | Automated Command                                                        | File Exists?                                                      |
| --------- | ----------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| STATE-01  | viewMode defaults to 'list', persists via AsyncStorage                                                | unit      | `npm test -- --testPathPattern="settingsSlice" -t "viewMode"`            | ❌ Wave 0 (add to existing settingsSlice.test.ts)                 |
| STATE-02  | fetchSeriesProgress builds progressMap from single batch query                                        | unit      | `npm test -- --testPathPattern="seriesSlice" -t "fetchSeriesProgress"`   | ❌ Wave 0 (add to existing seriesSlice.test.ts)                   |
| STATE-03  | getOrFetchAuthorById returns cached author, falls back to DB                                          | unit      | `npm test -- --testPathPattern="authorsSlice" -t "getOrFetchAuthorById"` | ❌ Wave 0 (add to existing authorsSlice.test.ts)                  |
| EFFECT-01 | ConsolidatedPlayerControls reads intervals from useSettings, no AsyncStorage call                     | unit      | `npm test -- --testPathPattern="ConsolidatedPlayerControls"`             | ❌ Wave 0                                                         |
| EFFECT-02 | LibraryItemDetail does not call fetchServerProgress on mount                                          | unit      | `npm test -- --testPathPattern="LibraryItemDetail"`                      | ❌ Wave 0 (verify removal)                                        |
| EFFECT-03 | useAuth() returns userId from store                                                                   | unit      | `npm test -- --testPathPattern="AuthProvider"`                           | ❌ Wave 0                                                         |
| EFFECT-04 | CachedItemDetails includes authorId and seriesId after fetchItemDetails                               | unit      | `npm test -- --testPathPattern="libraryItemDetailsSlice"`                | ❌ Wave 0                                                         |
| EFFECT-05 | MoreScreen renders with APP_VERSION constant, no useEffect for version                                | unit      | manual review / no useEffect in component                                | manual-only                                                       |
| EFFECT-06 | loggerSlice.availableTags populated on initialize; shared between LogsScreen and LoggerSettingsScreen | unit      | `npm test -- --testPathPattern="loggerSlice"`                            | ❌ Wave 0 (add to existing loggerSlice tests if any, else create) |

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern="settingsSlice|seriesSlice|authorsSlice|libraryItemDetailsSlice|loggerSlice" --passWithNoTests`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] Add `viewMode` tests to `src/stores/slices/__tests__/settingsSlice.test.ts`
- [ ] Add `fetchSeriesProgress` tests to `src/stores/slices/__tests__/seriesSlice.test.ts`
- [ ] Add `getOrFetchAuthorById` tests to `src/stores/slices/__tests__/authorsSlice.test.ts`
- [ ] Add `libraryItemDetailsSlice` tests for authorId/seriesId fields: `src/stores/slices/__tests__/libraryItemDetailsSlice.test.ts`
- [ ] Add `loggerSlice` availableTags tests — currently no loggerSlice test file exists
- [ ] Add batch DB helper test: `src/db/helpers/__tests__/mediaProgress.test.ts` for `getMediaProgressForItems`

## Sources

### Primary (HIGH confidence)

- Direct codebase reading — all findings verified against actual source files
- `src/stores/slices/settingsSlice.ts` — viewMode integration point, existing pattern
- `src/stores/slices/seriesSlice.ts` — progressMap addition target
- `src/stores/slices/loggerSlice.ts` — availableTags addition target
- `src/stores/slices/libraryItemDetailsSlice.ts` — authorId/seriesId extension point
- `src/stores/slices/userProfileSlice.ts` — userId already stored as user.id
- `src/providers/AuthProvider.tsx` — userId exposure gap confirmed
- `src/providers/StoreProvider.tsx` — AuthProvider/StoreProvider ordering confirmed
- `src/app/(tabs)/library/index.tsx` — STATE-01 target confirmed
- `src/app/(tabs)/series/[seriesId]/index.tsx` — STATE-02 target confirmed
- `src/app/(tabs)/authors/[authorId]/index.tsx` — STATE-03 target confirmed
- `src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx` — EFFECT-01 target confirmed
- `src/components/library/LibraryItemDetail.tsx` — EFFECT-02, EFFECT-03, EFFECT-04 targets confirmed
- `src/app/(tabs)/more/index.tsx` — EFFECT-05 target confirmed, useEffect for version confirmed
- `src/app/(tabs)/more/logs.tsx` — EFFECT-06 target confirmed
- `src/app/(tabs)/more/logger-settings.tsx` — EFFECT-06 target confirmed
- `node_modules/react-native-device-info/src/index.ts` — `getVersion` and `getBuildNumber` confirmed synchronous (use `getSupportedPlatformInfoSync`)

### Secondary (MEDIUM confidence)

- Drizzle `inArray` operator — confirmed in existing codebase usage (libraryItems.ts pattern)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies, all patterns are existing code
- Architecture: HIGH — all targets read directly, patterns confirmed from existing slices
- Pitfalls: HIGH — derived from actual code inspection of provider ordering, initialization guards, and auth flow
- Open questions: MEDIUM — userId routing question based on confirmed provider ordering; solution is recommended but implementation choice is planner's

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable codebase, no external dependencies changing)
