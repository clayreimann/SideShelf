---
created: 2026-03-10T18:17:53.965Z
title: Chapter taps on item detail screen should seek and start playback
area: services
files:
  - src/components/library/LibraryItemDetail/
  - src/services/coordinator/
  - src/services/PlayerStateCoordinator.ts
---

## Problem

Tapping a chapter row (or eventually a bookmark) in the item detail screen is currently rejected by the player state machine. The tap should:

1. Seek to the chapter's start position
2. Start playback if not already playing

This means `dispatchPlayerEvent()` with the right event is either not being called on tap, or the state machine is rejecting the transition from the current state (e.g. idle/stopped) when no track is loaded yet.

## Solution

Investigate what event is dispatched on chapter row tap and trace it through `PlayerStateCoordinator`. Likely needs either:

- A new state machine transition that loads + seeks + plays in one event
- Or: load the item first (if not loaded), then seek to chapter position, then play
