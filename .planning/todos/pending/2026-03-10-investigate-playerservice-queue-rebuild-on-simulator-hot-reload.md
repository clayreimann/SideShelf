---
created: 2026-03-10T03:36:39.594Z
title: Investigate PlayerService queue rebuild on simulator hot reload
area: services
files:
  - src/services/PlayerService.ts
  - src/services/coordinator/PlayerStateCoordinator.ts
  - src/services/ProgressService.ts
  - src/services/PlayerBackgroundService.ts
---

## Problem

When hitting play on a fresh simulator build (or possibly after a hot reload), the player shows several symptoms that suggest a stale or unwired singleton from a previous JS bundle:

1. **Queue mismatch on play** — `PlayerService` logs "TrackPlayer queue missing or mismatched, rebuilding" immediately on PLAY, even for a track that was previously playing.

2. **Position reported as 0:00 despite active session at 11:03:38** — TrackPlayer returns 0:00 position, `ProgressService` correctly blocks writes ("Preventing write of currentTime=0 for active session"), and `PlayerBackgroundService` falls back to the store position. The position reconciliation works, but it suggests TrackPlayer's internal state was reset while the JS singleton was not.

3. **Smart rewind fires from 0:00 → 0:00** — Smart rewind calculates "jump back 10s from 0:00" which is a no-op, but means the rewind ran against a stale position before reconciliation completed.

4. **Double sync fired** — `ProgressService` triggers two consecutive `POST /api/session/local` calls with identical bodies (same session, same position) at 03:33:06.593Z and 03:33:06.594Z. One of these is a duplicate triggered by something other than the debounce.

5. **State machine rejects late events** — After the player is already in `playing` state, it receives `RELOAD_QUEUE`, `POSITION_RECONCILED`, and `QUEUE_RELOADED` events that were already in-flight from the queue rebuild. The coordinator correctly rejects them, but they shouldn't be arriving that late.

**Hypothesis:** The PlayerService singleton persists across hot reloads on simulator but TrackPlayer's native layer is reset, causing the JS singleton's state assumptions (queue exists, position known) to diverge from actual native state. This may have been worsened by the PlayerService refactor that introduced the coordinator.

**Not confirmed:** Whether this occurs on a cold launch (first run after install) or only on simulator hot reload / new bundle.

## Solution

1. Reproduce reliably: run fresh `npx expo run:ios`, press play immediately on a track that was previously at a non-zero position.
2. Check if `PlayerService` calls `TrackPlayer.reset()` or otherwise tears down state on app foreground after a bundle reload.
3. Look at whether the double sync is coming from two different event subscriptions firing — check if `PlayerBackgroundService` has multiple listeners registered (unwiring issue).
4. Consider whether `TrackPlayer.getQueue()` should be called defensively on app resume rather than only on PLAY.
5. Use `/gsd:debug` if the issue is hard to pin down.
