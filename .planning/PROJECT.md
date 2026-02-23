# Audiobookshelf React Native

## What This Is

An Expo-based React Native mobile client for the Audiobookshelf self-hosted audiobook and podcast server. The app provides offline downloads, audio playback with chapter navigation, and progress synchronization across devices. The player system has been fully migrated to an event-driven coordinator architecture (v1.0 complete) — the coordinator is now the single source of truth for all playback state.

## Core Value

The coordinator owns player state — services execute its commands and report reality back, not the other way around.

## Current Milestone: v1.1 Bug Fixes & Polish

**Goal:** Fix six runtime bugs exposed after the coordinator migration and apply five focused polish improvements to downloads, navigation, and the home screen.

**Target features:**

- Fix skip buttons: short-tap action and now playing metadata refresh after skip
- Fix download tracking: files lost from app awareness after download
- Fix iCloud exclusion native module (excludes downloads from iCloud backup)
- Fix Storage tab: not showing all downloaded items
- Fix More screen routing: Series and Authors tabs fail to open
- Move now playing metadata ownership to coordinator (out of AppStore)
- More screen icons and navigation UX polish
- Better reorder tab UX
- Home screen loading skeleton

## Requirements

### Validated

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

### Active

- [ ] Skip button short-tap performs skip action (not just menu appearance)
- [ ] Skip button triggers now playing metadata refresh with updated current time
- [ ] Downloaded file tracking survives app restart (files on disk remain registered)
- [ ] iCloud exclusion module correctly excludes downloaded files from iCloud backup
- [ ] Storage tab shows all downloaded items
- [ ] More screen correctly routes to Series and Authors tabs
- [ ] Now playing metadata updates are owned by the coordinator, not AppStore
- [ ] More screen items have icons and clear visual affordance as navigation targets
- [ ] Reorder tab UX improved
- [ ] Home screen shows loading skeleton while content loads

### Out of Scope

- Full playerSlice removal — Zustand/React integration is valuable; stays as read-only proxy
- Changing the state machine topology — Phase 1 validated the transition matrix; it stays
- New player features beyond bug fixes — this is polish, not a feature milestone
- Performance optimization beyond what naturally emerges from cleanup
- Configurable smart-rewind/jump intervals — logic + settings UI needed; deferred to v1.2
- RN Downloader upgrade — maintenance upgrade, not blocking; deferred to v1.2
- iOS native intents, Siri shortcuts — deferred to a future features milestone
- Cloudflare feedback worker — deferred to a future milestone

## Context

The codebase is a React Native app using Expo, Zustand for state, SQLite/Drizzle for persistence, and react-native-track-player for audio. The coordinator migration (v1.0) is complete — the coordinator is the single executor of playback state transitions, with playerSlice as a read-only proxy.

**Post-migration architecture:**

- `src/services/coordinator/PlayerStateCoordinator.ts` — owns all player state transitions and canonical position
- `src/services/PlayerService.ts` — thin execution layer (~1,097 lines, down from ~1,640)
- `src/services/ProgressService.ts` — session management and server sync (~1,178 lines)
- `src/stores/slices/playerSlice.ts` — read-only Zustand proxy driven by coordinator bridge
- `src/services/coordinator/__tests__/` — 122+ tests, 92.83% coordinator coverage

**Known technical debt going into v1.1:**

- AppStore still calls `updateNowPlayingMetadata()` directly — coordinator bridge should own this
- Skip button `MenuView` component: `shouldOpenOnLongPress` prop fixes menu appearance but skip action itself was untested
- Download tracking has regressions surfaced in real usage
- More screen uses a routing pattern that breaks for nested tabs (Series, Authors)

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

| Decision                           | Rationale                                                                     | Outcome                                     |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| Event bus decoupling               | Prevents circular dependencies between coordinator and services               | ✓ Good — Phase 1 validated                  |
| Serial event processing            | Guarantees no race conditions, simpler reasoning                              | ✓ Good — <10ms average, no issues           |
| Observer mode first                | Zero-risk validation of state machine logic in production                     | ✓ Good — 122+ tests, minimal rejections     |
| playerSlice as read-only proxy     | Zustand/React integration too valuable to remove; make it reflect coordinator | ✓ Good — Phase 4 shipped cleanly            |
| YOLO rollback posture              | 122+ tests + Phase 1 production validation provides sufficient confidence     | ✓ Good — migration shipped without rollback |
| Continuous delivery between phases | Artificial wait periods add no value given test coverage                      | ✓ Good — 11 plans completed in ~1 month     |
| Custom FSM over XState             | Production-validated, XState adds 16.7kB with no functional gain              | ✓ Good — no regrets                         |

---

_Last updated: 2026-02-20 after v1.1 milestone start_
