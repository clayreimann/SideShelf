# Pitfalls Research

**Domain:** React Native Expo audiobook app — v1.3 Beta Polish milestone
**Researched:** 2026-03-09
**Confidence:** HIGH — grounded in direct codebase inspection, official issue trackers, and verified library behaviour

---

## Critical Pitfalls

### Pitfall 1: React Compiler Extracts Worklet Functions, Breaking Reanimated at Runtime

**What goes wrong:**
React Compiler (enabled via `app.json` `experiments.reactCompiler: true`) aggressively extracts inline functions passed to hooks like `useDerivedValue`, `useAnimatedStyle`, and `useAnimatedScrollHandler`. Reanimated's worklet system requires these functions to be inline (or explicitly `'worklet'`-marked) at the call site so the Reanimated Babel plugin can hoist them to the UI thread. When React Compiler extracts them into a separate `_temp` helper, they become regular JS functions, not worklets. At runtime, Reanimated throws: `[Reanimated] Tried to synchronously call a non-worklet function on the UI thread.`

This is a confirmed, unresolved conflict between React Compiler and Reanimated (github.com/software-mansion/react-native-reanimated/issues/6826). This codebase already has React Compiler enabled AND Reanimated 4.1.1. Every new `useAnimatedStyle` or `useDerivedValue` written for CollapsibleSection or FullScreenPlayer is exposed to this.

**Why it happens:**
React Compiler treats `useDerivedValue(() => value.value * 2)` as "a callback that can be memoized", extracts the arrow function, and passes a reference to the extracted copy. Reanimated never sees the inline arrow function it expects to mark as a worklet. The Babel worklet transform ran at compile time on the original source — the extracted function never gets the `__workletContextObject` property the UI thread runtime checks for.

**How to avoid:**
Test every new `useAnimatedStyle`/`useDerivedValue` addition by running the app in development and triggering the animation. If it crashes with "non-worklet function", add an explicit `'worklet';` directive as the first line of the callback body. This forces Reanimated's Babel plugin to mark it regardless of what React Compiler does with the surrounding code. Document this in the migration PR so it is not treated as a one-time fluke.

**Warning signs:**

- Red screen crash with `[Reanimated] Tried to synchronously call a non-worklet function on the UI thread`
- Animation works in development (Metro + Hermes debug, where React Compiler may behave differently) but crashes in production build
- Only affects new Reanimated code — existing `tab-bar-settings.tsx` usages predate this conflict and may work due to their specific structure

**Phase to address:** CollapsibleSection Reanimated migration phase and FullScreenPlayer animation migration phase. Add `'worklet';` directives proactively rather than reactively.

---

### Pitfall 2: FlashList Does Not Support `columnWrapperStyle` — Grid Spacing Breaks on Migration

**What goes wrong:**
`LibraryItemList.tsx` currently uses FlatList with `columnWrapperStyle={componentStyles.gridColumnWrapper}` to add `gap: spacing.md` between grid items. FlashList does not support `columnWrapperStyle` at all (github.com/Shopify/flash-list/issues/686). Passing it does nothing and a warning appears in development. The 3-column grid layout will lose all inter-item spacing on migration, making covers run flush against each other.

Additionally, FlashList and FlatList differ fundamentally in how they handle multi-column layouts: FlatList wraps three items in a row View; FlashList treats each item as an individual cell and manages column layout internally. Width-based styling that assumed "this item is 1/3 of the parent in FlatList" is still correct in FlashList with `numColumns={3}` (FlashList honours `numColumns` for width division), but any `StyleSheet.create` entry that references a gap via `columnWrapperStyle` must be replaced.

**Why it happens:**
The FlashList architecture recycles individual cells, not row-wrapper Views. There is no row wrapper to apply `columnWrapperStyle` to. This is a documented limitation, not a bug — FlashList explicitly does not implement this prop.

**How to avoid:**
Replace `columnWrapperStyle` with per-item horizontal padding calculated from the item's column index. Use `overrideItemLayout` if needed for the grid/list mode switch (`getItemType` is the correct FlashList mechanism for telling the recycler that grid items and list items are different component types and should not be recycled into each other). Verify the grid visually at all three column counts: 3 items (full grid), 2 items (partial last row), 1 item (degenerate case). Also add `estimatedItemSize` — without it, FlashList warns and estimates poorly, causing layout jumps on first render.

**Warning signs:**

- Grid items have no gap after migration (covers flush against each other)
- Warning in Metro logs: `columnWrapperStyle is not supported in FlashList`
- Grid layout jumps or flashes on first scroll (missing `estimatedItemSize`)
- Items rendered in wrong component template when switching grid/list mode (missing `getItemType`)

**Phase to address:** FlashList migration phase (PERF-01). Measure average item height in both grid and list modes for `estimatedItemSize` before implementation.

---

### Pitfall 3: AirPlay AVRoutePickerView Requires a Native Module — Not Available in Expo Managed Workflow Without Prebuild

**What goes wrong:**
`AVRoutePickerView` is an iOS native UI component. There is no Expo SDK built-in for it. Using it requires a third-party native module (`@douglowder/expo-av-route-picker-view` or `react-native-avroutepickerview`). Both libraries require native code and cannot be used with Expo Go — they require `expo prebuild` to compile into the native project.

The app already uses `expo-dev-client` and prebuild (`npm run ios` runs `expo prebuild --clean && expo run:ios`), so this is not a hard blocker. However: the `scheme` in `app.json` is currently `"side-shelf"` (with a hyphen). Hyphens are valid in iOS URL schemes (RFC 2396), so this is not a bug — but it must match what Maestro deep link tests use. The `ui-testing.md` plan uses `sideshelf://` (no hyphen); this mismatch means all Maestro `openLink` commands will fail silently until corrected.

**Why it happens:**
Two separate naming decisions were made independently: the `app.json` scheme was set to `side-shelf` (matching the app name), and the UI testing plan was written assuming `sideshelf` (no hyphen). Neither was wrong in isolation; the conflict only surfaces when deep link tests run.

**How to avoid:**
Pick one scheme and use it everywhere. The AirPlay module requires an explicit pod install or CNG dependency declaration in `app.json`'s `plugins` array. Verify the module renders on device (not simulator — the iOS simulator does not show the AirPlay picker popup). For the URL scheme conflict: run `xcrun simctl openurl booted "side-shelf:///(tabs)/library"` and `xcrun simctl openurl booted "sideshelf:///(tabs)/library"` to determine which the app actually responds to before writing any Maestro flows.

**Warning signs:**

- AirPlay button renders but tapping does nothing (module not installed or pod not linked)
- `@douglowder/expo-av-route-picker-view` throws "Unrecognized RCT module" at runtime (pod install ran but native module not registered)
- Maestro `openLink` commands time out with no navigation (scheme mismatch between `app.json` and YAML)
- AirPlay button shows in development build but is invisible on TestFlight (missing config plugin declaration for EAS build)

**Phase to address:** AirPlay/player UI redesign phase. Verify scheme consistency before writing any Maestro flows.

---

### Pitfall 4: Expo Tree Shaking Crashes Production Builds When Reanimated Is Present

**What goes wrong:**
Expo's `EXPO_UNSTABLE_TREE_SHAKING=1` flag is marked unstable for a reason: it has a confirmed bug where it can tree-shake away the initialization side effects of `react-native-reanimated`, leaving the native Worklets module uninitialized in production builds. The app crashes on launch with a Worklets initialization error. This is tracked in expo/expo#41620 and software-mansion/react-native-reanimated#8752. This codebase uses Reanimated 4.1.1, which splits worklet runtime into the `react-native-worklets` package — the surface for this bug is larger than in Reanimated 3.x.

Additionally, `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1` changes Metro's module resolution ordering. Modules with initialization side effects (like `react-native-gesture-handler`'s `GestureHandlerRootView`, `react-native-screens`, and `async-lock`) may initialize in a different order than expected, causing subtle runtime failures unrelated to Reanimated.

**Why it happens:**
Tree shaking identifies imports with no "live bindings" (nothing imported from the module is used in the final bundle) and removes the entire module, including any `import 'some-module'` side-effect imports. Reanimated's initialization works via side-effect imports in its entry point. If tree shaking incorrectly classifies these as dead code, the native side is never initialized.

**How to avoid:**
Enable tree shaking incrementally. First enable only `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1` (the graph optimization, lower risk). Then add `EXPO_UNSTABLE_TREE_SHAKING=1` in a separate commit and test a production build (`eas build --platform ios --profile production --local`). Do NOT test only with `expo start` — tree shaking only applies to production bundles. Verify the production build launches, plays audio, and the Reanimated animation on CollapsibleSection works. If Worklets crashes, the workaround is to add a dummy `Animated.View` import in `_layout.tsx` to force Reanimated into the bundle (confirmed workaround from the GitHub issue).

**Warning signs:**

- Production build crashes immediately on launch with `Worklets native module not initialized` or similar
- Development build (from `expo start`) works fine — tree shaking does not apply to dev bundles
- Reanimated animations stop working in production but work in development
- `async-lock` throws `Cannot read property 'acquire' of undefined` (lock singleton not initialized due to module ordering change)

**Phase to address:** Tree shaking phase (PERF-03). This must be a standalone phase that ships a production build to TestFlight for smoke testing before being considered done.

---

### Pitfall 5: CollapsibleSection Height Animation Requires Measuring Dynamic Content Height — Cannot Animate to "auto"

**What goes wrong:**
The current `CollapsibleSection` uses the legacy `Animated` API and simply shows/hides content by toggling `isExpanded`. The new design (SECTION-01–03) requires showing the first ~100px of content in collapsed state and animating to the full height when expanding. Reanimated's `withTiming` cannot animate to `'auto'` height — it requires a numeric value. If the content height is not measured first, the animation either jumps to a hardcoded estimate or does not animate at all.

The standard Reanimated pattern for animating to a dynamic height is: render the content offscreen/invisible → measure its height via `onLayout` → store the height in a `useRef` → animate `sharedValue` from collapsed height (100) to measured height. This requires a two-pass render: the content must be rendered before its height is known.

**Why it happens:**
React Native layout is asynchronous. There is no synchronous way to know a component's layout dimensions before it renders. `useAnimatedStyle` with `height: withTiming(targetHeight)` will produce a zero-height animation if `targetHeight` is 0 when the animation starts (before `onLayout` fires).

**How to avoid:**
Render the full content with `position: 'absolute'` and `opacity: 0` to measure its height via `onLayout`, then animate once the height is known. Alternatively, use a fixed peek height for the collapsed state (100px as specified) and animate to the measured full height. Guard the animation start: only call `withTiming` after `measuredHeight > 0`. If `measuredHeight` is 0 at expand time, show content without animation rather than showing nothing.

**Warning signs:**

- Collapsed section shows nothing instead of the first 100px (wrong initial height)
- Expand animation plays but content snaps to wrong final height (measuring before layout)
- Section height is correct for the first item but wrong for subsequent items in a list (recycled component with stale `measuredHeight` from previous item)

**Phase to address:** CollapsibleSection redesign phase (SECTION-01–03). Write the height measurement pattern before implementing the animation.

---

### Pitfall 6: Sleep Timer Volume Fade Interval Not Cleared on Playback Stop or App Backgrounding

**What goes wrong:**
The sleep timer volume fade (SLEEP-01) requires a `setInterval` that calls `TrackPlayer.setVolume()` every ~300ms for the last 30 seconds. If the user manually stops playback before the sleep timer fires, or the app is backgrounded, or the sleep timer is cancelled, this interval must be explicitly cleared. If it is not:

1. The interval continues calling `TrackPlayer.setVolume()` on a stopped player — no crash, but volume is stuck at the faded value when the user next plays
2. If a new sleep timer is set while the old interval is still running, two intervals race to set volume simultaneously, creating non-monotonic volume behaviour
3. After the volume reaches 0 and the sleep timer stops playback, the volume stays at 0 permanently (the interval was not cleared, but it has already reached 0)

The current `SleepTimerControl` component and its underlying slice/service do not implement volume restoration. Any refactoring of the sleep timer to add fade must also ensure volume is restored to 1.0 when: timer cancelled, playback manually stopped, or app relaunches.

**Why it happens:**
Interval cleanup is easy to forget when the cleanup trigger is "any of three different events". Volume state is not tracked in `playerSlice` — the coordinator does not know what volume level TrackPlayer is at. There is no `TrackPlayer.getVolume()` in RNTP's API surface, so the app cannot read the current volume to restore it; it must store the pre-fade volume itself.

**How to avoid:**
Implement the fade interval in a service method (not a component), store the interval ID in the service, and clear it from all three exit paths: `cancelSleepTimer()`, `stopPlayback()`, and app foreground restore. Store the pre-fade volume in the sleep timer state and call `TrackPlayer.setVolume(storedVolume)` on cancel and on playback stop. Add a unit test that verifies: volume is 1.0 after cancel, volume is 1.0 after `stopPlayback()` is called during fade.

**Warning signs:**

- After sleep timer fires: subsequent playback sessions start at volume 0 (silent)
- Rapid cancel/restart of sleep timer: volume changes erratically
- Background + foreground during fade: app continues at reduced volume with no user indication

**Phase to address:** Sleep timer phase (SLEEP-01). Treat volume as explicit state owned by the sleep timer service logic.

---

### Pitfall 7: Bookmark Sync Creates Duplicate Records on Server When Offline Create Is Followed by Sync

**What goes wrong:**
The ABS bookmark API creates a bookmark server-side with a server-assigned ID. The local SQLite cache will need to store a bookmark immediately when the user taps "Add Bookmark" (for offline viewing). At that point, the server ID is not known — the local record must use a local placeholder ID. When the device comes online and the bookmark is synced, the server creates the record and returns a server ID. If the sync logic does not update the local record's server ID (and instead re-creates a new local record on the next fetch), there will be duplicates.

A second scenario: the user creates a bookmark offline, then the same bookmark timestamp gets a server-assigned ID after sync. If the app then calls `GET /api/me/items/:id/bookmarks` and upserts all returned bookmarks, it will insert the server version (with server ID) as a new record while the local-ID placeholder still exists.

**Why it happens:**
The ABS API does not have an "update bookmark" endpoint — only create and delete. The local cache must track whether a bookmark is "pending sync" (created locally, no server ID yet) vs "synced" (server ID known). Without this flag, every sync is ambiguous: is this server bookmark the same as the local one, or a different one that happens to be at the same position?

**How to avoid:**
Add a `syncStatus` column to the bookmarks schema with values: `pending_create`, `synced`, `pending_delete`. On local creation: insert with `syncStatus = 'pending_create'` and a UUID as the local ID. On sync: POST to server → receive server ID → update local record's `serverId` and `syncStatus = 'synced'`. On server fetch: upsert by `serverId` (not by local ID or position). This requires the bookmarks schema and helper to be designed with this state machine in mind from the start — retrofitting it is painful.

**Warning signs:**

- After reconnecting: bookmark list shows the same bookmark twice at the same position
- Server bookmark list has duplicates for items bookmarked offline
- Deleting a bookmark offline: the bookmark reappears on next sync (pending_delete status not respected)

**Phase to address:** Bookmark phase (BOOKMARK-01–06). Design the schema with `syncStatus` before writing any sync logic.

---

## Moderate Pitfalls

### Pitfall 8: FullScreenPlayer Reanimated Migration Conflicts with PanResponder Swipe-to-Dismiss

**What goes wrong:**
`FullScreenPlayer/index.tsx` uses `PanResponder` (from React Native core) for the swipe-down-to-dismiss gesture. It also uses `Animated` API for the cover size and chapter list panel animations. The migration (PERF-11) replaces the `Animated` values with Reanimated `useSharedValue`. `PanResponder` is incompatible with Reanimated gesture values — they live on different threads. Animating a Reanimated `useSharedValue` from inside a `PanResponder.onPanResponderMove` callback (which runs on the JS thread) defeats the purpose of Reanimated and creates a janky animation.

The correct solution is to replace `PanResponder` with Reanimated's `Gesture.Pan()` + `GestureDetector`. But this changes the gesture handling architecture, not just the animation values. It is a larger scope change than "just migrate the animations."

**Why it happens:**
The migration requirement (PERF-11) says "migrate panel open/close animations to Reanimated". It does not say "migrate gestures." If implemented naively (replace `Animated.Value` → `useSharedValue`, keep `PanResponder`), the animation moves to Reanimated but the gesture update path remains on the JS thread, providing no meaningful performance improvement for the dismissal gesture.

**How to avoid:**
Scope the migration explicitly: either migrate both gestures and animations to Reanimated's Gesture API, or defer gesture migration and only migrate the cover size / chapter list panel animations (which are triggered by `setShowChapterList` state, not gesture-driven). The latter is lower risk and still eliminates the most common jank path (chapter list toggle on a busy JS thread).

**Warning signs:**

- Swipe-to-dismiss becomes jittery after migration (PanResponder driving a Reanimated value from JS thread)
- Gesture conflicts: `GestureDetector` and `PanResponder` both trying to handle touch events on the same View

**Phase to address:** FullScreenPlayer redesign phase (PERF-11). Document the scope decision explicitly in the phase plan.

---

### Pitfall 9: `key` Prop Strategy for Grid/List Mode Switch Is Incompatible with FlashList

**What goes wrong:**
`LibraryItemList.tsx` line 98 uses a `key` prop on FlatList: `key={\`${viewMode}-${numColumns}\`}`to force a full re-render when view mode changes. This is the correct FlatList workaround for`numColumns`changes (FlatList does not support dynamic`numColumns`). FlashList supports dynamic `numColumns`changes without needing to remount — passing a`key` prop to force remount would throw away FlashList's recycled view pool, negating the performance benefit of the migration.

Remove the `key` prop when migrating to FlashList. Instead, let FlashList handle the `numColumns` change natively, and use `getItemType` to tell the recycler that grid-mode and list-mode items are different component types so they are not recycled into each other.

**Why it happens:**
The key-to-force-remount pattern is a known FlatList workaround that is copy-pasted into migrations. It looks harmless but actively degrades FlashList performance.

**How to avoid:**
Remove the `key` prop entirely when migrating to FlashList. Add `getItemType` returning different strings for grid vs list mode. Verify visually that switching between grid and list mode is smooth and that items render in the correct template after switching.

**Warning signs:**

- Switching between grid and list modes has a visible flash/blank (remount happening)
- React DevTools shows the entire list unmounting and remounting on view mode switch

**Phase to address:** FlashList migration phase (PERF-01).

---

### Pitfall 10: Deep Link Scheme Mismatch Between `app.json` and Maestro YAML

**What goes wrong:**
`app.json` defines `"scheme": "side-shelf"` (hyphen). The `ui-testing.md` plan uses `sideshelf://` throughout (no hyphen). Every `openLink` command in the Maestro flows will fail silently: Maestro sends the URL, iOS does not recognize the scheme, and the app is not opened. The test appears to "work" (no error thrown) but navigates nowhere — subsequent `assertVisible` checks fail with confusing "element not found" errors unrelated to the scheme issue.

**Why it happens:**
The deep linking scheme was specified in `app.json` during setup and documented separately in the testing plan without cross-reference. Both decisions were reasonable individually.

**How to avoid:**
Before writing any Maestro flows, run `xcrun simctl openurl booted "side-shelf:///(tabs)/library"` and verify the app navigates to the library. Then update all Maestro YAML files to use `side-shelf://` consistently. Add a comment at the top of `_login.yaml` citing the scheme and where it is defined.

**Warning signs:**

- Maestro `openLink` commands complete without error but the app does not navigate
- Screenshots show the app in its previous state rather than the navigated screen
- `assertVisible` fails with "No element found" after `openLink`

**Phase to address:** Deep link and Maestro infrastructure phase (NAVIGATION-03, TESTING-01–05). Verify scheme before writing any flows.

---

### Pitfall 11: expo-image Placeholder Sizing Is Broken with Non-square CoverImage Dimensions

**What goes wrong:**
`CoverImange.tsx` renders cover art at various sizes (48px in FloatingPlayer, fullCoverSize up to 40% of screen height in FullScreenPlayer). `expo-image`'s blurhash placeholder always renders as square (1:1) — if the Image component has non-square dimensions and `contentFit` is set to anything other than `'fill'`, the placeholder renders at the wrong size and may flicker incorrectly when the real image loads. This is a confirmed expo/expo issue (#21677).

The current code uses React Native's `Image` component with no placeholder. The migration to `expo-image` for the disk-caching benefit is correct — but if a blurhash placeholder is added (the natural next step after switching to expo-image), the placeholder sizing bug will appear.

**Why it happens:**
expo-image's placeholder system was designed assuming 1:1 aspect ratio. The bug is known and tracked upstream but not fixed as of SDK 54.

**How to avoid:**
Use `expo-image` for the caching benefit only. Do not add blurhash placeholders in this phase. If a placeholder is desired, use a solid colour `placeholder` (not a blurhash string) — colour placeholders are not affected by the sizing bug. The `CoverImage` component already renders a fallback View with text initials when no URI is provided — keep this as the pre-load state rather than adding a blurhash.

**Warning signs:**

- After expo-image migration: placeholder appears stretched or at wrong size while image loads
- Cover art flickers or shows an incorrectly-sized blurred preview

**Phase to address:** expo-image migration phase (PERF-08). Document the placeholder decision explicitly.

---

### Pitfall 12: ProgressService Decomposition Requires Understanding Background Sync Contract Before Splitting

**What goes wrong:**
`ProgressService` runs sync operations triggered by both foreground events (play/pause/seek via coordinator events) and background timers (periodic sync). Unlike `PlayerService` (which was decomposed into collaborators that receive explicit arguments), `ProgressService` has a background service contract: it must be able to sync progress even when no coordinator event has fired recently. Any collaborator split that moves state out of `ProgressService` into pure functions must ensure the background sync path can still access the necessary state.

If the decomposition is done mechanically (copy methods into helpers, inject dependencies), without mapping the background sync trigger paths, the background sync may silently stop working — no crash, no error, just progress not being saved during long listening sessions when the user does not seek or change chapters.

**Why it happens:**
`PlayerService` decomposition was straightforward because all collaborator calls originated from coordinator events (explicitly dispatched). `ProgressService` has timers — the split must carry the timer management into the facade cleanly, and collaborators must not hold timer state.

**How to avoid:**
Before splitting, draw the call graph: which methods are called by coordinator event handlers, which are called by timers, and which are called by external callers (other services). The facade must own all timers. Collaborators receive the data they need as parameters, not via shared singleton state. Write a test that verifies background sync fires correctly after the split (simulate a 5-minute timer expiry without any coordinator events).

**Warning signs:**

- After decomposition: progress syncs correctly during active interaction (seeking, chapter changes) but stops after several minutes of uninterrupted listening
- Background sync timer interval appears in the facade but the actual `syncProgress()` call silently no-ops

**Phase to address:** ProgressService decomposition phase (DEBT-03).

---

## Technical Debt Patterns

| Shortcut                                                              | Immediate Benefit              | Long-term Cost                                                                | When Acceptable                                               |
| --------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Keeping `PanResponder` when migrating animations to Reanimated        | Smaller diff for PERF-11       | JS-thread dismissal gesture defeats Reanimated's purpose; jank on swipe       | Never — migrate gesture and animation together, or defer both |
| Using `key` prop to remount FlashList on mode switch                  | Exact copy of FlatList pattern | Destroys recycled view pool; negates FlashList performance benefit            | Never in FlashList                                            |
| Object-returning Zustand selector in new bookmark/progress components | Less boilerplate               | Re-renders at 1Hz during playback; existing `use*()` hooks already solve this | Never                                                         |
| Adding blurhash placeholder to expo-image in this phase               | Better perceived loading       | expo-image blurhash sizing bug (expo/expo#21677) causes visual glitches       | Acceptable only if solid-colour placeholder used instead      |
| Not adding `syncStatus` to bookmark schema                            | Faster initial implementation  | Duplicate records after offline→online sync; requires schema migration to fix | Never — design the schema correctly from the start            |

---

## Integration Gotchas

| Integration                           | Common Mistake                                         | Correct Approach                                                                                     |
| ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| FlashList + `columnWrapperStyle`      | Copy `columnWrapperStyle` from FlatList migration      | Remove `columnWrapperStyle`; apply per-item margins via `renderItem` index math                      |
| FlashList + `key` to force remount    | Copy key prop from FlatList migration                  | Remove `key` prop; use `getItemType` to prevent cross-mode recycling                                 |
| Reanimated 4 + React Compiler         | Assume inline worklet lambdas work as in Reanimated 3  | Add explicit `'worklet';` directive in all new `useAnimatedStyle`/`useDerivedValue` callbacks        |
| AirPlay module + EAS build            | Install library, works in dev build, not in production | Declare the config plugin in `app.json` `plugins` array so EAS CNG includes it                       |
| expo-image + blurhash placeholder     | Add blurhash for perceived performance                 | Use solid-colour placeholder only; blurhash sizing is broken for non-1:1 images                      |
| Expo tree shaking + Reanimated 4      | Enable both `.env` flags, test with `expo start`       | Test with a production build only; tree shaking does not apply in dev; add `Animated.View` safeguard |
| ABS bookmark create API + offline     | Store bookmark locally using server ID as key          | Use local UUID + `syncStatus` field; update server ID after successful sync POST                     |
| Sleep timer volume fade + manual stop | Clear only the fade interval                           | Also restore volume to 1.0 and clear the stored pre-fade volume on stop                              |
| Deep links + Maestro                  | Use `sideshelf://` in YAML                             | Verify actual scheme from `app.json` with `xcrun simctl openurl` before writing flows                |

---

## Performance Traps

| Trap                                          | Symptoms                                                            | Prevention                                                                             | When It Breaks                                    |
| --------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| FlashList without `estimatedItemSize`         | List renders but jumps on first scroll; warning in logs             | Measure average item height in grid and list mode before migration                     | Every render — FlashList warns and guesses poorly |
| Reanimated `height` animation vs `scaleY`     | Layout-affecting height animation can cause parent relayout jank    | Prefer `scaleY` + `overflow: 'hidden'` for collapse animations where possible          | Any device under JS thread load                   |
| Sleep timer interval leak                     | Silent: volume stays at 0 after sleep fires; active on next session | Capture interval ID; clear from all three exit paths                                   | First use after sleep timer fires                 |
| `useEffect` with position in dependency array | Component re-renders at 1Hz during playback                         | Use `useAppStore.getState()` snapshot inside effect body; do not subscribe to position | Any playback session                              |

---

## "Looks Done But Isn't" Checklist

- [ ] **FlashList migration:** Grid spacing is visible (no flush cover art) — `columnWrapperStyle` gap must be replaced with per-item margin
- [ ] **FlashList migration:** Grid/list mode switch is smooth with no remount flash — `key` prop removed, `getItemType` added
- [ ] **FlashList migration:** `estimatedItemSize` is set — check for warning `FlashList's rendered size is not usable` in dev logs
- [ ] **Reanimated migration:** New `useAnimatedStyle`/`useDerivedValue` callbacks tested in production build (not just dev) for React Compiler worklet extraction crash
- [ ] **AirPlay button:** Tested on a physical device (not simulator) — simulator does not show AirPlay picker popup
- [ ] **AirPlay button:** Visible in TestFlight/production build — config plugin declared in `app.json` `plugins` array
- [ ] **Deep links:** `xcrun simctl openurl booted "side-shelf:///(tabs)/library"` navigates correctly before any Maestro flows are written
- [ ] **Maestro flows:** All `openLink` URLs use `side-shelf://` (with hyphen) matching `app.json` scheme
- [ ] **Tree shaking:** Verified via production build to TestFlight, not just `expo start`
- [ ] **Tree shaking:** Reanimated animations work in production build (worklets initialized)
- [ ] **Bookmarks:** Adding a bookmark offline → going online → sync does not create duplicate bookmarks
- [ ] **Bookmarks:** Deleting a bookmark offline → going online → bookmark does not reappear after sync
- [ ] **Sleep timer fade:** After fade completes and playback stops, next play session starts at full volume (not 0)
- [ ] **Sleep timer fade:** Cancelling the timer while fade is in progress restores volume to 1.0
- [ ] **CollapsibleSection:** Section with dynamic content height expands to the correct height (onLayout measured, not hardcoded)
- [ ] **ProgressService decomposition:** Background sync still fires after 5+ minutes of uninterrupted playback (timer path tested)

---

## Recovery Strategies

| Pitfall                                    | Recovery Cost | Recovery Steps                                                                                                             |
| ------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| React Compiler + Reanimated worklet crash  | LOW           | Add `'worklet';` directive to affected callback; rebuild                                                                   |
| Tree shaking crashes production build      | MEDIUM        | Disable `EXPO_UNSTABLE_TREE_SHAKING=1`; add `Animated.View` safeguard; re-enable and rebuild                               |
| FlashList grid spacing lost                | LOW           | Remove `columnWrapperStyle`; add per-item margin in `renderItem` based on index                                            |
| Bookmark duplicates after offline sync     | HIGH          | Requires schema migration to add `syncStatus` column; existing duplicates must be deduplicated by position + creation time |
| Sleep timer volume stuck at 0              | LOW           | Add `TrackPlayer.setVolume(1.0)` to `stopPlayback()` and `cancelSleepTimer()`; deploy OTA                                  |
| Deep link scheme mismatch in Maestro       | LOW           | Update YAML files to use correct scheme; no code change needed                                                             |
| AirPlay button missing in production build | MEDIUM        | Add config plugin to `app.json` `plugins`; rebuild with EAS                                                                |

---

## Pitfall-to-Phase Mapping

| Pitfall                                                            | Prevention Phase                                             | Verification                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| React Compiler + Reanimated worklet extraction (Pitfall 1)         | CollapsibleSection + FullScreenPlayer animation phases       | Build production binary; trigger each animation; confirm no "non-worklet function" crash |
| FlashList missing `columnWrapperStyle` (Pitfall 2)                 | FlashList migration phase (PERF-01)                          | Visual check: grid items have visible spacing between covers                             |
| AirPlay native module + scheme mismatch (Pitfall 3)                | AirPlay/player UI phase + Maestro deep link phase            | Device test: picker shows; `xcrun simctl openurl` test before writing YAML               |
| Tree shaking crashes Reanimated in production (Pitfall 4)          | Tree shaking phase (PERF-03)                                 | TestFlight build: launch, play audio, open CollapsibleSection                            |
| CollapsibleSection height animation to dynamic content (Pitfall 5) | CollapsibleSection phase (SECTION-01–03)                     | Expand section with varying content lengths; measure vs visual height match              |
| Sleep timer volume fade interval leak (Pitfall 6)                  | Sleep timer phase (SLEEP-01)                                 | Cancel timer mid-fade: volume restored; restart playback: full volume                    |
| Bookmark offline sync duplicates (Pitfall 7)                       | Bookmark phase (BOOKMARK-01–06)                              | Add bookmark offline; go online; sync; verify single record on server and locally        |
| PanResponder + Reanimated incompatibility (Pitfall 8)              | FullScreenPlayer animation phase (PERF-11)                   | Swipe-to-dismiss is smooth during JS thread load                                         |
| FlashList `key` prop remount (Pitfall 9)                           | FlashList migration phase (PERF-01)                          | Grid/list switch: no blank flash; React DevTools confirms no unmount                     |
| Deep link scheme mismatch (Pitfall 10)                             | Deep link phase (NAVIGATION-03) + Maestro phase (TESTING-01) | `xcrun simctl openurl` with both scheme variants; confirm which one works                |
| expo-image blurhash sizing bug (Pitfall 11)                        | expo-image migration phase (PERF-08)                         | Use solid-colour placeholder only; no blurhash                                           |
| ProgressService decomposition timer path (Pitfall 12)              | ProgressService decomposition phase (DEBT-03)                | Test: 5 minutes of playback with no user interaction; confirm progress synced            |

---

## Sources

### Direct Codebase Analysis (HIGH confidence)

- `src/components/library/LibraryItemList.tsx` — FlatList with `columnWrapperStyle`, `key` prop for remount, inline `renderItem`, `numColumns={3}` grid layout
- `src/components/ui/CollapsibleSection.tsx` — legacy `Animated.timing` with `useNativeDriver: false`; `isExpanded` toggle without height measurement
- `src/app/FullScreenPlayer/index.tsx` — `Animated.parallel` with `useNativeDriver: false` at lines 93–105; `PanResponder` for swipe-to-dismiss
- `app.json` — `"scheme": "side-shelf"` (hyphen); `experiments.reactCompiler: true`; confirms scheme mismatch with `ui-testing.md` plan
- `package.json` — `react-native-reanimated: ~4.1.1`, `react-native-worklets: 0.5.1`, `expo: 54.0.21`; no `@shopify/flash-list` yet installed
- `docs/investigation/rn-best-practices-audit.md` — Area 6 confirms both CollapsibleSection and FullScreenPlayer use legacy Animated with `useNativeDriver: false`
- `docs/plans/ui-testing.md` — Uses `sideshelf://` scheme throughout (no hyphen), conflicting with `app.json`

### Confirmed Library Issues (HIGH confidence)

- `software-mansion/react-native-reanimated#6826` — React Compiler extracts inline worklet functions, causing "Tried to synchronously call a non-worklet function on the UI thread" — confirmed open as of 2025
- `Shopify/flash-list#686` — `columnWrapperStyle` not supported in FlashList — confirmed limitation
- `expo/expo#41620` — Expo tree shaking crashes production with latest react-native-reanimated — reported 2025-12-14
- `software-mansion/react-native-reanimated#8752` — "Native part of Worklets doesn't seem to be initialized due to tree shaking" — cross-linked with expo issue
- `expo/expo#21677` — expo-image blurhash placeholder size incorrect with non-1:1 aspect ratio content fit settings

### Documentation and Community (MEDIUM confidence)

- Expo tree shaking guide (docs.expo.dev/guides/tree-shaking) — confirms feature is "experimental" and `EXPO_UNSTABLE_TREE_SHAKING=1` syntax
- FlashList usage docs (shopify.github.io/flash-list/docs/usage) — `getItemType`, `estimatedItemSize`, `overrideItemLayout` documented
- ABS bookmark API (api.audiobookshelf.org) — create/delete endpoints exist; no "upsert by local ID" endpoint confirmed; offline pattern requires local ID → server ID update on sync
- AirPlay in Expo — `@douglowder/expo-av-route-picker-view` and `react-native-avroutepickerview` are the two viable options; both require prebuild
- RFC 2396 — Hyphens are valid in URI scheme names; `side-shelf://` is a valid scheme

---

_Pitfalls research for: v1.3 Beta Polish milestone_
_Researched: 2026-03-09_
