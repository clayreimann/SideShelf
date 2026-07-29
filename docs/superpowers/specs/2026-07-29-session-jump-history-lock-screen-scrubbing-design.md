# Session Jump History and Lock-Screen Scrubbing Design

## Goal

Let listeners recover from multiple position jumps during the active playback session, including jumps made from the lock screen, and make lock-screen scrubbing seek within the displayed chapter instead of treating a chapter-relative value as a book-absolute position.

## Scope

This release adds a session-scoped jump ledger. It records:

- full-screen and item-detail progress scrubs;
- lock-screen progress scrubs;
- chapter and bookmark jumps;
- in-app and lock-screen skip-button bursts; and
- unexpected native position jumps of at least 30 seconds.

It does not record normal playback progress, resume restoration, smart rewind, sleep-timer rewind, or navigation back to a history entry.

The ledger survives backgrounding and foreground UI reconstruction. It clears when playback stops or a different library item starts. It is capped at 100 newest entries.

Durable, cross-session listening history comparable to Audible is explicitly deferred. The entry model retains timestamps, source, category, item identity, and position data so a later feature can reuse the event shape without making this session ledger a long-term analytics store.

## Root Cause of Lock-Screen Scrubbing

`updateNowPlayingMetadata()` intentionally publishes chapter-relative `duration` and `elapsedTime` values to the native now-playing center. On iOS, React Native Track Player forwards `MPChangePlaybackPositionCommandEvent.positionTime` as `RemoteSeekEvent.position`. That value is therefore relative to the displayed chapter.

`PlayerBackgroundService.handleRemoteSeek()` currently dispatches the remote value directly as the absolute book position. Scrubbing to two minutes in a later chapter consequently seeks to two minutes from the beginning of the book.

The fix converts the remote value through the chapter represented by the current now-playing metadata:

```text
absolutePosition = chapter.start + remotePosition
```

The result is clamped to the displayed chapter and track bounds. If the active track has no chapters, the remote value remains an absolute track position.

## Jump Entry Model

Each entry contains:

- a unique entry ID;
- the active playback session ID when available;
- `libraryItemId`;
- source surface: full-screen player, item details, lock screen, or native player;
- category: scrub, skip forward, skip backward, chapter, bookmark, or unexpected native jump;
- `fromPosition` and `toPosition` in absolute book seconds;
- `createdAt` and `updatedAt`; and
- whether the entry still owns the pending toast notification.

The coordinator captures `fromPosition` from its authoritative context before applying the seek. Callers provide only the target and jump metadata, avoiding stale React or Zustand positions.

## Recording Architecture

Player dispatch metadata gains a structured jump descriptor and a suppression flag for history navigation. Existing seek callers label intentional jumps:

- progress controls label scrubs;
- skip controls label forward or backward skips;
- chapter and bookmark navigation label their categories; and
- remote commands label lock-screen scrubs or skips.

The coordinator is the central recorder:

1. An accepted `SEEK` captures the current context position.
2. It applies the absolute target position.
3. It appends or aggregates the jump entry.
4. It synchronizes the session ledger and pending toast marker into the player store.
5. The store persists the active session snapshot through the existing async storage layer.

Unexpected native jumps continue to be detected from `NATIVE_PROGRESS_UPDATED` when the delta is at least 30 seconds and no explicit seek or track load is in progress. Those jumps flow into the same ledger rather than a separate single pending-jump object.

The same-track `LOAD_TRACK` short circuit used by chapter and bookmark navigation must propagate the dispatch metadata into the generated `SEEK`. Loading a different item starts a new ledger instead of recording a cross-item jump.

History restoration validates the snapshot version, item identity, entry shape, and 100-entry bound. A missing, malformed, stale, or different-item snapshot is discarded.

## Skip-Burst Aggregation

Consecutive skips aggregate when all of these are true:

- they belong to the same playback session and item;
- they come from the same surface;
- they have the same direction; and
- the latest entry still owns the active toast.

The existing entry keeps its original `fromPosition`, updates `toPosition` to the newest target, and refreshes `updatedAt`. Four forward 30-second presses therefore display one `+2:00` entry from the position before the first press to the position after the fourth.

A scrub, chapter jump, bookmark jump, opposite-direction skip, different surface, toast dismissal/expiry, item change, or stop ends the burst. The next jump creates a new entry.

## Toast and Foreground Behavior

`PlayerProgressToast` becomes a summary of the ledger entry that owns the pending notification. It displays the net destination and delta and offers a translated action to view Jump History. Dismissing or expiring the toast clears only the pending marker; it does not remove the ledger entry.

When a jump occurs while the app is backgrounded, its pending marker is persisted. When the app becomes active, the toast begins a fresh visible interval rather than expiring according to time spent in the background. Additional eligible skip presses continue updating the same pending burst until the foreground toast is dismissed or expires.

## Full-Screen Player UI

The existing settings menu gains a translated `Jump History` item. Selecting it opens a bottom-sheet-style modal without leaving the player.

The modal:

- uses a shared history list component;
- renders entries newest first;
- has a translated title, empty state, and close control;
- identifies each entry's source and category;
- shows absolute `fromPosition`, `toPosition`, net delta, and relative occurrence time; and
- keeps entries available after the toast is dismissed.

Selecting an entry seeks to its `fromPosition` and marks the seek as history navigation so it does not create a new entry. The modal remains open so the listener can make another selection or close it explicitly.

## Library Item Detail UI

The item-detail screen adds a collapsible `Jump History (N)` section immediately after Chapters. It uses the same row component and formatting as the full-screen modal.

The section reads only the ledger belonging to the current playback session and renders only when the viewed `itemId` owns that session. It never shows another book's entries. For the active item with no entries, the section provides a translated empty state.

Selecting a row seeks to its `fromPosition` without recording another jump. The item-detail screen remains open.

## Error Handling

History recording is best-effort and never blocks playback. Async storage failures are logged through the tagged logger while the in-memory ledger remains usable.

If selecting an entry fails to seek, the entry remains in the ledger and the modal or inline list remains available. The failure is logged through the existing player UI logging path.

Remote seek conversion uses the chapter represented by the current track position. It clamps a chapter-relative value to that chapter's duration and then clamps the absolute value to the track duration. Missing chapter data falls back to the existing absolute behavior.

## Accessibility and Localization

The settings action, modal, modal close control, collapsible section, history rows, toast action, and dismiss control receive explicit accessibility roles and translated labels.

Each history-row label includes the source/category, original position, destination position, and signed delta. Selected history entries do not rely on color alone.

All new user-facing text is added in English and Spanish.

## Verification

Implementation follows test-driven development:

- Pure ledger tests cover append, newest-first selection, the 100-entry cap, restoration validation, item/stop reset, exclusions, toast ownership, and skip-burst aggregation.
- Coordinator tests prove that explicit seeks record the authoritative pre-seek position, same-track `LOAD_TRACK` propagates jump metadata, unexpected native jumps enter the ledger, and history navigation is suppressed.
- Remote-command tests prove that a chapter-relative lock-screen seek becomes the correct absolute book position, clamps to chapter and track bounds, and retains absolute behavior without chapters.
- Foreground tests prove that a pending background jump receives a fresh toast interval when the app becomes active.
- UI tests cover the settings-menu modal entry, newest-first modal rows, row navigation, item-detail filtering and placement, empty states, accessibility labels, and toast aggregation.
- Focused Jest tests run during each red-green cycle.
- `npx dpdm --circular src/services/PlayerService.ts` verifies the service graph remains acyclic.
- Changed-file lint/type diagnostics and the full Jest suite run before completion.

## Out of Scope

- Cross-session or server-synchronized listening history.
- Analytics, playback heat maps, or long-term event retention.
- Editing or deleting individual session entries.
- A redo stack.
- Recording ordinary playback ticks or automatic rewind behavior.
