# Project Research Summary

**Project:** abs-react-native — PlayerStateCoordinator State Machine Migration (Phases 2–5)
**Domain:** React Native audio player — observer-to-executor state machine migration
**Researched:** 2026-02-16
**Confidence:** HIGH — all four research files are grounded in direct codebase analysis, not generic guidance

## Executive Summary

This project is a brownfield architectural migration, not a feature addition. The `PlayerStateCoordinator` was built in Phase 1 as an observing FSM that validates transitions and tracks state but does not execute side effects. Phases 2–5 complete the original design intent: the coordinator becomes the single executor of all audio commands, the canonical owner of playback position, the sole writer to the Zustand `playerSlice`, and finally the mechanism that enables deletion of 500+ lines of now-redundant coordination scaffolding scattered across `PlayerService`, `PlayerBackgroundService`, and `ProgressService`. The migration is structurally well-prepared — `executeTransition()` is already scaffolded, `observerMode` is already `false` in the committed code, and the Zustand `useAppStore.setState()` bridge API is already available.

The recommended approach requires no new dependencies and no library replacements. The existing custom FSM, Zustand 5.0.8, eventemitter3, and async-lock are all sufficient and already installed. The critical decisions are: (1) keep the custom FSM rather than migrating to XState — the coordinator is production-validated and XState adds 16.7 kB with no meaningful benefit for this use case; (2) use coordinator-pushes-via-`useAppStore.setState()` as the Zustand bridge — one direction only, no feedback loops; (3) establish a deterministic position reconciliation priority: native player > server session DB > AsyncStorage > zero.

The four phases have strict sequential dependencies that must not be shortcut. Each phase unlocks the next: Phase 2 (executor) enables Phase 3 (canonical position) because position authority only makes sense when the coordinator is the only executor. Phase 3 enables Phase 4 (read-only store proxy) because the bridge can only push canonical data after the coordinator owns it. Phase 4 enables Phase 5 (cleanup) because legacy guard flags are load-bearing until all write paths flow through the coordinator. The key risk throughout is concurrent write paths during the transition period — both old service-direct writes and new coordinator-bridge writes existing simultaneously, causing position flicker, duplicate sessions, and inconsistent UI state. The mitigation is strict phase gates with specific grep-based verification before advancing.

## Key Findings

### Recommended Stack

The entire migration works within the existing installed dependency set. No new dependencies are required. The custom FSM in `PlayerStateCoordinator.ts` + `transitions.ts` is the correct choice over XState — it is already production-validated with 122+ tests, covers all needed states, and XState's actor model would require restructuring service boundaries that is out of scope. The coordinator communicates outward via two mechanisms: `useAppStore.setState()` pushes to the Zustand playerSlice (for React UI), and `eventemitter3` emits to non-React subscribers (for services). Both mechanisms are already wired.

The single addition required in Phase 3 is extending `StateContext` with typed `positionSources` (with timestamps) to enable deterministic reconciliation. In Phase 4, a `usePlayerState(selector)` hook wraps the coordinator's subscription API for React consumers who need direct coordinator access without going through Zustand.

**Core technologies:**

- Custom FSM (`PlayerStateCoordinator` + `transitions.ts`): state machine execution control — already written, production-validated, no migration risk
- Zustand 5.0.8 (`useAppStore`): React/UI state proxy — `setState()` works outside React components as the coordinator bridge API
- async-lock 1.4.1: serial event queue — prevents race conditions in transition execution; already in use
- eventemitter3 5.0.1: coordinator-to-subscriber notification — used for diagnostics and non-React service events
- react-native-track-player 4.1.2: native audio playback — authoritative position source during active playback via `TrackPlayer.getProgress()`

**What to avoid:**

- XState (replaces working code, adds 16.7 kB, requires actor model restructuring)
- `immer` middleware in Zustand (not needed, existing spread patterns are sufficient)
- AsyncStorage as position source during live playback (100–500ms stale; write-on-pause/stop only)

### Expected Features

This migration preserves all existing user-facing behavior. No new user-visible features are delivered. The observable improvements are developer-facing: elimination of duplicate session creation, single canonical position, and reduced coordinator surface area for bugs. User-visible regression risk is the primary concern.

**Must preserve (table stakes — regression = user-visible bug):**

- Play starts at correct position on resume — complexity is HIGH in Phase 3; `MIN_PLAUSIBLE_POSITION = 5` threshold from `determineResumePosition()` must be replicated in the coordinator reconciler
- Position bar updates at 1Hz during playback — fast-path exemption for `NATIVE_PROGRESS_UPDATED` (skips async-lock) is required to maintain update frequency
- Pause/play from lock screen and notification — already dispatches to event bus; Phase 2 makes coordinator execute them
- App restore resumes correct book at correct position — most complex table-stakes item; RESTORING → READY transition must own the full restoration flow
- Progress syncs to server — `ProgressService` must read canonical position from coordinator, not from `TrackPlayer.getProgress()` directly

**Developer-reliability improvements (phase deliverables):**

- Phase 2: No duplicate play sessions; coordinator is the single executor; `observerMode` rollback remains available
- Phase 3: One position reconciliation algorithm replacing three scattered ones; cold-start restore within 5 seconds; no 30-minute position drift
- Phase 4: All playerSlice player fields written only via coordinator bridge; `isRestoringState` flag removed; chapter display driven by bridge
- Phase 5: `PlayerService.ts` under 1,100 lines (from 1,640); three large reconciliation methods deleted; `ProgressService` mutex removed

**Defer (not part of this migration):**

- New player features of any kind — migration must complete and stabilize before feature additions
- Sleep timer migration to coordinator context — retain direct playerSlice write path for now (lower risk; sleep timer does not participate in the race conditions being fixed)
- XState migration — permanently deferred; decision documented in STACK.md

### Architecture Approach

The target architecture enforces a strict "events up, commands down" invariant. All information flows upward to the coordinator via the event bus. All actions flow downward from the coordinator via `execute*` method calls on `PlayerService`. The coordinator is the single point of authority for state, position, and command execution. The Zustand `playerSlice` becomes a read-only projection of coordinator state — React components continue using `usePlayer()` with no API changes.

**Major components:**

1. `PlayerStateCoordinator` (singleton) — owns canonical state, validates transitions, executes commands via `PlayerService.execute*()`, pushes state to subscribers; no direct TrackPlayer access
2. `PlayerEventBus` — decoupled dispatch layer; services write events here, coordinator reads; never changes across all phases
3. `playerSlice` (Zustand) — React integration proxy; Phase 4 removes all write paths, retaining only read-path and UI-only state (sleep timer, modal visibility)
4. `PlayerService` — execution-only delegate; public methods dispatch events, `execute*` methods called by coordinator to call TrackPlayer; Phase 5 removes reconciliation methods
5. `PlayerBackgroundService` — forwards native TrackPlayer events to EventBus; handles remote controls; retains direct `ProgressService` calls for Android background context

**Key architectural constraint:** Android runs `PlayerBackgroundService` in a separate Headless JS context with its own coordinator instance. The background context coordinator MUST NOT write to `useAppStore` (no Zustand/React context available). DB session via `ProgressService` remains the cross-context source of truth for position.

### Critical Pitfalls

1. **Coordinator-to-service feedback loop (Phase 2)** — An `execute*` method accidentally calling `dispatchPlayerEvent()` causes the coordinator to process the same intent twice, creating an infinite dispatch loop. Prevention: enforce via JSDoc and code review that no `execute*` method dispatches events. Verification: assert event bus receives exactly one event per coordinator dispatch. Rollback: set `observerMode = true`.

2. **Dual position authority during Phase 3 transition (Phase 3)** — `PlayerBackgroundService.handlePlaybackProgressUpdated` has 14 `store.updatePosition()` call sites. If Phase 3 adds coordinator-pushed position writes before removing these, both paths run simultaneously, causing position flicker. Prevention: extract a single `setCanonicalPosition()` helper first, then swap it for the coordinator bridge in one atomic change. Verify with grep: no `store.updatePosition` in service files after Phase 3.

3. **Zustand re-render storm from NATIVE_PROGRESS_UPDATED (Phase 4)** — If `usePlayerState()` returns the full `StateContext` object, all subscribers re-render every second (position updates at 1Hz). Prevention: design `usePlayerState(selector)` with selector support from day one. Measure component render counts with React Profiler before Phase 4 begins to establish baseline.

4. **Premature legacy flag removal exposing unguarded code paths (Phase 5)** — `isRestoringState` and session creation guards protect code paths that still bypass the coordinator. Removing flags before all write paths route through the coordinator silently removes guards from those remaining paths. Prevention: for each flag removed, grep all write sites for the guarded state and confirm none remain outside coordinator-controlled paths. Recovery cost is HIGH — no coordinator rollback after Phase 5.

## Implications for Roadmap

The phase structure is already defined in `docs/plans/state-machine-migration.md`. Research confirms the ordering is correct and the dependencies are hard. The roadmap should reflect these phases without reordering.

### Phase 2: Coordinator Executes Transitions

**Rationale:** The coordinator must be the executor before it can own position or drive UI. This is the foundation all subsequent phases build on. Phase 1 is complete and production-validated — Phase 2 is the logical next step in the original design.
**Delivers:** Coordinator calls `PlayerService.execute*()` on all transitions; duplicate session creation eliminated; `observerMode` rollback remains available.
**Addresses:** Lock screen controls, play/pause from notification, no duplicate sessions, seek from headphone controls.
**Avoids:** Feedback loop pitfall — enforce no `dispatchPlayerEvent` in any `execute*` method.
**Research flag:** LOW — `executeTransition()` is already scaffolded and `observerMode = false` is already committed. Primary work is wiring service calls and adding execution tests. Standard patterns apply.

### Phase 3: Coordinator Owns Canonical Position

**Rationale:** Position reconciliation requires the coordinator to be the single executor (Phase 2). Only after Phase 2 is stable does it make sense to centralize position authority — before that, the coordinator's "canonical position" would be a shadow, not a truth.
**Delivers:** Single deterministic position reconciliation algorithm replacing three scattered ones; cold-start resume within 5 seconds; 30-minute drift eliminated; server sync reads coordinator position.
**Addresses:** Correct resume position, app restore behavior, position drift during long playback.
**Avoids:** Dual position authority pitfall — extract `setCanonicalPosition()` helper before removing existing call sites.
**Research flag:** MEDIUM — this is the most complex phase. The `MIN_PLAUSIBLE_POSITION = 5` threshold, the "native position 0 vs. native position not-yet-loaded" distinction, and the Android dual-context concern all need explicit design attention before implementation. Consider a brief design spike for the reconciliation algorithm.

### Phase 4: playerSlice Becomes Read-Only Proxy

**Rationale:** The coordinator bridge can only push canonical data to the store after it owns canonical position (Phase 3). Phase 4 before Phase 3 creates a bridge that writes potentially stale position data — worse than the current state.
**Delivers:** All playerSlice player fields written only via coordinator `subscribe()` + `syncToStore()` bridge; `isRestoringState` flag removed; `usePlayerState(selector)` hook added.
**Addresses:** Consistent UI renders, chapter display correctness, session ID alignment.
**Avoids:** Re-render storm — `usePlayerState` must accept a selector parameter; measure render counts before migration.
**Research flag:** MEDIUM — sleep timer migration decision (coordinator context vs. retained local write path) must be resolved before Phase 4 begins. The `updateNowPlayingMetadata()` trigger timing also needs explicit design before implementation.

### Phase 5: Service Simplification and Legacy Cleanup

**Rationale:** Removal is only safe after Phases 2–4 own all write paths. Guard flags and reconciliation methods are load-bearing until the coordinator is the sole path for all state changes.
**Delivers:** `PlayerService.ts` under 1,100 lines; three reconciliation methods deleted; `ProgressService` mutex removed; `isRestoringState` field deleted.
**Addresses:** Long-term maintainability; eliminates confusion from dual write paths.
**Avoids:** Premature flag removal — verify all bypass write sites are gone before removing each flag; use dependency-ordered removal.
**Research flag:** LOW — Phase 5 is pure deletion after Phase 4 is stable. Standard patterns apply. The only risk is sequencing; the research provides explicit ordering guidance.

### Phase Ordering Rationale

- **Phase 2 must precede Phase 3:** Position authority is only meaningful when the coordinator is the sole executor. The coordinator cannot be the single source of position truth if services are still independently executing playback commands.
- **Phase 3 must precede Phase 4:** The coordinator bridge can only be the canonical writer to `playerSlice` after it owns canonical position. Bridging before owning position creates a second writer for potentially stale data.
- **Phase 4 must precede Phase 5:** Legacy guard flags protect code paths that still bypass the coordinator. Deletion before Phase 4 completes silently removes guards from remaining direct-write paths. Phase 5 recovery cost is HIGH (no rollback).
- **No reordering is safe.** The dependencies are structural, not merely conventional.

### Research Flags

Phases needing deeper design attention before implementation:

- **Phase 3:** Position reconciliation algorithm complexity — the "native position 0 before queue loaded" vs. "native position 0 due to failure" distinction, `MIN_PLAUSIBLE_POSITION` threshold replication, and Android dual-coordinator context all need explicit design before coding begins. A short design spike is recommended.
- **Phase 4:** Sleep timer write path decision (coordinator context vs. retained local write) and `updateNowPlayingMetadata()` trigger timing need resolution before implementation. React Profiler baseline measurement needed before any component migration.

Phases with standard patterns (skip research-phase):

- **Phase 2:** `executeTransition()` is already scaffolded; service method split is already in place; the work is wiring and testing. No novel design required.
- **Phase 5:** Pure deletion. Ordering rules are clear from research. No novel patterns.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                                     |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | All decisions are grounded in the existing installed codebase. No new dependencies. XState rejection is well-documented with bundle size and migration risk reasoning.                    |
| Features     | HIGH       | Derived entirely from direct codebase analysis. All claims are verifiable in source files. "Features" here means migration deliverables, not new capabilities.                            |
| Architecture | HIGH       | Based on direct analysis of all relevant service files, coordinator, transitions matrix, and existing documentation. Component responsibilities and data flows are confirmed from source. |
| Pitfalls     | HIGH       | Each pitfall is grounded in specific file locations (line numbers cited). Not generic advice. The dual-context Android concern is documented in the codebase itself.                      |

**Overall confidence:** HIGH

### Gaps to Address

- **Sleep timer migration (Phase 4):** Whether `sleepTimer` moves to coordinator `StateContext` or retains a direct playerSlice write path is an unresolved design decision. It is low-risk to defer (sleep timer does not participate in race conditions), but the decision must be made before Phase 4 implementation begins to avoid rework.
- **Position reconciliation edge case — "native 0 before load" (Phase 3):** The `MIN_PLAUSIBLE_POSITION = 5` threshold in `PlayerService.determineResumePosition()` solves a specific edge case. The new coordinator reconciler must explicitly replicate this guard. Needs attention during Phase 3 design, not yet resolved in research.
- **Android background context coordinator writes (Phase 3+):** The background context coordinator must NOT write to `useAppStore`. This constraint is documented but the enforcement mechanism (whether by convention or by guard code) is not yet designed. Needs explicit design in Phase 3.
- **`updateNowPlayingMetadata()` call frequency (Phase 4):** Currently debounced to avoid hammering TrackPlayer. After Phase 4, the coordinator bridge triggers this after chapter changes. The debounce mechanism must be preserved or recreated in the bridge. Design needed before Phase 4 implementation.

## Sources

### Primary (HIGH confidence)

- `src/services/coordinator/PlayerStateCoordinator.ts` — Phase 1 implementation, `observerMode` flag, `executeTransition()` scaffold, `updateContextFromEvent()` behavior
- `src/services/coordinator/transitions.ts` — validated state transition matrix, `noOpEvents` list
- `src/services/coordinator/eventBus.ts` — event bus pattern
- `src/services/PlayerService.ts` — public/execute method split, `determineResumePosition()` (lines 646–760), `reconcileTrackPlayerState()` (lines 1183–1374), `executeLoadTrack()` (lines 223–421)
- `src/services/PlayerBackgroundService.ts` — 14 `store.updatePosition()` call sites, Android dual-context acknowledgment (lines 47–53), `handlePlaybackProgressUpdated()` (270-line function)
- `src/services/ProgressService.ts` — `startSessionLocks` mutex, session management, DB sync logic
- `src/stores/slices/playerSlice.ts` — `isRestoringState` flag, direct mutation methods, `_updateCurrentChapter()` guard
- `src/stores/appStore.ts` — `subscribeWithSelector` middleware (line 60–61), `useAppStore.setState()` API
- `docs/architecture/player-state-machine.md` — design rationale, NATIVE_STATE_CHANGED handler, observer mode behavior
- `docs/plans/state-machine-migration.md` — phase definitions, success metrics, rollback strategies, testing strategy
- `.planning/PROJECT.md` — project constraints, key decisions, out-of-scope list
- `.planning/codebase/CONCERNS.md` — known bugs (duplicate session creation), fragile areas, tech debt

### Secondary (MEDIUM confidence)

- Zustand v5 docs — external store `setState()` pattern, `subscribeWithSelector` middleware: https://zustand.docs.pmnd.rs/
- XState v5 npm (current 5.28.0): https://www.npmjs.com/package/xstate
- XState bundle size ~16.7 kB gzipped: https://bundlephobia.com/package/xstate (corroborated by multiple sources, not directly measured)
- XState custom FSM tradeoffs: https://www.rainforestqa.com/blog/selecting-a-finite-state-machine-library-for-react

---

_Research completed: 2026-02-16_
_Ready for roadmap: yes_
