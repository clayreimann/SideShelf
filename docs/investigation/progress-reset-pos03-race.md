# Progress Reset to 0:00 — POS-03 Race Condition

**Status:** Open — toast (Task 2) provides user recovery; proper fix pending
**Date:** 2026-03-22
**Symptom:** After returning from background (or triggering a queue rebuild), position resets to 0:00 and audio replays from the beginning ("opening credits again").

---

## Root Cause

The POS-03 guard (`isLoadingTrack && position === 0`) blocks native-zero during queue reconstruction, but its window closes too early:

1. `RELOAD_QUEUE` → `isLoadingTrack = true` (guard ON)
2. `executeRebuildQueue()` calls `TrackPlayer.add()` + `TrackPlayer.seekTo(position)` (async)
3. `QUEUE_RELOADED` dispatched → **`isLoadingTrack = false`** (guard OFF), `context.position = correctPos`
4. Native seek is still in flight — TrackPlayer still reports position = 0
5. `NATIVE_PROGRESS_UPDATED` fires with 0 → guard is OFF → 0 overwrites `context.position` and store
6. `ProgressService` DB guard fires ("Preventing write of currentTime=0") — audio is already at 0

**Key question:** Does `executeRebuildQueue()` `await` `TrackPlayer.seekTo()`? If the seek is fire-and-forget, the guard closes before the seek even starts.

---

## Relevant Code Locations

| Location                               | Role                                                       |
| -------------------------------------- | ---------------------------------------------------------- |
| `PlayerStateCoordinator.ts` ~line 493  | `NATIVE_PROGRESS_UPDATED` case — POS-03 guard              |
| `PlayerStateCoordinator.ts` ~line 478  | `QUEUE_RELOADED` case — clears `isLoadingTrack`            |
| `PlayerStateCoordinator.ts` ~line 1163 | Inline queue rebuild inside `executePlay()`                |
| `TrackLoadingCollaborator.ts`          | `executeRebuildQueue()` — `TrackPlayer.add()` + `seekTo()` |

---

## Open Questions

1. Does `executeRebuildQueue()` `await` `TrackPlayer.seekTo()`? If fire-and-forget, guard closes before seek starts.
2. Which foreground path triggers this? Short background (<15min) vs. long background vs. JS context recreate — `restorePersistedState()` and `syncPositionFromDatabase()` take different restoration flows.
3. Does `TrackPlayer.seekTo()` resolve before native progress events fire, or is there a guaranteed subsequent event with the correct position?
4. What is `resumeInfo.position` in the `QUEUE_RELOADED` payload? If it's already 0 here, the bug is upstream in `executeRebuildQueue()`.

---

## Logging to Add Before Next Reproduce

Add these spans before the next attempt to capture the race:

1. **In `executeRebuildQueue()`** — log `isLoadingTrack` state and `TrackPlayer.getProgress().position` immediately _after_ `await TrackPlayer.seekTo()`. Confirms whether seek completed before control returns.
2. **In `QUEUE_RELOADED` handler** — log `event.payload.position`. Confirms whether the correct position reaches the event.
3. **In `NATIVE_PROGRESS_UPDATED`** — when `!isLoadingTrack && newPosition === 0 && this.context.position > 5`, emit a warning: `[POS-03-MISS] native 0 flowing through after queue reload; context.position was X`.
4. **In `syncPositionToStore()`** — add a span attribute `positionMs` to the position update so trace dumps show exactly when store position jumps to 0.
5. **Wrap `executeRebuildQueue()`** in a trace span (`player.queue.rebuild`) with start/end positions — makes the rebuild window visible in a trace dump.

---

## Fix Options

### Option A — Extend guard to `NATIVE_STATE_CHANGED(Playing)`

Don't clear `isLoadingTrack` in `QUEUE_RELOADED`. Keep the guard active until `NATIVE_STATE_CHANGED(Playing)` fires (which already has an `isLoadingTrack = false` clause). Extends the guard window to cover the entire seek.

**Risk:** If `NATIVE_STATE_CHANGED(Playing)` never fires (error path), `isLoadingTrack` stays true permanently. Needs a timeout fallback.

### Option B — `SEEK_AFTER_RELOAD_COMPLETE` event (Precise)

Dispatch a new `SEEK_AFTER_RELOAD_COMPLETE` event from `executeRebuildQueue()` _after_ `await TrackPlayer.seekTo()` resolves. Clear `isLoadingTrack` only on this event. Precisely scopes the guard to seek completion.

**Tradeoff:** Adds a new event type; `executeRebuildQueue()` must be confirmed to actually await the seek.

### Option C — Position-based guard extension

In `NATIVE_PROGRESS_UPDATED`, keep blocking zero if `this.context.queueStatus === "valid"` AND `newPosition === 0` AND `this.context.position > 5`. Position-based — no dependency on `isLoadingTrack` timing.

**Tradeoff:** Could suppress a legitimate jump to 0 (e.g., user manually rewinds to start). The `position > 5` threshold mitigates this but doesn't eliminate it.
