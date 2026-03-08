---
phase: 12-service-decomposition
plan: 01
subsystem: services
tags:
  [typescript, facade-pattern, collaborator-pattern, testing, coverage, react-native-track-player]

# Dependency graph
requires:
  - phase: 11-useEffect-cleanup
    provides: PlayerService working with coordinator pattern, all tests green at 574
provides:
  - PlayerService facade with 4 collaborator classes (TrackLoadingCollaborator,
    PlaybackControlCollaborator, ProgressRestoreCollaborator, BackgroundReconnectCollaborator)
  - src/services/player/types.ts shared interface contracts
  - 92% statement coverage on PlayerService.ts + player/*.ts
  - Pattern for independently testable service concerns (2-7 mocks vs 13+)
affects: [12-02-download-decomposition, future-service-testing, PlayerService-callers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Facade + Collaborator: facade owns all state and public interface, collaborators are stateless and receive state via constructor injection (IPlayerServiceFacade)"
    - "types.ts interface contracts in subdirectory to prevent facade↔collaborator circular imports"
    - "Dynamic import in ProgressRestoreCollaborator.rebuildCurrentTrackIfNeeded() for TrackLoadingCollaborator to avoid potential cycles"
    - "require() in BackgroundReconnectCollaborator.reconnectBackgroundService() for PlayerBackgroundService (pre-existing pattern, CLAUDE.md documented)"
    - "forceExit: true in jest.config.js to prevent @react-native-community/netinfo open handles from blocking lint-staged"

key-files:
  created:
    - src/services/player/types.ts
    - src/services/player/TrackLoadingCollaborator.ts
    - src/services/player/PlaybackControlCollaborator.ts
    - src/services/player/ProgressRestoreCollaborator.ts
    - src/services/player/BackgroundReconnectCollaborator.ts
    - src/services/__tests__/TrackLoadingCollaborator.test.ts
    - src/services/__tests__/PlaybackControlCollaborator.test.ts
    - src/services/__tests__/ProgressRestoreCollaborator.test.ts
    - src/services/__tests__/BackgroundReconnectCollaborator.test.ts
  modified:
    - src/services/PlayerService.ts
    - src/services/__tests__/PlayerService.test.ts
    - jest.config.js

key-decisions:
  - "All 4 collaborators receive IPlayerServiceFacade in constructor, never import from PlayerService.ts directly — types.ts is the indirection layer"
  - "rebuildCurrentTrackIfNeeded placed in ProgressRestoreCollaborator (owns session restore); exposed on facade so PlaybackControlCollaborator can call it without a direct import"
  - "BackgroundReconnectCollaborator uses dynamic require() for PlayerBackgroundService per CLAUDE.md pattern"
  - "forceExit added to jest.config.js — @react-native-community/netinfo timer prevents clean jest exit when tests import ProgressService transitively"
  - "Tasks 1+2 committed together — TDD RED commit was not possible because pre-commit hook runs related tests which failed with Cannot find module"

requirements-completed: [DECOMP-01]

# Metrics
duration: 33min
completed: 2026-03-04
---

# Phase 12 Plan 01: PlayerService Decomposition Summary

**PlayerService refactored from 1,102-line god-class to pure facade + 4 collaborators, with 92% statement coverage using constructor-injected IPlayerServiceFacade interfaces**

## Performance

- **Duration:** 33 min
- **Started:** 2026-03-04T23:03:53Z
- **Completed:** 2026-03-04T23:36:xx Z
- **Tasks:** 3 (Tasks 1+2 combined due to pre-commit hook, Task 3 separate)
- **Files modified:** 13

## Accomplishments

- PlayerService.ts reduced from 1,102 lines of mixed business logic to a 280-line facade where all execute*/restore*/reconnect*/sync* methods are single-line delegates
- 4 collaborator classes in src/services/player/ each independently testable with 2-8 mocks (vs 13+ in original PlayerService)
- 92.17% combined statement coverage (target was 90%); PlaybackControlCollaborator.ts at 100%, TrackLoadingCollaborator.ts at 98%
- Zero circular dependencies in PlayerService graph (dpdm confirms)
- All 657 existing tests pass, no regressions

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: types.ts interfaces + collaborator implementations + facade refactor** - `52b17fc` (feat)
2. **Task 3: fill collaborator tests to 92% coverage** - `4872c13` (test)

_Note: Tasks 1+2 were combined because the pre-commit hook (lint-staged) runs `jest --bail --findRelatedTests` which requires the implementation to exist for the test imports to resolve._

## Files Created/Modified

- `src/services/player/types.ts` - IPlayerServiceFacade + 4 collaborator interface contracts
- `src/services/player/TrackLoadingCollaborator.ts` - executeLoadTrack, buildTrackList, reloadTrackPlayerQueue (189 lines moved)
- `src/services/player/PlaybackControlCollaborator.ts` - executePlay, executePause, executeStop, executeSeek, executeSetRate, executeSetVolume
- `src/services/player/ProgressRestoreCollaborator.ts` - restorePlayerServiceFromSession, syncPositionFromDatabase, rebuildCurrentTrackIfNeeded
- `src/services/player/BackgroundReconnectCollaborator.ts` - reconnectBackgroundService, refreshFilePathsAfterContainerChange
- `src/services/PlayerService.ts` - refactored as pure facade (implements IPlayerServiceFacade, creates collaborators in constructor)
- `src/services/__tests__/TrackLoadingCollaborator.test.ts` - 30 tests, 8 mocks
- `src/services/__tests__/PlaybackControlCollaborator.test.ts` - 9 tests, 3 mocks
- `src/services/__tests__/ProgressRestoreCollaborator.test.ts` - 20 tests, 8 mocks
- `src/services/__tests__/BackgroundReconnectCollaborator.test.ts` - 8 tests, 4 mocks
- `src/services/__tests__/PlayerService.test.ts` - extended with 12 new tests for facade methods
- `jest.config.js` - added forceExit: true (Rule 2 auto-fix for netinfo open handles)

## Decisions Made

- **IPlayerServiceFacade placed in types.ts**: Both PlayerService.ts and collaborators import from the same file, preventing circular imports. No collaborator file imports from PlayerService.ts.
- **rebuildCurrentTrackIfNeeded in ProgressRestoreCollaborator**: This method orchestrates session restore, which is ProgressRestore's concern. It is exposed on IPlayerServiceFacade so PlaybackControlCollaborator can call it without importing ProgressRestoreCollaborator directly.
- **ProgressRestoreCollaborator uses dynamic import for TrackLoadingCollaborator**: PlayerService creates both in its constructor; using dynamic import in rebuildCurrentTrackIfNeeded avoids potential issues if the module loading order were to change.
- **BackgroundReconnectCollaborator keeps require() pattern**: PlayerBackgroundService is loaded via require() to handle module cache clearing in **DEV** mode. This is a pre-existing pattern documented in CLAUDE.md.
- **forceExit added to jest config**: @react-native-community/netinfo starts an internet reachability timer that never unrefs. When ProgressService is transitively imported in tests, this timer prevents Jest from exiting cleanly. Adding forceExit fixes lint-staged --bail invocations without changing test behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added forceExit to jest.config.js**

- **Found during:** Task 3 (fill collaborator tests to 90% coverage)
- **Issue:** ProgressRestoreCollaborator tests transitively import ProgressService, which imports @react-native-community/netinfo. The netinfo module starts an internet reachability timer that never unrefs. When multiple test files were staged together in lint-staged, Jest exited with code 1 after all tests passed, causing the pre-commit hook to fail.
- **Fix:** Added `forceExit: true` to jest.config.js
- **Files modified:** jest.config.js
- **Verification:** lint-staged commit succeeded; full suite still 657 tests passing
- **Committed in:** 4872c13 (Task 3 commit)

**2. [Rule 3 - Blocking] Tasks 1 (RED stubs) and 2 (GREEN implementations) combined into single commit**

- **Found during:** Task 1 (attempting to commit RED state test stubs)
- **Issue:** The pre-commit hook runs `jest --bail --findRelatedTests` which attempts to import collaborator modules that don't exist yet. Cannot commit RED state tests because the module resolution fails.
- **Fix:** Created all collaborator implementations alongside the test stubs in a single commit.
- **Impact:** TDD RED→GREEN lifecycle was maintained logically but not split across commits.

---

**Total deviations:** 2 auto-fixed (1 missing critical infrastructure, 1 blocking workflow issue)
**Impact on plan:** Both fixes necessary for committing work. No scope creep.

## Issues Encountered

- **Pre-commit hook + TDD RED state**: Standard Jest pre-commit hooks are incompatible with TDD RED commits when the red state is "Cannot find module". Future TDD tasks in this project should either: (a) accept combined RED+GREEN commits, or (b) mock the imports in the test stubs so module resolution doesn't fail.

## Services That Pass Audit (No Split Needed)

As documented in RESEARCH.md, the following services were audited and do not need splitting:

- **PlayerBackgroundService.ts**: Module of focused event-handler functions. Each handler dispatches one coordinator event and calls one ProgressService method — testable with 2 mocks. Splitting would obscure the event registration table.
- **ProgressService.ts**: Decomposition deferred to DECOMP-03 per REQUIREMENTS.md. Would benefit from splitting but is out of scope for Phase 12.
- **ApiClientService.ts**: Single responsibility (credential storage + token refresh). All methods operate on private fields — testable with 2 mocks.
- **BundleService.ts**: Single dependency (expo-updates). Each method testable with 1 mock.
- **libraryItemBatchService.ts**: Two focused methods, each testable with 2 mocks.

## Next Phase Readiness

- Phase 12-02 (DownloadService decomposition) can begin immediately — same facade+collaborator pattern established here applies
- The `src/services/download/` directory should be created for DownloadStatusCollaborator and DownloadRepairCollaborator
- PlayerService public interface is unchanged — no callers need updates

---

_Phase: 12-service-decomposition_
_Completed: 2026-03-04_

## Self-Check: PASSED

- FOUND: src/services/player/types.ts
- FOUND: src/services/player/TrackLoadingCollaborator.ts
- FOUND: src/services/player/PlaybackControlCollaborator.ts
- FOUND: src/services/player/ProgressRestoreCollaborator.ts
- FOUND: src/services/player/BackgroundReconnectCollaborator.ts
- FOUND: src/services/**tests**/TrackLoadingCollaborator.test.ts
- FOUND: src/services/**tests**/PlaybackControlCollaborator.test.ts
- FOUND: src/services/**tests**/ProgressRestoreCollaborator.test.ts
- FOUND: src/services/**tests**/BackgroundReconnectCollaborator.test.ts
- FOUND commit: 52b17fc (feat — types.ts + collaborators + facade)
- FOUND commit: 4872c13 (test — coverage + jest.config.js forceExit)
