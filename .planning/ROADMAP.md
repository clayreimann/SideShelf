# Roadmap: Player State Machine Migration

## Overview

Phase 1 (observer mode) is complete and production-validated. This roadmap covers Phases 2-5: flipping the coordinator from observer to executor, centralizing playback position authority, bridging coordinator state to the UI layer, and deleting the legacy coordination scaffolding that becomes redundant once the coordinator owns everything. Each phase unlocks the next — the dependency ordering is structural, not conventional. All four phases together complete the original design intent: the coordinator is the single source of truth for player state.

v1.1 (Phases 6–9) is a focused bug-fix and polish pass following the coordinator migration. Six runtime bugs are corrected and five polish improvements are applied to downloads, the player, navigation, and the home screen.

## Phases

**Phase Numbering:**

- Phases 2-5 continue from Phase 1 (already shipped)
- Integer phases (2, 3, 4, 5): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions if needed
- Phases 6-9: v1.1 Bug Fixes & Polish

- [x] **Phase 1: Observer Mode** - Coordinator observes and validates — SHIPPED (production-validated)
- [x] **Phase 2: Execution Control** - Coordinator calls service methods; services stop executing independently — COMPLETE (human-accepted 2026-02-16)
- [x] **Phase 3: Position Reconciliation** - Coordinator owns canonical position; single deterministic algorithm replaces three scattered ones — COMPLETE (2026-02-16)
- [x] **Phase 03.1: Fix Coordinator Service Bugs** - Four runtime bugs fixed: seek state memory loss, completed items resuming from end, mark-as-unfinished not resetting position, skip button UX — COMPLETE (2026-02-18)
- [x] **Phase 4: State Propagation** - playerSlice becomes read-only proxy driven by coordinator bridge — COMPLETE (human-accepted 2026-02-19)
- [x] **Phase 5: Cleanup** - Legacy guard flags and reconciliation methods deleted; services simplified to thin execution layers — COMPLETE (2026-02-20)
- [x] **Phase 6: iCloud Exclusion** - Plugin registered, compiled into build, exclusion applied at download completion and path repair — COMPLETE (2026-02-23)
- [x] **Phase 7: Download Tracking** - Stale DB records cleared on startup; Storage tab accurate; active downloads excluded from reconciliation scan (completed 2026-02-23)
- [ ] **Phase 8: Skip & Player Polish** - Skip action executes on short-tap; lock screen updates after skip; skip intervals persist across sessions
- [ ] **Phase 9: Navigation & UI Polish** - More screen routes to correct tabs; icons and nav affordance added; home screen loading skeleton; tab reorder UX improved

## Phase Details

### Phase 1: Observer Mode

**Goal**: Coordinator observes and validates all player state transitions in production
**Status**: COMPLETE — production-validated with 122+ tests, 90%+ coverage, <10ms average event processing, minimal rejections
**Plans**: Shipped

### Phase 2: Execution Control

**Goal**: The coordinator calls service methods when events arrive — services no longer execute playback commands independently; coordinator is the single executor
**Depends on**: Phase 1 (complete)
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06
**Success Criteria** (what must be TRUE):

1. A play command issued from any surface (UI button, lock screen, headphone control) routes through the coordinator before any TrackPlayer call is made
2. Attempting to start a second playback session while one is loading is rejected by a transition guard — no duplicate session is created
3. The event bus receives exactly one event per coordinator action (no feedback loop from `execute*` methods back into the bus)
4. Setting `observerMode = true` reverts the coordinator to Phase 1 behavior without a code deploy
5. NATIVE\_\* events (lock screen, external controls) continue to update coordinator context unconditionally, even when coordinator is executor
6. All existing playback behaviors work without regression: resume position, chapter display, lock screen controls, background audio

**Plans:** 2 plans

Plans:

- [x] 02-01-PLAN.md — Fix executeTransition bug, observerMode runtime toggle, BGS duplicate side effect removal
- [x] 02-02-PLAN.md — Execution control contract tests (EXEC-01 through EXEC-06)

### Phase 3: Position Reconciliation

**Goal**: The coordinator owns canonical playback position using a single deterministic reconciliation algorithm; all position sources (native, server DB, AsyncStorage) are subordinate to it
**Depends on**: Phase 2
**Requirements**: POS-01, POS-02, POS-03, POS-04, POS-05, POS-06
**Success Criteria** (what must be TRUE):

1. After cold app start, the player resumes at the correct position (within 5 seconds of actual last position) rather than restarting from zero
2. After 30 minutes of continuous playback, position drift is less than 5 seconds between coordinator canonical position and server-synced position
3. Native position reports of 0 during track queue loading do not overwrite a valid prior position stored in the coordinator
4. `PlayerService.determineResumePosition()` no longer exists — position reconciliation has exactly one home in the coordinator
5. On Android, the background service coordinator does not conflict with the UI coordinator; DB session remains the cross-context source of truth

**Plans:** 2 plans

Plans:

- [ ] 03-01-PLAN.md — Extract shared constants, create coordinator resolveCanonicalPosition method, add native-0 guard
- [ ] 03-02-PLAN.md — Wire PlayerService callers, remove determineResumePosition, update BGS constant, POS contract tests

### Phase 4: State Propagation

**Goal**: playerSlice becomes a read-only proxy — all player state fields are written only by the coordinator bridge (`syncToStore()`); services have no direct write paths to playerSlice
**Depends on**: Phase 3
**Requirements**: PROP-01, PROP-02, PROP-03, PROP-04, PROP-05, PROP-06
**Success Criteria** (what must be TRUE):

1. A grep for `playerSlice` write methods in service files (PlayerService, PlayerBackgroundService, ProgressService) returns zero results for player state fields
2. Component render counts (measured with React Profiler) do not increase after the bridge is added — `usePlayerState(selector)` prevents re-render storms from 1Hz position updates
3. Sleep timer state is written directly to playerSlice (documented exception) and does not break when coordinator bridge is active
4. The Android background service coordinator never calls `syncToStore()` — the Zustand store is inaccessible from the headless JS context
5. `updateNowPlayingMetadata()` debounce behavior is preserved after chapter changes trigger the coordinator bridge

**Plans:** 3 plans

Plans:

- [ ] 04-01-PLAN.md — Build coordinator-to-store bridge (syncPositionToStore + syncStateToStore) and wire into handleEvent
- [ ] 04-02-PLAN.md — Remove direct store writes from PlayerService and PlayerBackgroundService
- [ ] 04-03-PLAN.md — PROP contract tests (PROP-01 through PROP-06) and test updates

### Phase 5: Cleanup

**Goal**: Legacy guard flags and redundant reconciliation methods are deleted; PlayerService is simplified to a thin execution layer; the migration is structurally complete
**Depends on**: Phase 4
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06
**Status**: COMPLETE (2026-02-20)
**Success Criteria** (what must be TRUE):

1. Implicit state flags (`isLoading`, `isPreparing`, `sessionCreationInProgress`) do not exist anywhere in service files — confirmed by grep
2. `PlayerService.ts` line count is under 1,100 lines (down from ~1,640 lines)
3. `isRestoringState` is removed only after BGS chapter updates route through the coordinator — the removal is the last flag removed, in dependency order
4. `ProgressService` session mutex is removed and no duplicate session creation is observable in a complete load-play-pause-seek-stop integration test run
5. An integration test exercises the full playback flow (load → play → pause → seek → stop) end-to-end through the coordinator, and 90%+ test coverage is maintained across all modified files

**Plans:** 6/6 plans executed

Plans:

- [x] 05-01-PLAN.md — Remove observerMode flag and scaffolding from coordinator and coordinator tests
- [x] 05-02-PLAN.md — Delete dead PlayerService methods (reconcileTrackPlayerState, verifyTrackPlayerConsistency, syncStoreWithTrackPlayer, dead accessors, updateNowPlayingMetadata wrapper) and update \_layout.tsx/index.ts callers
- [x] 05-03-PLAN.md — Move chapter detection to coordinator syncPositionToStore; remove BGS NowPlaying writes
- [x] 05-04-PLAN.md — Remove isRestoringState from playerSlice and PlayerService; update backgroundRestoration test to use isLoadingTrack
- [x] 05-05-PLAN.md — Full lifecycle integration test (LOAD→PLAY→PAUSE→SEEK→PLAY→STOP) and 90%+ coverage verification
- [x] 05-06-PLAN.md — Remove startSessionLocks mutex from ProgressService after integration test gate passes

---

## v1.1: Bug Fixes & Polish

### Phase 6: iCloud Exclusion

**Goal**: Downloaded files are reliably excluded from iCloud backup — the native module is compiled into the build, exclusion is applied at download completion, and path repair re-applies exclusion so iOS app updates do not silently re-enable backup
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: ICLD-01, ICLD-02, ICLD-03
**Success Criteria** (what must be TRUE):

1. After running `expo prebuild --clean` and building the app, `NativeModules.ICloudBackupExclusion` resolves to a non-null object — the module is compiled into the Xcode project
2. After a file finishes downloading, its filesystem entry has `NSURLIsExcludedFromBackupKey = true` — verifiable via a device diagnostic or the native module's own logging
3. After `repairDownloadStatus` runs (iOS app update path migration), re-downloaded files still have the exclusion attribute applied — the repair path does not silently re-enable iCloud backup

**Status**: COMPLETE (2026-02-23)
**Plans:** 2/2 plans executed

Plans:

- [x] 06-01-PLAN.md — Register plugin in app.config.js, add exclusion to repairDownloadStatus, add startup retroactive scan
- [x] 06-02-PLAN.md — Human verification: native build confirms NativeModules.ICloudBackupExclusion resolves non-null; fixed file:// URL encoding bug in setExcludeFromBackup

### Phase 7: Download Tracking

**Goal**: The app's awareness of which files are downloaded matches what is actually on disk — stale records from deleted or missing files are cleared on startup, and the reconciliation scan does not corrupt in-progress downloads
**Depends on**: Phase 6 (iCloud exclusion native module must be working before the repair scan re-applies exclusion)
**Requirements**: DL-01, DL-02, DL-03
**Success Criteria** (what must be TRUE):

1. After deleting a downloaded file outside the app and restarting, the item's "downloaded" badge is gone and tapping it triggers a fresh download rather than a failed playback attempt
2. The Storage tab lists every item that has files on disk — no item present in the filesystem is absent from Storage
3. Performing a scan while a download is actively in progress does not mark the partial file as complete or corrupt the download record

**Plans:** 3/3 plans complete

Plans:

- [ ] 07-01-PLAN.md — Reconciliation scan in fileLifecycleManager (active-download guard, zombie detection), removeDownloadedItem in downloadSlice, fire-and-forget wiring in \_layout.tsx
- [ ] 07-02-PLAN.md — Partial download badge in CoverImage, action sheet in LibraryItemDetail, isItemPartiallyDownloaded selector
- [ ] 07-03-PLAN.md — orphanScanner.ts disk walk, useFocusEffect refresh in storage.tsx, Unknown files section with delete

### Phase 8: Skip & Player Polish

**Goal**: The skip button short-tap executes a skip action; the lock screen shows the updated elapsed time after any skip; the user's chosen skip intervals survive app restarts
**Depends on**: Phase 5 (v1.0 complete; Phase 6/7 can run in parallel)
**Requirements**: SKIP-01, SKIP-02, PLR-01, PLR-02
**Success Criteria** (what must be TRUE):

1. Tapping (not holding) the skip button moves playback forward or backward by the configured interval — the menu does not appear on short-tap
2. After a skip that stays within the same chapter, the iOS lock screen and Control Center show the new elapsed time within one second — not the pre-skip time
3. The skip forward interval selected in the player persists after closing and reopening the app
4. The skip backward interval selected in the player persists after closing and reopening the app independently of the forward interval

**Plans:** 2/3 plans executed

Plans:

- [ ] 08-01-PLAN.md — Replace AsyncStorage interval reads in FullScreenPlayer with useSettings() Zustand hook; persist interval selection on long-press (PLR-01, PLR-02)
- [ ] 08-02-PLAN.md — Dispatch SEEK_COMPLETE from executeSeek; unconditional updateNowPlayingMetadata on SEEK_COMPLETE in syncStateToStore (SKIP-02)
- [ ] 08-03-PLAN.md — Device verification checkpoint: short-tap skip, lock screen update, interval persistence (SKIP-01)

### Phase 9: Navigation & UI Polish

**Goal**: More screen routes correctly to Series and Authors tabs; More screen items have icons and visual affordance; the home screen shows a shimmer skeleton during cold start; tab reorder UX is improved
**Depends on**: Phase 5 (v1.0 complete; can run in parallel with Phases 6–8)
**Requirements**: NAV-01, NAV-02, UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):

1. Tapping "Series" on the More screen switches to the Series tab — not pushes a Series screen onto the More navigation stack
2. Tapping "Authors" on the More screen switches to the Authors tab — not pushes an Authors screen onto the More navigation stack
3. Each item in the More screen list has a distinct icon identifying its destination
4. Each item in the More screen list shows a chevron or equivalent affordance indicating it is a navigation target, and has a visible tap state
5. During cold start (no cached sections), the home screen shows placeholder skeleton cards in the shape of content items before data loads — not a bare spinner
6. The tab reorder screen provides a sufficiently clear and usable drag-to-reorder interaction
   **Plans**: TBD

## Progress

### v1.0 — Player State Machine Migration

**Execution Order:**
Phases execute in numeric order: 2 → 3 → 4 → 5

| Phase                      | Plans Complete | Status   | Completed  |
| -------------------------- | -------------- | -------- | ---------- |
| 1. Observer Mode           | -              | Complete | 2026-02-16 |
| 2. Execution Control       | 2/2            | Complete | 2026-02-16 |
| 3. Position Reconciliation | 2/2            | Complete | 2026-02-16 |
| 03.1. Bug Fixes            | 2/2            | Complete | 2026-02-18 |
| 4. State Propagation       | 3/3            | Complete | 2026-02-19 |
| 5. Cleanup                 | 6/6            | Complete | 2026-02-20 |

### v1.1 — Bug Fixes & Polish

**Execution Order:**
Phase 6 → Phase 7 (depends on 6); Phase 8 and 9 are independent and can run in parallel with 6/7

| Phase                     | Plans Complete | Status      | Completed  |
| ------------------------- | -------------- | ----------- | ---------- |
| 6. iCloud Exclusion       | 2/2            | Complete    | 2026-02-23 |
| 7. Download Tracking      | 3/3            | Complete    | 2026-02-23 |
| 8. Skip & Player Polish   | 2/3            | In Progress |            |
| 9. Navigation & UI Polish | 0/TBD          | Not started | -          |
