# Phase 16: Full Screen Player Redesign + AirPlay - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the native nav bar chrome from the full screen player, replace it with a custom header row (chevron-down dismiss, AirPlay, settings gear). Add a UIMenu settings menu with three preference groups. Place AirPlay on the floating player and item details controls. Migrate the existing chapter panel animation from RN Animated to Reanimated (PERF-11). The existing secondary controls row (Speed, Bookmark, Sleep Timer) stays on screen — UIMenu is for display preferences only.

</domain>

<decisions>
## Implementation Decisions

### Header layout

- **No navigation bar chrome** — `headerShown: false` in `_layout.tsx`; fully custom header row built inside the screen component
- **Layout:** `[chevron-down]` on left | empty center | `[AirPlay] [gear]` on right
- **Chevron icon:** points down (modal pop, not nav back — `chevron.down` SF Symbol / Ionicons chevron-down)
- **Settings icon:** gear (`settings` / `gear` Ionicons icon)
- **Top padding:** safe area inset only; 4–8px clearance from Dynamic Island bottom — verify on device, may need small top margin adjustment
- **Drag indicator:** small pill/handle (grey, centered) rendered above the header row to signal swipe-to-dismiss. iOS pattern. Android: not rendered (pill is an iOS-specific affordance)
- **Swipe-down dismiss:** existing `PanResponder` stays — both chevron tap and swipe-down gesture dismiss the player

### UIMenu structure (gear button)

- **UIMenu is for display preferences only** — no actions (bookmark, sleep timer, speed) migrate to the menu; those stay in the secondary controls row as-is
- **Three inline sections with native dividers:**
  1. **Progress format** (inline radio with checkmark on active): Time Remaining / Elapsed / Total / Percent Complete — per Phase 14 decision, inline radio, no push navigation
  2. **Chapter bar time display** (inline radio): "Show total duration" (default: `1:23 … 4:56`) / "Show time remaining" (`1:23 … -3:33`) — affects the right-side label of the chapter seek bar
  3. **Keep Screen Awake** — toggle that activates `expo-keep-awake` while the full screen player is open and playing
- **All three new preferences persist** via `settingsSlice` + `appSettings.ts` following the established settings pattern

### AirPlay integration

- **Package:** researcher should verify `@douglowder/expo-av-route-picker-view` against SDK 54 + `newArchEnabled: true`. If incompatible, fall back to a local Expo Module in `modules/` wrapping `AVRoutePickerView`. This is the noted blocker from STATE.md — resolve before planning.
- **Full screen player header:** AirPlay button sits between empty center and gear button: `[chevron] … [AirPlay][gear]`
- **Floating player:** AirPlay added between the track info text area and the PlayPause button: `[cover][info text][AirPlay][play/pause]`
- **Item details ConsolidatedPlayerControls:**
  - AirPlay **replaces** the FullScreenButton on the far right: `[bookmark][<<][play][>>][AirPlay]`
  - Tapping anywhere on the embedded player card (other than a button) opens the full screen player (replaces the explicit FullScreenButton tap target)

### Chapter panel

- **Behavior unchanged:** cover art shrinks to thumbnail, chapter list slides in below — same interaction as today
- **Migration:** port from `Animated.parallel` (RN core, `useNativeDriver: false`) to Reanimated `useSharedValue` + `withTiming` + `useAnimatedStyle` for PERF-11
- **Toggle affordance:** stays as a text link (`Show Chapters (N)` / `Hide Chapters`) positioned below the progress bar / above the cover image — no position change, no visual upgrade to a button
- **Restyling:** text link should be subtler (smaller text, lower opacity) to match the new header visual weight

### Claude's Discretion

- Exact icon sizes and spacing within the header row
- Pill/handle dimensions and opacity
- Transition animation for the UIMenu opening (native — no custom animation needed)
- Whether `expo-keep-awake` should also activate during background play (probably not — only when full screen player is visible)
- Whether chapter bar time display preference applies to the item details ConsolidatedPlayerControls seek bar as well as the full screen player (likely yes — same `ProgressBar` component)

</decisions>

<specifics>
## Specific Ideas

- Gear UIMenu is for _preferences_ not _actions_ — this distinction is intentional. Speed, Bookmark, and Sleep Timer buttons remain on screen as primary controls.
- Dynamic Island clearance (4–8px): safe area inset alone may provide this on modern iPhones, but executor should verify on a device with Dynamic Island before locking the padding value.
- Drag pill on iOS only — not a recognized Android pattern; conditional render by platform.
- ConsolidatedPlayerControls: removing FullScreenButton means the entire card becomes a tap-to-open target (not just the removed button's area). This is a behavior addition, not just a removal.

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/app/FullScreenPlayer/_layout.tsx`: set `headerShown: false` here (Stack screenOptions) — one-line change to remove nav chrome
- `src/app/FullScreenPlayer/index.tsx`: already has `PanResponder` swipe-down dismiss, `Animated` chapter panel, `Stack.Screen` headerRight with Done button — all targets for this phase
- `src/components/ui/FloatingPlayer.tsx`: has `PlayPauseButton` on the far right — AirPlay inserts before it
- `src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx`: has `FullScreenButton` on far right — replace with AirPlay + make card pressable
- `src/components/ui/CollapsibleSection.tsx`: Reanimated patterns from Phase 15 — `useSharedValue`, `withTiming`, `useAnimatedStyle` — copy this pattern for chapter panel migration
- `settingsSlice` + `appSettings.ts`: established pattern for 2 new settings (`chapterBarShowRemaining: boolean`, `keepScreenAwake: boolean`)

### Established Patterns

- Reanimated: `useSharedValue(0)`, `withTiming(toValue, { duration: 300 })`, `useAnimatedStyle` — validated in `CollapsibleSection.tsx` and `tab-bar-settings.tsx`
- Settings persistence: `AsyncStorage` via `appSettings.ts`, loaded in `settingsSlice.initializeSettings()` with `Promise.all` — 2 new keys needed
- `UIMenu` / context menus in RN: research needed on best approach for iOS native UIMenu with inline radio sections — likely `@react-native-menu/menu` or `react-native-ios-context-menu`; researcher should evaluate

### Integration Points

- `src/app/FullScreenPlayer/_layout.tsx` → `headerShown: false`
- `src/app/FullScreenPlayer/index.tsx` → custom header row, chapter panel Reanimated migration, UIMenu button
- `src/components/ui/FloatingPlayer.tsx` → insert AirPlay button
- `src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx` → replace FullScreenButton with AirPlay, add card-level press handler
- `src/stores/slices/settingsSlice.ts` → add `chapterBarShowRemaining` + `keepScreenAwake` state + actions
- `src/lib/appSettings.ts` → add 2 new keys to `SETTINGS_KEYS`

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

_Phase: 16-full-screen-player-redesign-airplay_
_Context gathered: 2026-03-10_
