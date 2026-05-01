---
phase: 23-pre-release-todos-and-notes
plan: "02"
subsystem: player-coordinator
tags: [chapter-navigation, smart-rewind, coordinator, dispatch-meta, cold-start]
dependency_graph:
  requires: []
  provides: [skipSmartRewind-in-DispatchMeta, chapter-tap-seek-play, cold-start-chapter-highlight]
  affects: [PlaybackControlCollaborator, PlayerStateCoordinator, ChapterList, LibraryItemDetail]
tech_stack:
  added: []
  patterns:
    - DispatchMeta extended with skipSmartRewind flag threaded through coordinator to executePlay
    - Coordinator short-circuit dispatches SEEK before PLAY when startPosition differs
    - ChapterList uses dispatchPlayerEvent directly instead of playerService.playTrack
key_files:
  created: []
  modified:
    - src/types/coordinator.ts
    - src/services/player/types.ts
    - src/services/player/PlaybackControlCollaborator.ts
    - src/services/PlayerService.ts
    - src/services/coordinator/PlayerStateCoordinator.ts
    - src/components/library/LibraryItemDetail/ChapterList.tsx
    - src/components/library/LibraryItemDetail.tsx
    - src/services/__tests__/PlaybackControlCollaborator.test.ts
decisions:
  - skipSmartRewind flag on DispatchMeta (not on individual event variants) — keeps discriminated union clean; coordinator reads meta from bus side-channel
  - Short-circuit uses this.context.position (coordinator canonical) not store.player.position — avoids test environment store mock issues and is more correct
  - ChapterList unified to always dispatch LOAD_TRACK (coordinator handles paused/playing distinction internally via short-circuit)
  - Cold-start fallback in LibraryItemDetail: display-only (progress.currentTime), no playback impact
metrics:
  duration_seconds: 293
  completed_date: "2026-05-01T23:26:35Z"
  tasks_completed: 2
  files_modified: 8
---

# Phase 23 Plan 02: Chapter Tap Seek+Play, Smart Rewind Bypass, Cold-Start Chapter Highlight Summary

Three tightly coupled player bugs fixed via DispatchMeta extension, coordinator short-circuit update, and ChapterList dispatch change.

## What Was Built

**Task 1 (TDD): DispatchMeta + skipSmartRewind in executePlay**

Extended `DispatchMeta` in `src/types/coordinator.ts` with `skipSmartRewind?: boolean`. Updated `IPlaybackControlCollaborator.executePlay` to accept `meta?: DispatchMeta`. Updated `PlaybackControlCollaborator.executePlay` to conditionally skip `applySmartRewind` when `meta.skipSmartRewind` is `true`. Normal play/resume behavior is fully preserved (no meta = smart rewind fires as before).

**Task 2: Coordinator short-circuit + chapter tap dispatch + cold-start position**

- *D-08 — Coordinator short-circuit*: When same item is re-requested while paused/playing and `startPosition` is provided and differs from `this.context.position` by more than 1 second, the coordinator dispatches `SEEK` before `PLAY`. The `meta` (including `skipSmartRewind`) is threaded through `executeTransition` so it reaches `playerService.executePlay(meta)`.
- *D-09 — Chapter tap dispatch*: `ChapterList.handleChapterPress` now uses `dispatchPlayerEvent` directly with `{ source: "ui", skipSmartRewind: true }`. The old `isCurrentlyPlaying` branch split (playTrack vs seekTo) is removed — the coordinator short-circuit handles the paused/playing case internally.
- *D-10 — Cold-start chapter highlight*: `LibraryItemDetail.tsx` passes `position || progress?.currentTime ?? 0` as `currentPosition` to `ChapterList`. When `player.position` is 0 on cold start, the persisted `mediaProgress.currentTime` is used for chapter highlight calculation. This is display-only — no playback impact.

## Tests

- TDD RED: 1 failing test added to `PlaybackControlCollaborator.test.ts` for `skipSmartRewind: true`
- TDD GREEN: Implementation made test pass; 16 total tests in that file pass
- Full test suite: 932 tests pass (3 skipped), 0 failures

## Deviations from Plan

**1. [Rule 1 - Bug] Test environment guard for short-circuit position comparison**

- **Found during:** Task 2
- **Issue:** Plan said to use `useAppStore.getState().player.position` for the short-circuit position comparison. The coordinator test file mocks `useAppStore.getState` as `jest.fn()` (returns undefined) — this would throw `TypeError: Cannot read properties of undefined (reading 'player')` in the existing coordinator integration tests.
- **Fix:** Used `this.context.position` instead (coordinator's own canonical position). This is actually more correct than reading the store — the coordinator's context is the authoritative source of truth for position.
- **Files modified:** `src/services/coordinator/PlayerStateCoordinator.ts`
- **Commit:** included in Task 2 commit (96c8838)

**2. [Rule 1 - Bug] PlayerService.executePlay facade needed meta threading**

- **Found during:** Task 2
- **Issue:** The plan specified updating `PlaybackControlCollaborator.executePlay` and the coordinator's call to `playerService.executePlay(meta)`, but `PlayerService.executePlay()` (the facade) delegates to `playbackControl.executePlay()` without passing meta.
- **Fix:** Updated `PlayerService.executePlay(meta?: DispatchMeta)` to accept and forward meta. Added `DispatchMeta` import to `PlayerService.ts`.
- **Files modified:** `src/services/PlayerService.ts`
- **Commit:** included in Task 2 commit (96c8838)

## Known Stubs

None — all three fixes are fully wired with real behavior.

## Self-Check

- [x] `src/types/coordinator.ts` contains `skipSmartRewind?: boolean` in `DispatchMeta`
- [x] `src/services/player/types.ts` contains `executePlay(meta?: DispatchMeta)`
- [x] `src/services/player/PlaybackControlCollaborator.ts` contains `if (!meta?.skipSmartRewind)`
- [x] `src/services/coordinator/PlayerStateCoordinator.ts` short-circuit dispatches `SEEK` when `startPosition` differs
- [x] `src/components/library/LibraryItemDetail/ChapterList.tsx` contains `skipSmartRewind: true`
- [x] `src/components/library/LibraryItemDetail.tsx` uses `progress?.currentTime` fallback
- [x] Commits exist: 7f359a0 (TDD RED), 3716856 (Task 1 GREEN), 96c8838 (Task 2)
- [x] Full test suite: 932 passed, 0 failed
