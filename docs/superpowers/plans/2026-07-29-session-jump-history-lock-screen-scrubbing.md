# Session Jump History and Lock-Screen Scrubbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recoverable, session-scoped history of listener-initiated position jumps and convert chapter-relative lock-screen scrubs into correct book-absolute seeks.

**Architecture:** Pure helpers define and reduce a bounded jump ledger; the player coordinator records accepted seeks from its authoritative pre-seek position and flushes entries into the player slice. The slice persists one active-item session snapshot for foreground/background context handoff, while shared React Native components render the same newest-first ledger in the full-screen player and item details.

**Tech Stack:** TypeScript, React Native, Expo Router, Zustand, AsyncStorage, React Native Track Player, Jest, React Native Testing Library.

## Global Constraints

- Record full-screen and item-detail scrubs, lock-screen scrubs, chapter and bookmark jumps, in-app and lock-screen skip bursts, and unexpected native jumps of at least 30 seconds.
- Do not record normal playback, resume restoration, smart rewind, sleep-timer rewind, or navigation from a history entry.
- The ledger survives backgrounding and foreground UI reconstruction, clears on stop or item change, and retains at most 100 newest entries.
- Consecutive skips aggregate only for the same session, item, surface, direction, and active toast.
- Lock-screen seek input is chapter-relative when chapter metadata is active and must be converted to an absolute book position.
- All new user-facing text and accessibility labels must exist in English and Spanish.
- Long-term Audible-style listening history, analytics, entry deletion, and redo are out of scope.
- Keep database access unchanged; this feature uses the existing async storage layer only.
- Use `@/` imports, tagged logging, existing store hooks, and no circular service imports.

---

## File Structure

### New files

- `src/lib/helpers/jumpHistory.ts` — pure ledger creation, append/aggregation, dismissal, lookup, and validation.
- `src/lib/helpers/__tests__/jumpHistory.test.ts` — pure behavioral coverage for the ledger.
- `src/components/player/JumpHistoryList.tsx` — shared newest-first accessible history rows.
- `src/components/player/JumpHistoryModal.tsx` — bottom-sheet-style modal used by the full-screen player.
- `src/components/player/__tests__/JumpHistoryList.test.tsx` — row order, labels, and selection behavior.
- `src/components/player/__tests__/JumpHistoryModal.test.tsx` — modal title, empty state, close, and delegated selection.
- `src/components/library/LibraryItemDetail/JumpHistorySection.tsx` — active-item-only collapsible detail section.
- `src/components/library/LibraryItemDetail/__tests__/JumpHistorySection.test.tsx` — item filtering, empty state, and suppressed history navigation.
- `src/app/FullScreenPlayer/playerSettingsActions.ts` — typed construction of the existing settings actions plus Jump History.
- `src/app/FullScreenPlayer/__tests__/playerSettingsActions.test.ts` — menu-state and Jump History action coverage.
- `src/components/ui/__tests__/PlayerProgressToast.test.tsx` — foreground restoration, timer, aggregation display, dismissal, and modal navigation.
- `src/services/__tests__/PlayerBackgroundServiceRemoteCommands.test.ts` — remote seek/skip dispatch and progress-update contracts.

### Modified files

- `src/types/player.ts` — jump descriptor, entry, session, and record input types.
- `src/types/coordinator.ts` — jump metadata and suppression fields on `DispatchMeta`.
- `src/lib/asyncStore.ts` — active jump-session key.
- `src/stores/slices/playerSlice.ts` — ledger state, persistence, restoration, lifecycle reset, modal state, and actions.
- `src/stores/slices/__tests__/playerSlice.test.ts` — persistence and lifecycle tests.
- `src/stores/appStore.ts` — expose ledger/modal fields and UI actions through `usePlayer()`.
- `src/services/coordinator/PlayerStateCoordinator.ts` — authoritative jump capture and store flush.
- `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts` — explicit, suppressed, unexpected, and same-track metadata tests.
- `src/services/PlayerService.ts` — typed seek options forwarded as dispatch metadata.
- `src/services/__tests__/PlayerService.test.ts` — public seek metadata contract.
- `src/lib/nowPlayingMetadata.ts` — pure chapter-relative-to-absolute remote seek conversion.
- `src/lib/__tests__/nowPlayingMetadata.test.ts` — conversion and clamping tests.
- `src/services/PlayerBackgroundService.ts` — corrected remote scrub target, tagged remote skips, and test shims.
- `src/app/FullScreenPlayer/index.tsx` — tag jump sources, use typed settings actions, and render the history modal.
- `src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx` — tag item-detail skip bursts.
- `src/components/library/LibraryItemDetail/ChapterList.tsx` — tag chapter navigation.
- `src/components/library/LibraryItemDetail/BookmarksSection.tsx` — tag bookmark navigation and start inactive items at the bookmark.
- `src/components/library/LibraryItemDetail.tsx` — insert Jump History immediately after Chapters.
- `src/components/ui/PlayerProgressToast.tsx` — ledger-backed foreground-aware summary and View History action.
- `src/i18n/locales/en.ts` — English history strings and accessibility copy.
- `src/i18n/locales/es.ts` — Spanish history strings and accessibility copy.
- `src/__tests__/mocks/stores.ts` and coordinator-local store mocks — new player slice fields/actions.

---

### Task 1: Pure jump-ledger model and reducer

**Files:**

- Modify: `src/types/player.ts`
- Create: `src/lib/helpers/jumpHistory.ts`
- Create: `src/lib/helpers/__tests__/jumpHistory.test.ts`

**Interfaces:**

- Produces:

```typescript
export type JumpSurface = "full_screen" | "item_detail" | "lock_screen" | "native_player";

export type JumpCategory =
  | "scrub"
  | "skip_forward"
  | "skip_backward"
  | "chapter"
  | "bookmark"
  | "unexpected_native";

export interface JumpDescriptor {
  surface: JumpSurface;
  category: JumpCategory;
}

export interface JumpHistoryEntry extends JumpDescriptor {
  id: string;
  sessionId: string | null;
  libraryItemId: string;
  fromPosition: number;
  toPosition: number;
  createdAt: number;
  updatedAt: number;
  toastPending: boolean;
}

export interface JumpHistorySession {
  version: 1;
  libraryItemId: string;
  entries: JumpHistoryEntry[];
}

export type JumpRecordInput = Omit<JumpHistoryEntry, "toastPending">;
```

```typescript
export const MAX_JUMP_HISTORY_ENTRIES = 100;
export function recordJump(
  session: JumpHistorySession | null,
  input: JumpRecordInput
): JumpHistorySession;
export function dismissPendingJump(session: JumpHistorySession | null): JumpHistorySession | null;
export function getPendingJump(session: JumpHistorySession | null): JumpHistoryEntry | null;
export function validateJumpHistorySession(
  value: unknown,
  libraryItemId: string
): JumpHistorySession | null;
```

- [ ] **Step 1: Write failing reducer tests**

Create literal fixtures and tests that identify the exact mutations they catch:

```typescript
const firstSkip: JumpRecordInput = {
  id: "jump-1",
  sessionId: "session-1",
  libraryItemId: "item-1",
  surface: "full_screen",
  category: "skip_forward",
  fromPosition: 100,
  toPosition: 130,
  createdAt: 1_000,
  updatedAt: 1_000,
};

it("aggregates a same-surface forward skip while the prior toast is pending", () => {
  const first = recordJump(null, firstSkip);
  const aggregated = recordJump(first, {
    ...firstSkip,
    id: "jump-2",
    fromPosition: 130,
    toPosition: 220,
    createdAt: 2_000,
    updatedAt: 2_000,
  });

  expect(aggregated.entries).toEqual([
    expect.objectContaining({
      id: "jump-1",
      fromPosition: 100,
      toPosition: 220,
      createdAt: 1_000,
      updatedAt: 2_000,
      toastPending: true,
    }),
  ]);
});

it("starts a new entry after the toast is dismissed", () => {
  const dismissed = dismissPendingJump(recordJump(null, firstSkip));
  const next = recordJump(dismissed, {
    ...firstSkip,
    id: "jump-2",
    fromPosition: 130,
    toPosition: 160,
    createdAt: 2_000,
    updatedAt: 2_000,
  });

  expect(next.entries.map((entry) => entry.id)).toEqual(["jump-2", "jump-1"]);
});
```

Add separate tests for opposite direction, different surface, non-skip categories, item change, `getPendingJump`, newest-first ordering, the 100-entry cap, a valid restored snapshot, malformed entries, and a different `libraryItemId`.

- [ ] **Step 2: Run the pure tests and verify RED**

Run:

```bash
npx jest src/lib/helpers/__tests__/jumpHistory.test.ts --runInBand
```

Expected: FAIL because `JumpHistoryEntry`, `recordJump`, and the other ledger interfaces/functions do not exist.

- [ ] **Step 3: Add the types and minimal pure implementation**

Implement newest-first storage and explicit aggregation:

```typescript
function canAggregate(previous: JumpHistoryEntry, next: JumpRecordInput): boolean {
  return (
    previous.toastPending &&
    previous.libraryItemId === next.libraryItemId &&
    previous.sessionId === next.sessionId &&
    previous.surface === next.surface &&
    previous.category === next.category &&
    (next.category === "skip_forward" || next.category === "skip_backward")
  );
}

export function recordJump(
  session: JumpHistorySession | null,
  input: JumpRecordInput
): JumpHistorySession {
  const active =
    session?.libraryItemId === input.libraryItemId
      ? session
      : { version: 1 as const, libraryItemId: input.libraryItemId, entries: [] };
  const [latest, ...older] = active.entries;

  if (latest && canAggregate(latest, input)) {
    return {
      ...active,
      entries: [
        { ...latest, toPosition: input.toPosition, updatedAt: input.updatedAt },
        ...older,
      ].slice(0, MAX_JUMP_HISTORY_ENTRIES),
    };
  }

  const cleared = active.entries.map((entry) =>
    entry.toastPending ? { ...entry, toastPending: false } : entry
  );
  return {
    ...active,
    entries: [{ ...input, toastPending: true }, ...cleared].slice(0, MAX_JUMP_HISTORY_ENTRIES),
  };
}
```

Use structural guards in `validateJumpHistorySession`; never cast unvalidated JSON directly to `JumpHistorySession`.

- [ ] **Step 4: Run the pure tests and verify GREEN**

Run:

```bash
npx jest src/lib/helpers/__tests__/jumpHistory.test.ts --runInBand
```

Expected: PASS with all ledger behaviors covered.

- [ ] **Step 5: Commit the pure ledger**

```bash
git add src/types/player.ts src/lib/helpers/jumpHistory.ts src/lib/helpers/__tests__/jumpHistory.test.ts
git commit -m "feat: add session jump ledger"
```

---

### Task 2: Player-slice persistence, restoration, and lifecycle

**Files:**

- Modify: `src/lib/asyncStore.ts`
- Modify: `src/stores/slices/playerSlice.ts`
- Modify: `src/stores/slices/__tests__/playerSlice.test.ts`
- Modify: `src/stores/appStore.ts`
- Modify: `src/__tests__/mocks/stores.ts`

**Interfaces:**

- Consumes: Task 1 ledger types and pure helpers.
- Produces:

```typescript
player.jumpHistory: JumpHistorySession | null;
player.isJumpHistoryModalVisible: boolean;

_recordJump(input: JumpRecordInput): void;
_dismissJumpToast(): void;
_clearJumpHistory(): void;
restoreJumpHistory(): Promise<void>;
setJumpHistoryModalVisible(visible: boolean): void;
```

- [ ] **Step 1: Write failing slice tests**

Extend the initial-state assertion and add focused tests:

```typescript
it("records and persists a jump for the current item", () => {
  store.getState()._setCurrentTrack(mockPlayerTrack);
  store.getState()._recordJump({
    id: "jump-1",
    sessionId: "session-1",
    libraryItemId: "item-1",
    surface: "full_screen",
    category: "scrub",
    fromPosition: 100,
    toPosition: 500,
    createdAt: 1_000,
    updatedAt: 1_000,
  });

  expect(store.getState().player.jumpHistory?.entries[0].fromPosition).toBe(100);
  expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
    ASYNC_KEYS.jumpHistorySession,
    expect.stringContaining('"jump-1"')
  );
});

it("clears jump history when a different item becomes current", () => {
  store.getState()._setCurrentTrack(mockPlayerTrack);
  store.getState()._recordJump(jumpInput);
  store.getState()._setCurrentTrack({ ...mockPlayerTrack, libraryItemId: "item-2" });

  expect(store.getState().player.jumpHistory).toBeNull();
  expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith(ASYNC_KEYS.jumpHistorySession);
});

it("restores only a valid snapshot for the current item", async () => {
  store.getState()._setCurrentTrack(mockPlayerTrack);
  mockedAsyncStorage.getItem.mockImplementation(async (key) =>
    key === ASYNC_KEYS.jumpHistorySession ? JSON.stringify(validSession) : null
  );

  await store.getState().restoreJumpHistory();

  expect(store.getState().player.jumpHistory).toEqual(validSession);
});
```

Also cover stop/`_setCurrentTrack(null)`, toast dismissal without entry deletion, item mismatch rejection, malformed snapshot rejection, and modal visibility.

Add a cold-restoration test in the existing `restorePersistedState` block proving that a restored `currentTrack` is established before the matching jump snapshot is validated and restored.

- [ ] **Step 2: Run slice tests and verify RED**

Run:

```bash
npx jest src/stores/slices/__tests__/playerSlice.test.ts --runInBand
```

Expected: FAIL because the new key, state, and actions are absent.

- [ ] **Step 3: Implement persistence and UI state**

Add:

```typescript
export const ASYNC_KEYS = {
  // existing keys
  jumpHistorySession: "abs.jumpHistorySession",
};
```

Use a single best-effort persistence helper inside the slice:

```typescript
const persistJumpHistory = (session: JumpHistorySession | null) => {
  void saveItem(ASYNC_KEYS.jumpHistorySession, session).catch((error) => {
    log.error("[persistJumpHistory] Failed to persist jump history", error as Error);
  });
};
```

Implement `_recordJump` with `get()` and `recordJump()`, `_dismissJumpToast` with `dismissPendingJump()`, and `restoreJumpHistory` with `getAsyncItem()` plus `validateJumpHistorySession()`. Update `_setCurrentTrack` so `null` or a different `libraryItemId` clears the ledger. Do not clear it when the same item is rehydrated.

Call `await get().restoreJumpHistory()` inside `restorePersistedState()` immediately after the current-track restoration block. This ordering is required because snapshot validation uses the active `libraryItemId`.

Expose `jumpHistory`, `isJumpHistoryModalVisible`, and `setJumpHistoryModalVisible` as individual selectors in `usePlayer()`; do not introduce an object-returning selector.

- [ ] **Step 4: Run slice tests and verify GREEN**

Run:

```bash
npx jest src/stores/slices/__tests__/playerSlice.test.ts --runInBand
```

Expected: PASS, including persistence and lifecycle cases.

- [ ] **Step 5: Commit player-slice integration**

```bash
git add src/lib/asyncStore.ts src/stores/slices/playerSlice.ts src/stores/slices/__tests__/playerSlice.test.ts src/stores/appStore.ts src/__tests__/mocks/stores.ts
git commit -m "feat: persist active jump session"
```

---

### Task 3: Coordinator-owned authoritative jump capture

**Files:**

- Modify: `src/types/coordinator.ts`
- Modify: `src/services/coordinator/PlayerStateCoordinator.ts`
- Modify: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`

**Interfaces:**

- Consumes: `JumpDescriptor`, `JumpRecordInput`, and player-slice `_recordJump`.
- Produces:

```typescript
export type DispatchMeta = {
  source?: EventSource;
  restoreSessionId?: string;
  skipSmartRewind?: boolean;
  jump?: JumpDescriptor;
  suppressJumpHistory?: boolean;
};
```

- [ ] **Step 1: Write failing coordinator tests**

Update coordinator store mocks with `_recordJump` and add:

```typescript
it("records an explicit seek from the coordinator's pre-seek position", async () => {
  await coordinator.dispatch({
    type: "NATIVE_PROGRESS_UPDATED",
    payload: { position: 100, duration: 3600 },
  });
  jest.clearAllMocks();

  await coordinator.dispatch(
    { type: "SEEK", payload: { position: 500 } },
    { source: "ui", jump: { surface: "full_screen", category: "scrub" } }
  );
  await waitForEventQueue();

  expect(mockStore._recordJump).toHaveBeenCalledWith(
    expect.objectContaining({
      libraryItemId: "item-1",
      fromPosition: 100,
      toPosition: 500,
      surface: "full_screen",
      category: "scrub",
    })
  );
});

it("does not record history navigation", async () => {
  await coordinator.dispatch(
    { type: "SEEK", payload: { position: 100 } },
    { source: "ui", suppressJumpHistory: true }
  );
  await waitForEventQueue();
  expect(mockStore._recordJump).not.toHaveBeenCalled();
});
```

Convert the existing unexpected-jump assertions from `_setPendingProgressJump` to `_recordJump`, and add a same-track `LOAD_TRACK` test proving its jump metadata reaches the generated `SEEK`.

- [ ] **Step 2: Run coordinator tests and verify RED**

Run:

```bash
npx jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --runInBand
```

Expected: FAIL because dispatch metadata has no jump contract and the coordinator still flushes a single pending toast object.

- [ ] **Step 3: Implement pre-event capture and unified flush**

Before `updateContextFromEvent(event)`, snapshot:

```typescript
const before = {
  position: this.context.position,
  isSeeking: this.context.isSeeking,
  isLoadingTrack: this.context.isLoadingTrack,
  currentTrack: this.context.currentTrack,
  sessionId: this.context.sessionId,
};
```

After updating allowed context, create `_pendingJumpRecord` for:

```typescript
if (event.type === "SEEK" && meta?.jump && !meta.suppressJumpHistory && before.currentTrack) {
  this._pendingJumpRecord = {
    id: `${before.currentTrack.libraryItemId}:${Date.now()}:${this.jumpSequence++}`,
    sessionId: before.sessionId,
    libraryItemId: before.currentTrack.libraryItemId,
    ...meta.jump,
    fromPosition: before.position,
    toPosition: event.payload.position,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
```

For `NATIVE_PROGRESS_UPDATED`, record `unexpected_native` only when the pre-event snapshot was neither seeking nor loading and the delta is at least 30 seconds. Remove `_pendingProgressJump`; flush `_pendingJumpRecord` through `store._recordJump()` from both store-sync methods.

Thread `meta` into the same-track short-circuit seek:

```typescript
dispatchPlayerEvent({ type: "SEEK", payload: { position: startPos } }, meta);
```

- [ ] **Step 4: Run coordinator tests and verify GREEN**

Run:

```bash
npx jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --runInBand
```

Expected: PASS for explicit, suppressed, unexpected, loading/seek exclusion, and metadata propagation.

- [ ] **Step 5: Commit coordinator capture**

```bash
git add src/types/coordinator.ts src/services/coordinator/PlayerStateCoordinator.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
git commit -m "feat: record authoritative player jumps"
```

---

### Task 4: Typed seek options and in-app jump sources

**Files:**

- Modify: `src/services/PlayerService.ts`
- Modify: `src/services/__tests__/PlayerService.test.ts`
- Modify: `src/app/FullScreenPlayer/index.tsx`
- Modify: `src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx`
- Modify: `src/components/library/LibraryItemDetail/ChapterList.tsx`
- Modify: `src/components/library/LibraryItemDetail/BookmarksSection.tsx`

**Interfaces:**

- Consumes: Task 3 `DispatchMeta.jump` and `suppressJumpHistory`.
- Produces:

```typescript
export type SeekOptions = Pick<DispatchMeta, "jump" | "suppressJumpHistory">;
async seekTo(position: number, options?: SeekOptions): Promise<void>;
```

- [ ] **Step 1: Write the failing PlayerService metadata test**

```typescript
it("forwards jump metadata with a public seek", async () => {
  await playerService.seekTo(500, {
    jump: { surface: "full_screen", category: "scrub" },
  });

  expect(dispatchPlayerEvent).toHaveBeenCalledWith(
    { type: "SEEK", payload: { position: 500 } },
    {
      source: "ui",
      jump: { surface: "full_screen", category: "scrub" },
    }
  );
});
```

Add a second test for `{ suppressJumpHistory: true }`.

- [ ] **Step 2: Run PlayerService tests and verify RED**

Run:

```bash
npx jest src/services/__tests__/PlayerService.test.ts --runInBand
```

Expected: FAIL because `seekTo` accepts one argument and drops options.

- [ ] **Step 3: Implement seek options and tag every in-app source**

Implement:

```typescript
async seekTo(position: number, options?: SeekOptions): Promise<void> {
  dispatchPlayerEvent(
    { type: "SEEK", payload: { position } },
    { source: "ui", ...options }
  );
}
```

Use exact descriptors:

```typescript
// Full-screen progress bar
playerService.seekTo(value, {
  jump: { surface: "full_screen", category: "scrub" },
});

// Full-screen forward skip; backward uses skip_backward
playerService.seekTo(targetPosition, {
  jump: { surface: "full_screen", category: "skip_forward" },
});

// Full-screen chapter controls/list
playerService.seekTo(chapterStart, {
  jump: { surface: "full_screen", category: "chapter" },
});

// Item-detail skips
playerService.seekTo(targetPosition, {
  jump: { surface: "item_detail", category: "skip_forward" },
});

// Current-item bookmark
playerService.seekTo(time, {
  jump: { surface: "item_detail", category: "bookmark" },
});
```

For an inactive bookmark, replace the racy `playTrack(); seekTo()` pair with `playTrack(libraryItemId, undefined, time)`. Add chapter jump metadata to the item-detail `LOAD_TRACK` dispatch; the coordinator records it only when the same item is already active.

- [ ] **Step 4: Run focused service and existing component tests**

Run:

```bash
npx jest src/services/__tests__/PlayerService.test.ts src/components/player/__tests__/ChapterList.test.tsx --runInBand
```

Expected: PASS with seek metadata forwarded and existing chapter-list behavior unchanged.

- [ ] **Step 5: Commit in-app source tagging**

```bash
git add src/services/PlayerService.ts src/services/__tests__/PlayerService.test.ts src/app/FullScreenPlayer/index.tsx src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx src/components/library/LibraryItemDetail/ChapterList.tsx src/components/library/LibraryItemDetail/BookmarksSection.tsx
git commit -m "feat: classify in-app playback jumps"
```

---

### Task 5: Correct and record lock-screen seek/skip commands

**Files:**

- Modify: `src/lib/nowPlayingMetadata.ts`
- Modify: `src/lib/__tests__/nowPlayingMetadata.test.ts`
- Modify: `src/services/PlayerBackgroundService.ts`
- Create: `src/services/__tests__/PlayerBackgroundServiceRemoteCommands.test.ts`

**Interfaces:**

- Produces:

```typescript
export function resolveAbsoluteRemoteSeekPosition(
  track: PlayerTrack | null,
  currentAbsolutePosition: number,
  remotePosition: number
): number;
```

- [ ] **Step 1: Write failing conversion tests**

```typescript
it("adds the active chapter start to a chapter-relative remote seek", () => {
  expect(resolveAbsoluteRemoteSeekPosition(mockTrack, 1900, 120)).toBe(1920);
});

it("clamps a remote seek to the displayed chapter", () => {
  expect(resolveAbsoluteRemoteSeekPosition(mockTrack, 1900, 9999)).toBe(3600);
});

it("keeps remote seek absolute when the track has no chapters", () => {
  expect(resolveAbsoluteRemoteSeekPosition({ ...mockTrack, chapters: [] }, 1900, 120)).toBe(120);
});
```

- [ ] **Step 2: Run metadata tests and verify RED**

Run:

```bash
npx jest src/lib/__tests__/nowPlayingMetadata.test.ts --runInBand
```

Expected: FAIL because the conversion helper is missing.

- [ ] **Step 3: Implement conversion beside chapter resolution**

```typescript
export function resolveAbsoluteRemoteSeekPosition(
  track: PlayerTrack | null,
  currentAbsolutePosition: number,
  remotePosition: number
): number {
  const trackDuration = Math.max(0, track?.duration ?? 0);
  if (!track?.chapters.length) {
    return trackDuration > 0
      ? Math.max(0, Math.min(trackDuration, remotePosition))
      : Math.max(0, remotePosition);
  }

  const chapter = resolveChapterAtPosition(track.chapters, currentAbsolutePosition);
  const chapterDuration = Math.max(0, chapter.end - chapter.start);
  const relative = Math.max(0, Math.min(chapterDuration, remotePosition));
  return Math.max(0, Math.min(trackDuration || chapter.end, chapter.start + relative));
}
```

- [ ] **Step 4: Write failing remote-command handler tests**

Expose the three existing module functions through the established BGS test-shim object, then assert:

```typescript
await handleRemoteSeek({ position: 120 });

expect(dispatchPlayerEvent).toHaveBeenCalledWith(
  { type: "SEEK", payload: { position: 1920 } },
  {
    source: "remote_command",
    jump: { surface: "lock_screen", category: "scrub" },
  }
);
expect(progressService.updateProgress).toHaveBeenCalledWith(
  "user-1",
  "item-1",
  1920,
  1,
  1,
  undefined,
  true
);
```

Add forward/backward tests proving remote skips carry `lock_screen` plus the correct skip category.

- [ ] **Step 5: Run remote-command tests and verify RED**

Run:

```bash
npx jest src/services/__tests__/PlayerBackgroundServiceRemoteCommands.test.ts --runInBand
```

Expected: FAIL because the remote handler dispatches the raw relative value and remote commands lack jump metadata.

- [ ] **Step 6: Implement corrected remote commands**

In `handleRemoteSeek`, read `TrackPlayer.getProgress()` once, resolve against `useAppStore.getState().player.currentTrack`, and use the absolute target for both the coordinator event and immediate progress update. Add lock-screen jump descriptors to remote skip handlers without changing their target arithmetic.

- [ ] **Step 7: Run metadata and remote-command tests**

Run:

```bash
npx jest src/lib/__tests__/nowPlayingMetadata.test.ts src/services/__tests__/PlayerBackgroundServiceRemoteCommands.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit lock-screen correction**

```bash
git add src/lib/nowPlayingMetadata.ts src/lib/__tests__/nowPlayingMetadata.test.ts src/services/PlayerBackgroundService.ts src/services/__tests__/PlayerBackgroundServiceRemoteCommands.test.ts
git commit -m "fix: resolve chapter-relative lock screen seeks"
```

---

### Task 6: Shared history list, modal, item-detail section, and settings entry

**Files:**

- Create: `src/components/player/JumpHistoryList.tsx`
- Create: `src/components/player/JumpHistoryModal.tsx`
- Create: `src/components/player/__tests__/JumpHistoryList.test.tsx`
- Create: `src/components/player/__tests__/JumpHistoryModal.test.tsx`
- Create: `src/components/library/LibraryItemDetail/JumpHistorySection.tsx`
- Create: `src/components/library/LibraryItemDetail/__tests__/JumpHistorySection.test.tsx`
- Create: `src/app/FullScreenPlayer/playerSettingsActions.ts`
- Create: `src/app/FullScreenPlayer/__tests__/playerSettingsActions.test.ts`
- Modify: `src/app/FullScreenPlayer/index.tsx`
- Modify: `src/components/library/LibraryItemDetail.tsx`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/es.ts`

**Interfaces:**

```typescript
interface JumpHistoryListProps {
  entries: JumpHistoryEntry[];
  onSelect: (entry: JumpHistoryEntry) => void;
  now?: number;
}

interface JumpHistoryModalProps {
  visible: boolean;
  entries: JumpHistoryEntry[];
  onClose: () => void;
  onSelect: (entry: JumpHistoryEntry) => void;
}

interface JumpHistorySectionProps {
  libraryItemId: string;
}
```

- [ ] **Step 1: Write failing shared-list and section tests**

Use two literal entries in reverse chronological order:

```typescript
it("renders newest first and selects the requested entry", () => {
  const onSelect = jest.fn();
  const view = render(
    <JumpHistoryList entries={[newest, oldest]} onSelect={onSelect} now={10_000} />
  );

  expect(view.getAllByRole("button")[0]).toHaveTextContent("8:20");
  fireEvent.press(view.getAllByRole("button")[1]);
  expect(onSelect).toHaveBeenCalledWith(oldest);
});
```

For `JumpHistorySection`, assert it returns `null` for a different active item, shows the translated empty state for the active item with no entries, and calls:

```typescript
playerService.seekTo(entry.fromPosition, { suppressJumpHistory: true });
```

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
npx jest src/components/player/__tests__/JumpHistoryList.test.tsx src/components/player/__tests__/JumpHistoryModal.test.tsx src/components/library/LibraryItemDetail/__tests__/JumpHistorySection.test.tsx --runInBand
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the shared rows and two containers**

Render each row as a `Pressable` with source/category, `from → to`, signed delta, and relative occurrence copy. Keep all formatting inside `JumpHistoryList` so the modal and detail section cannot drift.

The modal uses the established bottom-sheet pattern:

```tsx
<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <View style={styles.backdrop}>
    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header">{translate("player.jumpHistory.title")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={translate("player.jumpHistory.close")}
          onPress={onClose}
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>
      {entries.length > 0 ? (
        <JumpHistoryList entries={entries} onSelect={onSelect} />
      ) : (
        <Text>{translate("player.jumpHistory.empty")}</Text>
      )}
    </View>
  </View>
</Modal>
```

`JumpHistorySection` renders immediately after `ChapterList` in `LibraryItemDetail.tsx`.

- [ ] **Step 4: Write and run the failing settings-action test**

Create a typed helper that returns the existing four menu groups plus:

```typescript
{
  id: "jumpHistory",
  title: translate("player.jumpHistory.title"),
}
```

Test that this item exists and that current `progressFormat`, bookmark-title, chapter-time, and keep-awake states remain unchanged.

Run:

```bash
npx jest src/app/FullScreenPlayer/__tests__/playerSettingsActions.test.ts --runInBand
```

Expected: FAIL until `buildPlayerSettingsActions()` exists.

- [ ] **Step 5: Wire the full-screen settings item and modal**

Replace the inline action array with `buildPlayerSettingsActions(...)`. Extend `handleMenuAction`:

```typescript
else if (actionId === "jumpHistory") setJumpHistoryModalVisible(true);
```

Render `JumpHistoryModal` from `player.jumpHistory?.entries ?? []`; selection calls `playerService.seekTo(entry.fromPosition, { suppressJumpHistory: true })`. The modal remains open until explicitly closed.

Add exact English/Spanish keys for title, empty state, view action, close action, sources, categories, `just now`, `{count}m ago`, `{count}h ago`, and the row accessibility template.

- [ ] **Step 6: Run all new UI tests**

Run:

```bash
npx jest src/components/player/__tests__/JumpHistoryList.test.tsx src/components/player/__tests__/JumpHistoryModal.test.tsx src/components/library/LibraryItemDetail/__tests__/JumpHistorySection.test.tsx src/app/FullScreenPlayer/__tests__/playerSettingsActions.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit history UI**

```bash
git add src/components/player/JumpHistoryList.tsx src/components/player/JumpHistoryModal.tsx src/components/player/__tests__/JumpHistoryList.test.tsx src/components/player/__tests__/JumpHistoryModal.test.tsx src/components/library/LibraryItemDetail/JumpHistorySection.tsx src/components/library/LibraryItemDetail/__tests__/JumpHistorySection.test.tsx src/app/FullScreenPlayer/playerSettingsActions.ts src/app/FullScreenPlayer/__tests__/playerSettingsActions.test.ts src/app/FullScreenPlayer/index.tsx src/components/library/LibraryItemDetail.tsx src/i18n/locales/en.ts src/i18n/locales/es.ts
git commit -m "feat: add jump history surfaces"
```

---

### Task 7: Foreground-aware ledger toast and modal navigation

**Files:**

- Modify: `src/components/ui/PlayerProgressToast.tsx`
- Create: `src/components/ui/__tests__/PlayerProgressToast.test.tsx`

**Interfaces:**

- Consumes: `getPendingJump`, `restoreJumpHistory`, `_dismissJumpToast`, `setJumpHistoryModalVisible`, and the `/FullScreenPlayer` route.
- Replaces: `pendingProgressJump` and `_setPendingProgressJump`.

- [ ] **Step 1: Write failing toast tests**

Mock `AppState.addEventListener`, fake timers, the current pathname, and router:

```typescript
it("does not expire a pending jump while backgrounded and starts the timer on foreground", async () => {
  AppState.currentState = "background";
  const view = render(<PlayerProgressToast />);

  jest.advanceTimersByTime(10_000);
  expect(mockDismiss).not.toHaveBeenCalled();

  await act(async () => appStateListener("active"));
  expect(mockRestoreJumpHistory).toHaveBeenCalled();
  jest.advanceTimersByTime(7_000);
  expect(mockDismiss).toHaveBeenCalled();
});

it("opens the full-screen history modal from outside the player", () => {
  fireEvent.press(render(<PlayerProgressToast />).getByText("View History"));
  expect(mockSetModalVisible).toHaveBeenCalledWith(true);
  expect(mockRouterPush).toHaveBeenCalledWith("/FullScreenPlayer");
});
```

Add a display test showing an aggregated entry from 100 to 220 renders `+2:00`, and a dismissal test proving the entry remains while only its pending flag changes.

- [ ] **Step 2: Run toast tests and verify RED**

Run:

```bash
npx jest src/components/ui/__tests__/PlayerProgressToast.test.tsx --runInBand
```

Expected: FAIL because the toast reads the legacy single jump, expires during background time, and exposes Undo instead of View History.

- [ ] **Step 3: Implement foreground-aware toast behavior**

Read the pending entry with `getPendingJump(jumpHistory)`. Track `AppState` locally; schedule the seven-second timer only while active. Include `pendingJump.updatedAt` in the timer effect dependencies so each aggregated skip refreshes the visible interval. On every `"active"` event:

```typescript
await restoreJumpHistory();
setIsAppActive(true);
```

On View History:

```typescript
setJumpHistoryModalVisible(true);
if (pathname !== "/FullScreenPlayer") {
  router.push("/FullScreenPlayer");
}
```

Remove direct seek/Undo behavior. Dismiss with `_dismissJumpToast()` so the ledger remains intact.

- [ ] **Step 4: Run toast tests and verify GREEN**

Run:

```bash
npx jest src/components/ui/__tests__/PlayerProgressToast.test.tsx --runInBand
```

Expected: PASS, including background-to-foreground restoration and additive delta display.

- [ ] **Step 5: Remove legacy pending-jump references**

Run:

```bash
rg -n "pendingProgressJump|_setPendingProgressJump" src
```

Expected: no production or test references.

- [ ] **Step 6: Commit the foreground toast**

```bash
git add src/components/ui/PlayerProgressToast.tsx src/components/ui/__tests__/PlayerProgressToast.test.tsx
git commit -m "feat: surface background jump history"
```

---

### Task 8: Whole-feature verification

**Files:**

- Verify all files changed in Tasks 1–7.

**Interfaces:**

- Consumes the completed feature.
- Produces fresh evidence for release readiness.

- [ ] **Step 1: Run all focused jump-history tests**

```bash
npx jest src/lib/helpers/__tests__/jumpHistory.test.ts src/stores/slices/__tests__/playerSlice.test.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts src/services/__tests__/PlayerService.test.ts src/lib/__tests__/nowPlayingMetadata.test.ts src/services/__tests__/PlayerBackgroundServiceRemoteCommands.test.ts src/components/player/__tests__/JumpHistoryList.test.tsx src/components/player/__tests__/JumpHistoryModal.test.tsx src/components/library/LibraryItemDetail/__tests__/JumpHistorySection.test.tsx src/app/FullScreenPlayer/__tests__/playerSettingsActions.test.ts src/components/ui/__tests__/PlayerProgressToast.test.tsx --runInBand
```

Expected: all listed suites pass.

- [ ] **Step 2: Check service import cycles**

```bash
npx dpdm --circular src/services/PlayerService.ts
```

Expected: no circular dependencies.

- [ ] **Step 3: Run changed-file lint diagnostics**

```bash
npx eslint src/types/player.ts src/types/coordinator.ts src/lib/helpers/jumpHistory.ts src/lib/nowPlayingMetadata.ts src/stores/slices/playerSlice.ts src/stores/appStore.ts src/services/PlayerService.ts src/services/PlayerBackgroundService.ts src/services/coordinator/PlayerStateCoordinator.ts src/app/FullScreenPlayer/index.tsx src/app/FullScreenPlayer/playerSettingsActions.ts src/components/ui/PlayerProgressToast.tsx src/components/player/JumpHistoryList.tsx src/components/player/JumpHistoryModal.tsx src/components/library/LibraryItemDetail.tsx src/components/library/LibraryItemDetail/JumpHistorySection.tsx src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx src/components/library/LibraryItemDetail/ChapterList.tsx src/components/library/LibraryItemDetail/BookmarksSection.tsx
```

Expected: zero errors in changed production files.

- [ ] **Step 4: Run TypeScript diagnostics**

```bash
npx tsc --noEmit
```

Expected: no new errors attributable to changed files. If repository baseline errors remain, compare them against the current baseline and report them explicitly rather than claiming a clean global typecheck.

- [ ] **Step 5: Run the full Jest suite**

```bash
npm test -- --runInBand
```

Expected: all suites pass.

- [ ] **Step 6: Check formatting and final scope**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only jump-history/lock-screen-scrub implementation files and their tests/localization are changed.
