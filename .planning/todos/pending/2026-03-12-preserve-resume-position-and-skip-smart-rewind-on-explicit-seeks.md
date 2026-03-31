---
created: 2026-03-12T14:08:50.986Z
title: Preserve resume position and skip smart rewind on explicit seeks
area: services
files:
  - src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx
  - src/components/library/LibraryItemDetail/BookmarksSection.tsx
  - src/services/ProgressService.ts
  - src/services/PlayerService.ts
  - src/services/coordinator/
  - src/stores/slices/playerSlice.ts
---

## Problem

Two related playback-state issues surfaced during bookmark verification:

1. On some cold starts, tapping play resumes the item from `0:00` instead of the saved progress position. This appears to happen before the initial progress sync and player/store reconciliation have fully settled, so the first playback action can still use a stale zero position.
2. When the user explicitly jumps via chapter selection or bookmark selection, smart rewind should not fire. Those jumps are intentional seeks to an exact destination, so applying the rewind phase can land playback behind the requested chapter/bookmark position.

## Solution

Investigate the initial resume-position pipeline from `ProgressService` through the player coordinator and store so the first play after cold start consistently uses the reconciled resume position instead of a transient `0:00`.

For explicit chapter/bookmark jumps, thread enough intent through the player/coordinator path to distinguish user-directed seeks from rewind-eligible transport actions. Smart rewind should be skipped for chapter taps and bookmark jumps while remaining enabled for normal back/forward transport behavior.
