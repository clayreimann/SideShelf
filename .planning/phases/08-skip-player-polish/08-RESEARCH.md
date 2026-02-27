# Phase 8: Skip & Player Polish - Research

**Researched:** 2026-02-27
**Domain:** React Native audio player UI — skip button gesture handling, lock screen metadata, settings persistence, and player mount-time state initialization
**Confidence:** HIGH (all findings from direct codebase inspection)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Lock Screen / Now Playing Sync

- Call `updateNowPlayingMetadata` after every SEEK_COMPLETE event — no "only if changed" optimization; correctness over micro-efficiency
- Single call with all current fields together (position + chapter title + artwork) — no partial updates that could leave an inconsistent lock screen state
- No debounce on skip-triggered metadata updates — every skip produces exactly one lock screen refresh; rapid taps each update the display
- Android `updateMetadataForTrack` artwork bug (#2287): include a device-test task in the plan; if the bug reproduces on device, document as a known upstream issue but do not block the phase on a fix we can't make in TS

#### Popover Player Display Bugs

- Both bugs (cover art missing, chapter progress stale until play) are treated as a single investigation — likely share a root cause in the initialization path after an iOS app update (path migration or coordinator state not yet propagated when the popover mounts)
- Expected behavior: correct chapter and cover art show **immediately** when the popover opens, before any user interaction — coordinator state must be read synchronously on mount
- Claude should investigate whether full-screen player is also affected (user was unsure) — fix should cover both surfaces if they share the same source

### Claude's Discretion

- Which coordinator event or state subscription the popover should read from on mount
- Where the coordinator event or state subscription the popover should read from on mount
- Whether cover art URL staleness is a coordinator bridge gap or a React component binding issue
- Exact call site for `updateNowPlayingMetadata` within the coordinator event handler (after state update vs after TrackPlayer seek resolves)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                              | Research Support                                                                                                                                                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SKIP-01 | User can short-tap skip button to execute a skip (forward or backward)                   | `SkipButton.tsx` wraps `Pressable` in `MenuView` with `shouldOpenOnLongPress` — currently the MenuView intercepts the tap gesture before `onPress` fires; removing or correctly configuring `shouldOpenOnLongPress` is the fix                                                      |
| SKIP-02 | Lock screen shows updated elapsed time after any skip (same-chapter or chapter-crossing) | `updateNowPlayingMetadata` exists in `playerSlice`; coordinator has SEEK_COMPLETE event in transitions; BGS dispatches SEEK on remote jumps but does not dispatch SEEK_COMPLETE; the gap is: no SEEK_COMPLETE dispatch after seek resolves                                          |
| PLR-01  | Skip forward interval selection persists across app sessions                             | `settingsSlice.updateJumpForwardInterval` already persists to AsyncStorage via `setJumpForwardInterval`; `FullScreenPlayer/index.tsx` reads interval from `getJumpForwardInterval()` in a `useEffect` on mount — not from Zustand; fix is to read from `useSettings()` hook instead |
| PLR-02  | Skip backward interval selection persists across app sessions                            | Same root cause as PLR-01; `FullScreenPlayer/index.tsx` reads from `getJumpBackwardInterval()` on mount rather than from the already-populated `settings.jumpBackwardInterval` Zustand state                                                                                        |

</phase_requirements>

---

## Summary

Phase 8 addresses four separate bugs across three interaction surfaces: skip button tap behavior, lock screen metadata staleness after a skip, skip interval persistence across restarts, and popover/full-screen player display regressions after iOS app updates.

The good news is that the infrastructure for all four fixes already exists. Skip intervals are already persisted to AsyncStorage by `settingsSlice`; the player already has `updateNowPlayingMetadata`; `SkipButton` already has `shouldOpenOnLongPress` on its `MenuView`. The bugs are wiring failures, not missing features. Each fix is a targeted change to an existing component or coordinator event flow.

The popover display bugs (cover art and stale chapter) share a root cause: on mount, neither `FloatingPlayer` nor `FullScreenPlayer` forces a metadata/position refresh from the coordinator. They rely on Zustand state that was last set by the coordinator bridge, which runs only when player events arrive. After an iOS app update, the coordinator's `syncStateToStore` may not have run yet when the player UI mounts, leaving `currentChapter` stale and `coverUri` pointing to an old absolute path. The fix is to call `refreshFilePathsAfterContainerChange()` and `_updateCurrentChapter(position)` synchronously on mount, or to ensure the coordinator runs `syncStateToStore` during its own app-foreground event.

**Primary recommendation:** Four targeted fixes, each in ≤2 files. No new libraries required. No architectural changes needed.

---

## Standard Stack

This phase uses only libraries already in the project.

### Core

| Library                                     | Version   | Purpose                                                                                     | Why Standard                     |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| `@react-native-menu/menu`                   | installed | Native context menu for skip interval selection                                             | Already used in `SkipButton.tsx` |
| `react-native-track-player`                 | installed | `updateMetadataForTrack`, `seekTo`, `getProgress`                                           | Audio playback library           |
| Zustand (`useAppStore`)                     | installed | `settings.jumpForwardInterval`, `settings.jumpBackwardInterval`, `updateNowPlayingMetadata` | State management                 |
| `@react-native-async-storage/async-storage` | installed | Persists jump intervals via `appSettings.ts`                                                | Already wired in `settingsSlice` |

**No new packages required.**

---

## Architecture Patterns

### Relevant Project Structure

```
src/
├── components/player/
│   └── SkipButton.tsx           # SKIP-01: shouldOpenOnLongPress is already set; bug is here
├── app/FullScreenPlayer/
│   └── index.tsx                # PLR-01/PLR-02: reads intervals from appSettings on mount, not Zustand
├── components/ui/
│   └── FloatingPlayer.tsx       # Popover display bugs live here (and possibly FullScreenPlayer)
├── services/
│   ├── PlayerBackgroundService.ts  # SKIP-02: dispatches SEEK but not SEEK_COMPLETE
│   └── PlayerService.ts            # refreshFilePathsAfterContainerChange() for cover bug
├── services/coordinator/
│   └── PlayerStateCoordinator.ts   # syncStateToStore called on SEEK_COMPLETE
├── stores/slices/
│   ├── playerSlice.ts           # updateNowPlayingMetadata
│   └── settingsSlice.ts         # updateJumpForwardInterval, updateJumpBackwardInterval
└── lib/
    └── appSettings.ts           # getJumpForwardInterval / setJumpForwardInterval
```

### Pattern 1: Coordinator Event → Store Bridge

The coordinator's `syncStateToStore(event)` is the canonical path from coordinator state to React components. It is called after every allowed transition. For SEEK_COMPLETE specifically:

- `transitions.ts` maps `SEEKING → SEEK_COMPLETE → READY`
- `syncStateToStore` runs after SEEK_COMPLETE
- `updateNowPlayingMetadata` inside `syncStateToStore` only fires when chapter changes (PROP-06 guard)

The locked decision requires calling `updateNowPlayingMetadata` unconditionally after SEEK_COMPLETE. This means adding an explicit call in `executeTransition` (or in `syncStateToStore`) that bypasses the `lastSyncedChapterId` guard specifically for seek completion.

```typescript
// Source: src/services/coordinator/PlayerStateCoordinator.ts
// syncStateToStore is called for every allowed transition
// Current chapter-change guard (PROP-06):
const currentChapterId = this.context.currentChapter?.chapter?.id?.toString() ?? null;
if (currentChapterId !== null && currentChapterId !== this.lastSyncedChapterId) {
  this.lastSyncedChapterId = currentChapterId;
  store.updateNowPlayingMetadata().catch(...);
}
```

After SEEK_COMPLETE, the position has changed but the chapter may be the same (same-chapter skip). The guard prevents `updateNowPlayingMetadata` from running in the same-chapter case. The fix: in `syncStateToStore`, add an additional unconditional call when `event.type === "SEEK_COMPLETE"`.

### Pattern 2: Skip Button Gesture — MenuView + shouldOpenOnLongPress

`SkipButton.tsx` wraps `Pressable` inside `MenuView`. `MenuView` from `@react-native-menu/menu` intercepts press events. With `shouldOpenOnLongPress`, the menu only opens on long-press — but the native gesture recognizer on iOS still competes with the `Pressable.onPress` handler.

```typescript
// Source: src/components/player/SkipButton.tsx (line 126)
<MenuView
  ...
  shouldOpenOnLongPress  // boolean prop, already set
>
  {buttonContent}  // Pressable is inside MenuView
</MenuView>
```

The bug: the `Pressable` is a child of `MenuView`. On iOS, `MenuView` holds the gesture recognizer at the container level. Even with `shouldOpenOnLongPress`, the short tap may be absorbed by the `MenuView` wrapper before reaching the `Pressable`'s `onPress`.

**Fix path:** The MEMORY.md notes this was previously fixed with `shouldOpenOnLongPress` in Phase 03.1. If that fix is already committed and still exhibiting the bug, the issue is more subtle — either the prop is not propagating correctly to native or there is a nested gesture conflict. The investigation task must confirm whether `shouldOpenOnLongPress={true}` is currently in the file (it is, confirmed on line 126) and run a device test to determine if the bug remains. If it does, restructure: move `onPress` to the `MenuView`'s `onPress` callback (if the library supports it) or use a different wrapper layout.

### Pattern 3: Settings Persistence — settingsSlice vs. Direct AsyncStorage Read

The persistence infrastructure for jump intervals already works end-to-end:

1. User changes interval → `updateJumpForwardInterval(seconds)` → optimistic Zustand update + `setJumpForwardInterval(seconds)` (AsyncStorage write)
2. App restart → `initializeSettings()` → `getJumpForwardInterval()` → Zustand populated

The problem is in `FullScreenPlayer/index.tsx`:

```typescript
// Source: src/app/FullScreenPlayer/index.tsx (lines 94-104)
useEffect(() => {
  const loadIntervals = async () => {
    const [forward, backward] = await Promise.all([
      getJumpForwardInterval(), // reads AsyncStorage directly
      getJumpBackwardInterval(), // reads AsyncStorage directly
    ]);
    setJumpForwardInterval(forward); // local component state
    setJumpBackwardInterval(backward); // local component state
  };
  loadIntervals();
}, []); // runs once on mount
```

This bypasses Zustand entirely. The component uses local `useState` for `jumpForwardInterval` and `jumpBackwardInterval` instead of reading from `useSettings()`. When the user changes the interval in the player and then reopens the player, the `useEffect` fires again and reads from AsyncStorage — which should now have the correct value. But there is a timing window where the Zustand state is updated but the component's local state has not yet re-read it.

**Fix:** Replace local `useState` + `useEffect` with `useSettings()` hook. The settings slice is initialized at app start via `useSettingsStoreInitializer`. The values are already in Zustand by the time `FullScreenPlayer` mounts.

```typescript
// Current (broken):
const [jumpForwardInterval, setJumpForwardInterval] = useState(30);
useEffect(() => {
  loadIntervals();
}, []);

// Fixed:
const { jumpForwardInterval, jumpBackwardInterval } = useSettings();
// Remove the useEffect entirely
```

### Pattern 4: Popover Mount — Stale Chapter and Cover Art

**Root cause analysis (from codebase inspection):**

`FloatingPlayer` reads from `usePlayer()`:

```typescript
const { currentTrack, currentChapter } = usePlayer();
```

`FullScreenPlayer` also reads from `usePlayer()`:

```typescript
const { currentTrack, position, currentChapter, ... } = usePlayer();
```

Both components are live-subscribed to Zustand and will re-render when any of these values change. They do NOT read stale data at mount time unless the Zustand store itself has stale data.

**Cover art staleness:** `currentTrack.coverUri` is set in `PlayerService.executeLoadTrack()` via `getCoverUri(libraryItem.id)`. `getCoverUri()` returns `Paths.cache + "covers/" + libraryItemId` — a stable path independent of iOS container path changes. However, `PlayerService.refreshFilePathsAfterContainerChange()` exists specifically to refresh the cover URI after container migrations. If this method is not being called when the app is foregrounded post-update, the stale absolute URL stored in AsyncStorage (via `_setCurrentTrack`) will be used.

The track stored in AsyncStorage (`ASYNC_KEYS.currentTrack`) contains the full `PlayerTrack` object including `coverUri`. On restore (`restorePersistedState`), the track is read from AsyncStorage and `_setCurrentTrack()` is called with the old `coverUri`. `refreshFilePathsAfterContainerChange()` is supposed to be called to fix this, but the call must happen AFTER restore.

Check where `refreshFilePathsAfterContainerChange` is called:

```typescript
// Source: src/services/PlayerService.ts (line 1049)
async refreshFilePathsAfterContainerChange(): Promise<void> {
  // ...
  const refreshedCoverUri = getCoverUri(currentTrack.libraryItemId);
  // getCoverUri uses Paths.cache which IS container-aware via expo-file-system
  // So the URI returned here should always be correct
}
```

Since `getCoverUri` uses `expo-file-system`'s `Paths.cache` (which resolves to the current container path), the cover at `getCoverUri(id)` should always point to the current container. The cover image file itself may or may not exist in cache — but the URI path is always correct. The issue is that `currentTrack.coverUri` stored in AsyncStorage contains an old `file://` absolute path from before the app update, and `refreshFilePathsAfterContainerChange` is either not being called on foreground, or it is but the image file is missing from the new container's cache.

**Chapter staleness:** `currentChapter` is derived by `_updateCurrentChapter(position)` inside `updatePosition()`. When `restorePersistedState` runs, it calls `updatePosition(asyncStoragePosition)` which calls `_updateCurrentChapter`. However, `_updateCurrentChapter` guards against running while `isLoadingTrack` is true:

```typescript
// Source: src/stores/slices/playerSlice.ts (line 463)
if (loading.isLoadingTrack) {
  log.debug("Skipping chapter update while track is loading");
  return;
}
```

After restore, if `isLoadingTrack` is still true when the popover mounts, `currentChapter` would be null. But more likely, `currentTrack` is null at that point because `_setCurrentTrack` hasn't been called yet, so `_updateCurrentChapter` returns early:

```typescript
if (!currentTrack || !currentTrack.chapters.length) {
  return;
}
```

**Confirmed pattern:** After an app update, `restorePersistedState` runs and populates `currentTrack` from AsyncStorage. `_setCurrentTrack` is called, which calls `_updateCurrentChapter(state.player.position)` — but `position` at that point is 0 (initial state), because `updatePosition` hasn't been called yet. So `currentChapter` resolves to chapter index 0 (the first chapter) regardless of actual position.

Then `updatePosition(asyncStoragePosition)` is called, which DOES call `_updateCurrentChapter(asyncStoragePosition)`. But if `isLoadingTrack` is true at that moment, it's skipped.

The chapter displayed in `FloatingPlayer` will be chapter 0 until a player event arrives that triggers `syncPositionToStore` or `syncStateToStore` and runs `updatePosition` again.

**Full-screen player investigation:** `FullScreenPlayer` uses the exact same `usePlayer()` hook and shares the same Zustand state. If `FloatingPlayer` shows stale chapter, so does `FullScreenPlayer`. The fix covers both.

### Anti-Patterns to Avoid

- **Reading AsyncStorage directly in component `useEffect`** instead of using the Zustand hook that already loaded the value (PLR-01/PLR-02 root cause)
- **Assuming coordinator bridge has run when a component mounts** — the bridge runs on events; if no event has fired since app start, Zustand state may be default values
- **Calling `updateNowPlayingMetadata` with `lastSyncedChapterId` guard for all cases** — the guard correctly debounces chapter-change metadata updates but must be bypassed for seek completion

---

## Don't Hand-Roll

| Problem                                | Don't Build                    | Use Instead                                                           | Why                                   |
| -------------------------------------- | ------------------------------ | --------------------------------------------------------------------- | ------------------------------------- |
| Jump interval selection UI             | Custom modal/popover           | `MenuView` from `@react-native-menu/menu`                             | Already in use; native look-and-feel  |
| AsyncStorage persistence for intervals | Custom key-value wrapper       | `appSettings.ts` `setJumpForwardInterval` / `setJumpBackwardInterval` | Already implemented and tested        |
| Lock screen metadata update            | Direct TrackPlayer calls       | `updateNowPlayingMetadata()` in `playerSlice`                         | Already handles all fields atomically |
| Settings state management              | Local `useState` + `useEffect` | `useSettings()` Zustand hook                                          | Already populated at app start        |

---

## Common Pitfalls

### Pitfall 1: SEEK_COMPLETE Is Never Dispatched From BGS

**What goes wrong:** The coordinator's transition matrix has `SEEKING → SEEK_COMPLETE → READY` but nothing in `PlayerBackgroundService.ts` or `PlayerService.ts` dispatches `SEEK_COMPLETE`. The `executeSeek` method calls `TrackPlayer.seekTo(position)` and returns — no follow-up event.
**Why it happens:** The seek flow was designed to use `NATIVE_PROGRESS_UPDATED` to detect seek completion (it transitions `SEEKING → READY` when progress arrives). So `SEEK_COMPLETE` in the type system exists but is unused in practice.
**How to avoid:** For SKIP-02, the implementation must choose: either dispatch `SEEK_COMPLETE` explicitly after `TrackPlayer.seekTo` resolves in `executeSeek`, OR hook into the `NATIVE_PROGRESS_UPDATED` path when the previous state was `SEEKING`. The context's `updateContextFromEvent("SEEK_COMPLETE")` sets `isSeeking = false`. For the metadata call, the `syncStateToStore` call that follows is the right place to add the unconditional `updateNowPlayingMetadata`.
**Warning signs:** Lock screen position does not update after tapping skip — confirms SEEK_COMPLETE path not being triggered.

### Pitfall 2: MenuView Gesture Conflict on iOS

**What goes wrong:** On iOS, `MenuView` from `@react-native-menu/menu` sets up a UIContextMenuInteraction at the container level. Even with `shouldOpenOnLongPress`, the gesture recognizer may still swallow short taps in some configurations, especially when the `Pressable` is a child of the `MenuView`.
**Why it happens:** The UIContextMenuInteraction API on iOS has evolved across OS versions. On iOS 16+, the interaction behavior for `shouldOpenOnLongPress` changed.
**How to avoid:** Run a device test on the actual iOS version in use (Darwin 24.6.0 → iOS 18). If `shouldOpenOnLongPress` is insufficient, the alternative is to move the `Pressable` OUTSIDE the `MenuView` and use `MenuView` only as an action container triggered by long-press events from the `Pressable` itself.
**Warning signs:** Short-tap opens the interval selection menu instead of executing the skip.

### Pitfall 3: Cover URI Uses expo-file-system Paths (Container-Aware)

**What goes wrong:** `getCoverUri` returns `Paths.cache + "covers/" + libraryItemId`. The `Paths.cache` from `expo-file-system` resolves dynamically to the current container's cache directory. However, the cover image file itself must exist at that path. After an iOS app update, the old cache directory is discarded, so the file is missing even though the URI path formula is correct.
**Why it happens:** iOS invalidates the app container's cache directory on certain updates. The cover file downloaded previously is gone; `getCoverUri` returns a valid-looking URI that 404s because the file doesn't exist.
**How to avoid:** The `CoverImage` component should handle missing-file gracefully (show a placeholder). The `refreshFilePathsAfterContainerChange` flow should detect that `getCoverUri(id)` now points to a missing file and re-download. This is a content issue (missing file) not a URI staleness issue.
**Warning signs:** Cover art shows a gray placeholder or broken image in the player but the URI looks correct in logs.

### Pitfall 4: Chapter State Zero-Position Initialization Race

**What goes wrong:** On restore, `_setCurrentTrack` is called before `updatePosition(asyncStoragePosition)`. Inside `_setCurrentTrack`, `_updateCurrentChapter(state.player.position)` runs with the CURRENT position (which is 0 at that instant), so `currentChapter` resolves to chapter 0.
**Why it happens:** The restore sequence in `restorePersistedState` sets the track first, then sets the position. Between those two calls, any Zustand subscriber that renders (React reconciliation) will see chapter 0.
**How to avoid:** The fix path is to ensure `_updateCurrentChapter` is called again after `updatePosition(asyncStoragePosition)` completes. The existing code already does this (updatePosition calls \_updateCurrentChapter internally), but the guard `if (loading.isLoadingTrack) return` must not be active at that point.

---

## Code Examples

### SKIP-01: How shouldOpenOnLongPress Is Currently Set

```typescript
// Source: src/components/player/SkipButton.tsx (lines 115-129)
return (
  <MenuView
    title={translate(...)}
    onPressAction={({ nativeEvent }) => {
      const jumpSeconds = parseInt(nativeEvent.event);
      onJump(jumpSeconds);
    }}
    actions={menuActions}
    shouldOpenOnLongPress  // this is already true — confirmed in file
  >
    {buttonContent}  // Pressable lives inside MenuView
  </MenuView>
);
```

If the bug is still present despite `shouldOpenOnLongPress`, the issue is that the native wrapper intercepts the tap regardless. The investigation must verify this on device.

### PLR-01 / PLR-02: Current Broken Pattern

```typescript
// Source: src/app/FullScreenPlayer/index.tsx (lines 62-104)
// Broken: local state bypasses Zustand
const [jumpForwardInterval, setJumpForwardInterval] = useState(30);
const [jumpBackwardInterval, setJumpBackwardInterval] = useState(15);

useEffect(() => {
  const loadIntervals = async () => {
    const [forward, backward] = await Promise.all([
      getJumpForwardInterval(), // AsyncStorage read — already done by settingsSlice on startup
      getJumpBackwardInterval(),
    ]);
    setJumpForwardInterval(forward); // populates local state, not Zustand
    setJumpBackwardInterval(backward);
  };
  loadIntervals();
}, []);
```

### PLR-01 / PLR-02: Fixed Pattern

```typescript
// Fixed: read from Zustand (already initialized at app start)
const { jumpForwardInterval, jumpBackwardInterval } = useSettings();
// Remove useState + useEffect entirely
// SkipButton.interval={jumpForwardInterval} will now always reflect current persisted value
```

### SKIP-02: Where updateNowPlayingMetadata Should Be Called After Seek

```typescript
// Source: src/services/coordinator/PlayerStateCoordinator.ts
// In syncStateToStore, add after existing chapter-change guard:
private syncStateToStore(event: PlayerEvent): void {
  // ... existing sync calls ...

  // PROP-06: Only call updateNowPlayingMetadata when chapter actually changes
  const currentChapterId = this.context.currentChapter?.chapter?.id?.toString() ?? null;
  if (currentChapterId !== null && currentChapterId !== this.lastSyncedChapterId) {
    this.lastSyncedChapterId = currentChapterId;
    store.updateNowPlayingMetadata().catch(...);
  }

  // SKIP-02 addition: unconditional call after seek completion (chapter may be same)
  if (event.type === "SEEK_COMPLETE") {
    store.updateNowPlayingMetadata().catch(...);
  }
}
```

**But SEEK_COMPLETE is never dispatched today.** The alternative is to add the unconditional `updateNowPlayingMetadata` call when the `NATIVE_PROGRESS_UPDATED` event resolves a SEEKING state:

```typescript
// In syncPositionToStore() or in handleEvent() when transitioning from SEEKING via NATIVE_PROGRESS_UPDATED:
// After position is updated and chapter is resolved, call updateNowPlayingMetadata unconditionally.
```

The cleanest implementation is to dispatch `SEEK_COMPLETE` explicitly from `executeSeek` after `TrackPlayer.seekTo` resolves, then add the `updateNowPlayingMetadata` call in `syncStateToStore` for `event.type === "SEEK_COMPLETE"`.

### Cover Art: refreshFilePathsAfterContainerChange Flow

```typescript
// Source: src/services/PlayerService.ts (line 1049)
async refreshFilePathsAfterContainerChange(): Promise<void> {
  const store = useAppStore.getState();
  const currentTrack = store.player.currentTrack;
  if (!currentTrack) return;

  const refreshedCoverUri = getCoverUri(currentTrack.libraryItemId);
  // getCoverUri uses expo-file-system Paths.cache — always current container path

  if (refreshedCoverUri !== currentTrack.coverUri) {
    const updatedTrack = { ...currentTrack, coverUri: refreshedCoverUri };
    store._setCurrentTrack(updatedTrack);
    await useAppStore.getState().updateNowPlayingMetadata();
  }
}
```

This method exists. The investigation task must confirm where it is called and whether it runs after restore on foreground. If not called, add the call to the app-foreground handler.

---

## State of the Art

| Old Approach                                                   | Current Approach                                                      | Impact                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Reading jump intervals from AsyncStorage on every player mount | Read from `settingsSlice` Zustand state (already loaded at app start) | Eliminates async read on mount; intervals always current         |
| `updateNowPlayingMetadata` only on chapter change              | `updateNowPlayingMetadata` after every SEEK_COMPLETE                  | Lock screen reflects position correctly after same-chapter skips |
| `shouldOpenOnLongPress` on `MenuView` (Phase 03.1 fix)         | Confirmed still present; need device test to verify behavior          | Short-tap executes skip, long-tap opens menu                     |

---

## Open Questions

1. **Is `refreshFilePathsAfterContainerChange` currently being called on app foreground?**
   - What we know: The method exists and correctly recalculates `coverUri`. It is called in at least one place in the codebase.
   - What's unclear: Whether the call site fires reliably after iOS app updates specifically.
   - Recommendation: Search all call sites of `refreshFilePathsAfterContainerChange` in the investigation task; add a call after `RESTORE_COMPLETE` if it's not already there.

2. **Does the SKIP-01 bug actually reproduce on device (short-tap still opens menu)?**
   - What we know: `shouldOpenOnLongPress` is present in `SkipButton.tsx`. MEMORY.md records this was fixed in Phase 03.1.
   - What's unclear: Whether the fix was truly committed and the bug is genuinely unresolved, or whether the bug manifests only on certain iOS versions.
   - Recommendation: Device test first. If the bug is gone, SKIP-01 may just need a regression test.

3. **Is `currentChapter` null or stale-at-zero when the floating player first opens after app update?**
   - What we know: `_updateCurrentChapter` guards on `isLoadingTrack`. If it runs while loading, it's a no-op.
   - What's unclear: The exact timing of `isLoadingTrack` being cleared vs. when the player UI renders after restore.
   - Recommendation: Add a log to confirm the chapter state when `FloatingPlayer` first renders after app restart.

4. **Does FullScreenPlayer show the same chapter/cover bugs as FloatingPlayer?**
   - What we know: Both use `usePlayer()` from the same Zustand state.
   - What's unclear: User was unsure.
   - Recommendation: Both are affected if the store is stale; the fix to the store applies to both.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `src/components/player/SkipButton.tsx` — skip button structure confirmed
- Direct codebase inspection: `src/app/FullScreenPlayer/index.tsx` — interval local-state pattern confirmed
- Direct codebase inspection: `src/stores/slices/settingsSlice.ts` — persistence flow confirmed end-to-end
- Direct codebase inspection: `src/stores/slices/playerSlice.ts` — `updateNowPlayingMetadata`, `_updateCurrentChapter` behavior confirmed
- Direct codebase inspection: `src/services/coordinator/PlayerStateCoordinator.ts` — `syncStateToStore`, `lastSyncedChapterId` guard confirmed
- Direct codebase inspection: `src/services/coordinator/transitions.ts` — SEEK_COMPLETE transition confirmed
- Direct codebase inspection: `src/services/PlayerBackgroundService.ts` — confirmed no SEEK_COMPLETE dispatch
- Direct codebase inspection: `src/lib/covers.ts` — `getCoverUri` uses `Paths.cache` (container-aware)
- Direct codebase inspection: `src/services/PlayerService.ts` — `refreshFilePathsAfterContainerChange` confirmed
- Direct codebase inspection: `src/stores/appStore.ts` — `useSettings()` hook confirmed
- Direct codebase inspection: `src/lib/appSettings.ts` — AsyncStorage keys confirmed

### Secondary (MEDIUM confidence)

- MEMORY.md project memory — confirms `shouldOpenOnLongPress` was added in Phase 03.1
- `src/services/coordinator/transitions.ts` — SEEKING → NATIVE_PROGRESS_UPDATED → READY: confirms current seek completion mechanism

---

## Metadata

**Confidence breakdown:**

- Skip button fix (SKIP-01): HIGH — code confirmed, `shouldOpenOnLongPress` is present; device test needed to confirm if bug is resolved or still reproducible
- Lock screen update (SKIP-02): HIGH — gap identified (no SEEK_COMPLETE dispatch), fix path clear (dispatch from executeSeek + unconditional updateNowPlayingMetadata call)
- Interval persistence (PLR-01/PLR-02): HIGH — root cause confirmed (local useState bypasses Zustand), fix is straightforward
- Popover display bugs: MEDIUM-HIGH — root cause analysis based on code inspection; exact reproduction requires device test post iOS app update

**Research date:** 2026-02-27
**Valid until:** 2026-03-30 (stable codebase, no fast-moving dependencies)
