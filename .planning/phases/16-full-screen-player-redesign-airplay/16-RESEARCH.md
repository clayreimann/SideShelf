# Phase 16: Full Screen Player Redesign + AirPlay - Research

**Researched:** 2026-03-10
**Domain:** React Native iOS UIMenu, AirPlay (AVRoutePickerView), Reanimated 4, expo-keep-awake
**Confidence:** HIGH (with one MEDIUM item on AirPlay package)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Header layout**

- No navigation bar chrome — `headerShown: false` in `_layout.tsx`; fully custom header row built inside the screen component
- Layout: `[chevron-down]` on left | empty center | `[AirPlay] [gear]` on right
- Chevron icon: points down (modal pop — `chevron.down` SF Symbol / Ionicons `chevron-down`)
- Settings icon: gear (`settings` / `gear` Ionicons icon)
- Top padding: safe area inset only; 4–8px clearance from Dynamic Island bottom
- Drag indicator: small pill/handle (grey, centered) rendered above the header row on iOS only
- Swipe-down dismiss: existing `PanResponder` stays

**UIMenu structure (gear button)**

- UIMenu is for display preferences only — no actions (bookmark, sleep timer, speed) move to the menu
- Three inline sections:
  1. Progress format (inline radio): Time Remaining / Elapsed / Total / Percent Complete
  2. Chapter bar time display (inline radio): "Show total duration" (default) / "Show time remaining"
  3. Keep Screen Awake — toggle activating `expo-keep-awake` while full screen player is open and playing
- All three preferences persist via `settingsSlice` + `appSettings.ts`

**AirPlay integration**

- Package: researcher must verify `@douglowder/expo-av-route-picker-view` vs SDK 54 + `newArchEnabled: true`; local Expo Module fallback in `modules/` if incompatible
- Full screen player header: `[chevron] … [AirPlay][gear]`
- Floating player: AirPlay between info text and PlayPause button
- Item details ConsolidatedPlayerControls: AirPlay **replaces** FullScreenButton; card becomes tap-to-open

**Chapter panel**

- Behavior unchanged; migration from `Animated.parallel` to Reanimated `useSharedValue` + `withTiming` + `useAnimatedStyle`
- Toggle affordance: stays as text link below progress bar, styled subtler (smaller text, lower opacity)

### Claude's Discretion

- Exact icon sizes and spacing within the header row
- Pill/handle dimensions and opacity
- Transition animation for UIMenu opening (native — no custom animation needed)
- Whether `expo-keep-awake` should activate during background play
- Whether chapter bar time display preference applies to ConsolidatedPlayerControls seek bar as well

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID        | Description                                                                    | Research Support                                                          |
| --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| PLAYER-01 | Full screen player navigation bar is removed                                   | `headerShown: false` in `_layout.tsx` — one-line change confirmed         |
| PLAYER-02 | Full screen player has a chevron-down dismiss button                           | Custom header row with Ionicons `chevron-down` + `router.back()`          |
| PLAYER-03 | Full screen player Done button replaced with UIMenu settings button            | `@react-native-menu/menu` v2.0.0 already installed, new-arch compatible   |
| PLAYER-04 | Full screen player has AirPlay route picker in header                          | AirPlay package research — see AirPlay section below                      |
| PLAYER-05 | Floating player has AirPlay route picker                                       | FloatingPlayer layout mapped; slot between info text and PlayPause        |
| PLAYER-06 | Item details player controls have AirPlay route picker                         | ConsolidatedPlayerControls: FullScreenButton replaced, card pressable     |
| PERF-11   | FullScreenPlayer panel open/close animations use Reanimated `useAnimatedStyle` | Pattern validated in CollapsibleSection.tsx; ChapterList migration mapped |

</phase_requirements>

---

## Summary

Phase 16 involves four distinct work streams: (1) removing the native nav bar and adding a custom header row with a drag pill, chevron dismiss, AirPlay button, and UIMenu gear button; (2) integrating AirPlay on three player surfaces; (3) migrating the chapter panel animation from `Animated.parallel` to Reanimated; and (4) adding three new user preferences backed by the established `settingsSlice` + `appSettings` pattern.

The UIMenu library (`@react-native-menu/menu` v2.0.0) is already installed in the project and confirmed new-architecture compatible via its `codegenConfig` field and `ios/NewArch/` source directory. The API supports `state: 'on' | 'off'` on individual actions for radio-style checkmarks, and subactions-as-sections for UIMenu inline grouping. No additional installation is needed.

The AirPlay package (`@douglowder/expo-av-route-picker-view`) is the principal blocker. It targets `expo-modules-core ~1.12.15` (SDK 52 era) while the project runs `expo-modules-core 3.0.23` (SDK 54). The package has not been updated since June 2024 and contains no `codegenConfig`. Its Expo Modules API usage may still build under new-arch (Expo's Modules API is Fabric-compatible by design), but the version gap means build success cannot be assumed without a test build. A local module fallback in `modules/` is the safe contingency and takes only ~1 hour to write.

**Primary recommendation:** Attempt `@douglowder/expo-av-route-picker-view` install in a dev build first. If it fails to compile, scaffold a local Expo Module in `modules/AirPlayButton/` wrapping `AVRoutePickerView` directly — the Swift is three lines. Everything else in this phase is low-risk.

---

## Standard Stack

### Core (already installed)

| Library                   | Version | Purpose                        | Why Standard                                                                                  |
| ------------------------- | ------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `@react-native-menu/menu` | 2.0.0   | iOS UIMenu / Android PopupMenu | Already installed; new-arch `codegenConfig` confirmed; `state` prop supports radio checkmarks |
| `react-native-reanimated` | ~4.1.1  | UI-thread animations           | Already installed; pattern validated in CollapsibleSection (Phase 15)                         |
| `expo-keep-awake`         | 15.0.7  | Prevent screen sleep           | Already installed; `useKeepAwake()` hook is the idiomatic API                                 |
| `expo-symbols`            | ~1.0.7  | SF Symbols on iOS              | Already installed; used via `<SymbolView>` for `chevron.down` etc.                            |
| `@expo/vector-icons`      | ^15.0.2 | Ionicons fallback              | Already installed; `chevron-down`, `settings-outline` icons                                   |

### AirPlay (NEEDS VERIFICATION BEFORE PLANNING)

| Option                                         | Status                                                                                       | Confidence                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `@douglowder/expo-av-route-picker-view` v0.0.5 | Targets `expo-modules-core ~1.12.15` (SDK 52); last commit June 2024. Must test a dev build. | MEDIUM — may work via new-arch interop |
| Local Expo Module in `modules/AirPlayButton/`  | Fallback; scaffold with `npx create-expo-module --local`; ~1 hour Swift                      | HIGH — guaranteed compatibility        |

**Installation (AirPlay — if npm package works):**

```bash
npm install @douglowder/expo-av-route-picker-view
npx expo prebuild --clean
```

**Installation (local module fallback):**

```bash
npx create-expo-module --local modules/AirPlayButton
# Implement AVRoutePickerView wrapper in Swift
# Declare in expo-module.config.json
npx expo prebuild --clean
```

### Supporting (already installed, referenced here for clarity)

| Library                          | Version | Purpose               | When to Use              |
| -------------------------------- | ------- | --------------------- | ------------------------ |
| `react-native-safe-area-context` | ~5.6.0  | `useSafeAreaInsets()` | Header row top padding   |
| `expo-linear-gradient`           | ~15.0.8 | Gradient overlays     | Not needed in this phase |

---

## Architecture Patterns

### Recommended File Change Map

```
src/
├── app/FullScreenPlayer/
│   ├── _layout.tsx          # headerShown: false (1-line change)
│   └── index.tsx            # Custom header row, Reanimated chapter panel, UIMenu button
├── components/ui/
│   └── FloatingPlayer.tsx   # Add AirPlay button between info text and PlayPause
├── components/library/LibraryItemDetail/
│   └── ConsolidatedPlayerControls.tsx  # Replace FullScreenButton with AirPlay; add card Pressable
├── stores/slices/
│   └── settingsSlice.ts     # Add chapterBarShowRemaining + keepScreenAwake state/actions
└── lib/
    └── appSettings.ts       # Add 2 new SETTINGS_KEYS + get/set helpers

modules/                     # Only if local module fallback is needed
└── AirPlayButton/
    ├── ios/AirPlayButton.swift
    ├── src/index.ts
    └── expo-module.config.json
```

### Pattern 1: Custom Header Row (no nav chrome)

**What:** Remove `Stack.Screen` `headerRight`; set `headerShown: false` in `_layout.tsx`; render a `View` header row manually inside the screen with `useSafeAreaInsets()` for top padding.

**When to use:** Full screen modal players, sheets — anywhere the navigation chrome interferes with custom layout.

```typescript
// Source: project pattern from _layout.tsx + useSafeAreaInsets()
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const insets = useSafeAreaInsets();

// Drag pill (iOS only)
{Platform.OS === 'ios' && (
  <View style={{ alignItems: 'center', paddingTop: insets.top + 4 }}>
    <View style={{
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: 'rgba(128,128,128,0.4)',
      marginBottom: 8,
    }} />
  </View>
)}

// Header row
<View style={{
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 16,
  marginBottom: 8,
}}>
  <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
    <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
  </TouchableOpacity>
  <View style={{ flex: 1 }} />
  {/* AirPlay component here */}
  <MenuView ... >
    <TouchableOpacity>
      <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
    </TouchableOpacity>
  </MenuView>
</View>
```

### Pattern 2: UIMenu with Inline Radio Sections (`@react-native-menu/menu`)

**What:** `MenuView` wraps any React Native child (the gear button). The `actions` array encodes sections as entries with `subactions`. iOS 14+ renders these as `UIMenu` with inline dividers. `state: 'on'` renders a checkmark; `state: 'off'` renders nothing.

**Key API facts (from installed README + source, HIGH confidence):**

- `actions[].subactions` creates a sub-menu section, shown inline on iOS 14+ via `UIMenu` with `.displayInline` attribute
- `state: 'on'` places a checkmark next to the item
- `state: 'off'` shows the item without a checkmark
- `onPressAction({ nativeEvent: { event: actionId } })` returns the pressed action ID
- `shouldOpenOnLongPress={false}` — open on tap (the desired behavior for a gear button)
- Three `subactions` groups = three UIMenu inline sections with native dividers

```typescript
// Source: @react-native-menu/menu README (installed, v2.0.0)
import { MenuView } from '@react-native-menu/menu';

<MenuView
  title=""
  shouldOpenOnLongPress={false}
  onPressAction={({ nativeEvent }) => handleMenuAction(nativeEvent.event)}
  actions={[
    {
      id: 'progressFormat',
      title: 'Progress Format',
      subactions: [
        { id: 'progressFormat-remaining', title: 'Time Remaining',
          state: progressFormat === 'remaining' ? 'on' : 'off' },
        { id: 'progressFormat-elapsed', title: 'Elapsed',
          state: progressFormat === 'elapsed' ? 'on' : 'off' },
        { id: 'progressFormat-total', title: 'Total Duration',
          state: progressFormat === 'total' ? 'on' : 'off' },
        { id: 'progressFormat-percent', title: 'Percent Complete',
          state: progressFormat === 'percent' ? 'on' : 'off' },
      ],
    },
    {
      id: 'chapterBarTime',
      title: 'Chapter Bar Time',
      subactions: [
        { id: 'chapterBar-total', title: 'Show Total Duration',
          state: chapterBarShowRemaining ? 'off' : 'on' },
        { id: 'chapterBar-remaining', title: 'Show Time Remaining',
          state: chapterBarShowRemaining ? 'on' : 'off' },
      ],
    },
    {
      id: 'keepAwake',
      title: 'Keep Screen Awake',
      state: keepScreenAwake ? 'on' : 'off',
    },
  ]}
>
  <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
    <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
  </TouchableOpacity>
</MenuView>
```

**handleMenuAction pattern:**

```typescript
const handleMenuAction = useCallback((actionId: string) => {
  if (actionId === 'progressFormat-remaining') updateProgressFormat('remaining');
  else if (actionId === 'progressFormat-elapsed') updateProgressFormat('elapsed');
  else if (actionId === 'progressFormat-total') updateProgressFormat('total');
  else if (actionId === 'progressFormat-percent') updateProgressFormat('percent');
  else if (actionId === 'chapterBar-total') updateChapterBarShowRemaining(false);
  else if (actionId === 'chapterBar-remaining') updateChapterBarShowRemaining(true);
  else if (actionId === 'keepAwake') updateKeepScreenAwake(!keepScreenAwake);
}, [progressFormat, chapterBarShowRemaining, keepScreenAwake, ...]);
```

### Pattern 3: Reanimated Chapter Panel Migration

**What:** Replace `Animated.parallel` (JS thread, `useNativeDriver: false`) with Reanimated `useSharedValue` + `withTiming` + `useAnimatedStyle`. The chapter panel controls two values: cover size and chapter list height/opacity.

**Direct precedent:** `CollapsibleSection.tsx` (Phase 15) and how it drives `heightSV.value = withTiming(...)`. ChapterList currently receives an `Animated.Value` prop — after migration it should receive a `SharedValue<number>` or the animation logic should live in FullScreenPlayer and ChapterList should receive computed animated styles.

**Cleanest approach:** Keep animation logic in `FullScreenPlayer/index.tsx` (where `showChapterList` state lives); pass computed `animatedStyle` objects or keep `SharedValue` in FullScreenPlayer and pass it as a prop to `ChapterList` with an `Animated.View` wrapper.

```typescript
// Source: CollapsibleSection.tsx (Phase 15 validated pattern)
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from "react-native-reanimated";

const DURATION = 300;

// Shared values replacing Animated.Value
const coverSizeSV = useSharedValue(0); // 0 = full size, 1 = minimized
const chapterPanelSV = useSharedValue(0); // 0 = hidden, 1 = visible

// Replace Animated.parallel useEffect
const toggleChapterList = useCallback(() => {
  const next = !showChapterList;
  setShowChapterList(next);
  coverSizeSV.value = withTiming(next ? 1 : 0, { duration: DURATION });
  chapterPanelSV.value = withTiming(next ? 1 : 0, { duration: DURATION });
}, [showChapterList, coverSizeSV, chapterPanelSV]);

// Cover animated style (replaces animatedCoverSize interpolation)
const coverStyle = useAnimatedStyle(() => {
  const size = fullCoverSize + (minimizedCoverSize - fullCoverSize) * coverSizeSV.value;
  const mb = 24 + (8 - 24) * coverSizeSV.value;
  return { width: size, height: size, marginBottom: mb };
});

// Chapter panel animated style
const chapterPanelStyle = useAnimatedStyle(() => ({
  height: chapterPanelSV.value * containerHeight,
  opacity: chapterPanelSV.value,
  transform: [{ translateY: (1 - chapterPanelSV.value) * 20 }],
  overflow: "hidden" as const,
}));
```

**ChapterList prop update:** Change `chapterListAnim: Animated.Value` to `animatedStyle: ReturnType<typeof useAnimatedStyle>` — ChapterList wraps its root in `<Animated.View style={[animatedStyle, ...]} />` and removes internal `Animated.Value` interpolations.

### Pattern 4: expo-keep-awake Integration

**What:** Use `useKeepAwake()` hook conditionally when `keepScreenAwake` setting is true and the player is visible. The hook activates on mount and deactivates on unmount, so the correct pattern is: render the hook consumer inside a sub-component that mounts only when conditions are met, OR use `activateKeepAwakeAsync` / `deactivateKeepAwake` in a `useEffect`.

```typescript
// Source: expo-keep-awake 15.0.7 type definitions (installed)
import { useKeepAwake } from 'expo-keep-awake';

// Option A: conditional hook in a render sub-component (cleaner)
function KeepAwakeGuard() {
  useKeepAwake();
  return null;
}

// In FullScreenPlayer:
{keepScreenAwake && isPlaying && <KeepAwakeGuard />}

// Option B: useEffect with activate/deactivate
useEffect(() => {
  if (keepScreenAwake && isPlaying) {
    activateKeepAwakeAsync('fullscreen-player');
  } else {
    deactivateKeepAwake('fullscreen-player');
  }
  return () => { deactivateKeepAwake('fullscreen-player'); };
}, [keepScreenAwake, isPlaying]);
```

### Pattern 5: Settings Slice Extension

**What:** Two new settings follow the exact established pattern. Three files change.

**New state fields:**

```typescript
// settingsSlice.ts — add to SettingsSliceState.settings
chapterBarShowRemaining: boolean; // default: false ("show total duration")
keepScreenAwake: boolean; // default: false
```

**New SETTINGS_KEYS (appSettings.ts):**

```typescript
chapterBarShowRemaining: '@app/chapterBarShowRemaining',
keepScreenAwake: '@app/keepScreenAwake',
```

**New helpers (appSettings.ts) — follow the existing boolean pattern:**

```typescript
export async function getChapterBarShowRemaining(): Promise<boolean>;
export async function setChapterBarShowRemaining(val: boolean): Promise<void>;
export async function getKeepScreenAwake(): Promise<boolean>;
export async function setKeepScreenAwake(val: boolean): Promise<void>;
```

**initializeSettings Promise.all** — add the two new getters to the existing parallel load array.

### Anti-Patterns to Avoid

- **`Animated.Value` in new code:** `useNativeDriver: false` for height/width is JS-thread blocked. All new panel animations must use Reanimated.
- **Object-returning selectors for new settings:** `const { keepScreenAwake, chapterBarShowRemaining } = useSettings()` — these are separate scalar reads, use individual selectors from the existing `useSettings()` hook.
- **UIMenu actions for non-preference items:** The gear menu is preferences only. Bookmark, Sleep Timer, Speed stay in the secondary controls row.
- **Conditional `useKeepAwake()` at the top level:** React rules of hooks prohibit conditional hooks. Use the guard-component pattern (Option A above) or the `useEffect` approach (Option B).
- **Skipping `prebuild --clean` after AirPlay package install:** Native modules require a clean rebuild; a JS-only reload will appear to do nothing.

---

## Don't Hand-Roll

| Problem                    | Don't Build                           | Use Instead                                         | Why                                                                                 |
| -------------------------- | ------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| iOS UIMenu with checkmarks | Custom modal/sheet picker             | `@react-native-menu/menu` `state: 'on'`             | Native UIMenu renders above the keyboard, respects light/dark, no z-index fights    |
| Screen sleep prevention    | `AppState` + `brightness` hacks       | `expo-keep-awake` `useKeepAwake()`                  | Handles all edge cases including system overrides, background mode                  |
| AirPlay route selection UI | Custom device picker                  | `AVRoutePickerView` (via package or local module)   | iOS system picker handles Bluetooth, AirPlay 2, multi-room; impossible to replicate |
| Animation interpolation    | Manual `Animated.Value.interpolate()` | Reanimated `useAnimatedStyle()` with derived values | UI thread execution; no JS-thread bridge cost on every frame                        |

---

## Common Pitfalls

### Pitfall 1: ChapterList receives Animated.Value — must migrate interface too

**What goes wrong:** Migrating the animation in `FullScreenPlayer/index.tsx` but leaving `ChapterList` props typed as `chapterListAnim: Animated.Value` causes a TypeScript error or silent runtime failure when a `SharedValue` is passed.

**Why it happens:** ChapterList has its own `Animated.View` driven by the received `Animated.Value` with `interpolate()` calls for opacity, translateY, and height. Those APIs don't exist on Reanimated `SharedValue`.

**How to avoid:** Update ChapterList interface to accept `animatedStyle: StyleProp<ViewStyle>` instead of `chapterListAnim`. The animated styles are computed in FullScreenPlayer (where the `SharedValue` lives) via `useAnimatedStyle`, then passed as a prop. ChapterList wraps its root in `<Animated.View style={[animatedStyle, { marginBottom: 16, overflow: 'hidden' }]}>`.

**Warning signs:** TypeScript error `Type 'SharedValue<number>' is not assignable to type 'Animated.Value'`.

### Pitfall 2: UIMenu `subactions` renders as a sub-menu, not inline sections

**What goes wrong:** On some older iOS versions or with incorrect attributes, `subactions` may render as a nested popover rather than inline sections with dividers.

**Why it happens:** iOS 14+ UIMenu renders child menus inline when the parent action has `.displayInline` attribute. The `@react-native-menu/menu` library sets this by default for the iOS UIMenu case, but verifying on-device matters.

**How to avoid:** Test on iOS 14+ device (the app's minimum deployment target should be checked). The `@react-native-menu/menu` README shows a working nested `subactions` example with `state` — this is the same pattern. iOS 13 falls back to ActionSheet, which doesn't support inline radio sections; this is acceptable for the app's audience.

**Warning signs:** All three sections collapse into a single nested "..." item.

### Pitfall 3: AirPlay button non-functional on Simulator

**What goes wrong:** The AVRoutePickerView shows a button but tapping it does nothing on the iOS Simulator.

**Why it happens:** AirPlay route discovery requires real hardware. The simulator has no audio output routing to discover. This is documented behavior.

**How to avoid:** Do not test AirPlay functionality on Simulator. Always test AirPlay on a physical device. For CI purposes, a smoke test that the component renders without crashing is sufficient.

**Warning signs:** No route picker popover appears after tapping.

### Pitfall 4: `@douglowder/expo-av-route-picker-view` build failure due to modules-core version gap

**What goes wrong:** The package targets `expo-modules-core ~1.12.15` (SDK 52). The project runs `expo-modules-core 3.0.23` (SDK 54). If the Swift module uses deprecated Expo Modules API surface that was removed in 2.x or 3.x, the build will fail with a Swift compilation error.

**Why it happens:** expo-modules-core has a history of API churn between major versions. The package has no updates since June 2024 and no `codegenConfig`.

**How to avoid:** Run `expo prebuild --clean && expo run:ios` against the dev build as Wave 0 of planning. If it fails, immediately scaffold the local module. Do not block other tasks on this — the local module fallback is small.

**Warning signs:** Xcode build error mentioning `ExpoModulesCore` types or missing Swift symbols.

### Pitfall 5: `headerShown: false` removes safe area management

**What goes wrong:** When `headerShown: false`, the navigation header no longer provides the top safe area padding. The content starts at the physical top of the screen, overlapping the Dynamic Island or status bar.

**Why it happens:** React Navigation's header normally handles safe area insets. Without it, the screen content must apply `useSafeAreaInsets().top` manually.

**How to avoid:** Add `const insets = useSafeAreaInsets()` in FullScreenPlayer. Apply `paddingTop: insets.top` (or `insets.top + 4` for Dynamic Island clearance) to the outermost container or the drag pill / header row View.

**Warning signs:** Header row overlaps the camera notch or Dynamic Island on device.

### Pitfall 6: ProgressBar right-side time label hard-codes duration, ignores `chapterBarShowRemaining`

**What goes wrong:** The ProgressBar component currently renders `formatTime(duration)` as the right-side label unconditionally. The `chapterBarShowRemaining` preference needs to show a negative time remaining string instead.

**Why it happens:** ProgressBar has no concept of "show remaining vs total" for the right label. It always shows `formatTime(duration)`.

**How to avoid:** Add a `rightLabel?: string` override prop to ProgressBar (or a `showRemaining?: boolean` prop). The caller (FullScreenPlayer, ConsolidatedPlayerControls) computes the correct string based on the `chapterBarShowRemaining` setting and passes it as `rightLabel`. This keeps ProgressBar generic and avoids coupling it to settings.

**Warning signs:** The right-side time label always shows total duration regardless of the setting.

---

## Code Examples

### Keep Awake Guard Component (preferred pattern)

```typescript
// In FullScreenPlayer/index.tsx
// Source: expo-keep-awake 15.0.7 docs + project pattern
import { useKeepAwake } from 'expo-keep-awake';
import { isPlaying, keepScreenAwake } from store selectors;

function KeepAwakeGuard() {
  useKeepAwake('sideshelf-player');
  return null;
}

// Inside render:
{keepScreenAwake && isPlaying && <KeepAwakeGuard />}
```

### Reanimated migration — cover size derivation without interpolation

```typescript
// Source: CollapsibleSection.tsx (Phase 15) + Reanimated 4 docs
// Full cover and mini cover sizes are computed from window dimensions:
const fullCoverSize = Math.min(width - 64, height * 0.4);
const minimizedCoverSize = 60;

const coverSizeSV = useSharedValue(0);

const coverAnimStyle = useAnimatedStyle(() => {
  "worklet";
  const sz = fullCoverSize + (minimizedCoverSize - fullCoverSize) * coverSizeSV.value;
  const mb = 24 - 16 * coverSizeSV.value; // 24 at 0 (full), 8 at 1 (minimized)
  return {
    width: sz,
    height: sz,
    marginBottom: mb,
    borderRadius: 12,
    overflow: "hidden" as const,
  };
});
// Wrap CoverImage in <Animated.View style={coverAnimStyle}>
```

### Local Expo Module scaffold (AVRoutePickerView fallback)

```bash
# Source: Expo Modules API docs
npx create-expo-module --local modules/AirPlayButton
```

```swift
// modules/AirPlayButton/ios/AirPlayButton.swift
import ExpoModulesCore
import AVKit

public class AirPlayButtonView: ExpoView {
  let routePicker = AVRoutePickerView()
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addSubview(routePicker)
    routePicker.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      routePicker.leadingAnchor.constraint(equalTo: leadingAnchor),
      routePicker.trailingAnchor.constraint(equalTo: trailingAnchor),
      routePicker.topAnchor.constraint(equalTo: topAnchor),
      routePicker.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }
}
```

```typescript
// modules/AirPlayButton/src/index.ts
import { requireNativeViewManager } from 'expo-modules-core';
import { ViewProps } from 'react-native';

const NativeView = requireNativeViewManager('AirPlayButton');

export function AirPlayButton(props: ViewProps) {
  return <NativeView {...props} />;
}
```

### settingsSlice.ts new action (pattern from updateProgressFormat)

```typescript
// Follow exact pattern of updateProgressFormat in settingsSlice.ts
updateChapterBarShowRemaining: async (showRemaining: boolean) => {
  const previousValue = get().settings.chapterBarShowRemaining;
  set((state: SettingsSlice) => ({
    ...state,
    settings: { ...state.settings, chapterBarShowRemaining: showRemaining },
  }));
  try {
    await setChapterBarShowRemaining(showRemaining);
  } catch (error) {
    log.error("Failed to update chapterBarShowRemaining", error as Error);
    set((state: SettingsSlice) => ({
      ...state,
      settings: { ...state.settings, chapterBarShowRemaining: previousValue },
    }));
    throw error;
  }
},
```

---

## AirPlay Package Decision Tree

```
Task 0 (AirPlay verification):
  1. npm install @douglowder/expo-av-route-picker-view
  2. expo prebuild --clean && expo run:ios (device or sim)
  3a. Build succeeds → use the package
  3b. Swift compile error → scaffold modules/AirPlayButton/
      (3b takes ~1 hour; subsequent tasks are unblocked)
```

---

## State of the Art

| Old Approach                                                    | Current Approach                                              | When Changed                                                                      | Impact                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| `Animated.Value` with `useNativeDriver: false` for panel height | Reanimated `useSharedValue` + `useAnimatedStyle`              | RN Animated never supported native driver for layout props; Reanimated always has | JS thread freed; 60fps on UI thread         |
| `Animated.Value.interpolate()`                                  | Reanimated linear interpolation in `useAnimatedStyle` worklet | Reanimated 2+                                                                     | Worklet runs on native thread, no bridge    |
| `MPVolumeView` for AirPlay                                      | `AVRoutePickerView`                                           | iOS 13+                                                                           | `MPVolumeView` AirPlay button deprecated    |
| Navigation header for "Done" button                             | `headerShown: false` + custom header row                      | N/A — always possible; design trend                                               | Full design control; no chrome interference |

**Deprecated/outdated:**

- `Animated.parallel` with `useNativeDriver: false`: works but runs on JS thread, causing jank when JS is busy; PERF-11 specifically targets this
- `MPVolumeView` for AirPlay: deprecated in iOS 13, broken in iOS 17+ for AirPlay discovery; do not use
- `@react-native-menu/menu` `subactions` as nested menus (pre-iOS 14): iOS 13 ActionSheet fallback loses inline sections, but this is acceptable for the app's audience

---

## Validation Architecture

### Test Framework

| Property           | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| Framework          | Jest 29.7 + jest-expo 54                                                       |
| Config file        | `jest.config.js` (inferred from `jest-expo` preset)                            |
| Quick run command  | `jest --findRelatedTests src/stores/slices/settingsSlice.ts --passWithNoTests` |
| Full suite command | `npm test`                                                                     |

### Phase Requirements → Test Map

| Req ID    | Behavior                                             | Test Type   | Automated Command                                                                          | File Exists?                                                         |
| --------- | ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| PLAYER-01 | `headerShown: false` set in layout                   | manual      | Visual on device                                                                           | N/A                                                                  |
| PLAYER-02 | Chevron button calls `router.back()`                 | manual      | Visual on device                                                                           | N/A                                                                  |
| PLAYER-03 | UIMenu fires correct action IDs; settings update     | unit        | `jest --findRelatedTests src/stores/slices/settingsSlice.ts`                               | Partial (settingsSlice.test.ts exists; new settings need test cases) |
| PLAYER-04 | AirPlay button renders in header                     | manual      | Device-only (AirPlay non-functional on Simulator)                                          | N/A                                                                  |
| PLAYER-05 | AirPlay button renders in FloatingPlayer             | manual      | Visual on device                                                                           | N/A                                                                  |
| PLAYER-06 | AirPlay replaces FullScreenButton; card is pressable | manual      | Visual on device                                                                           | N/A                                                                  |
| PERF-11   | Chapter panel uses Reanimated, no `Animated.Value`   | unit / grep | `grep -r "Animated.Value" src/app/FullScreenPlayer/ src/components/player/ChapterList.tsx` | ❌ Wave 0                                                            |

### Sampling Rate

- **Per task commit:** `jest --findRelatedTests <changed-file> --passWithNoTests`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/stores/slices/__tests__/settingsSlice.test.ts` — add test cases for `chapterBarShowRemaining` and `keepScreenAwake` initialize/update/revert (file exists; needs extension)
- [ ] No unit tests for UIMenu interaction — acceptable; PLAYER-03 is best verified visually on device given the native rendering dependency

---

## Open Questions

1. **Does `@douglowder/expo-av-route-picker-view` build on SDK 54 + newArch?**
   - What we know: Package targets `expo-modules-core ~1.12.15`; project runs `3.0.23`; last update June 2024; uses Expo Modules API (which Expo says supports new-arch by default)
   - What's unclear: Whether any breaking API changes between expo-modules-core 1.x and 3.x affect this package's Swift code
   - Recommendation: Make this the first task in Wave 1 (a build-only spike). If it fails, immediately scaffold `modules/AirPlayButton/`. Unblock other tasks within the same wave.

2. **Should `chapterBarShowRemaining` affect the ConsolidatedPlayerControls ProgressBar right label?**
   - What we know: CONTEXT.md lists this under Claude's Discretion — "likely yes — same `ProgressBar` component"
   - What's unclear: The planner should decide; the research recommendation is YES for consistency, but it requires that ConsolidatedPlayerControls also reads `chapterBarShowRemaining` from `useSettings()`
   - Recommendation: Apply to both surfaces (same setting key, same selector). A user who changes the preference in the full screen player expects consistency.

3. **`expo-symbols` vs Ionicons for the chevron and gear icons**
   - What we know: Both are installed. `expo-symbols` requires iOS 16+ for full SF Symbol support. The header icons (chevron-down, settings-outline) exist in both.
   - What's unclear: Whether the project has an iOS 15 minimum deployment target.
   - Recommendation: Use Ionicons for cross-version safety. SF Symbols via `expo-symbols` are a nice-to-have upgrade if iOS 16+ is the floor.

---

## Sources

### Primary (HIGH confidence)

- Installed source: `node_modules/@react-native-menu/menu/README.md` — full API reference, `MenuAction` type, `state` prop, `subactions` behavior
- Installed source: `node_modules/@react-native-menu/menu/package.json` — version 2.0.0, `codegenConfig` confirms new-arch support
- Installed source: `node_modules/@react-native-menu/menu/ios/` — `NewArch/` and `OldArch/` directories confirm dual-arch implementation
- Installed source: `node_modules/expo-keep-awake/build/index.d.ts` — `useKeepAwake`, `activateKeepAwakeAsync`, `deactivateKeepAwake` API surface
- Project source: `src/components/ui/CollapsibleSection.tsx` — validated Reanimated 4 pattern (Phase 15)
- Project source: `src/app/FullScreenPlayer/index.tsx` — existing animation values, chapter panel structure, PanResponder
- Project source: `src/components/player/ChapterList.tsx` — `chapterListAnim: Animated.Value` interface to be migrated
- Project source: `src/stores/slices/settingsSlice.ts` — established pattern for new settings
- Project source: `src/lib/appSettings.ts` — established pattern for AsyncStorage keys and helpers

### Secondary (MEDIUM confidence)

- WebFetch: `https://raw.githubusercontent.com/douglowder/expo-av-route-picker-view/main/package.json` — version 0.0.5, `expo-modules-core ~1.12.15` dev dep, last updated June 2024
- WebSearch: Expo Modules API supports New Architecture by default (Expo official claim); all expo-\* packages in SDK 53+ support new-arch

### Tertiary (LOW confidence — flagged for validation)

- WebSearch: `@douglowder/expo-av-route-picker-view` compatibility with `expo-modules-core 3.0.x` — unverified; requires a device build to confirm

---

## Metadata

**Confidence breakdown:**

- Standard stack (UIMenu, Reanimated, expo-keep-awake): HIGH — all installed, APIs inspected from source
- Architecture (header row, settings pattern, Reanimated migration): HIGH — directly derived from existing project code
- AirPlay package compatibility: MEDIUM — functional concern requiring a build test; fallback path is well-understood
- Pitfalls: HIGH — derived from code inspection (ChapterList interface) and known platform behavior (AirPlay simulator, safe-area, modules-core version gap)

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (30 days; AirPlay package is the only time-sensitive item — check for updates before planning if delayed)
