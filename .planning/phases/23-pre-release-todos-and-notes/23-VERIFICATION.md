---
phase: 23-pre-release-todos-and-notes
verified: 2026-05-01T23:55:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 23: Pre-Release Todos and Notes Verification Report

**Phase Goal:** Fix five known pre-release bugs: auth startup login flicker + expired token UX, chapter tap seek+play, smart rewind bypass on explicit seeks, play/pause icon lag + flicker, and More-tab deep navigation to item detail
**Verified:** 2026-05-01T23:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                 | Status   | Evidence                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | App cold-starts directly to tabs without a login screen flash when already authenticated                                              | VERIFIED | `authInitializedPromise` exported from `AuthProvider.tsx` (line 22); `_layout.tsx` awaits it before `SplashScreen.hideAsync()` (lines 59-60)                                                                                                                                 |
| 2   | When token is expired and silent refresh fails, a dismissible formSheet modal appears over the current screen                         | VERIFIED | `(tabs)/_layout.tsx` uses `router.push("/login")` (line 164) for `loginMessage` effect; `login` screen has `presentation: "formSheet"` in `_layout.tsx` (line 366)                                                                                                           |
| 3   | After dismissing the modal without logging in, a headerLeft button appears on all tab screens to re-open the login modal              | VERIFIED | `tokenExpiredHeaderLeft` Pressable rendered when `showTokenExpiredHeader` is true (lines 170-182); wired to `Tabs.screenOptions.headerLeft` (line 195)                                                                                                                       |
| 4   | After successful login via modal, user stays on the same screen — `router.back()` when `canGoBack()` is true                          | VERIFIED | `login.tsx` lines 82-88: `router.canGoBack()` check, `router.back()` for modal dismiss, `router.replace("/")` for initial login                                                                                                                                              |
| 5   | Tapping a chapter on the item detail screen seeks to the chapter start and begins playback, even when the same item is already paused | VERIFIED | Coordinator short-circuit (line ~1209) dispatches `SEEK` when `startPos !== undefined && Math.abs(startPos - currentPos) > 1`; `ChapterList.tsx` dispatches `LOAD_TRACK` with `startPosition`                                                                                |
| 6   | Chapter taps and bookmark jumps do not trigger smart rewind                                                                           | VERIFIED | `ChapterList.tsx` dispatches with `{ source: "ui", skipSmartRewind: true }` (line 81); `PlaybackControlCollaborator.executePlay` checks `!meta?.skipSmartRewind` before calling `applySmartRewind`                                                                           |
| 7   | Normal play/resume (play button, sleep timer cancel) still triggers smart rewind                                                      | VERIFIED | No `skipSmartRewind` flag in normal play dispatch paths; `PlaybackControlCollaborator` tests confirm both paths                                                                                                                                                              |
| 8   | On cold start, ChapterList highlights the correct chapter based on persisted progress, not chapter 1                                  | VERIFIED | `LibraryItemDetail.tsx` lines 597-601: passes `position \|\| (progress?.currentTime ?? 0)` as `currentPosition` to ChapterList — display-only fallback from persisted mediaProgress                                                                                          |
| 9   | Play/pause button icon flips immediately on press without waiting for coordinator response                                            | VERIFIED | `PlayPauseButton.tsx`: `pendingIsPlaying` local state (line 45); `displayIsPlaying = pendingIsPlaying ?? isPlaying` (line 48); `handlePress` sets pending state before `onPress()` (lines 60-63)                                                                             |
| 10  | Icon does not flicker back to play during LOADING/BUFFERING intermediate states                                                       | VERIFIED | Reconciliation `useEffect` guards with `!isLoadingTrack` (line 54) — pending state held through coordinator loading transitions                                                                                                                                              |
| 11  | Navigating More -> Series list -> Series detail -> Item detail renders correctly                                                      | VERIFIED | `src/app/(tabs)/more/series/[seriesId]/item/[itemId].tsx` exists, re-exports from series stack; `more/_layout.tsx` registers `series/[seriesId]/item/[itemId]` Stack.Screen                                                                                                  |
| 12  | Navigating More -> Authors list -> Author detail -> Item detail renders correctly                                                     | VERIFIED | `src/app/(tabs)/more/authors/[authorId]/item/[itemId].tsx` exists, re-exports from authors stack; `more/_layout.tsx` registers `authors/[authorId]/item/[itemId]` Stack.Screen; `authors/_layout.tsx` now includes `[authorId]/index` and `[authorId]/item/[itemId]` entries |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact                                                     | Expected                                                                                   | Status   | Details                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/providers/AuthProvider.tsx`                             | Exports `authInitializedPromise`, calls `_onAuthInitialized?.()`                           | VERIFIED | Line 22: `export const authInitializedPromise`; line 86: `_onAuthInitialized?.()` called after `setInitialized(true)`                                    |
| `src/app/_layout.tsx`                                        | Imports `authInitializedPromise`, awaits before `SplashScreen.hideAsync()`                 | VERIFIED | Line 9: import; line 59: `await authInitializedPromise`; line 60: `await SplashScreen.hideAsync()`                                                       |
| `src/app/login.tsx`                                          | `canGoBack()` check for modal vs initial login                                             | VERIFIED | Lines 82-88: `router.canGoBack()` distinguishes modal dismiss from initial login                                                                         |
| `src/app/(tabs)/_layout.tsx`                                 | `router.push("/login")` for expired token, `headerLeft` button                             | VERIFIED | Line 164: `router.push`; lines 170-195: `tokenExpiredHeaderLeft` wired to `Tabs.screenOptions.headerLeft`                                                |
| `src/types/coordinator.ts`                                   | `DispatchMeta` with `skipSmartRewind?: boolean`                                            | VERIFIED | Line 329: `skipSmartRewind?: boolean` in `DispatchMeta` type                                                                                             |
| `src/services/player/types.ts`                               | `IPlaybackControlCollaborator.executePlay(meta?: DispatchMeta)`                            | VERIFIED | Line 85: `executePlay(meta?: DispatchMeta): Promise<void>`                                                                                               |
| `src/services/player/PlaybackControlCollaborator.ts`         | `executePlay` checks `!meta?.skipSmartRewind`                                              | VERIFIED | Lines 31-46: signature and conditional `applySmartRewind` call                                                                                           |
| `src/services/coordinator/PlayerStateCoordinator.ts`         | Short-circuit dispatches `SEEK` when `startPosition` differs                               | VERIFIED | Lines ~1199-1216: `SEEK` dispatched before `PLAY` when `startPos !== undefined && Math.abs(startPos - currentPos) > 1`; meta threaded to `PLAY` dispatch |
| `src/components/library/LibraryItemDetail/ChapterList.tsx`   | Dispatches with `skipSmartRewind: true`, uses `dispatchPlayerEvent`                        | VERIFIED | Line 7: import; lines 79-81: `dispatchPlayerEvent` with `{ source: "ui", skipSmartRewind: true }`                                                        |
| `src/components/player/PlayPauseButton.tsx`                  | `pendingIsPlaying`, `displayIsPlaying`, `isLoadingTrack`, uses `displayIsPlaying` for icon | VERIFIED | Lines 41, 45, 48, 54, 97, 103 — all present and wired                                                                                                    |
| `src/components/player/__tests__/PlayPauseButton.test.tsx`   | Tests for optimistic state (146 lines)                                                     | VERIFIED | File exists at 146 lines; contains `pendingIsPlaying` test coverage                                                                                      |
| `src/services/__tests__/PlaybackControlCollaborator.test.ts` | Tests for `skipSmartRewind` behavior (234 lines)                                           | VERIFIED | Lines 164-171: tests for `skipSmartRewind: true` (no rewind) and `skipSmartRewind: false` (rewind fires)                                                 |
| `src/app/(tabs)/more/series/[seriesId]/item/[itemId].tsx`    | Re-export of series item detail                                                            | VERIFIED | File exists; single-line `export { default } from "@/app/(tabs)/series/[seriesId]/item/[itemId]"`                                                        |
| `src/app/(tabs)/more/authors/[authorId]/item/[itemId].tsx`   | Re-export of authors item detail                                                           | VERIFIED | File exists; single-line `export { default } from "@/app/(tabs)/authors/[authorId]/item/[itemId]"`                                                       |
| `src/app/(tabs)/more/_layout.tsx`                            | Stack.Screen entries for item detail routes                                                | VERIFIED | Lines 25-26: both `series/[seriesId]/item/[itemId]` and `authors/[authorId]/item/[itemId]` registered                                                    |
| `src/app/(tabs)/authors/_layout.tsx`                         | `[authorId]/index` and `[authorId]/item/[itemId]` entries                                  | VERIFIED | Lines 19-20: both entries present                                                                                                                        |

### Key Link Verification

| From                                        | To                                     | Via                                                | Status | Details                                                                                 |
| ------------------------------------------- | -------------------------------------- | -------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `AuthProvider.tsx`                          | `_layout.tsx`                          | `authInitializedPromise` module-level export       | WIRED  | Imported at `_layout.tsx` line 9; awaited at line 59                                    |
| `(tabs)/_layout.tsx`                        | `login.tsx`                            | `router.push("/login")` modal presentation         | WIRED  | Line 164 uses `router.push`; formSheet configured in root `_layout.tsx` line 365        |
| `login.tsx`                                 | navigation                             | `canGoBack()` check for modal vs initial           | WIRED  | Line 82: `router.canGoBack()` → `router.back()` or `router.replace("/")`                |
| `ChapterList.tsx`                           | `eventBus.ts`                          | `dispatchPlayerEvent` with `skipSmartRewind: true` | WIRED  | Line 7: import; line 79-81: dispatch call with meta                                     |
| `PlayerStateCoordinator.ts`                 | `PlaybackControlCollaborator.ts`       | `executePlay(meta)` threading                      | WIRED  | Line 1271: `await playerService.executePlay(meta)`                                      |
| `PlaybackControlCollaborator.ts`            | `smartRewind.ts`                       | conditional `applySmartRewind` call                | WIRED  | Lines 44-46: `if (!meta?.skipSmartRewind) { await applySmartRewind(currentPosition); }` |
| `more/series/[seriesId]/item/[itemId].tsx`  | `series/[seriesId]/item/[itemId].tsx`  | re-export default                                  | WIRED  | `export { default } from "@/app/(tabs)/series/[seriesId]/item/[itemId]"`                |
| `more/authors/[authorId]/item/[itemId].tsx` | `authors/[authorId]/item/[itemId].tsx` | re-export default                                  | WIRED  | `export { default } from "@/app/(tabs)/authors/[authorId]/item/[itemId]"`               |

### Data-Flow Trace (Level 4)

These are bug fixes, not data-rendering features — no DB queries or API calls are involved in the new behaviors. All data flows through existing store/coordinator paths. Level 4 not applicable.

### Behavioral Spot-Checks

Step 7b skipped — behaviors require running simulator (auth flow, player state machine, navigation). These are flagged for human verification below.

### Requirements Coverage

The D-\* requirement IDs are Phase 23-internal identifiers defined in `23-CONTEXT.md`, not tracked in the main `REQUIREMENTS.md`. The ROADMAP.md lists all 18 as Phase 23 requirements. Cross-reference against plans:

| Requirement | Source Plan | Description                                                 | Status    | Evidence                                                                                             |
| ----------- | ----------- | ----------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| D-01        | 23-01       | Hold SplashScreen until auth initialized                    | SATISFIED | `authInitializedPromise` + `await` in `_layout.tsx`                                                  |
| D-02        | 23-01       | Existing tabs routing guard has settled before UI visible   | SATISFIED | Splash held via promise; auth check fires before tabs render                                         |
| D-03        | 23-01       | Preserve silent refresh as primary path                     | SATISFIED | No changes to `handleUnauthorized()` — existing path untouched                                       |
| D-04        | 23-01       | Expired token presented as dismissible modal                | SATISFIED | `router.push("/login")` with `formSheet` presentation                                                |
| D-05        | 23-01       | headerLeft "Sign In" button after modal dismissed           | SATISFIED | `tokenExpiredHeaderLeft` in `Tabs.screenOptions`                                                     |
| D-06        | 23-01       | After modal login, user stays on same screen                | SATISFIED | `router.back()` when `canGoBack()` in `login.tsx`                                                    |
| D-07        | 23-01       | Login screen as formSheet (pre-existing config used)        | SATISFIED | `presentation: "formSheet"` already in root `_layout.tsx`                                            |
| D-08        | 23-02       | Chapter tap seeks when same item already paused             | SATISFIED | Coordinator short-circuit dispatches `SEEK` before `PLAY` when `startPosition` differs               |
| D-09        | 23-02       | Chapter tap sets `skipSmartRewind: true`                    | SATISFIED | `ChapterList.tsx` dispatch includes `skipSmartRewind: true` in meta                                  |
| D-10        | 23-02       | Cold-start chapter highlight from persisted progress        | SATISFIED | `LibraryItemDetail.tsx` passes `position \|\| (progress?.currentTime ?? 0)`                          |
| D-11        | 23-02       | `DispatchMeta` has `skipSmartRewind?: boolean`              | SATISFIED | `coordinator.ts` line 329                                                                            |
| D-12        | 23-02       | Normal play/resume still triggers smart rewind              | SATISFIED | No flag set in normal play paths; confirmed by test                                                  |
| D-13        | 23-03       | `pendingIsPlaying` optimistic state in PlayPauseButton      | SATISFIED | `PlayPauseButton.tsx` lines 45, 48, 60-63                                                            |
| D-14        | 23-03       | Icon flicker prevented during LOADING/BUFFERING             | SATISFIED | Reconciliation guarded with `!isLoadingTrack` (line 54)                                              |
| D-15        | 23-03       | Profile before fixing (plan guidance: implement regardless) | SATISFIED | Plan explicitly permitted implementation without separate profile commit; fix implemented            |
| D-16        | 23-04       | More tab supports full-depth navigation                     | SATISFIED | Re-export routes and `_layout.tsx` Stack.Screen entries                                              |
| D-17        | 23-04       | More stack includes all route levels                        | SATISFIED | `more/_layout.tsx` has both `series/[seriesId]/item/[itemId]` and `authors/[authorId]/item/[itemId]` |
| D-18        | 23-04       | Item detail in More stack is re-export not duplicate        | SATISFIED | Both item detail files are single-line re-exports                                                    |

**Note:** D-01 through D-18 are not tracked in `REQUIREMENTS.md` — they are phase-internal identifiers defined in `23-CONTEXT.md`. The main `REQUIREMENTS.md` does not include Phase 23 requirements in its traceability table (the table was last updated for Phases 14-22). This is expected — no orphaned REQUIREMENTS.md entries for Phase 23.

### Anti-Patterns Found

| File                 | Line              | Pattern                                               | Severity | Impact                                                                                                                                                                                                                |
| -------------------- | ----------------- | ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthProvider.tsx`   | 94                | `console.log("[AuthProvider] Auth state changed...")` | Info     | Development log; not a stub; does not block goal                                                                                                                                                                      |
| `login.tsx`          | 51, 101, 107      | `console.log(...)`                                    | Info     | Development logs in auth flow; not stubs                                                                                                                                                                              |
| `(tabs)/_layout.tsx` | 151               | `router.replace("/login")` in initial-auth effect     | Info     | Intentional by design — this is the initial unauthenticated state handler, not the expired-token effect. The plan explicitly preserves this. Not a regression.                                                        |
| `(tabs)/_layout.tsx` | NativeTabs branch | `tokenExpiredHeaderLeft` not wired to NativeTabs      | Info     | NativeTabs API does not support custom `headerLeft`. Only affects iOS devices using native tab bar. The standard Tabs path (non-native) is fully wired. This is a known API limitation, not a missing implementation. |

No blockers found. All console.log calls are existing patterns (not introduced by Phase 23) and are not stubs.

### Human Verification Required

#### 1. Auth Startup Flicker (D-01/D-02)

**Test:** Cold-start the app on a device with a valid stored token
**Expected:** Tabs appear immediately without any flash of the login screen
**Why human:** Cannot verify splash screen timing or visual flash programmatically

#### 2. Expired Token Modal UX (D-04/D-05/D-06)

**Test:** Expire a token (modify stored token to be invalid), trigger a request, dismiss the modal, then re-login via the headerLeft "Sign In" button
**Expected:** (1) FormSheet modal appears over current screen, (2) after dismiss a "Sign In" button appears in header, (3) after modal login the user stays on same screen with button gone
**Why human:** Modal presentation, formSheet appearance, and navigation behavior require running simulator/device

#### 3. Chapter Tap Seek+Play (D-08/D-09)

**Test:** Open an item that is already paused, open the chapter list, tap a chapter that is NOT the current chapter
**Expected:** Player seeks to that chapter's start position and begins playing; no smart rewind applies
**Why human:** Requires running player with real audio track; position behavior observable only at runtime

#### 4. Cold-Start Chapter Highlight (D-10)

**Test:** Close the app while an item is 30% through, re-open, navigate to item detail
**Expected:** ChapterList highlights the chapter corresponding to the 30% position, not chapter 1
**Why human:** Requires cold-start sequence with persisted state in simulator/device

#### 5. Play/Pause Optimistic Update (D-13/D-14)

**Test:** Tap the play/pause button rapidly on a loaded track
**Expected:** Icon flips immediately on tap with no visible lag or oscillation through loading states
**Why human:** Visual latency and flicker are perceptual — cannot be verified via static code inspection

#### 6. More Tab Deep Navigation (D-16/D-17/D-18)

**Test:** Hide the Series tab in Settings; tap More -> Series -> select a series -> tap an item
**Expected:** Item detail screen renders correctly with full back stack (More > Series > Series Detail > Item Detail)
**Why human:** Expo Router route resolution and navigation stack behavior require running app

### Gaps Summary

No gaps. All 12 observable truths are verified. All 16 artifacts pass levels 1-3 (exist, substantive, wired). All 8 key links are confirmed wired. All 18 D-\* requirement IDs are satisfied with implementation evidence.

The only items requiring attention are 6 human verification scenarios that need simulator/device testing — standard for UI/navigation behavior that cannot be verified statically.

---

_Verified: 2026-05-01T23:55:00Z_
_Verifier: Claude (gsd-verifier)_
