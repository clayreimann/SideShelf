# Phase 23: Pre-Release Todos and Notes - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Final pre-release bug fixes and UX improvements targeting five known issues:

1. Auth startup login flicker + expired token offline UX
2. Chapter taps on item detail screen should seek and start playback
3. Preserve resume position display + skip smart rewind on explicit seeks
4. Play/pause dispatch lag + icon flicker (optimistic update)
5. Hidden-tab deep navigation to item detail from More screen

No new features. No server-side changes. No test infrastructure work.

</domain>

<decisions>
## Implementation Decisions

### Auth Startup Flicker Fix

- **D-01:** Hold `SplashScreen.preventAutoHideAsync()` until `AuthProvider.initialized` is `true`. Do not hide the splash screen before the auth check resolves. This prevents any flash of the login screen during the init window.
- **D-02:** The existing `useEffect` in `(tabs)/_layout.tsx` that checks `initialized && !isAuthenticated` is the correct place to guard routing — just ensure the splash screen is held long enough that this check has already settled before the UI is visible.

### Expired Token UX

- **D-03:** When a token is expired, `api.ts` already attempts a silent refresh via `handleUnauthorized()`. Preserve this as the primary path. Only surface the user-facing login flow if the silent refresh fails.
- **D-04:** If silent refresh fails, present the login screen as a **modal** (not full navigation). The modal is dismissible so the user retains access to their downloaded content without re-authenticating.
- **D-05:** After the user dismisses the modal without logging in, inject a **headerLeft button** (in the Stack header, top-left, where the back button normally appears) on all tab screens. This button re-opens the login modal. It disappears once the token is refreshed successfully.
- **D-06:** After successful login via the modal (token refreshed): dismiss the modal and restore the user to exactly where they were. No navigation change, no library reload. The headerLeft token-refresh button disappears.
- **D-07:** The login screen is already configured as `presentation: "formSheet"` in `_layout.tsx` — use this existing presentation for the modal flow.

### Chapter Taps: Seek + Start Playback

- **D-08:** `ChapterList.tsx:handleChapterPress` already calls `playerService.playTrack(libraryItemId, undefined, chapterStart)` when `!isCurrentlyPlaying`. The bug is downstream — investigate why `playTrack` is rejected by the state machine when the item is not currently loaded and fix the load+seek+play path in `PlayerService` / coordinator.
- **D-09:** Chapter tap must also set `skipSmartRewind: true` (see D-11 below) so the rewind phase does not fire when jumping to a specific chapter.

### Resume Position Display (Cold-Start Chapter Highlight)

- **D-10:** The actual playback resume position is correct — the bug is display-only. On cold start, `player.position` in the store initializes to `0` before the restore event fires, causing `ChapterList` (and other position-dependent UI) to highlight chapter 1. Fix: ensure the UI reads the persisted progress position for initial display before the first `POSITION_RECONCILED` event arrives (e.g., from the store's `currentItem` media progress or a separate `initialPosition` field set during restore).

### Smart Rewind Bypass on Explicit Seeks

- **D-11:** Extend `DispatchMeta` in `eventBus.ts` with `skipSmartRewind?: boolean`. Chapter taps, bookmark jumps, and any other user-directed seek that dispatches `PLAY` should set `skipSmartRewind: true` in the meta. `PlaybackControlCollaborator.executePlay()` reads this flag and skips `applySmartRewind()` when set.
- **D-12:** Normal play/resume actions (tap play button, sleep timer cancel, etc.) do NOT set `skipSmartRewind` — smart rewind continues to fire for these as before.

### Play/Pause Dispatch Lag + Icon Flicker

- **D-13:** Add a local `pendingIsPlaying` state to `PlayPauseButton`. On press, flip `pendingIsPlaying` immediately (optimistic update). The rendered icon reads `pendingIsPlaying ?? isPlaying` — pending state wins until reconciled. Clear `pendingIsPlaying` once the coordinator's `isPlaying` state settles.
- **D-14:** Investigate the icon flicker (brief oscillation between play/pause states) as part of the same pass. The flicker likely comes from the coordinator passing through an intermediate `LOADING`/`BUFFERING` state that maps to "not playing" — fix is to treat those states as "playing" in the icon rendering logic (i.e., spinner or disabled, not the play icon).
- **D-15:** Profile with React DevTools Profiler or the existing trace spans before finalizing the fix, to confirm the root cause is the async coordinator lock and not excess re-renders from a store selector issue.

### Hidden-Tab Deep Navigation from More Screen

- **D-16:** When a tab (e.g., series, authors) is hidden and surfaced via the More screen, navigation must support full depth: More → Series/Author list → Series/Author detail → Item detail screen.
- **D-17:** Phase 9 established the re-export pattern for More-stack navigation. Extend it so the More-scoped stacks include all route levels (not just the list/detail pair). Fix applies to all potentially-hidden tabs (series, authors, home, library).
- **D-18:** The item detail route within More-scoped stacks should be the same component as the top-level `item/[id]` route — re-export, do not duplicate.

### Claude's Discretion

- How exactly `initialPosition` is exposed for cold-start display (store field vs selector vs prop from parent)
- The exact reconciliation timing for `pendingIsPlaying` in `PlayPauseButton` (next render, timeout, or subscription)
- Which specific Expo Router stack configuration change is needed for the More deep navigation fix (Stack.Screen additions vs route file additions)

### Folded Todos

- **Auth startup flicker + expired token UX** (`2026-03-31-app-startup-login-flicker-and-expired-token-ux.md`) — folded in full, decisions D-01 through D-07.
- **Chapter taps seek + start playback** (`2026-03-10-chapter-taps-on-item-detail-screen-should-seek-and-start-playback.md`) — folded in, decisions D-08 and D-09.
- **Preserve resume position + skip smart rewind on explicit seeks** (`2026-03-12-preserve-resume-position-and-skip-smart-rewind-on-explicit-seeks.md`) — folded in, decisions D-10 through D-12. Scope narrowed: actual playback position is already correct; only the display bug and the smart rewind bypass remain.
- **Audit play/pause UI-thread dispatch lag** (`2026-03-18-audit-and-reduce-ui-thread-work-in-play-pause-dispatch-path.md`) — folded in, decisions D-13 through D-15.
- **Hidden-tab deep navigation from More screen** (discovered during discuss-phase 2026-04-30) — folded in, decisions D-16 through D-18.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Auth

- `src/providers/AuthProvider.tsx` — auth state machine, `initialized` flag, token load flow
- `src/app/(tabs)/_layout.tsx` — tab layout, auth redirect useEffect, headerLeft injection point
- `src/app/login.tsx` — login modal, `isAuthenticated` redirect guard
- `src/lib/api/api.ts` — `handleUnauthorized()` silent refresh path (line 67+)

### Player State Machine

- `src/services/coordinator/eventBus.ts` — `DispatchMeta` type, `dispatchPlayerEvent()` signature
- `src/services/coordinator/PlayerStateCoordinator.ts` — state machine coordinator
- `src/services/coordinator/transitions.ts` — state transition matrix
- `src/services/player/PlaybackControlCollaborator.ts` — `executePlay()` + `applySmartRewind()` call
- `src/lib/smartRewind.ts` — smart rewind implementation

### UI / Navigation

- `src/components/library/LibraryItemDetail/ChapterList.tsx` — `handleChapterPress`, chapter highlight logic
- `src/components/player/PlayPauseButton.tsx` — play/pause button, icon rendering
- `src/stores/slices/playerSlice.ts` — `isPlaying`, `position`, player store state
- `src/app/(tabs)/more/` — More tab stack, re-export patterns for hidden tabs

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `DispatchMeta` (eventBus.ts) — existing side-channel for event metadata; extend with `skipSmartRewind?: boolean`
- `SplashScreen.preventAutoHideAsync()` — already called in `_layout.tsx`; needs to remain held until `AuthProvider.initialized` is true
- Login screen `presentation: "formSheet"` — already configured in `_layout.tsx:362+`; use as-is for expired token modal

### Established Patterns

- Re-export screens for More stack navigation (Phase 9 decision, PROJECT.md Key Decisions)
- `DispatchMeta` side-channel for threading intent without polluting event union types (Phase 17.1 decision)
- Coordinator-owns-state: all play/seek events go through `dispatchPlayerEvent()`, never direct TrackPlayer calls from UI
- Individual Zustand selectors (not object-returning) — CLAUDE.md constraint

### Integration Points

- `AuthProvider` exposes `initialized` and `isAuthenticated` — both needed for the flicker fix and token expiry guard
- `ChapterList.handleChapterPress` → `playerService.playTrack()` — bug is downstream in coordinator, not in ChapterList itself
- `PlaybackControlCollaborator.executePlay()` calls `applySmartRewind()` unconditionally — this is the bypass insertion point

</code_context>

<specifics>
## Specific Ideas

- Expired token indicator placement: Stack header `headerLeft` prop on all tab-screen Stack.Screen entries. Not a floating overlay. Not a tab bar badge. The header nav bar's left slot.
- After successful modal login: modal dismisses, user stays on the current screen, no navigation change. The header left button disappears.
- More deep navigation: same item detail component (re-export), not a duplicate. Phase 9's re-export pattern is the model.
- Cold-start chapter display: the actual playback resumes correctly when play is tapped. Only the initial chapter highlight (before first play) is wrong — this is scoped narrowly.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)

- **Contribute AirPlay component resizable icon native module upstream** (`2026-03-16-contribute-airplay-component-resizable-icon-native-module-upstream.md`) — OSS contribution, not a pre-release app fix. Deferred to a future milestone.
- **Investigate PlayerService queue rebuild on simulator hot reload** (`2026-03-10-investigate-playerservice-queue-rebuild-on-simulator-hot-reload.md`) — simulator-only artifact, not confirmed on device. Deferred — use `/gsd:debug` if the issue surfaces on device.

</deferred>

---

_Phase: 23-pre-release-todos-and-notes_
_Context gathered: 2026-04-30 via discuss-phase_
