# Architecture Research

**Domain:** Expo/React Native audiobook client — v1.3 Beta Polish integration
**Researched:** 2026-03-09
**Confidence:** HIGH (derived from direct codebase inspection)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  UI Layer  (src/app/, src/components/)                          │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │FullScreenPlayer│ │ FloatingPlayer│  │ ItemDetails / Library │  │
│  └──────┬───────┘  └───────┬───────┘  └──────────┬───────────┘  │
│         │                  │                      │              │
├─────────┴──────────────────┴──────────────────────┴─────────────┤
│  State Layer  (src/stores/)                                     │
│  ┌──────────┐ ┌────────────┐ ┌───────────────┐ ┌─────────────┐  │
│  │playerSlice│ │settingsSlice│ │userProfileSlice│ │librarySlice │  │
│  │(read-only)│ │(preferences)│ │(bookmarks)    │ │             │  │
│  └────┬─────┘ └──────┬─────┘ └───────┬────────┘ └──────┬──────┘  │
│       │              │               │                  │         │
├───────┴──────────────┴───────────────┴──────────────────┴────────┤
│  Service Layer  (src/services/)                                  │
│  ┌──────────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  PlayerStateCoordinator│ │ProgressService │  │DownloadService│  │
│  │  (owns player state) │  │ (facade+collabs│  │(facade+collab)│  │
│  │  ┌────────────────┐  │  └────────────────┘  └──────────────┘  │
│  │  │  eventBus.ts   │  │  ┌────────────────┐                    │
│  │  │  (leaf node)   │  │  │SleepTimerService│  (NEW in v1.3)    │
│  │  └────────────────┘  │  └────────────────┘                    │
│  │  PlayerService(facade)│                                        │
│  │  + 4 collaborators   │                                         │
│  └──────────────────────┘                                         │
├──────────────────────────────────────────────────────────────────┤
│  Data Layer  (src/db/, src/lib/)                                 │
│  ┌────────────────────────┐  ┌──────────────────────────────────┐ │
│  │  Drizzle/SQLite helpers│  │  API client (endpoints.ts)       │ │
│  │  per-entity helper files│  │  ApiClientService                │ │
│  └────────────────────────┘  └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                | Responsibility                                                                                        | Notes                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `PlayerStateCoordinator` | Canonical owner of all playback state; drives `PlayerService` via `executeTransition`                 | Serial event queue via `async-lock`; `eventBus.ts` is the decoupling point           |
| `PlayerService` (facade) | Public API for UI; delegates to 4 collaborators                                                       | Dynamic `require()` of coordinator avoids circular import                            |
| `playerSlice`            | Read-only Zustand proxy of coordinator context; synced via `syncStateToStore` / `syncPositionToStore` | Two-tier sync prevents 1Hz selector storms                                           |
| `settingsSlice`          | User preferences persisted to `appSettings`; loaded once at startup                                   | Pattern: add field + getter/setter in `appSettings.ts`, load in `initializeSettings` |
| `userProfileSlice`       | User record, server info, bookmarks array in memory                                                   | Bookmarks partially wired; API endpoints and slice state already exist               |
| `ProgressService`        | Session tracking + server sync for downloaded media                                                   | Currently a monolith; v1.3 decomposes it (same pattern as PlayerService)             |
| `eventBus.ts`            | Leaf-node event dispatch; safe to import from anywhere                                                | Never import coordinator or services from here                                       |

---

## New vs. Modified Components by Feature

### Feature 1: AirPlay Route Picker (PLAYER-04, PLAYER-05, PLAYER-06)

**New components:**

- `src/components/player/AirPlayButton.tsx` — wraps `AVRoutePickerView`; renders as a tappable button that presents the system AirPlay picker sheet

**Modified components:**

- `src/app/FullScreenPlayer/index.tsx` — add `<AirPlayButton>` to header; the existing `Stack.Screen options` currently render only a "Done" button — this becomes the chevron dismiss + settings UIMenu + AirPlay button row
- `src/components/ui/FloatingPlayer.tsx` — add `<AirPlayButton>` at trailing edge after `PlayPauseButton`
- Item details screen player controls — add `<AirPlayButton>`

**Integration notes:**

AirPlay on iOS requires `AVRoutePickerView`, a native UIKit component; no pure-JS implementation exists. Two approaches:

- `react-native-airplay-btn` (npm) wraps `AVRoutePickerView` — check maintenance status before adopting
- Custom Expo module via JSI — more control, no external dep

No coordinator changes needed. AirPlay routing is handled entirely by iOS audio session. TrackPlayer respects it automatically once the audio session category is set correctly (already done in `configureTrackPlayer`).

---

### Feature 2: Bookmarks (BOOKMARK-01 through BOOKMARK-06)

**Current state (verified):**

- `createBookmark` and `deleteBookmark` API endpoints exist in `endpoints.ts`
- `ApiAudioBookmark` type exists in `types/api.ts` with `id`, `libraryItemId`, `title`, `time`, `createdAt`
- `userProfileSlice` has `bookmarks: ApiAudioBookmark[]` in state and `createBookmark`, `deleteBookmark`, `refreshBookmarks`, `getItemBookmarks` actions already defined (calling the API endpoints)
- `FullScreenPlayer` already calls `useUserProfile().createBookmark()`

**What is missing for BOOKMARK-01 through BOOKMARK-06:**

- `src/db/schema/bookmarks.ts` — local SQLite table (BOOKMARK-06 offline reading)
- `src/db/helpers/bookmarks.ts` — `upsertBookmark()`, `getBookmarksForItem()`, `deleteBookmark()`, `marshalBookmarkFromApi()` per the existing helper pattern
- Generated migration via `npm run drizzle:generate`
- `userProfileSlice` — wire `refreshBookmarks` to write/read DB helpers (currently in-memory only from API)
- Bookmark list UI on item detail screen (BOOKMARK-02)
- Rename/edit bookmark UI requires `PUT /api/me/item/:id/bookmark/:bookmarkId` — not yet in `endpoints.ts` (BOOKMARK-03)
- `src/db/schema/index.ts` — re-export the new bookmarks table

**Schema shape for `bookmarks` table:**

```typescript
export const bookmarks = sqliteTable("bookmarks", {
  id: text("id").primaryKey(), // server-assigned ID
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  libraryItemId: text("library_item_id").notNull(),
  title: text("title").notNull(),
  time: real("time").notNull(), // position in seconds
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
// Index on (userId, libraryItemId) for per-item query pattern
```

**New file list for bookmarks:**

| File                                    | Type     | Purpose                                        |
| --------------------------------------- | -------- | ---------------------------------------------- |
| `src/db/schema/bookmarks.ts`            | NEW      | SQLite table definition                        |
| `src/db/helpers/bookmarks.ts`           | NEW      | DB helpers per entity pattern                  |
| `src/db/schema/index.ts`                | MODIFIED | Re-export bookmarks table                      |
| `src/stores/slices/userProfileSlice.ts` | MODIFIED | Wire DB helpers into bookmark actions          |
| `src/lib/api/endpoints.ts`              | MODIFIED | Add `updateBookmark` endpoint for rename       |
| `src/types/api.ts`                      | MODIFIED | Add `ApiUpdateBookmark` request type if needed |
| Item detail screen                      | MODIFIED | Show bookmark list per item                    |

---

### Feature 3: Progress Display Format (PROGRESS-01 through PROGRESS-04)

**Modified components:**

- `src/stores/slices/settingsSlice.ts` — add `progressDisplayFormat: "timeRemaining" | "percentComplete" | "elapsedTotal"` field following the existing pattern (`updateXxx` action + persistence)
- `src/lib/appSettings.ts` — add getter/setter for the new preference
- `src/app/FullScreenPlayer/index.tsx` — read `progressDisplayFormat` from `useSettings()`; replace hardcoded `"X remaining"` text with computed display based on format
- `src/components/ui/FloatingPlayer.tsx` — add progress display area reading from the same setting
- Item details player controls — same pattern
- Settings screen — add picker for the 3 format options

**No service or coordinator changes.** This is a pure UI preference read from `settingsSlice`. Position data already flows from coordinator → playerSlice on every `NATIVE_PROGRESS_UPDATED` tick.

---

### Feature 4: Collapsible Section Redesign (SECTION-01 through SECTION-03)

**Modified components:**

- Existing collapsible section component — needs:
  - Reanimated `useAnimatedStyle` + `withTiming` for height animation (UI-thread, not JS-thread)
  - A `peekHeight` (~100px) for collapsed state
  - A bottom fade overlay (absolute-positioned `LinearGradient` or equivalent) that appears when collapsed and disappears when expanded
  - `onLayout` to capture expanded height; animate between `peekHeight` and `expandedHeight`

**Important:** The existing `FullScreenPlayer` already uses `Animated.timing` with `useNativeDriver: false` for the chapter list panel. PERF-11 requires migrating this to Reanimated `useAnimatedStyle`. Both SECTION-02 and PERF-11 converge on the same migration.

**No store or service changes.** Pure component refactor.

---

### Feature 5: Sleep Timer Volume Fade (SLEEP-01)

**Current state (verified):**

- `playerSlice` has `sleepTimer` state (`endTime`, `type`, `chapterTarget`)
- `sleepTimer` is explicitly excluded from coordinator context (`PROP-04` exception — confirmed in `syncStateToStore` comment)
- Coordinator already handles `SET_VOLUME` events and calls `playerService.executeSetVolume()` which calls `TrackPlayer.setVolume()`
- `StateContext.volume` is tracked in coordinator; `SET_VOLUME` event type exists in `coordinator.ts`

**Why the fade must NOT live in the coordinator:**

The coordinator does not own sleep timer state and the `PROP-04` exception explicitly preserves that separation. Adding sleep timer awareness to the coordinator would contradict a documented architectural decision.

**Why a standalone `SleepTimerService` is correct (not a `useEffect` in `SleepTimerControl`):**

The volume fade must survive screen unmount. `SleepTimerControl` lives inside `FullScreenPlayer`, which can be dismissed. A `useEffect`-based interval would stop when the screen unmounts. A service singleton runs for the app lifetime.

**Implementation:**

```
src/services/SleepTimerService.ts  (NEW singleton)
  - start(): begins 1s poll interval
  - stop(): clears interval
  - poll():
      remaining = getSleepTimerRemaining() from Zustand
      if remaining === null: noop
      if remaining <= 30:
          volume = Math.max(0, remaining / 30)
          dispatchPlayerEvent({ type: "SET_VOLUME", payload: { volume } })
      if remaining <= 0:
          dispatchPlayerEvent({ type: "PAUSE" })
          cancelSleepTimer()
```

The `SleepTimerService` is wired into `initializeApp()` in `src/app/_layout.tsx` (or wherever app initialization runs). It reads Zustand state via `useAppStore.getState()` (outside React — safe via Zustand's store reference).

**New/modified files:**

| File                                                 | Action    | Change                                                |
| ---------------------------------------------------- | --------- | ----------------------------------------------------- |
| `src/services/SleepTimerService.ts`                  | NEW       | Singleton; polls sleep timer; dispatches `SET_VOLUME` |
| `src/app/_layout.tsx`                                | MODIFIED  | Start `sleepTimerService` in `initializeApp()`        |
| `src/types/coordinator.ts`                           | NO CHANGE | `SET_VOLUME` event already exists                     |
| `src/services/coordinator/PlayerStateCoordinator.ts` | NO CHANGE | Already handles `SET_VOLUME`                          |

---

### Feature 6: Series/Authors More Tab Navigation (NAVIGATION-01, NAVIGATION-02)

**Current state:** The re-export pattern was established in v1.1 for tab navigation from More. The requirement indicates the detail-level navigation is still broken (tapping a series/author within the More stack does not navigate to the detail screen).

**What to check first:**

- `src/app/(tabs)/more/series.tsx` — does it properly re-export the series list with navigation wired?
- `src/app/(tabs)/more/[seriesId]/` — does a dynamic segment route exist within the More stack?
- The pattern from v1.1: "Re-export screens for More stack nav — Expo Router treats each file's default export as the screen"

**Most likely fix:** Either the More stack is missing a dynamic route file for series/author detail, or the detail screen's navigation call uses the wrong path (tab-stack path vs More-stack path).

**No store or service changes.** Routing configuration only.

---

### Feature 7: Deep Linking (NAVIGATION-03)

**New configuration:**

- `app.json` — add `scheme: "sideshelf"` under `expo.scheme`
- Expo Router handles URL → route mapping automatically: `sideshelf://library/[item]` maps to `src/app/(tabs)/library/[item].tsx`
- No new source files required for basic deep linking
- `src/app/_layout.tsx` — any deep link side effects (e.g., navigate to a specific item while closing any open modals)

**Maestro additions (TESTING-01 through TESTING-05):**

- Login screen inputs: `testID="login-server-url-input"`, `testID="login-username-input"`, `testID="login-password-input"`, `testID="login-submit-button"`
- Player controls: `testID="play-resume-button"`, `testID="player-done-button"`, `testID="seek-slider"`, `testID="speed-control"`, `testID="download-button"`, `testID="library-search-input"`
- `maestro/_login.yaml` and `maestro/_start-playback.yaml` subflows
- Standalone screen flows in `maestro/flows/`

---

### Feature 8: ProgressService Decomposition (DEBT-03)

**Pattern (same as PlayerService — v1.2):**

```
src/services/
├── ProgressService.ts              (facade — preserves all public API)
└── progress/
    ├── types.ts                    (IProgressServiceFacade interface — prevents circular imports)
    ├── SessionTrackingCollaborator.ts  (startSession, endSession, updateProgress, recordSnapshot)
    └── SessionSyncCollaborator.ts      (syncUnsyncedSessions, syncCurrentSession, closeServerSession)
```

**Critical constraint:** Collaborators must take explicit arguments — never call `ProgressService.getInstance()` from inside a collaborator. The facade passes `this` (typed to `IProgressServiceFacade`) to collaborators. Verify with `npx dpdm --circular src/services/ProgressService.ts` before and after split.

**Natural decomposition boundary:**

The current `ProgressService.ts` mixes session creation, session updating, server sync, media progress upsert, and orchestration between them. The split:

- `SessionTrackingCollaborator` — local DB session lifecycle (start, update position, end, snapshot)
- `SessionSyncCollaborator` — network sync (sync unsynced, sync current session, close server session, handle offline)
- Facade retains — `getCurrentSession` (query forwarded to tracking collaborator), public API surface, collaborator wiring

---

### Feature 9: Performance (PERF-01 through PERF-11)

Targeted changes with no new architecture:

| Requirement                        | Target File(s)                              | Change                                                                 |
| ---------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| PERF-01: FlashList                 | Library list component                      | Replace `FlatList` with `@shopify/flash-list` `FlashList`              |
| PERF-02: ChapterList memoization   | `src/components/player/ChapterList.tsx`     | `useCallback` on `renderItem`; `getItemLayout`                         |
| PERF-03: Tree shaking              | `metro.config.js`, `.env`                   | Expo tree shaking transformer config                                   |
| PERF-04: Direct icon imports       | `src/app/_layout.tsx`, `statisticsSlice.ts` | Replace barrel imports with specific file paths                        |
| PERF-05: TTI baseline              | Home screen                                 | `performance.mark('screenInteractive')` via `react-native-performance` |
| PERF-06: Concurrent secure storage | `src/providers/AuthProvider.tsx`            | `Promise.all` for parallel reads                                       |
| PERF-07: Deferred coordinator init | `src/app/_layout.tsx`                       | Move `getInstance()` from module scope into `initializeApp()`          |
| PERF-08: expo-image                | `src/components/ui/CoverImage.tsx`          | Replace `Image` with `expo-image`                                      |
| PERF-09: ChapterList cleanup       | `src/components/player/ChapterList.tsx`     | Return cleanup from `useEffect` setTimeout                             |
| PERF-10: NetInfo leak              | `src/stores/slices/networkSlice.ts`         | Capture + call unsubscribe; clear intervals before creating            |
| PERF-11: Reanimated animations     | `src/app/FullScreenPlayer/index.tsx`        | Replace `Animated.timing` with `useAnimatedStyle`                      |

---

## Data Flow

### Bookmark Add Flow

```
FullScreenPlayer (user taps bookmark button)
    ↓
handleCreateBookmark()
    ↓
useUserProfile().createBookmark(libraryItemId, position)
    ↓
userProfileSlice.createBookmark()
    ├── POST /api/me/item/:id/bookmark  (ApiClientService → endpoints.ts)
    └── upsertBookmark() in db/helpers/bookmarks.ts  (SQLite cache write)
    ↓
state.userProfile.bookmarks = [...existing, newBookmark]
    ↓
UI: confirmation + bookmark list re-renders
```

### Bookmark Offline Read Flow

```
ItemDetail screen mounts
    ↓
getItemBookmarks(libraryItemId)  (Zustand in-memory — instant)
    ↓ (if stale or empty)
refreshBookmarks()
    ├── Online: GET /api/me → user.bookmarks → upsert all to SQLite
    └── Offline: getBookmarksForItem(libraryItemId) from SQLite
    ↓
Render bookmark list
```

### Sleep Timer Volume Fade Flow

```
SleepTimerService (1s setInterval)
    ↓
useAppStore.getState().getSleepTimerRemaining()
    ↓
If remaining <= 30s:
    volume = Math.max(0, remaining / 30)
    dispatchPlayerEvent({ type: "SET_VOLUME", payload: { volume } })
        ↓
    PlayerEventBus → PlayerStateCoordinator.dispatch()
        ↓
    executeTransition → PlayerService.executeSetVolume(volume)
        ↓
    TrackPlayer.setVolume(volume)
        ↓
    syncStateToStore → playerSlice._setVolume(volume)

If remaining <= 0:
    dispatchPlayerEvent({ type: "PAUSE" })
    cancelSleepTimer()  (Zustand direct — UI state, not playback state)
```

### Progress Display Format Flow

```
Settings screen: user selects format
    ↓
settingsSlice.updateProgressDisplayFormat(format)
    ↓
appSettings.setProgressDisplayFormat(format)  (AsyncStorage persistence)
    ↓
state.settings.progressDisplayFormat = format
    ↓
FullScreenPlayer / FloatingPlayer / ItemDetails
    useSettings() → progressDisplayFormat
    ↓
Format position/duration per selected format
(no coordinator involvement — pure derivation from existing store values)
```

---

## Recommended Build Order

Dependencies drive ordering. Each phase must not require later phase artifacts.

**Phase A: Settings + Progress Display** — no dependencies, pure UI + settings slice extension

- Add `progressDisplayFormat` to `settingsSlice` + `appSettings`
- Update 3 player surfaces to read and format accordingly
- Covers: PROGRESS-01 through PROGRESS-04

**Phase B: Collapsible Section Redesign** — no external dependencies, pure component

- Reanimated + peek + fade overlay
- Covers: SECTION-01 through SECTION-03, PERF-11 (Reanimated FullScreenPlayer animations)

**Phase C: Full Screen Player Redesign** — depends on AirPlay native component decision

- Nav bar removal, chevron dismiss, settings UIMenu
- AirPlay button (blocked on native component selection)
- Covers: PLAYER-01 through PLAYER-06

**Phase D: Bookmarks** — depends on Phase C UIMenu structure (bookmark action lives in UIMenu)

- DB schema + helpers + migration
- Wire `userProfileSlice` to DB helpers
- Add `updateBookmark` endpoint
- Bookmark list UI on item detail screen
- Covers: BOOKMARK-01 through BOOKMARK-06

**Phase E: Sleep Timer Volume Fade** — no hard dependencies, can run anytime after store is stable

- New `SleepTimerService` singleton
- Wire into `initializeApp()`
- Covers: SLEEP-01

**Phase F: Navigation + Deep Linking**

- Diagnose and fix More tab series/authors navigation
- Deep link scheme in `app.json`
- testID additions for Maestro
- Covers: NAVIGATION-01 through NAVIGATION-03, TESTING-01 through TESTING-05

**Phase G: Performance** — no functional dependencies; can parallelize with other phases or batch

- FlashList, expo-image, memoization, tree shaking, TTI, memory leaks
- Covers: PERF-01 through PERF-10 (PERF-11 already done in Phase B)

**Phase H: ProgressService Decomposition** — independent, can run in parallel with G

- Follow PlayerService pattern; verify with `dpdm` before and after
- Covers: DEBT-03

**Phase I: Tech Debt** — cross-cutting; do last to avoid disrupting other phases

- DEBT-01: path normalization touches DB + downloads + filesystem (high blast radius)
- DEBT-02: orphan reassociation UI (contained)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Importing Coordinator or PlayerService from Inside a DB Helper

**What people do:** Call `PlayerService.getInstance()` or `getCoordinator()` from a DB helper function.
**Why it's wrong:** Creates circular import cycles. DB helpers are called by services; the dependency graph is one-directional.
**Do this instead:** DB helpers take explicit function arguments. No upward imports.

### Anti-Pattern 2: Object-Returning Selectors in Components

**What people do:** `const { a, b } = useAppStore(state => ({ a: state.x.a, b: state.x.b }))`
**Why it's wrong:** Returns a new object reference on every call, triggering re-renders on every store tick including the 1Hz position updates from the coordinator.
**Do this instead:** Separate individual selectors: `const a = useAppStore(state => state.x.a)`.

### Anti-Pattern 3: Sleep Timer Logic in the Coordinator

**What people do:** Add sleep timer state to `StateContext` and handle fade in `PlayerStateCoordinator`.
**Why it's wrong:** Sleep timer is explicitly excluded from coordinator context (`PROP-04`). It is UI-originated, persisted in `playerSlice`, and exists outside the playback state machine.
**Do this instead:** `SleepTimerService` reads Zustand sleep timer state and dispatches `SET_VOLUME` + `PAUSE` command events to the coordinator. Coordinator executes them as commands, not as internal state.

### Anti-Pattern 4: Bookmarks in Memory Only (No SQLite Backing)

**What people do:** Store bookmarks only in `userProfileSlice` in-memory array without SQLite.
**Why it's wrong:** Bookmarks are lost on restart if the API is unreachable. BOOKMARK-06 explicitly requires offline viewing.
**Do this instead:** SQLite is the local source of truth. Read from SQLite immediately on mount, then refresh from API in background and upsert to SQLite.

### Anti-Pattern 5: Barrel Imports in Services

**What people do:** `import { getActiveSession } from "@/db/helpers"` (barrel index).
**Why it's wrong:** Can create circular imports when the barrel re-exports many files.
**Do this instead:** Import from the specific file: `import { getActiveSession } from "@/db/helpers/localListeningSessions"`.

### Anti-Pattern 6: `useEffect` Interval for Sleep Timer Fade in a Screen Component

**What people do:** Put the volume fade `setInterval` in a `useEffect` inside `SleepTimerControl` or `FullScreenPlayer`.
**Why it's wrong:** `FullScreenPlayer` can be dismissed (user taps chevron-down). Unmount clears the interval and the fade stops, but sleep timer is still active.
**Do this instead:** `SleepTimerService` singleton started in `initializeApp()`; survives all navigation.

---

## Integration Points

### Internal Boundaries

| Boundary                        | Communication                                        | Notes                                                     |
| ------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| UI → Coordinator                | `dispatchPlayerEvent()` via `eventBus.ts`            | Never call coordinator directly from UI                   |
| Coordinator → PlayerService     | Dynamic `require()` inside `executeTransition`       | Breaks circular dep at module load time                   |
| Services → eventBus             | `dispatchPlayerEvent()`                              | eventBus is the safe leaf node                            |
| Coordinator → Zustand           | `syncStateToStore()` / `syncPositionToStore()`       | Two-tier: position-only at 1Hz, full state on transitions |
| UI → Zustand                    | `useAppStore()` with individual selectors            | No object-returning selectors                             |
| DB helpers → no services        | Pure data-access functions, no upward imports        | Called by services only                                   |
| SleepTimerService → Coordinator | `dispatchPlayerEvent({ type: "SET_VOLUME" })`        | Same path as any other command event                      |
| userProfileSlice → API + DB     | `endpoints.ts` functions + `db/helpers/bookmarks.ts` | Follows existing dual-write pattern                       |

### New File Summary

| File                                                   | Category               | Type                  |
| ------------------------------------------------------ | ---------------------- | --------------------- |
| `src/components/player/AirPlayButton.tsx`              | AirPlay                | NEW component         |
| `src/db/schema/bookmarks.ts`                           | Bookmarks              | NEW schema            |
| `src/db/helpers/bookmarks.ts`                          | Bookmarks              | NEW DB helper         |
| `src/services/SleepTimerService.ts`                    | Sleep Timer            | NEW service singleton |
| `src/services/progress/types.ts`                       | ProgressService decomp | NEW interface types   |
| `src/services/progress/SessionTrackingCollaborator.ts` | ProgressService decomp | NEW collaborator      |
| `src/services/progress/SessionSyncCollaborator.ts`     | ProgressService decomp | NEW collaborator      |

### Modified File Summary

| File                                    | Feature(s)                         | What Changes                                                  |
| --------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `src/app/FullScreenPlayer/index.tsx`    | PLAYER-01–04, PROGRESS-02, PERF-11 | Header redesign, UIMenu, AirPlay, progress format, Reanimated |
| `src/components/ui/FloatingPlayer.tsx`  | PLAYER-05, PROGRESS-03             | AirPlay button, progress display                              |
| `src/stores/slices/settingsSlice.ts`    | PROGRESS-01                        | Add `progressDisplayFormat` field + action                    |
| `src/lib/appSettings.ts`                | PROGRESS-01                        | Add `progressDisplayFormat` getter/setter                     |
| `src/stores/slices/userProfileSlice.ts` | BOOKMARK-01–06                     | Wire DB helpers into bookmark actions                         |
| `src/lib/api/endpoints.ts`              | BOOKMARK-03                        | Add `updateBookmark` endpoint                                 |
| `src/db/schema/index.ts`                | BOOKMARK-06                        | Re-export bookmarks table                                     |
| `src/services/ProgressService.ts`       | DEBT-03                            | Decompose to facade + collaborators                           |
| `src/app/_layout.tsx`                   | PERF-07, SLEEP-01                  | Deferred coordinator init; start SleepTimerService            |
| `app.json`                              | NAVIGATION-03                      | Add `scheme: "sideshelf"`                                     |

---

## Confidence Assessment

| Area                             | Confidence | Reason                                                            |
| -------------------------------- | ---------- | ----------------------------------------------------------------- |
| Coordinator/sleep timer boundary | HIGH       | `PROP-04` explicitly documented in `syncStateToStore`             |
| Bookmark data flow               | HIGH       | API endpoints + slice state + type verified from code             |
| AirPlay native requirement       | HIGH       | `AVRoutePickerView` is iOS-only UIKit; no pure-JS path            |
| ProgressService decomposition    | HIGH       | Identical pattern applied to PlayerService in v1.2                |
| Settings slice extension pattern | HIGH       | Pattern repeated across all existing settings                     |
| Navigation fix approach          | MEDIUM     | Root cause not yet diagnosed; re-export pattern is the right tool |
| AirPlay library choice           | LOW        | `react-native-airplay-btn` maintenance not verified               |

---

## Sources

- `src/services/coordinator/PlayerStateCoordinator.ts` — coordinator context, `syncStateToStore`, `PROP-04` exception
- `src/types/coordinator.ts` — `PlayerEvent` types including `SET_VOLUME`
- `src/stores/slices/playerSlice.ts` — `sleepTimer` state, Zustand/coordinator boundary
- `src/stores/slices/settingsSlice.ts` — settings extension pattern
- `src/stores/slices/userProfileSlice.ts` — bookmark state + actions (partially implemented)
- `src/app/FullScreenPlayer/index.tsx` — current header structure, existing `Animated.timing`
- `src/components/ui/FloatingPlayer.tsx` — current floating player layout
- `src/db/schema/localData.ts` — existing local data schema patterns
- `src/lib/api/endpoints.ts` — existing `createBookmark`, `deleteBookmark` endpoints
- `src/types/api.ts` — `ApiAudioBookmark` type
- `src/services/coordinator/eventBus.ts` — leaf-node dispatch confirmed
- `.planning/PROJECT.md` — architecture constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1.3 requirements

---

_Architecture research for: Expo/React Native audiobook client — v1.3 Beta Polish_
_Researched: 2026-03-09_
