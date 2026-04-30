# Phase 23: Pre-Release Todos and Notes - Research

**Researched:** 2026-04-30
**Domain:** React Native / Expo Router / Player State Machine / Auth UX
**Confidence:** HIGH — all findings derived from direct source-code inspection

## Summary

Phase 23 is a collection of five targeted bug fixes. All work is surgical: no new features, no schema changes, no external dependencies. Every fix touches existing, well-understood code paths.

The fixes divide into three subsystems: (1) auth/startup UX (splash screen timing and expired-token modal), (2) player behavior (chapter taps, smart rewind bypass, cold-start position display, optimistic play/pause icon), and (3) navigation (More-tab hidden-tab deep navigation to item detail). Source files for all five are identified and read. No external research is required.

**Primary recommendation:** Plan each of the five bugs as its own independent plan. They share no code and have no sequencing dependencies. All can be parallelized during execution.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auth Startup Flicker Fix**

- D-01: Hold `SplashScreen.preventAutoHideAsync()` until `AuthProvider.initialized` is `true`. Do not hide the splash screen before the auth check resolves.
- D-02: The existing `useEffect` in `(tabs)/_layout.tsx` that checks `initialized && !isAuthenticated` is the correct place to guard routing — ensure splash is held long enough that this check has already settled before the UI is visible.

**Expired Token UX**

- D-03: When a token is expired, `api.ts` already attempts a silent refresh via `handleUnauthorized()`. Preserve this as the primary path. Only surface the user-facing login flow if the silent refresh fails.
- D-04: If silent refresh fails, present the login screen as a **modal** (not full navigation). The modal is dismissible so the user retains access to downloaded content without re-authenticating.
- D-05: After the user dismisses the modal without logging in, inject a **headerLeft button** on all tab screens. This button re-opens the login modal. It disappears once the token is refreshed successfully.
- D-06: After successful login via the modal (token refreshed): dismiss the modal and restore the user to exactly where they were. No navigation change, no library reload. The headerLeft token-refresh button disappears.
- D-07: The login screen is already configured as `presentation: "formSheet"` in `_layout.tsx` — use this existing presentation for the modal flow.

**Chapter Taps: Seek + Start Playback**

- D-08: `ChapterList.tsx:handleChapterPress` already calls `playerService.playTrack(libraryItemId, undefined, chapterStart)` when `!isCurrentlyPlaying`. The bug is downstream — investigate why `playTrack` is rejected by the state machine when the item is not currently loaded and fix the load+seek+play path in `PlayerService` / coordinator.
- D-09: Chapter tap must also set `skipSmartRewind: true` (see D-11) so the rewind phase does not fire when jumping to a specific chapter.

**Resume Position Display (Cold-Start Chapter Highlight)**

- D-10: The actual playback resume position is correct — the bug is display-only. On cold start, `player.position` initializes to `0` before the restore event fires. Fix: ensure the UI reads the persisted progress position for initial display before the first `POSITION_RECONCILED` event arrives.

**Smart Rewind Bypass on Explicit Seeks**

- D-11: Extend `DispatchMeta` in `eventBus.ts` with `skipSmartRewind?: boolean`. Chapter taps, bookmark jumps, and any other user-directed seek that dispatches `PLAY` should set `skipSmartRewind: true` in the meta. `PlaybackControlCollaborator.executePlay()` reads this flag and skips `applySmartRewind()` when set.
- D-12: Normal play/resume actions (tap play button, sleep timer cancel, etc.) do NOT set `skipSmartRewind` — smart rewind continues to fire for these as before.

**Play/Pause Dispatch Lag + Icon Flicker**

- D-13: Add a local `pendingIsPlaying` state to `PlayPauseButton`. On press, flip `pendingIsPlaying` immediately (optimistic update). The rendered icon reads `pendingIsPlaying ?? isPlaying` — pending state wins until reconciled. Clear `pendingIsPlaying` once the coordinator's `isPlaying` state settles.
- D-14: Investigate icon flicker (brief oscillation between play/pause states). The flicker likely comes from the coordinator passing through an intermediate `LOADING`/`BUFFERING` state that maps to "not playing" — fix by treating those states as "playing" in the icon rendering logic.
- D-15: Profile with React DevTools Profiler or the existing trace spans before finalizing the fix, to confirm root cause.

**Hidden-Tab Deep Navigation from More Screen**

- D-16: When a tab is hidden and surfaced via the More screen, navigation must support full depth: More → Series/Author list → Series/Author detail → Item detail screen.
- D-17: Phase 9 established the re-export pattern for More-stack navigation. Extend it so the More-scoped stacks include all route levels (not just the list/detail pair).
- D-18: The item detail route within More-scoped stacks should be the same component as the top-level `item/[id]` route — re-export, do not duplicate.

### Claude's Discretion

- How exactly `initialPosition` is exposed for cold-start display (store field vs selector vs prop from parent)
- The exact reconciliation timing for `pendingIsPlaying` in `PlayPauseButton` (next render, timeout, or subscription)
- Which specific Expo Router stack configuration change is needed for the More deep navigation fix (Stack.Screen additions vs route file additions)

### Deferred Ideas (OUT OF SCOPE)

- Contribute AirPlay component resizable icon native module upstream
- Investigate PlayerService queue rebuild on simulator hot reload
  </user_constraints>

---

## Standard Stack

No new libraries required. All work is within the existing stack.

### Core (already installed)

| Library                      | Purpose               | Role in Phase 23                                           |
| ---------------------------- | --------------------- | ---------------------------------------------------------- |
| expo-router                  | File-based navigation | Splash screen hold, modal flow, More-stack route additions |
| expo-splash-screen           | Managed splash screen | D-01: hold until `initialized` is true                     |
| react-native-track-player    | Native audio          | Underlying target of coordinator PLAY dispatch             |
| zustand                      | State management      | `pendingIsPlaying` pattern, `player.position` store field  |
| expo-symbols / MaterialIcons | Platform icons        | `PlayPauseButton` icon rendering                           |

### No Installations Required

All fixes are source-only changes within existing files. No `npm install` needed.

---

## Architecture Patterns

### Pattern 1: Splash Screen Hold Until Auth Resolves

**What:** `SplashScreen.preventAutoHideAsync()` is called at module scope in `_layout.tsx` (line 33). Currently `SplashScreen.hideAsync()` is called inside `onLayoutRootView` when fonts are loaded — this fires before `AuthProvider.initialized` is `true`, causing a login-screen flash.

**Fix:** Thread `initialized` from `useAuth()` into the hide condition. Hide only when both fonts are loaded AND `initialized` is `true`.

**Key file:** `src/app/_layout.tsx` — `onLayoutRootView` callback and the `useEffect` deps.

**Pattern (current):**

```typescript
const onLayoutRootView = useCallback(async () => {
  if (fontsLoaded || fontsError) {
    await SplashScreen.hideAsync(); // fires before initialized
  }
}, [fontsLoaded, fontsError]);
```

**Pattern (target):**

```typescript
const onLayoutRootView = useCallback(async () => {
  if ((fontsLoaded || fontsError) && initialized) {
    await SplashScreen.hideAsync();
  }
}, [fontsLoaded, fontsError, initialized]);
```

`initialized` must be lifted out of the provider tree so `RootLayout` can read it — either via a shared ref, a module-level atom, or by moving the auth context read up. The `AuthProvider` exposes `initialized` on its context value, but `RootLayout` wraps `AuthProvider` as a child, so it cannot directly call `useAuth()`. The fix requires passing `initialized` up via a callback prop or an external signal (e.g., a module-level `Promise` that `AuthProvider` resolves).

**Simpler alternative (confirmed safe by D-02):** The `useEffect` in `(tabs)/_layout.tsx` already guards `initialized && !isAuthenticated` routing. If the root layout defers `hideAsync` until `initialized` is stable, the guard in tabs layout handles all redirect cases without race.

### Pattern 2: Expired Token Modal (formSheet presentation)

**What:** Current behavior: when `loginMessage` is set and `!isAuthenticated`, `(tabs)/_layout.tsx` calls `router.replace("/login")`, which performs a full navigation replacing the tab stack. D-04/D-07 require a modal instead.

**Current code in `(tabs)/_layout.tsx`:**

```typescript
useEffect(() => {
  if (loginMessage && !isAuthenticated) {
    router.replace("/login"); // full navigation — wrong
  }
}, [loginMessage, isAuthenticated]);
```

**Target:** Replace `router.replace("/login")` with `router.push("/login")` (formSheet is already configured on the `login` Stack.Screen in `_layout.tsx` line 362+). The login screen becomes a dismissible sheet.

**`login.tsx` current behavior:** When `initialized && isAuthenticated`, it calls `router.replace("/")`. After D-06, successful login via modal should call `router.back()` (or dismiss) instead of replacing — to return to the current screen.

**D-05 headerLeft button:** Inject `headerLeft` on all Stack.Screen entries within the tab stacks whenever `loginMessage` is set and `!isAuthenticated`. The button calls `router.push("/login")`. Remove when token is refreshed (`isAuthenticated` becomes true).

### Pattern 3: DispatchMeta Extension for skipSmartRewind (D-11)

**Current `DispatchMeta` type** (`src/types/coordinator.ts` line 322):

```typescript
export type DispatchMeta = {
  source?: EventSource;
  restoreSessionId?: string;
};
```

**Target:**

```typescript
export type DispatchMeta = {
  source?: EventSource;
  restoreSessionId?: string;
  skipSmartRewind?: boolean;
};
```

**Consumption point:** `PlaybackControlCollaborator.executePlay()` receives the event+meta from the coordinator. The coordinator must thread `meta` through to the collaborator call. Currently `executePlay()` has no access to meta — the coordinator calls `this.playbackControl.executePlay()` without arguments. Two implementation options:

1. Pass `meta` as an argument to `executePlay(meta?: DispatchMeta)`.
2. Store `lastDispatchMeta` on the coordinator context before calling `executePlay()`.

Option 1 is cleaner. The coordinator already has `meta` available when it calls `executePlay()` (it's the meta from the current event).

**`applySmartRewind` call in `executePlay`:**

```typescript
async executePlay(meta?: DispatchMeta): Promise<void> {
  await TrackPlayer.play();
  if (!meta?.skipSmartRewind) {
    await applySmartRewind(currentPosition);
  }
  store._setLastPauseTime(null);
}
```

### Pattern 4: Chapter Tap Bug — State Machine Rejection Path

**Root cause (confirmed by code inspection):**

`handleChapterPress` calls `playerService.playTrack(libraryItemId, undefined, chapterStart)` when `!isCurrentlyPlaying`. `playTrack` dispatches `LOAD_TRACK`.

In `PlayerStateCoordinator.ts` line 1186-1202, when `LOAD_TRACK` arrives and `nextState === LOADING`, the coordinator checks:

```typescript
const wasActivelyPlayingOrPaused =
  previousState === PlayerState.PLAYING || previousState === PlayerState.PAUSED;
if (wasActivelyPlayingOrPaused && event.payload.libraryItemId === currentTrack?.libraryItemId) {
  dispatchPlayerEvent({ type: "PLAY" }, { source: "native_player" });
  return; // short-circuit
}
await playerService.executeLoadTrack(...);
```

**The real bug:** When the item is _already loaded_ (same `libraryItemId` as `currentTrack`) and was previously paused/playing, the coordinator short-circuits to `PLAY` — this is correct for resuming. But it does not honor the `startPosition` from the chapter tap. The `PLAY` is dispatched without seeking to `chapterStart` first.

When the item is _not loaded_ (fresh state, `currentTrack` is null or different item), the path falls through to `executeLoadTrack(libraryItemId, episodeId, startPosition)`. This path should work. If it does not, the bug is in `executeLoadTrack` or queue-building.

**Fix for the same-item case:** The short-circuit branch must check if `startPosition` was provided. If so, dispatch `SEEK` to `chapterStart` before dispatching `PLAY`. Or, honor `startPosition` in the short-circuit by seeking before resuming.

**Fix for the not-loaded case:** Investigate `executeLoadTrack` to confirm it correctly plumbs `startPosition` into the seek. Based on reading the coordinator at line 1205-1208, it does pass `startPosition`. This path may already work; the primary bug is the short-circuit path.

**D-09 integration:** Both paths that dispatch `PLAY` for a chapter tap must include `{ skipSmartRewind: true }` in meta.

### Pattern 5: Cold-Start Chapter Highlight (D-10)

**Bug:** `ChapterList` receives `currentPosition` from the item detail screen. On cold start, `player.position` in the store is `0` until the first `POSITION_RECONCILED` event fires. `ChapterList` uses `currentPosition` in `useMemo` to compute `playedChapters` and `upcomingChapters` — when position is `0`, all chapters appear as upcoming, highlighting chapter 1.

**ChapterList props:**

```typescript
type ChapterListProps = {
  chapters: ApiBookChapter[];
  currentPosition?: number;
  libraryItemId?: string;
  isCurrentlyPlaying?: boolean;
};
```

**Fix options (Claude's discretion per CONTEXT.md):**

1. In the parent screen, read persisted `mediaProgress.currentTime` from the store (or DB) and pass it as `currentPosition` before the first `POSITION_RECONCILED` fires. This is purely a display fix — no playback impact.
2. Add an `initialPosition` field to `playerSlice` that is set during restore from `PersistedPlayerState.position`, then cleared after the first real `POSITION_RECONCILED`. `ChapterList` reads `initialPosition ?? position`.

Option 1 is simpler and keeps the fix in the UI layer. The store already has `currentTrack` with a `libraryItemId` — the parent can fetch `savedProgress.currentTime` for that item and pass it down as the fallback position.

### Pattern 6: PlayPauseButton Optimistic Update (D-13/D-14)

**Current code:**

```typescript
const isPlaying = usePlayerState((state) => state.player.isPlaying);
// Renders SymbolView with "pause.circle.fill" or "play.circle.fill"
```

**Target:** Add `pendingIsPlaying` local state. On press, flip immediately. Reconcile when store settles.

```typescript
const [pendingIsPlaying, setPendingIsPlaying] = useState<boolean | null>(null);
const isPlaying = usePlayerState((state) => state.player.isPlaying);
const displayIsPlaying = pendingIsPlaying ?? isPlaying;

// On press:
const handlePress = useCallback(() => {
  setPendingIsPlaying(!displayIsPlaying);
  onPress();
}, [displayIsPlaying, onPress]);

// Clear pending when store catches up:
useEffect(() => {
  if (pendingIsPlaying !== null && isPlaying === pendingIsPlaying) {
    setPendingIsPlaying(null);
  }
}, [isPlaying, pendingIsPlaying]);
```

**D-14 flicker:** The coordinator passes through `LOADING`/`BUFFERING` states when transitioning. The `isPlaying` value in the store is `false` during these intermediate states. To prevent the icon from flickering back to "play" during loading: either (a) use `isLoadingTrack` to hold the icon in "play" while loading, or (b) only clear `pendingIsPlaying` when `isPlaying === pendingIsPlaying` AND `!isLoadingTrack`.

**Existing test:** `PlayPauseButton.test.tsx` has two tests (backward-compat and onLongPress). New tests for optimistic update will be needed.

### Pattern 7: More Stack Deep Navigation (D-16/D-17/D-18)

**Current state of More stack navigation:**

`more/_layout.tsx` declares these Stack.Screens:

- `index` — More list
- `series` — series list (re-export of series tab)
- `authors` — authors list (re-export of authors tab)
- `series/[seriesId]` — series detail (re-export)
- `authors/[authorId]` — author detail (re-export)

**Missing:** Item detail route within More stack. When series detail (`more/series/[seriesId]`) taps an item, it pushes to `/series/[seriesId]/item/[itemId]` — which is in the series tab's stack, NOT the More tab's stack. This push either fails silently or navigates to the wrong stack.

**Series detail push call (confirmed):**

```typescript
router.push(`/series/${seriesId}/item/${item.libraryItemId}`);
```

This resolves to `(tabs)/series/[seriesId]/item/[itemId]`, which is in the series tab stack. When series tab is hidden, this route is still accessible but the user lands in a hidden tab's stack, which may not render correctly.

**Fix (D-17/D-18):**

1. Add `more/series/[seriesId]/item/[itemId].tsx` as a re-export of the series item detail component.
2. Add `more/authors/[authorId]/item/[itemId].tsx` as a re-export of the authors item detail component.
3. Register these routes in `more/_layout.tsx` with `Stack.Screen name="series/[seriesId]/item/[itemId]"`.
4. Update push calls in the More-context series/author detail screens to use More-scoped paths (or rely on Expo Router's relative routing).

**Re-export pattern (already used in `more/series/[seriesId].tsx`):**

```typescript
export { default } from "@/app/(tabs)/series/[seriesId]/index";
```

Item detail screens already exist in both series and authors tabs:

- `(tabs)/series/[seriesId]/item/[itemId].tsx` — renders `LibraryItemDetail`
- `(tabs)/authors/[authorId]/item/[itemId].tsx` — renders `LibraryItemDetail`

Re-exports of these will work without code duplication.

**Authors layout gap:** `(tabs)/authors/_layout.tsx` only declares `index` and has no `[authorId]` or item detail routes. The author detail screen exists at `(tabs)/authors/[authorId]/index.tsx` but is not registered in the layout. This means even the authors tab may have navigation issues independent of the More fix.

### Anti-Patterns to Avoid

- **Calling `router.replace("/login")` for expired-token UX** — this destroys the tab stack. Use `router.push("/login")` (formSheet modal).
- **Calling `SplashScreen.hideAsync()` from inside a child of the provider tree** — can't read auth `initialized` from `RootLayout` without lifting state. Use an external signal (module-level callback or promise).
- **Object-returning Zustand selectors in `PlayPauseButton`** — CLAUDE.md constraint. Use individual selectors.
- **Duplicating item detail screen components in More stack** — re-export only.
- **Adding `skipSmartRewind` to the `PlayerEvent` union type** — goes in `DispatchMeta` per D-11. Keeps the discriminated union clean (established pattern from Phase 17.1).

---

## Don't Hand-Roll

| Problem                           | Don't Build              | Use Instead                                | Why                                                    |
| --------------------------------- | ------------------------ | ------------------------------------------ | ------------------------------------------------------ |
| Auth state exposure to RootLayout | Custom auth state store  | Module-level callback/promise pattern      | AuthProvider already owns initialized; don't duplicate |
| Modal presentation                | Custom overlay           | Expo Router formSheet (already configured) | Already wired in `_layout.tsx`                         |
| Optimistic state reconciliation   | setTimeout-based cleanup | `useEffect` with store subscription        | Zustand selector re-renders are the signal             |

---

## Common Pitfalls

### Pitfall 1: SplashScreen.hideAsync Race with Auth Init

**What goes wrong:** If `hideAsync` is gated on fonts only, the splash hides before `initialized` is true. The login redirect fires afterward, causing a visible flash.

**Why it happens:** `onLayoutRootView` fires on the root `View.onLayout`, which is earlier in the render cycle than `AuthProvider`'s async `useEffect` completing.

**How to avoid:** `RootLayout` needs a signal from `AuthProvider.initialized`. `AuthProvider` is a child of `RootLayout`, so `useAuth()` cannot be called in `RootLayout`. The signal must be external — a module-level ref, a callback prop on `AuthProvider`, or a separate exported promise.

**Warning signs:** Login screen visible for ~100-500ms on cold start even when already authenticated.

### Pitfall 2: login.tsx Redirect on Successful Modal Login

**What goes wrong:** `login.tsx` currently calls `router.replace("/")` when `initialized && isAuthenticated`. In the modal flow, this would navigate away from the current tab screen to the root, breaking D-06 (user stays where they are).

**How to avoid:** The modal path should call `router.back()` or `router.dismiss()` on success. Distinguish modal context from initial login context. One approach: check if there's a back route available (`router.canGoBack()`), and if so, use `router.back()` instead of `router.replace("/")`.

**Warning signs:** After successful token refresh via modal, user lands on home screen instead of their previous location.

### Pitfall 3: Chapter Tap Short-Circuit Skipping startPosition

**What goes wrong:** The coordinator's short-circuit (line 1192-1202) dispatches bare `PLAY` when the item is already loaded and the same item. It ignores `startPosition` from the `LOAD_TRACK` event payload.

**How to avoid:** When `startPosition` is present in the `LOAD_TRACK` payload, the short-circuit must dispatch a `SEEK` event before `PLAY`. Alternatively, re-route through `executeLoadTrack` when `startPosition` differs from current position.

**Warning signs:** Chapter tap when item is paused resumes from the paused position, not the chapter's start time.

### Pitfall 4: DispatchMeta not Threaded to executePlay

**What goes wrong:** The coordinator calls `this.playbackControl.executePlay()` without passing the current event's meta. `skipSmartRewind` in meta never reaches `applySmartRewind`.

**How to avoid:** Update the collaborator interface and all call sites to accept `meta?: DispatchMeta`. Verify that `IPlaybackControlCollaborator` interface in `src/services/player/types.ts` is also updated.

**Warning signs:** Smart rewind still fires after chapter taps even with `skipSmartRewind: true` set.

### Pitfall 5: More Stack Route Names with Nested Params

**What goes wrong:** Expo Router dynamic segment names in nested routes must match. If More-stack re-exports use `[seriesId]` but the series detail screen uses `params.seriesId`, the params will resolve correctly. But if the More stack declares `series/[seriesId]/item/[itemId]` as a `Stack.Screen` name, it must match the file path exactly.

**How to avoid:** File path determines the route. `more/series/[seriesId]/item/[itemId].tsx` creates the route. `Stack.Screen name="series/[seriesId]/item/[itemId]"` in `more/_layout.tsx` configures its presentation.

**Warning signs:** Navigation to item detail from More stack shows no header or wrong header title.

---

## Code Examples

### Extend DispatchMeta

```typescript
// src/types/coordinator.ts
export type DispatchMeta = {
  source?: EventSource;
  restoreSessionId?: string;
  skipSmartRewind?: boolean; // Add this
};
```

### Chapter Tap with skipSmartRewind

```typescript
// ChapterList.tsx handleChapterPress
const handleChapterPress = useCallback(
  async (chapterStart: number) => {
    if (!libraryItemId) return;
    try {
      if (!isCurrentlyPlaying) {
        // D-09: set skipSmartRewind so rewind doesn't fire on chapter jump
        dispatchPlayerEvent(
          { type: "LOAD_TRACK", payload: { libraryItemId, startPosition: chapterStart } },
          { source: "ui", skipSmartRewind: true }
        );
      } else {
        await playerService.seekTo(chapterStart);
      }
    } catch (error) {
      log.error("[handleChapterPress] Failed to jump to chapter:", error as Error);
    }
  },
  [libraryItemId, isCurrentlyPlaying]
);
```

Note: Alternatively, `playerService.playTrack()` can accept a meta parameter and thread `skipSmartRewind: true` through. Either approach works; the key is that `DispatchMeta.skipSmartRewind` reaches `executePlay`.

### More Stack Re-export (item detail)

```typescript
// src/app/(tabs)/more/series/[seriesId]/item/[itemId].tsx
export { default } from "@/app/(tabs)/series/[seriesId]/item/[itemId]";
```

```typescript
// more/_layout.tsx — add to Stack
<Stack.Screen
  name="series/[seriesId]/item/[itemId]"
  options={{ headerTitle: "", headerBackButtonDisplayMode: "minimal" }}
/>
<Stack.Screen
  name="authors/[authorId]/item/[itemId]"
  options={{ headerTitle: "", headerBackButtonDisplayMode: "minimal" }}
/>
```

---

## State of the Art

| Old Approach                                        | Current Approach                                   | Notes           |
| --------------------------------------------------- | -------------------------------------------------- | --------------- |
| Smart rewind always fires on PLAY                   | Smart rewind conditional on meta flag              | New in Phase 23 |
| Chapter taps ignore start position on short-circuit | Short-circuit respects startPosition               | Bug fix         |
| Login modal replaces tab stack                      | Login modal as formSheet sheet over current screen | Phase 23 change |

---

## Open Questions

1. **How to signal `initialized` from AuthProvider to RootLayout**
   - What we know: AuthProvider is a child of RootLayout; `useAuth()` cannot be called in RootLayout
   - What's unclear: Best mechanism — module-level callback, exported promise, or callback prop
   - Recommendation: Export a module-level `onAuthInitialized` callback from `AuthProvider.tsx` that `_layout.tsx` registers. When `setInitialized(true)` fires, call the callback. This keeps no new state in the root and avoids prop drilling.

2. **Authors tab layout missing [authorId] Stack.Screen**
   - What we know: `(tabs)/authors/_layout.tsx` only declares `index`. No `[authorId]/index` or item detail screens registered.
   - What's unclear: Whether Expo Router handles unregistered nested routes automatically or if navigation silently fails
   - Recommendation: Register `[authorId]/index` and `[authorId]/item/[itemId]` in `authors/_layout.tsx` as part of the More deep navigation fix.

3. **`login.tsx` modal vs initial-login context detection**
   - What we know: `router.canGoBack()` returns true when presented as a sheet over an existing stack
   - What's unclear: Whether checking `canGoBack()` is sufficient or if an explicit `isModal` prop/param is needed
   - Recommendation: Use `router.canGoBack()` to choose between `router.back()` and `router.replace("/")`. This is idiomatic Expo Router.

---

## Environment Availability

Step 2.6: SKIPPED — phase is entirely code/config changes. No external tools, services, or CLIs required.

---

## Validation Architecture

### Test Framework

| Property           | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| Framework          | Jest + React Native Testing Library (jest-expo preset) |
| Config file        | `jest.config.js` (project root)                        |
| Quick run command  | `npm test -- --testPathPattern=PlayPauseButton`        |
| Full suite command | `npm test`                                             |

### Phase Requirements → Test Map

Phase 23 has no formal REQ-IDs from REQUIREMENTS.md (these are bug fixes outside the v1.3 requirements table). Tests map to the five bug fixes:

| Fix                           | Behavior                                                               | Test Type                | Automated Command                                           | File Exists?                  |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------- | ----------------------------- |
| D-01/D-02 Splash hold         | Splash stays until `initialized`                                       | unit                     | Manual / visual only — SplashScreen is hard to unit test    | N/A                           |
| D-03–D-07 Expired token modal | Token expiry shows modal, not navigation                               | unit (AuthProvider mock) | `npm test -- --testPathPattern=login`                       | ❌ Wave 0                     |
| D-08/D-09 Chapter tap         | Chapter tap dispatches LOAD_TRACK with startPosition + skipSmartRewind | unit                     | `npm test -- --testPathPattern=ChapterList`                 | ✅ (ChapterList.test.tsx)     |
| D-11/D-12 skipSmartRewind     | skipSmartRewind in meta skips applySmartRewind                         | unit                     | `npm test -- --testPathPattern=PlaybackControlCollaborator` | ❌ Wave 0                     |
| D-10 Cold-start position      | ChapterList shows correct chapter when position=0 initially            | unit                     | `npm test -- --testPathPattern=ChapterList`                 | ✅ (ChapterList.test.tsx)     |
| D-13/D-14 Optimistic icon     | PlayPauseButton flips icon immediately on press                        | unit                     | `npm test -- --testPathPattern=PlayPauseButton`             | ✅ (PlayPauseButton.test.tsx) |
| D-16–D-18 More navigation     | Item detail accessible from More stack                                 | integration / manual     | Manual only (navigation routing)                            | N/A                           |
| D-11 DispatchMeta type        | skipSmartRewind field compiles cleanly                                 | compile                  | `npm run lint`                                              | ✅ (types/coordinator.ts)     |

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern=<changed file>`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/services/player/__tests__/PlaybackControlCollaborator.test.ts` — covers skipSmartRewind bypass when `meta.skipSmartRewind: true`
- [ ] `src/app/__tests__/login.modal.test.tsx` — covers expired-token modal navigation behavior (if testable without E2E)

_(ChapterList.test.tsx and PlayPauseButton.test.tsx already exist and cover the relevant components.)_

---

## Project Constraints (from CLAUDE.md)

Directives that apply to Phase 23 implementation:

- **Individual Zustand selectors only** — `const a = useAppStore(s => s.x.a)` not `const { a, b } = useAppStore(s => ({ a, b }))`. Critical for `PlayPauseButton` optimistic state work.
- **Never call TrackPlayer directly from UI** — all play/seek goes through `dispatchPlayerEvent()`.
- **No circular imports** — `DispatchMeta` extension is in `src/types/coordinator.ts` (leaf node); safe to import from anywhere.
- **`eventBus.ts` is a leaf node** — safe to import anywhere.
- **Always use tagged logger** — `const log = logger.forTag("ComponentName")`.
- **`@/` imports only** — no relative paths.
- **Strict TypeScript** — no `any` without comment.
- **`playTrack` is a public API dispatching `LOAD_TRACK`** — the coordinator owns the state machine; don't bypass it.
- **DB writes go through `src/db/helpers/`** — no inline db queries (not applicable to this phase — no schema changes).

---

## Sources

### Primary (HIGH confidence)

All findings from direct source-code inspection:

- `src/app/_layout.tsx` — SplashScreen.hideAsync call site, login Stack.Screen presentation config
- `src/app/(tabs)/_layout.tsx` — auth redirect useEffect, loginMessage handling
- `src/app/login.tsx` — modal, isAuthenticated redirect logic
- `src/providers/AuthProvider.tsx` — `initialized` flag, auth state machine
- `src/types/coordinator.ts` — `DispatchMeta` type (line 322), `PlayerState` enum
- `src/services/coordinator/eventBus.ts` — `dispatchPlayerEvent` signature
- `src/services/coordinator/PlayerStateCoordinator.ts` — LOAD_TRACK short-circuit (line 1186-1213), playIntentOnLoad flag
- `src/services/coordinator/transitions.ts` — full transition matrix
- `src/services/player/PlaybackControlCollaborator.ts` — `executePlay()` with unconditional `applySmartRewind` call
- `src/lib/smartRewind.ts` — `applySmartRewind` implementation
- `src/components/library/LibraryItemDetail/ChapterList.tsx` — `handleChapterPress`, `currentPosition` prop
- `src/components/player/PlayPauseButton.tsx` — current icon rendering logic
- `src/stores/slices/playerSlice.ts` — `player.position`, `player.isPlaying`, `player.loading.isLoadingTrack`
- `src/app/(tabs)/more/_layout.tsx` — current More stack routes
- `src/app/(tabs)/more/series/[seriesId].tsx` — re-export pattern confirmation
- `src/app/(tabs)/more/authors/[authorId].tsx` — re-export pattern
- `src/app/(tabs)/series/_layout.tsx` — series stack routes including `[seriesId]/item/[itemId]`
- `src/app/(tabs)/authors/_layout.tsx` — authors stack routes (gap identified: missing [authorId])
- `src/app/(tabs)/series/[seriesId]/item/[itemId].tsx` — item detail re-export target
- `src/app/(tabs)/authors/[authorId]/item/[itemId].tsx` — item detail re-export target
- `src/components/player/__tests__/PlayPauseButton.test.tsx` — existing test coverage
- `src/components/library/__tests__/ChapterList.test.tsx` — existing test coverage (via file listing)

### Secondary (MEDIUM confidence)

- Expo Router Stack.Screen naming conventions for nested dynamic routes — inferred from existing patterns in `series/_layout.tsx` (`[seriesId]/item/[itemId]`)

---

## Metadata

**Confidence breakdown:**

- Auth flicker fix: HIGH — root cause confirmed by reading `_layout.tsx` and `AuthProvider.tsx`
- Expired token modal: HIGH — formSheet already configured; behavioral change is in routing call
- Chapter tap bug: HIGH — short-circuit code read directly; root cause is `startPosition` ignored in short-circuit path
- skipSmartRewind: HIGH — `DispatchMeta` type read, `executePlay` signature read, insertion point confirmed
- Cold-start position: HIGH — `ChapterList` `currentPosition` prop usage confirmed
- Optimistic PlayPauseButton: HIGH — current component read, `pendingIsPlaying` pattern is standard React
- More deep navigation: HIGH — file structure confirmed, re-export pattern confirmed, gaps identified

**Research date:** 2026-04-30
**Valid until:** Until any of the canonical files listed above are modified
