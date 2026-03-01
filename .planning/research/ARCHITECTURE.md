# Architecture Patterns: v1.2 Tech Cleanup

**Domain:** React Native Expo audiobook app — coordinator-driven audio player, v1.2 upgrade & refactor milestone
**Researched:** 2026-02-28
**Confidence:** HIGH for codebase analysis; MEDIUM for Expo SDK 55 upgrade path; LOW for RNTP new-arch status (actively changing)

---

## Context

This document answers four integration questions for the v1.2 cleanup milestone, which focuses
on: (1) Expo SDK upgrade, (2) RN Downloader fork-to-mainline migration, (3) state centralization,
and (4) DB index additions. The existing architecture is:

- Coordinator FSM (`PlayerStateCoordinator`) — singleton, event-driven, async-lock serialized
- Zustand slice pattern — `playerSlice` is a read-only proxy of coordinator state via `syncStateToStore` / `syncPositionToStore`
- SQLite/Drizzle with helper pattern — all writes through `src/db/helpers/`
- Expo Router v6 — file-based routing in `src/app/`
- `@kesha-antonov/react-native-background-downloader` (custom fork on `spike-event-queue` branch)

---

## Question 1: Expo Upgrade — Break Risk Analysis

### What version is the app on now (verified, HIGH confidence)

From `package.json`:

- `expo`: `54.0.21`
- `expo-router`: `~6.0.14`
- `react-native`: `0.81.5`
- `react-native-track-player`: `^4.1.2`
- `expo-file-system`: `~19.0.17`
- `expo-sqlite`: `^16.0.8`

### SDK 55 critical blocker: New Architecture is mandatory (MEDIUM confidence)

**This is the primary upgrade risk.** Expo SDK 55 / React Native 0.83 drops the Old Architecture
entirely. The `newArchEnabled` flag is removed from `app.json`. Every native module in the app
must be New Architecture-compatible.

**react-native-track-player is the highest-risk dependency.** As of early 2026:

- Version 4.1.2 (current) does not have full TurboModule support
- Known crash: `Exception in HostObject::get for prop 'TrackPlayerModule': TurboModuleInteropUtils$ParsingException` on Android with New Architecture
- The issue is the module uses return types (`kotlinx.coroutines.Job`) incompatible with the TurboModule interop layer
- GitHub issues #2425, #2443, #2460, #2511 document this as unresolved as of February 2026

**Recommendation:** Check the RNTP changelog and issues immediately before attempting SDK 55. If
RNTP >= 4.2.0 with New Architecture support is not available, the Expo upgrade must be blocked on
a RNTP upgrade or a community patch. The coordinator FSM isolates all RNTP interaction in
`PlayerService.ts` — this is good, but it only reduces the blast radius; it does not eliminate the
dependency on RNTP being New-Architecture compatible.

### expo-file-system API rename (MEDIUM confidence)

The SDK 55 changelog documents a breaking rename:

- Old: import from `expo-file-system` (legacy API)
- New: the legacy API moves to `expo-file-system/legacy`; what was `expo-file-system/next` becomes the default `expo-file-system`

The app uses `expo-file-system` extensively in `src/lib/fileSystem.ts`. All import sites must be
audited and migrated to `expo-file-system/legacy` (to keep old API) OR migrated to the new API.
The new API is object-oriented (`File`, `Directory` classes vs flat function calls). Given the
number of call sites in `fileSystem.ts` and `DownloadService.ts`, the safest short-term path is
to rewrite imports to `expo-file-system/legacy` — this is a one-line change per file.

### expo-router v7 tab navigation changes (MEDIUM confidence)

The `(tabs)/_layout.tsx` already uses `expo-router/unstable-native-tabs` (`NativeTabs`, `Icon`,
`Label`) which is promoted to stable in Expo Router v7 as a new Native Tabs API. Key changes:

- `tabBarOptions` prop removed — replaced with individual screen options. The current code
  uses `Tabs.Screen` with `options.tabBarBadge`, `options.tabBarIcon`, `options.href` etc.
  These individual option props survive; the removed `tabBarOptions` wrapping object does not
  apply here.
- `NativeTabs.Trigger` pattern (which this app already uses) is the v7 stable pattern. No change
  needed.
- `navigate()` behavior changes in React Navigation v7 (which backs Expo Router v7): it now acts
  like `push` instead of returning to existing screen. The app uses `router.replace` for auth
  redirects (correct) and `router.push` for tab navigation from More screen. Verify these still
  work correctly after upgrade.
- The default template moves routes to `/src/app` — this app already has `src/app/`, so this is
  not a migration concern.

### Other Expo package version bumps (MEDIUM confidence)

SDK 55 aligns all Expo SDK package versions to match the SDK major version (e.g., `expo-camera`
becomes `^55.0.0`). Run `npx expo install --fix` after bumping `expo` to auto-correct peer
dependencies. The most volatile Expo packages for this app:

| Package              | Risk   | Reason                                                                 |
| -------------------- | ------ | ---------------------------------------------------------------------- |
| `expo-sqlite`        | LOW    | No documented breaking changes in SDK 55; localStorage API is additive |
| `expo-file-system`   | HIGH   | API rename (see above)                                                 |
| `expo-secure-store`  | LOW    | Stable API                                                             |
| `expo-splash-screen` | MEDIUM | Often has breaking changes between SDKs                                |
| `expo-router`        | MEDIUM | v6 → v7 navigation behavior changes                                    |
| `expo-dev-client`    | LOW    | Build tool, not runtime                                                |

### How Expo Router file-based routing affects upgrade risk (HIGH confidence)

The route file structure is isolated from the SDK version. Expo Router's file-based routing
discovers routes from the filesystem — adding an SDK major does not change which files exist.
The risk is not structural but behavioral: how navigation events and the `useRouter()` hook
behave in v7.

The app's use of `router.replace("/login")` for auth redirects and `router.push(...)` for
deep link navigation is the standard pattern. However, verify `router.replace` still suppresses
back-navigation to the login screen after authentication — this was a v1.1 bug fix and the
new Architecture / v7 navigation stack behavior may interact with it differently.

### Build order recommendation for Expo upgrade

1. First: enable New Architecture on SDK 54 — confirm RNTP works before changing SDK version
2. Second: bump to SDK 55 with New Architecture already enabled — isolate issues
3. Migrate `expo-file-system` imports to `expo-file-system/legacy` immediately after bump
4. Run `npx expo install --fix` to align package versions
5. Test on physical device, not simulator — New Architecture issues are more pronounced on device

---

## Question 2: RN Downloader Fork-to-Mainline Migration

### Current fork state (verified, HIGH confidence)

The app depends on: `github:clayreimann/react-native-background-downloader#spike-event-queue`

This is a personal fork of `@kesha-antonov/react-native-background-downloader` on a
`spike-event-queue` branch. The fork likely adds event queue behavior that differs from the
mainline.

### What DownloadService.ts actually uses from the library (verified, HIGH confidence)

From direct analysis of `src/services/DownloadService.ts`:

```
Import surface:
  RNBackgroundDownloader (default export)
  DownloadTask (type)

API methods called:
  RNBackgroundDownloader.setConfig({ progressInterval, isLogsEnabled })
  RNBackgroundDownloader.checkForExistingDownloads()   → DownloadTask[]
  RNBackgroundDownloader.download({ id, url, destination, headers, metadata })
    .begin(data => ...)
    .progress(data => ...)        data: { bytesDownloaded, bytesTotal }
    .done(data => ...)            data: { bytesDownloaded, bytesTotal }
    .error(data => ...)

DownloadTask instance methods:
  task.pause()
  task.resume()
  task.stop()
  task.state                      string: "DONE" | other
  task.metadata                   { libraryItemId, audioFileId, filename }
```

This is the complete API surface that must be verified against mainline before migration.

### Migration approach

Mainline `@kesha-antonov/react-native-background-downloader` (latest: 4.5.2 as of early 2026):

**Step 1: API diff.** Verify the above API surface exists identically in mainline. The `.begin`,
`.progress`, `.done`, `.error` chaining pattern and `checkForExistingDownloads` are core features
that have been stable. The `setConfig` call (`progressInterval`, `isLogsEnabled`) may differ in
parameter names — check the mainline README before migrating.

**Step 2: Identify what the `spike-event-queue` branch adds.** The branch name suggests the fork
adds event queue behavior. This likely affects how `.progress` / `.done` callbacks are delivered.
The mainline may batch or throttle differently. The `DownloadService.ts` already implements its own
debouncing via `setTimeout` on the `speedTracker` — this is the `progressDebounceMs` config. If
the fork was suppressing rapid-fire events that the mainline does not suppress, the custom debounce
in `DownloadService.ts` may need tuning.

**Step 3: Test the reconciliation path.** `restoreExistingDownloads()` relies on
`task.metadata` containing `{ libraryItemId, audioFileId, filename }`. Verify mainline supports
custom metadata objects on tasks. This is a critical path — if mainline doesn't preserve metadata
across app restarts, download recovery breaks entirely.

### Regression risks for existing download reconciliation logic (HIGH confidence)

The three highest-risk behaviors after mainline migration:

1. **`checkForExistingDownloads()` + `task.metadata`** — the reconciliation in
   `restoreExistingDownloads()` depends on `task.metadata.libraryItemId` surviving an app
   restart. If mainline serializes metadata differently, all resumed downloads will fail to
   attach to the correct library item.

2. **Progress callback frequency** — `handleTaskProgress()` runs a DB query
   (`getAudioFilesWithDownloadInfo`) on every progress callback to calculate accurate totals.
   If mainline fires progress more frequently than the fork, this could cause excessive DB
   reads during active downloads. The `progressInterval` config controls this; ensure it is
   still honored in mainline.

3. **`task.state === "DONE"` check** — `handleTaskCompletion()` uses `task.state` to determine
   if all tasks are complete. Verify the state string values match mainline.

### Component boundaries unchanged by migration

The migration is entirely contained within the `DownloadService` class — it is the only file that
imports from the downloader library. No coordinator events, no Zustand state, no other services
touch the downloader directly. The Zustand `downloadSlice` interacts with `DownloadService` only
through the `startDownload`, `deleteDownload`, and `isLibraryItemDownloaded` methods.

---

## Question 3: State Centralization — Coordinator/Zustand Boundary

### Current boundary (verified, HIGH confidence)

The existing architecture has a well-defined boundary:

**Coordinator-owned state** (lives in `StateContext`, synced to Zustand via bridge):

- `currentState` (FSM state: IDLE, LOADING, PLAYING, PAUSED, SEEKING, etc.)
- `position`, `duration` — playback position
- `isPlaying`, `isBuffering`, `isSeeking`, `isLoadingTrack`
- `playbackRate`, `volume`
- `sessionId`, `sessionStartTime`
- `currentTrack` (exception: coordinator sets on STOP only; PlayerService sets on load)
- `currentChapter` (coordinator context; derived in Zustand via `_updateCurrentChapter`)

**Zustand-only state** (never in coordinator, never synced):

- `isModalVisible` — UI-only, no coordinator event for it
- `sleepTimer` — explicitly excluded from coordinator (`PROP-04 exception`)
- `lastPauseTime` — service-ephemeral, not persisted through coordinator
- `initialized` — lifecycle flag
- All download state (`downloadSlice`)
- All library/content state (`librarySlice`, `homeSlice`, etc.)

**Component-local state** (current `useState` usage):

- `FullScreenPlayer`: `isSeekingSlider`, `sliderValue`, `showChapterList`, `isCreatingBookmark`
- `library/index.tsx`: `viewMode`, `searchQuery`
- `series/index.tsx`: `showSortMenu`
- `authors/index.tsx`: `showSortMenu`
- `home/index.tsx`: `isRefreshing`, `skeletonSectionCount`, `emptyConfirmed`
- `SleepTimerControl`: `remainingTime`
- Login: `didPing`, `baseUrl`, `username`, `password`, `submitting`, `error`

### What should move to Zustand vs stay local (HIGH confidence)

**Candidates for centralization (worth moving to Zustand):**

1. **`viewMode` in `library/index.tsx`** — user preference that should survive navigation. If
   the user sets list view and navigates away, they expect list view when they return. This maps
   to `settingsSlice` (persisted via `appSettings` helpers). LOW coordinator risk — no playback
   relationship.

2. **`searchQuery` in `library/index.tsx`** — borderline. If search should persist across
   navigation (debatable UX), move to a `librarySlice` field. If it should reset on navigate,
   keep as `useState`. Recommend keeping local unless explicitly requested.

3. **`isRefreshing` in `home/index.tsx`** — pure UI loading state driven by an API call. Keep
   local — does not need to survive navigation or be shared across components.

**Must stay local (not appropriate for Zustand):**

1. **`isSeekingSlider` / `sliderValue` in FullScreenPlayer** — these represent the slider drag
   state, which must be decoupled from the coordinator's seek state. The slider is intentionally
   locally controlled during drag; the coordinator's position is only applied on drag release.
   Moving these to Zustand would require a new slice action and would add latency to slider
   interaction. Keep as `useState`.

2. **`showChapterList`, `showSortMenu`** — transient UI modal/panel state. No reason to
   persist these or share them. Keep as `useState`.

3. **`remainingTime` in `SleepTimerControl`** — the `sleepTimer` end time is already in Zustand.
   `remainingTime` is computed locally from that value via `setInterval`. This is the correct
   pattern — computed state belongs in the component.

4. **Login form state** (`baseUrl`, `username`, `password`, etc.) — form state never belongs in
   Zustand. Keep local.

### How centralization interacts with the coordinator (HIGH confidence)

The key invariant of the existing architecture is: **nothing bypasses the coordinator for
playback state changes.** State centralization for _non-playback_ state does not threaten this.

The risk is in the `playerSlice` boundary. The `playerSlice` defines `setModalVisible` as the
only direct UI-action mutator. All other `playerSlice` actions are `_`-prefixed internal
mutators called by the coordinator bridge. This design is correct and should not change.

If any state centralization work touches `playerSlice`, the rule is:

- Read: `useAppStore(state => state.player.X)` — always safe
- Write via coordinator event: `dispatchPlayerEvent(...)` — always safe for playback state
- Write via `_`-prefixed mutator: only from coordinator bridge (`syncStateToStore` / `syncPositionToStore`) — never from components
- Write via public action (`setModalVisible`, `setSleepTimer`): only for pure UI state that has no coordinator equivalent

### Recommended centralization target for v1.2

**Move `viewMode` preference to `settingsSlice`.** This is the highest-value, lowest-risk
centralization. Pattern:

1. Add `libraryViewMode: 'grid' | 'list'` to `settingsSlice` state
2. Add `setLibraryViewMode` action that calls the `appSettings` persistence helper
3. In `library/index.tsx`, replace `useState('grid')` with `useAppStore(s => s.settings.libraryViewMode)`
4. No coordinator changes required

**Keep everything else local for v1.2.** The payoff of centralizing `searchQuery`,
`isRefreshing`, etc., is low and the complexity is not worth it in a cleanup milestone.

---

## Question 4: DB/SQL Index Additions — Safe Migration Path

### How Drizzle migrations work for this app (verified, HIGH confidence)

From `drizzle.config.ts`:

- Schema: `./src/db/schema`
- Out: `./src/db/migrations`
- Dialect: `sqlite`
- Driver: `expo` (uses `expo-sqlite`)

Migrations are applied via the `expo-drizzle-studio-plugin` and the `DbProvider`
(`src/providers/DbProvider`). The migration runner applies all pending migrations from
`src/db/migrations/migrations.js` (the auto-generated manifest) in sequence at app startup.

### How to add indexes in Drizzle schema (verified, HIGH confidence)

Indexes are defined in the second parameter callback of `sqliteTable`. The `index` function
is imported from `drizzle-orm/sqlite-core`:

```typescript
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const localListeningSessions = sqliteTable(
  "local_listening_sessions",
  {
    // ... columns ...
  },
  (table) => ({
    userIdIdx: index("local_listening_sessions_user_id_idx").on(table.userId),
    libraryItemIdIdx: index("local_listening_sessions_library_item_id_idx").on(table.libraryItemId),
  })
);
```

After modifying the schema, run `npm run drizzle:generate` to produce a new migration SQL file.

### What the generated migration SQL looks like

For an index addition, Drizzle generates:

```sql
CREATE INDEX `local_listening_sessions_user_id_idx`
  ON `local_listening_sessions` (`user_id`);
```

`CREATE INDEX` in SQLite does NOT lock the table or block reads. It is effectively instantaneous
on the table sizes this app manages (hundreds to low thousands of rows). It is safe to run at app
startup.

### Safe migration path for production SQLite (HIGH confidence)

SQLite's `CREATE INDEX` is unconditionally safe on existing data:

- Non-destructive — never modifies existing rows
- Idempotent if wrapped in `IF NOT EXISTS` (Drizzle handles this)
- Does not require a table rebuild (unlike `ALTER TABLE ... ADD COLUMN NOT NULL`)
- Transactional — if the migration fails, it rolls back cleanly

The Drizzle migration runner applies migrations inside a transaction. If a migration fails
mid-way, the database remains at the prior version. This is safe.

### Candidate tables for indexes

Based on common query patterns visible in `src/db/helpers/`:

| Table                        | Column                    | Query Pattern                             | Why                                                |
| ---------------------------- | ------------------------- | ----------------------------------------- | -------------------------------------------------- |
| `local_listening_sessions`   | `userId`, `libraryItemId` | `getActiveSession(userId, libraryItemId)` | Called on every resume                             |
| `media_progress`             | `libraryItemId`, `userId` | `getMediaProgressForLibraryItem`          | Called on resume and in `resolveCanonicalPosition` |
| `local_audio_file_downloads` | `audioFileId`             | lookup during reconciliation scan         | Called for every audio file on startup             |
| `audio_files`                | `mediaId`                 | `getAudioFilesWithDownloadInfo`           | Called during download start, reconciliation       |
| `library_items`              | `serverId`                | library sync upserts                      | Called during full library refresh                 |

### Anti-pattern to avoid: composite indexes before profiling

Do not add composite indexes speculatively. Add single-column indexes on the FK columns most
used in WHERE clauses. Composite indexes help only when all columns appear in the same WHERE
clause. The query patterns in this app are simple FK lookups, so single-column indexes are correct.

---

## Component Boundaries for v1.2

### New vs Modified Components

| Component                                            | Status      | What Changes                                                       |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `src/db/schema/*.ts`                                 | MODIFIED    | Add index definitions to relevant tables                           |
| `src/db/migrations/00XX_*.sql`                       | NEW         | Generated by `drizzle:generate`                                    |
| `src/stores/slices/settingsSlice.ts`                 | MODIFIED    | Add `libraryViewMode` field + action                               |
| `src/app/(tabs)/library/index.tsx`                   | MODIFIED    | Replace `useState('grid')` with store selector                     |
| `src/services/DownloadService.ts`                    | MODIFIED    | Swap import from fork to mainline, verify API                      |
| `package.json`                                       | MODIFIED    | Bump expo, react-native, all expo-\* packages; swap downloader dep |
| `app.json`                                           | MODIFIED    | Remove `newArchEnabled` (no longer valid in SDK 55)                |
| `src/lib/fileSystem.ts`                              | MODIFIED    | Update expo-file-system imports                                    |
| `src/services/coordinator/PlayerStateCoordinator.ts` | NO CHANGE   | Isolated from all four tasks                                       |
| `src/stores/slices/playerSlice.ts`                   | NO CHANGE   | Boundary correctly defined                                         |
| `src/app/(tabs)/_layout.tsx`                         | VERIFY ONLY | Test nav behavior after router upgrade                             |

### What the Coordinator Does Not Touch (HIGH confidence)

The coordinator FSM is isolated from all four v1.2 tasks:

- Expo upgrade: coordinator uses `async-lock`, `eventemitter3`, RNTP — none of these are Expo SDK packages
- Downloader migration: coordinator has zero dependency on the download library
- State centralization: target state is in `settingsSlice`, not `playerSlice`
- DB indexes: schema changes; coordinator only reads position data, does not own DB queries

The `syncStateToStore` / `syncPositionToStore` bridge paths remain unchanged.

---

## Data Flow: Upgrade Impact Zones

```
Expo SDK Upgrade Impact:
  expo-file-system API rename
      ↓ affects
  src/lib/fileSystem.ts         (all file path utilities)
  src/services/DownloadService.ts  (download path construction, existence checks)
  src/services/PlayerService.ts    (cover URI, local file URIs)

  react-native-track-player new-arch compatibility
      ↓ affects
  src/services/PlayerService.ts    (all TrackPlayer.* calls)
  src/services/PlayerBackgroundService.ts  (event handlers)
  [coordinator is NOT in this blast radius — it calls PlayerService, not TrackPlayer directly]

  expo-router v7 navigation changes
      ↓ affects
  src/app/_layout.tsx          (auth redirect: router.replace)
  src/app/(tabs)/_layout.tsx   (tab routing, NativeTabs)
  src/app/(tabs)/more/index.tsx  (hidden tab navigation)
```

```
Downloader Migration Impact:
  @kesha-antonov/react-native-background-downloader (mainline)
      ↓ only affects
  src/services/DownloadService.ts  (entire import surface)
  [no coordinator, no Zustand, no other services]
```

```
State Centralization Impact:
  settingsSlice (add libraryViewMode)
      ↓ affects
  src/stores/slices/settingsSlice.ts
  src/app/(tabs)/library/index.tsx  (reads new field)
  [appSettings persistence helpers for write]
```

```
DB Index Impact:
  Schema additions
      ↓ affects
  src/db/schema/*.ts             (index definitions)
  src/db/migrations/00XX.sql     (generated migration)
  DbProvider on app startup      (applies migration)
  [all query performance improves transparently — no app code changes]
```

---

## Build Order Recommendation

**Phase ordering respects dependencies and isolates risk:**

**Step 1: DB indexes** (zero coordinator risk, zero UI risk, simplest)

- Modify schema files with `index()` definitions
- Run `npm run drizzle:generate`
- Test migration applies cleanly on a fresh install and on upgrade

**Step 2: State centralization** (low risk, isolated to library screen and settings)

- Add `libraryViewMode` to `settingsSlice`
- Update `library/index.tsx`
- Add persistence via `appSettings` helper
- No coordinator or player changes

**Step 3: Downloader migration** (medium risk, confined to DownloadService)

- Diff fork API vs mainline API
- Swap `package.json` dependency
- Verify `task.metadata`, `.begin`, `.progress`, `.done`, `.error`, `.state`, `setConfig`, `checkForExistingDownloads`
- Test download start, progress, completion, pause/resume, app-kill recovery

**Step 4: Expo upgrade** (highest risk, do last)

- Enable New Architecture on SDK 54 first — confirm RNTP works
- Verify RNTP >= 4.2.0 (or a patched version) is available with New Architecture support before proceeding
- Bump expo to 55.x
- Migrate expo-file-system imports to `expo-file-system/legacy`
- Run `npx expo install --fix`
- Test on physical device (both iOS and Android)
- Verify auth redirect behavior in Expo Router v7

**The Expo upgrade must be the last step** because it has the most unknowns (RNTP new-arch
status, file-system API changes) and if it reveals a hard blocker (RNTP incompatible), the other
three tasks still ship independently.

---

## Anti-Patterns to Avoid in v1.2

### Do not bypass the coordinator for any player state

State centralization work must not introduce new writes to `playerSlice` from components. The
only acceptable write path for player state is via `dispatchPlayerEvent`. Do not add direct
`store._setPlaying()` or similar calls from UI components as "convenience shortcuts."

### Do not merge Expo upgrade with New Architecture enablement simultaneously

The Expo docs explicitly warn: adopt New Architecture on SDK 54, then upgrade SDK. Running both
changes simultaneously makes it impossible to isolate bugs. RNTP's New Architecture issues will
appear regardless of SDK version if New Architecture is enabled — so find them on SDK 54 first.

### Do not use expo-file-system/next API patterns before SDK 55 ships

The API that is default in SDK 55 was `expo-file-system/next` in SDK 54. If you migrate to the
new API patterns before upgrading, you will be on the non-default experimental path on SDK 54.
Migrate to `expo-file-system/legacy` first (zero-risk, preserve existing behavior), then evaluate
the new object-oriented API as a separate follow-up task.

### Do not add composite indexes speculatively

`CREATE INDEX` is fast and safe, but the wrong index (e.g., on a low-cardinality boolean column)
can actively slow down queries. Index only the FK and filter columns identified from actual query
patterns in `src/db/helpers/`.

### Do not write download progress to Zustand

The `downloadSlice` owns completed/active tracking (Set membership), not live progress. Live
progress is delivered via callbacks. Adding `DownloadProgress` objects to Zustand state creates
a second source of truth and adds unnecessary render churn (progress updates are ~1Hz per file,
which would cause constant Zustand re-renders).

---

## Confidence Assessment

| Area                          | Confidence | Reason                                                           |
| ----------------------------- | ---------- | ---------------------------------------------------------------- |
| Expo upgrade risk             | MEDIUM     | SDK 55 documented; RNTP new-arch status is actively changing     |
| RNTP new-arch status          | LOW        | Multiple open issues as of Feb 2026; rapidly evolving            |
| expo-file-system rename       | HIGH       | Documented in SDK 55 changelog                                   |
| Downloader migration approach | MEDIUM     | API surface verified from code; mainline behavior unverified     |
| State centralization boundary | HIGH       | Direct codebase analysis, coordinator boundary well-defined      |
| DB index migration safety     | HIGH       | SQLite semantics; Drizzle migration runner verified              |
| Build order                   | HIGH       | Dependency chain is clear; Expo upgrade is the correct last step |

---

## Sources

**Codebase analysis (HIGH confidence):**

- `src/services/coordinator/PlayerStateCoordinator.ts` — coordinator state and bridge
- `src/stores/slices/playerSlice.ts` — Zustand boundary, public vs internal mutators
- `src/services/DownloadService.ts` — complete downloader API surface
- `src/stores/slices/downloadSlice.ts` — Zustand download state boundary
- `src/db/schema/*.ts` — current index absence in schemas
- `src/app/(tabs)/_layout.tsx` — NativeTabs usage, routing
- `src/app/_layout.tsx` — root layout, file-system usage
- `package.json` — all current dependency versions, fork reference
- `drizzle.config.ts` — migration configuration

**External sources (MEDIUM confidence):**

- [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55) — New Architecture mandatory, expo-file-system rename
- [How to upgrade to Expo SDK 55](https://expo.dev/blog/upgrading-to-sdk-55) — step-by-step guidance
- [RNTP New Architecture issue #2443](https://github.com/doublesymmetry/react-native-track-player/issues/2443) — compatibility status
- [RNTP issue #2460](https://github.com/doublesymmetry/react-native-track-player/issues/2460) — TurboModule parsing error
- [Expo Router v6 native tabs blog](https://expo.dev/blog/expo-router-v6) — NativeTabs stable API
- [Drizzle ORM Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) — index definition syntax
- [SQLite CREATE INDEX documentation](https://sqlite.org/lang_createindex.html) — safety guarantees
- [@kesha-antonov/react-native-background-downloader npm](https://www.npmjs.com/package/@kesha-antonov/react-native-background-downloader) — latest version 4.5.2
