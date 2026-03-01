# Audiobookshelf React Native

## What This Is

An Expo-based React Native mobile client for the Audiobookshelf self-hosted audiobook and podcast server. The app provides offline downloads, audio playback with chapter navigation, and progress synchronization across devices. The player system has been fully migrated to an event-driven coordinator architecture (v1.0), with bug fixes and polish applied in v1.1 — the coordinator is the single source of truth for all playback state, downloads are tracked accurately, and the UI is polished.

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

### Active

_No active requirements — v1.2 not yet defined._

### Out of Scope

- Full playerSlice removal — Zustand/React integration is valuable; stays as read-only proxy
- Changing the state machine topology — Phase 1 validated the transition matrix; it stays
- Configurable smart-rewind/jump intervals — logic + settings UI needed; deferred to v1.2
- RN Downloader upgrade to mainline — maintenance upgrade, not blocking; deferred to v1.2
- iOS native intents, Siri shortcuts — deferred to a future features milestone
- Cloudflare feedback worker — deferred to a future milestone
- PERF-01: NATIVE_PROGRESS_UPDATED bypass of async-lock — requires explicit safety analysis; deferred
- DIAG-01/02: Coordinator diagnostics to crash reporting — deferred

## Context

**Post-v1.1 codebase state:**

- ~50,175 lines TypeScript/TSX across `src/`
- Tech stack: Expo 54, React Native, Zustand, SQLite/Drizzle, react-native-track-player, Expo Router
- Coordinator migration (v1.0) complete — coordinator is single executor of playback state transitions
- Bug fixes (v1.1) complete — downloads, iCloud, skip button, navigation, home screen all polished
- PlayerService: ~1,097 lines (down from ~1,640 post-migration)
- Coordinator test coverage: 92.83%; playerSlice: 91.62%
- observerMode flag preserved as instant rollback mechanism

**Known technical debt going into v1.2:**

- `PERF-01`: `NATIVE_PROGRESS_UPDATED` events go through async-lock — lower latency possible with safety analysis
- Android `updateMetadataForTrack` artwork bug (#2287) — not verified (no Android device available)
- Long-press interval selection on skip button is now one-time-apply (not persistent) — by design; Settings controls default

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

| Decision                                  | Rationale                                                                                   | Outcome                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Event bus decoupling                      | Prevents circular dependencies between coordinator and services                             | ✓ Good — Phase 1 validated                      |
| Serial event processing                   | Guarantees no race conditions, simpler reasoning                                            | ✓ Good — <10ms average, no issues               |
| Observer mode first                       | Zero-risk validation of state machine logic in production                                   | ✓ Good — 122+ tests, minimal rejections         |
| playerSlice as read-only proxy            | Zustand/React integration too valuable to remove; make it reflect coordinator               | ✓ Good — Phase 4 shipped cleanly                |
| YOLO rollback posture                     | 122+ tests + Phase 1 production validation provides sufficient confidence                   | ✓ Good — migration shipped without rollback     |
| Continuous delivery between phases        | Artificial wait periods add no value given test coverage                                    | ✓ Good — 20 plans completed across 2 milestones |
| Custom FSM over XState                    | Production-validated, XState adds 16.7kB with no functional gain                            | ✓ Good — no regrets                             |
| Pressable-outside-MenuView (SkipButton)   | shouldOpenOnLongPress alone insufficient on iOS 18 — UIContextMenuInteraction swallows taps | ✓ Good — Phase 8 device-verified                |
| suppressNextPress ref on SkipButton       | Prevents onPress firing on long-press release (Pressable fires both events)                 | ✓ Good — clean gesture semantics                |
| SEEK_COMPLETE dispatch in executeSeek     | Keeps event dispatch at execution layer where TrackPlayer.seekTo actually runs              | ✓ Good — unconditional lock screen refresh      |
| Dynamic import in repairMissingCoverArt() | mediaMetadata.ts statically imports covers.ts — dynamic import breaks the circular dep      | ✓ Good — no circular dependency at runtime      |
| Re-export screens for More stack nav      | Expo Router treats each file's default export as the screen — re-export to share components | ✓ Good — series/authors cross-stack nav works   |
| Long-press interval as one-time-apply     | User intent in Settings controls default; long press is per-skip override                   | ✓ Good — cleaner UX semantics                   |

---

_Last updated: 2026-02-27 after v1.1 milestone_
