# currentTrack Ownership: PSC vs Store

## Summary

`currentTrack` (the `PlayerTrack` object) currently has **two partially-overlapping sources of truth**, which creates timing windows and necessitates workarounds in the coordinator.

## Current State

| Source                            | How it gets set                                                        | When                            |
| --------------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `store.player.currentTrack`       | `store._setCurrentTrack(track)` called directly by collaborators       | Immediately when track is built |
| `this.context.currentTrack` (PSC) | `updateContextFromEvent` on `RESTORE_STATE` and `NATIVE_TRACK_CHANGED` | After native callback fires     |

### Who writes to the store directly (bypassing PSC)

- `TrackLoadingCollaborator` — builds track from queue + DB, writes to store
- `ProgressRestoreCollaborator` — restores track from DB session, writes to store
- `BackgroundReconnectCollaborator` — updates cover URI on reconnect, writes to store
- `PlayerStateCoordinator` — writes to store **only on STOP** (to null it)

### The timing gap

`TrackLoadingCollaborator` sets `store.player.currentTrack` immediately when it builds the track. `NATIVE_TRACK_CHANGED` fires later (after the native TrackPlayer callback), which is when `this.context.currentTrack` gets set. During that window, the store has the track but the PSC context does not.

This is why `syncPositionToStore` reads `store.player.currentTrack` rather than `this.context.currentTrack` when calling `updateNowPlayingMetadata` — the context's copy is not reliably current at chapter-boundary detection time.

The documented exception lives in `syncStateToStore`:

> "currentTrack exception: Only synced on STOP (to clear). PlayerService retains responsibility for building and setting PlayerTrack objects — coordinator cannot build PlayerTrack."

## Why the PSC Can't Own It Today

The PSC is a pure event processor with no database access. `PlayerTrack` is built by collaborators that do DB lookups (`TrackLoadingCollaborator`, `ProgressRestoreCollaborator`). The PSC cannot construct the object itself.

This is a **construction** concern, not an **ownership** concern — they are separable.

## Path to PSC Ownership

Moving `currentTrack` to be PSC-owned (with the store as a read-only reflection) would eliminate the dual source of truth:

1. Collaborators dispatch a new event (e.g., `TRACK_BUILT`) carrying the `PlayerTrack` instead of calling `store._setCurrentTrack()` directly
2. `updateContextFromEvent` handles `TRACK_BUILT`, setting `this.context.currentTrack`
3. `syncStateToStore` syncs `currentTrack` to the store on every structural event (not just STOP)
4. `PlayerBackgroundService` continues reading from the store — no change needed

**Benefits:**

- Single source of truth in PSC context (consistent with how `position`, `isPlaying`, `sessionId`, etc. are all managed)
- `syncPositionToStore` and `syncStateToStore` can use `this.context.currentTrack` directly without the one-tick lag risk
- Eliminates the timing window between collaborator write and `NATIVE_TRACK_CHANGED`

**Risks to audit before doing this:**

- Cold-start / `RESTORE_STATE` path: the store is hydrated from AsyncStorage before the PSC processes any events — need to ensure `RESTORE_STATE` still sets context correctly
- Background mode: `NATIVE_TRACK_CHANGED` may behave differently in headless Android BGS context
- Queue reloads (`RELOAD_QUEUE` / `QUEUE_RELOADED`): verify the track object is still valid post-reload
- All callers of `store._setCurrentTrack()` must be converted to the new event

## Related

- `src/services/coordinator/PlayerStateCoordinator.ts` — `syncStateToStore`, `syncPositionToStore`, `updateContextFromEvent`
- `src/services/player/TrackLoadingCollaborator.ts`
- `src/services/player/ProgressRestoreCollaborator.ts`
- `src/lib/nowPlayingMetadata.ts` — created in `fix-lockscreen-time-sync` branch as a workaround for the position lag; reads track from store rather than PSC context for the same reason
