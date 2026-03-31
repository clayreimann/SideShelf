# Audiobookshelf React Native

## What This Is

An Expo-based React Native mobile client for the Audiobookshelf self-hosted audiobook and podcast server. The app provides offline downloads, audio playback with chapter navigation, and progress synchronization across devices. The coordinator owns all player state (v1.0), UI and downloads are polished (v1.1), and the codebase has undergone a full internal cleanup — SQLite performance, Zustand state centralization, service decomposition, and mainline RNBD migration (v1.2).

## Core Value

The coordinator owns player state — services execute its commands and report reality back, not the other way around.

## Requirements

### Validated

**v1.0 — Player State Machine Migration**

- ✓ Coordinator runs in observer mode in production — v1.0 Phase 1
- ✓ Event bus decouples services from coordinator (no circular dependencies) — v1.0 Phase 1
- ✓ Serial event processing eliminates race conditions — v1.0 Phase 1
- ✓ State transition matrix validated with 122+ tests (90%+ coverage) — v1.0 Phase 1
- ✓ Diagnostics UI in Track Player screen shows real-time coordinator state — v1.0 Phase 1
- ✓ All services integrated as event sources — v1.0 Phase 1
- ✓ Coordinator executes state transitions (calls service methods, not just observes) — v1.0 Phase 2
- ✓ Transition guards prevent invalid operations (duplicate sessions, play-when-loading, seek-when-idle) — v1.0 Phase 2
- ✓ Coordinator owns canonical position with single deterministic reconciliation algorithm — v1.0 Phase 3
- ✓ Native position-0-during-load edge case handled correctly — v1.0 Phase 3
- ✓ playerSlice is a read-only proxy driven by coordinator bridge — v1.0 Phase 4
- ✓ Two-tier sync (position-only vs full state) prevents 1Hz Zustand selector storms — v1.0 Phase 4
- ✓ Legacy implicit state flags removed (isRestoringState, sessionCreationInProgress, etc.) — v1.0 Phase 5
- ✓ Services simplified to thin execution layers — v1.0 Phase 5
- ✓ 90%+ test coverage maintained across all modified files — v1.0 Phase 5

**v1.1 — Bug Fixes & Polish**

- ✓ Short-tap skip button executes skip action without opening interval menu (iOS 18 gesture fix) — v1.1 Phase 8
- ✓ Lock screen shows updated elapsed time after any skip (SEEK_COMPLETE dispatch) — v1.1 Phase 8
- ✓ Skip forward/backward intervals persist across app sessions via Zustand settingsSlice — v1.1 Phase 8
- ✓ iCloud exclusion plugin compiled into Xcode build; downloads excluded at completion and path repair — v1.1 Phase 6
- ✓ Stale downloaded-but-missing-on-disk DB records cleared on startup — v1.1 Phase 7
- ✓ Storage tab accurately reflects all downloaded items; orphan scanner detects unknown files — v1.1 Phase 7
- ✓ Download reconciliation scan excludes active in-progress downloads — v1.1 Phase 7
- ✓ More screen navigates to Series/Authors tabs (not push onto More stack) — v1.1 Phase 9
- ✓ More screen items have SF Symbol + Ionicons icons with chevron nav affordance — v1.1 Phase 9
- ✓ Home screen shows pulsing skeleton shelves during cold start with 300ms cross-fade — v1.1 Phase 9
- ✓ Tab reorder screen has drag handle visual affordance — v1.1 Phase 9
- ✓ Cover art startup repair scan re-downloads missing covers after iOS app updates — v1.1 Phase 9

**v1.2 — Tech Cleanup**

- ✓ WAL journal mode + `synchronous=NORMAL` + 4 FK indexes — ~4x write throughput; DB errors show recovery UI — v1.2 Phase 10
- ✓ Batch upserts across all DB helpers — 500-item sync: 1,000 queries → 1 batch operation — v1.2 Phase 10
- ✓ `viewMode`, `progressMap`, `availableTags`, `userId` centralized into Zustand slices — v1.2 Phase 11
- ✓ Redundant mount-time DB fetches removed from 5+ components; `wipeUserData` cleans in FK order — v1.2 Phase 11
- ✓ PlayerService decomposed: facade + 4 collaborators at 92% coverage — v1.2 Phase 12
- ✓ DownloadService decomposed: facade + 2 stateless collaborators at 91% coverage — v1.2 Phase 12
- ✓ Custom RNBD fork (`spike-event-queue`) replaced by mainline 4.5.3; iCloud exclusion decode bug fixed — v1.2 Phase 13

### Active

<!-- v1.3 Beta Polish — 43 requirements across 9 categories -->

- [ ] Full screen player UI redesigned — nav bar removed, chevron dismiss, settings UIMenu, AirPlay button (PLAYER-01–04)
- [ ] AirPlay button added to floating player and item details controls (PLAYER-05–06)
- [ ] User-selectable progress display format shown consistently across all 3 player surfaces (PROGRESS-01–04)
- [ ] Collapsible sections show first ~100px with fade, animate height via Reanimated (SECTION-01–03)
- [ ] Bookmark add/view/rename/delete synced with ABS server and cached locally (BOOKMARK-01–06)
- [ ] Series/Authors navigation fixed from More tab; `sideshelf://` deep link scheme registered (NAVIGATION-01–03)
- [ ] Sleep timer volume fade over last 30 seconds before stop (SLEEP-01)
- [ ] RN performance improvements: FlashList, Reanimated animations, expo-image, tree shaking, TTI measurement, memory fixes (PERF-01–11)
- [ ] Tech debt: path standardization, orphan reassociation, ProgressService decomposition (DEBT-01–03)
- [ ] Maestro UI testing: deep links, self-contained login, testID coverage, flow decomposition, regression suite (TESTING-01–05)

### Out of Scope

- Full playerSlice removal — Zustand/React integration is valuable; stays as read-only proxy
- Changing the state machine topology — Phase 1 validated the transition matrix; it stays
- iOS native intents, Siri shortcuts — deferred to a future features milestone
- Cloudflare feedback worker — deferred to a future milestone
- PERF-01: NATIVE_PROGRESS_UPDATED bypass of async-lock — requires explicit safety analysis; deferred
- DIAG-01/02: Coordinator diagnostics to crash reporting — deferred
- Expo SDK 55 upgrade — gated on RNTP Android bridgeless compatibility (issue #2443)
- ProgressService decomposition (DECOMP-03) — deferred; background service contract complexity warrants standalone phase

## Context

**Post-v1.2 codebase state:**

- ~55,702 lines TypeScript/TSX across `src/`
- Tech stack: Expo 54, React Native, Zustand, SQLite/Drizzle, react-native-track-player, Expo Router, mainline RNBD 4.5.3
- Coordinator migration (v1.0) complete — coordinator is single executor of playback state transitions
- Bug fixes + polish (v1.1) complete — downloads, iCloud, skip button, navigation, home screen all polished
- Tech cleanup (v1.2) complete — DB performance, state centralization, service decomposition, fork elimination
- PlayerService: facade + 4 collaborators at 92% coverage
- DownloadService: facade + 2 stateless collaborators at 91% coverage
- observerMode flag preserved as instant rollback mechanism

**Known technical debt going into v1.3:**

- `PERF-01`: `NATIVE_PROGRESS_UPDATED` events go through async-lock — lower latency possible with safety analysis
- Android `updateMetadataForTrack` artwork bug (#2287) — not verified (no Android device available)
- Path standardization: encoding mismatch between `file://` URIs, POSIX paths, and `D:/C:` prefixed DB paths
- Orphan download reassociation UI: delete-only; user cannot link orphaned files to known library items
- Expo SDK 55 upgrade blocked by RNTP Android bridgeless compatibility (issue #2443)

Key architecture files:

- `src/types/coordinator.ts` — state/event type definitions
- `src/services/coordinator/eventBus.ts` — event bus
- `src/services/coordinator/transitions.ts` — state transition matrix
- `src/services/coordinator/PlayerStateCoordinator.ts` — main coordinator
- `src/services/coordinator/__tests__/` — test suite

## Constraints

- **Rollback**: The `observerMode` flag provides instant rollback — preserve it
- **Test coverage**: Must maintain >90% coverage — do not proceed if tests regress
- **playerSlice stays**: Zustand/React integration is valuable; only write paths change
- **Download stability**: Download fixes must not regress existing download behavior

## Key Decisions

| Decision                                  | Rationale                                                                                                                   | Outcome                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Event bus decoupling                      | Prevents circular dependencies between coordinator and services                                                             | ✓ Good — Phase 1 validated                        |
| Serial event processing                   | Guarantees no race conditions, simpler reasoning                                                                            | ✓ Good — <10ms average, no issues                 |
| Observer mode first                       | Zero-risk validation of state machine logic in production                                                                   | ✓ Good — 122+ tests, minimal rejections           |
| playerSlice as read-only proxy            | Zustand/React integration too valuable to remove; make it reflect coordinator                                               | ✓ Good — Phase 4 shipped cleanly                  |
| YOLO rollback posture                     | 122+ tests + Phase 1 production validation provides sufficient confidence                                                   | ✓ Good — migration shipped without rollback       |
| Continuous delivery between phases        | Artificial wait periods add no value given test coverage                                                                    | ✓ Good — 20 plans completed across 2 milestones   |
| Custom FSM over XState                    | Production-validated, XState adds 16.7kB with no functional gain                                                            | ✓ Good — no regrets                               |
| Pressable-outside-MenuView (SkipButton)   | shouldOpenOnLongPress alone insufficient on iOS 18 — UIContextMenuInteraction swallows taps                                 | ✓ Good — Phase 8 device-verified                  |
| suppressNextPress ref on SkipButton       | Prevents onPress firing on long-press release (Pressable fires both events)                                                 | ✓ Good — clean gesture semantics                  |
| SEEK_COMPLETE dispatch in executeSeek     | Keeps event dispatch at execution layer where TrackPlayer.seekTo actually runs                                              | ✓ Good — unconditional lock screen refresh        |
| Dynamic import in repairMissingCoverArt() | mediaMetadata.ts statically imports covers.ts — dynamic import breaks the circular dep                                      | ✓ Good — no circular dependency at runtime        |
| Re-export screens for More stack nav      | Expo Router treats each file's default export as the screen — re-export to share components                                 | ✓ Good — series/authors cross-stack nav works     |
| Long-press interval as one-time-apply     | User intent in Settings controls default; long press is per-skip override                                                   | ✓ Good — cleaner UX semantics                     |
| WAL pragma via execSync before Drizzle    | Must run on raw SQLite handle before Drizzle wraps connection; synchronous=NORMAL is connection-level                       | ✓ Good — ~4x write throughput                     |
| IPlayerServiceFacade in types.ts          | Both facade and collaborators import from one file — prevents circular imports                                              | ✓ Good — zero import cycles                       |
| DownloadService collaborators stateless   | Simpler than PlayerService pattern; query DB/filesystem independently with no callbacks                                     | ✓ Good — collaborators independently testable     |
| No fork migration flag                    | Repair/reconciliation handles fork-era downloads; beta app so aggressive cleanup acceptable                                 | ✓ Good — no special-case code needed              |
| forceExit: true in jest.config.js         | @react-native-community/netinfo reachability timer doesn't unref; fixes lint-staged --bail                                  | ✓ Good — no test behavior change                  |
| Span traces for async decision paths      | Log strings lose branching context across await; spans capture decision outcomes as structured attributes queryable in dump | ✓ Good — restore + smart rewind now fully visible |

## Current Milestone: v1.3 Beta Polish

**Goal:** Ship the app to beta — UX polish on the player and library UI, performance improvements from the RN audit, bookmark management, sleep timer volume fade, UI testing infrastructure, and remaining tech debt.

**Target features:**

- Full screen player UI redesign (nav bar removal, chevron dismiss, settings UIMenu, AirPlay)
- Unified player progress display with user-selectable format
- Collapsible section redesign (peek + fade + Reanimated height animation)
- Bookmark management (add/view/rename/delete, ABS server sync)
- Series/Authors More tab navigation fix + deep linking
- Sleep timer volume fade
- RN performance audit fixes (FlashList, expo-image, Reanimated animations, tree shaking, TTI, memory)
- Tech debt: path standardization, orphan reassociation, ProgressService decomposition
- Maestro UI testing infrastructure (deep links, login flow, testIDs, flow decomposition, regression suite)

---

_Last updated: 2026-03-09 after v1.3 milestone started_
