# Player State Machine Migration

## What This Is

A migration of the Audiobookshelf React Native app's player system from implicit state flags to an event-driven state machine. The PlayerStateCoordinator becomes the single source of truth for player state, eliminating race conditions and position drift that occur when multiple services each maintain their own view of playback state.

Phase 1 (observer mode) is complete and validated in production. This project covers Phases 2–5: giving the coordinator full execution control, centralizing position reconciliation, bridging coordinator state to the UI layer, and cleaning up legacy coordination code.

## Core Value

The coordinator owns player state — services execute its commands and report reality back, not the other way around.

## Requirements

### Validated

- ✓ Coordinator runs in observer mode in production — existing
- ✓ Event bus decouples services from coordinator (no circular dependencies) — existing
- ✓ Serial event processing eliminates race conditions in observation layer — existing
- ✓ State transition matrix validated with 122+ tests (90%+ coverage) — existing
- ✓ Diagnostics UI in Track Player screen shows real-time coordinator state — existing
- ✓ All services integrated as event sources (PlayerService, PlayerBackgroundService, ProgressService, playerSlice, index.ts) — existing

### Active

- [ ] Coordinator executes state transitions (calls service methods, not just observes)
- [ ] Services route through coordinator instead of executing directly
- [ ] Transition guards prevent invalid operations (duplicate sessions, play-when-loading, etc.)
- [ ] Coordinator owns canonical position with reconciliation from all sources (native, server, AsyncStorage)
- [ ] Position sync uses coordinator's canonical position as source of truth
- [ ] playerSlice becomes a read-only proxy reflecting coordinator context (sync strategy TBD in Phase 4 planning)
- [ ] Legacy implicit state flags removed (isLoading, isPreparing, sessionCreationInProgress, etc.)
- [ ] Services simplified to thin execution layers (coordinator validates, services execute)
- [ ] 90%+ test coverage maintained throughout all phases

### Out of Scope

- Full playerSlice removal — playerSlice stays as Zustand/React integration layer, just becomes read-only
- New player features — this is a migration, not a feature addition
- Changing the state machine topology — Phase 1 validated the transition matrix; it stays
- Performance optimization beyond what the migration naturally provides

## Context

The codebase currently has four components each maintaining independent player state:

- **PlayerService** — handles UI commands, orchestrates playback
- **PlayerBackgroundService** — processes native TrackPlayer events
- **ProgressService** — manages DB persistence and server sync
- **playerSlice** — Zustand store for UI state

This fragmentation causes race conditions (concurrent session creation), position drift (four sources of truth with scattered reconciliation), and fragile implicit coordination via boolean flags (`isRestoringState`, `sessionCreationInProgress`, etc.).

Phase 1 built the full coordinator infrastructure and validated state machine accuracy in production. The transition matrix, event bus, serial processing queue, and diagnostics are all proven. Phase 2 flips the coordinator from observer to executor.

Key architecture files:

- `src/types/coordinator.ts` — state/event type definitions
- `src/services/coordinator/eventBus.ts` — event bus
- `src/services/coordinator/transitions.ts` — state transition matrix
- `src/services/coordinator/PlayerStateCoordinator.ts` — main coordinator
- `src/services/coordinator/__tests__/` — test suite

## Constraints

- **Rollback**: The `observerMode` flag in PlayerStateCoordinator provides instant rollback for Phase 2+ — preserve it
- **Test coverage**: Must maintain >90% coverage throughout — do not proceed if tests regress
- **Continuous delivery**: No fixed validation periods between phases — move when confident
- **playerSlice stays**: Zustand/React integration is valuable; replace its write paths, not the slice itself
- **Context updates persist**: NATIVE\_\* events must continue updating coordinator context even in Phase 2+ (external controls, confirmation of execution, reality checks)

## Key Decisions

| Decision                           | Rationale                                                                     | Outcome                                    |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| Event bus decoupling               | Prevents circular dependencies between coordinator and services               | ✓ Good — Phase 1 validated                 |
| Serial event processing            | Guarantees no race conditions, simpler reasoning                              | ✓ Good — <10ms average, no issues          |
| Observer mode first                | Zero-risk validation of state machine logic in production                     | ✓ Good — 122+ tests, minimal rejections    |
| playerSlice as read-only proxy     | Zustand/React integration too valuable to remove; make it reflect coordinator | — Pending (design TBD in Phase 4 planning) |
| YOLO rollback posture              | 122+ tests + Phase 1 production validation provides sufficient confidence     | — Pending                                  |
| Continuous delivery between phases | Artificial wait periods add no value given test coverage                      | — Pending                                  |

---

_Last updated: 2026-02-16 after initialization_
