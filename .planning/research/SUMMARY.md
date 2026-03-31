# Project Research Summary

**Project:** SideShelf — v1.3 Beta Polish
**Domain:** React Native / Expo audiobook client (iOS-first, Expo SDK 54, New Architecture)
**Researched:** 2026-03-09
**Confidence:** HIGH (architecture and features derived from direct codebase inspection; MEDIUM for third-party native packages)

## Executive Summary

SideShelf v1.3 is a polish-and-feature milestone for an established Expo audiobook app. The work is not greenfield — the codebase already contains significant infrastructure (RNTP, Reanimated 4, Drizzle/SQLite, a coordinator-driven playback state machine, and partial bookmark wiring), and all five new feature areas (AirPlay route picker, full bookmark management, collapsible section redesign, progress display format, sleep timer volume fade) extend this existing architecture rather than introducing new architectural concepts. The recommended approach is to work strictly within the established layer boundaries (UI → Zustand → Services → DB helpers) and avoid the recurring temptation to shortcut through coordinators or component-local state for things that must survive navigation or backgrounding.

The two most impactful implementation decisions for this milestone are: first, the sleep timer volume fade must live in a new `SleepTimerService` singleton (not a `useEffect` in a screen component, which would stop when the player is dismissed); and second, the bookmark SQLite schema must be designed with a `syncStatus` column from the start to prevent duplicate records after offline-then-online transitions. Both decisions are architectural and expensive to retrofit once shipped. Every other feature area follows a straightforward extension of already-proven patterns in the codebase.

The primary risk cluster is around three interacting platform concerns: React Compiler's worklet extraction breaking Reanimated animations in production builds (a confirmed open issue), Expo's tree shaking being unstable with Reanimated 4's worklets package, and the AirPlay native module's uncertain new-architecture compatibility. All three risks concentrate in the animation and performance phases and must be validated against a production binary — not just `expo start`.

## Key Findings

### Recommended Stack

The v1.3 milestone requires three new packages and zero new architectural dependencies. `@douglowder/expo-av-route-picker-view` (0.0.5) is the recommended AirPlay UI package — it wraps `AVRoutePickerView` via the Expo Modules API, which is consistent with how this project integrates native modules. `@shopify/flash-list@^2.0.0` replaces FlatList for the library list; v2 is new-architecture-only (aligned with `newArchEnabled: true`) and JS-only (no pod install). `react-native-performance` is dev/diagnostic use only, providing TTI measurement via Performance Web API marks.

Everything else needed for v1.3 is already installed: Reanimated `~4.1.1`, `expo-image ~3.0.10`, and RNTP `^4.1.2`. The metro config change (`inlineRequires: true`) pairs with SDK 54's default tree shaking and is the one recommended configuration enhancement. RNTP 5.x alpha must be avoided — it is broken on iOS and not production-ready.

**Core technologies:**

- `@douglowder/expo-av-route-picker-view@^0.0.5`: AirPlay UI button (iOS only) — most recently maintained Expo Modules-based `AVRoutePickerView` wrapper; fallback is a local Expo Module (~30 lines of Swift via `npx create-expo-module --local`)
- `@shopify/flash-list@^2.0.0`: FlatList replacement — view recycling, new-arch aligned, JS-only in v2 (no pod install), dynamic `numColumns` supported natively
- `react-native-reanimated@~4.1.1` (already installed): UI-thread height animations for CollapsibleSection and FullScreenPlayer panel migration via `withTiming` + `useAnimatedStyle`
- `expo-image@~3.0.10` (already installed): disk-cached cover art; use solid-colour placeholder only — blurhash placeholder has a confirmed sizing bug for non-1:1 images (expo/expo#21677)
- `TrackPlayer.setVolume()` via RNTP (no new package): JS interval ramp for sleep timer volume fade — no native fade API exists in RNTP

### Expected Features

All five feature areas are committed for v1.3. None are optional. The codebase already has partial infrastructure for all of them.

**Must have (table stakes for v1.3):**

- AirPlay route picker button on all three player surfaces (FullScreenPlayer header, FloatingPlayer controls, item detail controls) — iOS users expect this from any audio app; absence is conspicuous
- Bookmark add/view/rename/delete with server sync — server API and slice state already partially wired; rename PATCH endpoint and SQLite persistence are the missing pieces
- CollapsibleSection peek-and-fade redesign — the current implementation is visually broken (no height animation, no peek, mounts/unmounts children on toggle)
- Progress display format selector (time remaining / elapsed-total / percent) — user-requested, low effort, high perceived value; must be consistent across all three player surfaces
- Sleep timer volume fade (30-second linear ramp) — the abrupt cut-off on sleep timer expiry is jarring; Castro, Apple Podcasts, and Pocket Casts all fade

**Should have (include if time permits):**

- Bookmark SQLite local cache (BOOKMARK-06) — enables offline viewing; can ship initial version reading from in-memory slice only, but the schema must be designed correctly from day one regardless
- Player UI redesign (PLAYER-01 through PLAYER-03): nav bar removal, chevron dismiss, settings UIMenu — the header redesign is already partially planned and `@react-native-menu/menu` is already installed for SleepTimerControl

**Defer (v2+):**

- Bookmark position editing — no ABS API endpoint exists; document "delete and re-add" for users
- Custom AirPlay device list — requires private APIs; not feasible
- Per-item progress format preference — over-engineering for v1.3; global setting is sufficient
- Sleep timer chapter-end volume fade — requires coordinator-level chapter tracking; the 30s time-based fade covers the primary use case

### Architecture Approach

The architecture is an established layered system (UI → Zustand → Services → DB helpers) with a coordinator-driven playback state machine at the center. Every v1.3 feature fits into this pattern without requiring structural changes. The key constraint is that sleep timer state is explicitly excluded from the coordinator (`PROP-04` exception), meaning the volume fade must be implemented as a new `SleepTimerService` singleton that reads Zustand state and dispatches `SET_VOLUME` command events to the coordinator. The coordinator then executes volume changes through its existing `executeSetVolume` path — no coordinator modifications required.

**Major components added or modified:**

1. `src/components/player/AirPlayButton.tsx` (NEW) — wraps `AVRoutePickerView`; platform-guarded (iOS only); placed in three player surfaces
2. `src/services/SleepTimerService.ts` (NEW) — singleton; 1s poll interval; reads `getSleepTimerRemaining()` from Zustand; dispatches `SET_VOLUME` and `PAUSE` events; started in `initializeApp()`
3. `src/db/schema/bookmarks.ts` + `src/db/helpers/bookmarks.ts` (NEW) — per-entity pattern; schema must include `syncStatus` column (`pending_create` / `synced` / `pending_delete`) and a local UUID from the start
4. `src/stores/slices/settingsSlice.ts` (MODIFIED) — add `progressDisplayFormat` field following the identical pattern of all existing settings keys
5. Collapsible section component (MODIFIED) — Reanimated `withTiming` + `onLayout` height measurement + `LinearGradient` fade overlay; children always mounted (no mount/unmount toggle)
6. `src/services/ProgressService.ts` (MODIFIED) — decomposed into facade + `SessionTrackingCollaborator` + `SessionSyncCollaborator`; same pattern as PlayerService decomposition in v1.2

### Critical Pitfalls

1. **React Compiler extracts Reanimated worklet functions** — `app.json` has `experiments.reactCompiler: true` and the project uses Reanimated 4.1.1. React Compiler hoists inline lambdas passed to `useAnimatedStyle`/`useDerivedValue` out of their call sites, stripping the worklet context Reanimated needs for UI-thread execution. The crash is "Tried to synchronously call a non-worklet function on the UI thread" — and it may only manifest in production builds, not dev. Prevention: add an explicit `'worklet';` directive as the first line of every new Reanimated callback, proactively.

2. **Expo tree shaking crashes production when Reanimated worklets are present** — `EXPO_UNSTABLE_TREE_SHAKING` can strip Reanimated's initialization side effects, leaving the Worklets native module uninitialized. Development builds are unaffected (tree shaking is production-only). Prevention: enable tree shaking in a dedicated standalone phase, test via a production build to TestFlight (not `expo start`), and add a dummy `Animated.View` import in `_layout.tsx` as a safeguard if the crash occurs.

3. **FlashList does not support `columnWrapperStyle`** — `LibraryItemList.tsx` uses `columnWrapperStyle` for grid spacing, which FlashList silently ignores, making grid covers run flush. The `key` prop used to remount FlatList on `numColumns` changes also destroys FlashList's recycled view pool. Prevention: remove `columnWrapperStyle` and the `key` prop; apply per-item horizontal padding via index math in `renderItem`; use `getItemType` for grid/list mode recycling separation.

4. **Bookmark offline sync creates duplicate records** — the ABS API assigns server-side IDs; local bookmarks created offline have no server ID yet. If sync logic upserts by server ID after a fetch, a locally-created bookmark and its server counterpart both remain as separate records. Prevention: design the schema with `syncStatus` and a local UUID from the start; update the server ID on successful POST response before any subsequent fetch.

5. **Sleep timer volume fade interval not cleared on cancel or stop** — if the fade `setInterval` is not explicitly cleared when the user cancels the timer or manually stops playback, volume stays at the faded value for the next session. Prevention: implement fade in `SleepTimerService` (not a component), store the pre-fade volume explicitly, and clear the interval plus restore volume from all three exit paths: timer expiry, cancel, and playback stop.

## Implications for Roadmap

The ARCHITECTURE.md build order is well-reasoned and based on dependency analysis of the actual codebase. The suggested phases below track that order closely, with adjustments based on pitfall severity and risk isolation.

### Phase 1: Settings Foundation + Progress Display Format

**Rationale:** No dependencies on other phases. Pure settings slice extension plus UI reads from it. Establishes the `progressDisplayFormat` setting that all three player surfaces depend on (PROGRESS-02/03/04 are blocked on PROGRESS-01). Low risk, establishes implementation momentum immediately.
**Delivers:** User-selectable progress display format (time remaining / elapsed-total / percent) consistent across FullScreenPlayer, FloatingPlayer, and item detail controls. Shared `formatProgressDisplay()` utility in `src/lib/helpers/`.
**Addresses:** PROGRESS-01 through PROGRESS-04
**Avoids:** No major pitfalls; standard settings extension pattern already used for all existing settings keys

### Phase 2: CollapsibleSection Redesign

**Rationale:** No external dependencies. Pure component refactor with Reanimated. Must happen before the FullScreenPlayer redesign (PERF-11 and the section migration converge on the same Reanimated pattern). Isolating this phase lets the team validate React Compiler + Reanimated worklet compatibility in a contained component before applying the same pattern to the more complex FullScreenPlayer.
**Delivers:** Peek-and-fade collapsible sections with Reanimated `withTiming` height animation, dynamic height measurement via `onLayout`, and a `LinearGradient` fade overlay in the collapsed state. Children always mounted.
**Addresses:** SECTION-01 through SECTION-03
**Avoids:** Pitfall 1 (React Compiler worklet extraction) — validate with a production build at the end of this phase before expanding Reanimated usage; Pitfall 5 (CollapsibleSection height animation requires measuring dynamic content height) — guard `withTiming` call until `measuredHeight > 0`

### Phase 3: Full Screen Player UI Redesign + AirPlay

**Rationale:** Depends on validating the Reanimated pattern from Phase 2. AirPlay package requires a pod install and native rebuild. The UIMenu structure (PLAYER-03) is a prerequisite for the bookmark action placement in Phase 4. This phase has the widest surface area — four tickets (PLAYER-01 through PLAYER-06) and one performance ticket (PERF-11) all touch `FullScreenPlayer/index.tsx`.
**Delivers:** Chevron dismiss replacing the Done button, settings UIMenu, AirPlay button on FullScreenPlayer and FloatingPlayer, Reanimated panel animations replacing legacy `Animated.timing`.
**Addresses:** PLAYER-01 through PLAYER-06, PERF-11
**Avoids:** Pitfall 3 (AirPlay native module + scheme mismatch) — verify module on a physical device; verify URL scheme with `xcrun simctl openurl` before any Maestro work; Pitfall 8 (PanResponder + Reanimated incompatibility) — explicitly scope whether dismissal gesture migration is included or deferred; never leave PanResponder driving a Reanimated shared value from the JS thread

### Phase 4: Bookmarks

**Rationale:** Depends on Phase 3 for UIMenu placement of the bookmark action. The DB schema must be designed with `syncStatus` before any sync logic is written — this is the highest-stakes schema decision in the milestone. API endpoints and slice state are already partially wired, which reduces the implementation risk considerably.
**Delivers:** Add/view/rename/delete bookmarks with server sync; SQLite local cache for offline viewing. `wipeUserData` updated to delete from the bookmarks table in correct FK order.
**Addresses:** BOOKMARK-01 through BOOKMARK-06
**Avoids:** Pitfall 4 (offline sync duplicates) — design schema with `syncStatus` and local UUID before writing any sync logic; Pitfall 7 (bookmark offline sync duplicates) — upsert by `serverId`, not by position or local ID

### Phase 5: Sleep Timer Volume Fade

**Rationale:** No hard dependency on other phases. The `SleepTimerService` singleton pattern is independent of everything else. Placing it here (after the navigation-heavy Phase 3 and 4) prevents it from being interleaved with the riskier Reanimated and native module work.
**Delivers:** 30-second linear volume ramp before sleep timer expiry; volume restoration on cancel, on manual stop, and on app relaunch.
**Addresses:** SLEEP-01
**Avoids:** Pitfall 6 (interval not cleared on playback stop or app backgrounding) — implement in a service singleton, not a component; store pre-fade volume in the service; clear interval from all three exit paths

### Phase 6: Navigation + Deep Linking + Maestro Infrastructure

**Rationale:** Foundational for all end-to-end testing. Must establish the correct URL scheme before writing any Maestro flows — scheme mismatch (Pitfall 10) causes silent test failures where `openLink` completes without error but the app does not navigate. Navigation fix for the More tab series/authors detail is likely a routing configuration issue (missing dynamic route file or wrong path).
**Delivers:** Fixed More tab series/authors navigation; deep link scheme consistent across `app.json` and all Maestro YAML; `testID` additions for player controls and login inputs; `maestro/_login.yaml` and `maestro/_start-playback.yaml` subflows.
**Addresses:** NAVIGATION-01 through NAVIGATION-03, TESTING-01 through TESTING-05
**Avoids:** Pitfall 10 (deep link scheme mismatch) — run `xcrun simctl openurl booted "side-shelf:///(tabs)/library"` to confirm the actual scheme before writing any YAML

### Phase 7: Performance (FlashList, expo-image, TTI, memory leaks)

**Rationale:** No functional dependencies; can run in parallel with Phase 6 or batched together. FlashList migration is isolated to the library list component. Performance changes carry low user-facing risk but high layout-correctness risk (the `columnWrapperStyle` and `key` prop pitfalls).
**Delivers:** FlashList library list, expo-image cover caching, ChapterList memoization, deferred coordinator init, TTI measurement baseline via `react-native-performance`, NetInfo subscriber leak fix.
**Addresses:** PERF-01 through PERF-10 (PERF-11 already done in Phase 3)
**Avoids:** Pitfall 2 (FlashList `columnWrapperStyle`) — remove it, replace with per-item margin; Pitfall 9 (FlashList `key` prop remount) — remove `key` prop, add `getItemType`; Pitfall 11 (expo-image blurhash sizing) — use solid-colour placeholder only

### Phase 8: Tree Shaking (Standalone)

**Rationale:** Explicitly isolated from all other phases to contain the blast radius. Must be validated against a production binary only — tree shaking does not apply in development. High probability of Reanimated production crashes; a TestFlight build is the required verification step, not `expo start`.
**Delivers:** Production bundle size reduction via Expo SDK 54 default tree shaking plus metro `inlineRequires`.
**Addresses:** PERF-03
**Avoids:** Pitfall 4 (tree shaking crashes Reanimated in production) — production build to TestFlight; verify all Reanimated animations work; add `Animated.View` safeguard import in `_layout.tsx` if worklet initialization fails

### Phase 9: ProgressService Decomposition

**Rationale:** Pure refactor with no user-facing changes. Can run in parallel with Phases 7 and 8. The background sync timer path must be mapped explicitly before splitting — silent failure (progress not saved after long uninterrupted playback) is the failure mode, and it will not surface in routine testing.
**Delivers:** `ProgressService` decomposed into facade + `SessionTrackingCollaborator` + `SessionSyncCollaborator`, following the PlayerService v1.2 pattern. All timers owned by the facade.
**Addresses:** DEBT-03
**Avoids:** Pitfall 12 (ProgressService decomposition breaks background sync timer path) — map all timer-triggered call paths before splitting; verify with a 5-minute uninterrupted playback test after the split

### Phase Ordering Rationale

- Settings (Phase 1) first because it unblocks three surfaces and carries no risk or dependencies.
- CollapsibleSection (Phase 2) before FullScreenPlayer (Phase 3) because Phase 2 is the risk probe for React Compiler + Reanimated worklet compatibility — validating it in isolation means Phase 3 can apply the same pattern with confidence.
- Bookmarks (Phase 4) after FullScreenPlayer UIMenu (Phase 3) because the bookmark action lives inside the UIMenu structure established in Phase 3.
- Sleep timer (Phase 5) is self-contained and low-risk; placing it mid-milestone ensures it is not squeezed out by end-of-milestone crunch on riskier phases.
- Navigation and Maestro (Phase 6) before performance phases because test infrastructure enables regression detection during the remaining work.
- Tree shaking (Phase 8) is explicitly isolated as the last functional phase because it is the highest-probability source of production-only regressions; everything else should be stable before introducing it.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 3 (AirPlay):** New-arch compatibility of `@douglowder/expo-av-route-picker-view` is unverified against SDK 54. Confirm with a device build before committing to this package. Document the local Expo Module fallback path explicitly in the phase plan.
- **Phase 4 (Bookmarks):** The ABS PATCH endpoint for bookmark rename (`PATCH /api/me/item/:id/bookmark/:bookmarkId`) was inferred from the create/delete pattern — it was not directly verified from ABS API documentation. Verify before implementing BOOKMARK-03.
- **Phase 8 (Tree Shaking):** The `inlineRequires` + Reanimated 4 + React Compiler triple interaction has not been documented anywhere in the issue trackers or community. Treat this phase as exploratory; have a revert plan ready.

Phases with well-documented patterns (research-phase likely unnecessary):

- **Phase 1 (Settings):** Extending `settingsSlice` is a repeated pattern with high internal documentation and multiple existing precedents.
- **Phase 5 (Sleep Timer):** Service singleton pattern is established; `TrackPlayer.setVolume()` API is documented; volume ramp pattern confirmed from RNTP issue tracker.
- **Phase 9 (ProgressService decomposition):** Identical pattern applied to PlayerService in v1.2; strong internal precedent with verified anti-patterns documented.

## Confidence Assessment

| Area         | Confidence                                                | Notes                                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH (already-installed packages) / MEDIUM (new packages) | Reanimated, expo-image, RNTP verified from package.json. FlashList v2 new-arch alignment confirmed via npm and Expo 54 upgrade path reports. AirPlay package new-arch compatibility UNVERIFIED against SDK 54 specifically. |
| Features     | HIGH                                                      | All five feature areas audited directly from codebase. Existing API endpoints, types, and slice state confirmed from source. ABS bookmark PATCH endpoint inferred, not verified from official ABS API docs.                 |
| Architecture | HIGH                                                      | Derived entirely from direct codebase inspection. Coordinator `PROP-04` exception confirmed in `syncStateToStore` comment. Build order based on verified dependency graph.                                                  |
| Pitfalls     | HIGH                                                      | All critical pitfalls grounded in confirmed open GitHub issues (6 upstream issues cited) or direct code inspection. Recovery strategies documented for each.                                                                |

**Overall confidence:** HIGH for implementation approach; MEDIUM for two specific third-party unknowns (AirPlay package new-arch compatibility, ABS bookmark PATCH endpoint).

### Gaps to Address

- **AirPlay package new-arch compatibility:** Verify `@douglowder/expo-av-route-picker-view` works in a device build with `newArchEnabled: true` before finalizing the Phase 3 plan. The local Expo Module fallback (~30 lines of Swift via `npx create-expo-module --local`) is documented and available if the npm package fails.
- **ABS bookmark PATCH endpoint:** Confirm `PATCH /api/me/item/:libraryItemId/bookmark/:bookmarkId` exists and accepts `{ title: string }` by checking the live ABS API documentation or ABS server source before implementing BOOKMARK-03.
- **URL scheme consistency:** `app.json` has `"scheme": "side-shelf"` (hyphen); `docs/plans/ui-testing.md` uses `sideshelf://` throughout (no hyphen). Resolve before Phase 6 — run `xcrun simctl openurl booted "side-shelf:///(tabs)/library"` to confirm which scheme the app actually responds to, then update all Maestro YAML accordingly.
- **expo-linear-gradient availability:** The CollapsibleSection redesign requires `expo-linear-gradient` for the fade overlay. Confirm it is in `package.json` before Phase 2 planning; if not, add its installation to Phase 2 scope.

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `src/services/coordinator/PlayerStateCoordinator.ts` — `PROP-04` exception, `SET_VOLUME` event handling, `syncStateToStore` two-tier sync pattern
- `src/stores/slices/userProfileSlice.ts` — bookmark state and actions (partially wired; `createBookmark`, `deleteBookmark`, `refreshBookmarks` exist)
- `src/lib/api/endpoints.ts` — `createBookmark`, `deleteBookmark` endpoints confirmed; `updateBookmark` absent
- `src/types/api.ts` — `ApiAudioBookmark` type (`id`, `libraryItemId`, `title`, `time`, `createdAt`) confirmed
- `src/app/FullScreenPlayer/index.tsx` — legacy `Animated.parallel`, `PanResponder`, existing header structure
- `src/components/ui/CollapsibleSection.tsx` — legacy `Animated.timing`, mount/unmount toggle pattern confirmed broken
- `src/components/library/LibraryItemList.tsx` — `columnWrapperStyle`, `key` remount prop, `numColumns={3}` grid
- `app.json` — `newArchEnabled: true`, `experiments.reactCompiler: true`, `"scheme": "side-shelf"`
- `package.json` — installed versions: Reanimated `~4.1.1`, `expo-image ~3.0.10`, RNTP `^4.1.2`, no FlashList installed
- `docs/plans/ui-testing.md` — `sideshelf://` scheme throughout (no hyphen), confirming the scheme mismatch

### Secondary (HIGH confidence — confirmed library issues)

- `software-mansion/react-native-reanimated#6826` — React Compiler extracts inline worklet functions, causing "non-worklet function on UI thread" crash (confirmed open)
- `Shopify/flash-list#686` — `columnWrapperStyle` not supported in FlashList (confirmed limitation, not a bug)
- `expo/expo#41620` — tree shaking crashes production with Reanimated (reported 2025-12-14)
- `software-mansion/react-native-reanimated#8752` — Worklets native module not initialized after tree shaking (cross-linked)
- `expo/expo#21677` — expo-image blurhash placeholder sizing incorrect for non-1:1 images

### Secondary (MEDIUM confidence — official and community documentation)

- Apple AVRoutePickerView docs — confirms `AVRoutePickerView` is the correct modern route picker API; `MPVolumeView` is deprecated for this purpose
- RNTP volume fade issues #670 and #1486 — confirms no native fade API; `setVolume()` loop is the established workaround
- FlashList v2 migration guide and Shopify engineering post — drop-in FlatList replacement; v2 is new-arch-only; JS-only recycling
- Expo SDK 54 changelog — confirms tree shaking enabled by default in production
- Expo tree shaking guide — `inlineRequires` usage and known Reanimated interaction
- Castro sleep timer support documentation — confirms 30s volume fade is an established audiobook app UX pattern
- ABS issue #320 — sleep timer fade confirmed as a user-requested feature

---

_Research completed: 2026-03-09_
_Ready for roadmap: yes_
