# Stack Research: v1.3 Beta Polish

**Project:** SideShelf (abs-react-native) — v1.3 milestone (Beta Polish)
**Researched:** 2026-03-09
**Confidence:** HIGH for packages already in tree (Reanimated, expo-image, RNTP); HIGH for FlashList v2 (npm-verified, new-arch alignment confirmed); MEDIUM for AirPlay packages (small/unmaintained ecosystem, new-arch compatibility unverified in search results); MEDIUM for react-native-performance (version confirmed, new-arch support unverified against SDK 54 interop); LOW for tree shaking specifics (conflicting signals on what's already auto-enabled vs. requires opt-in in SDK 54)

---

## Executive Decision Summary

Six targeted questions, six direct answers:

1. **AirPlay route picker** — Use `@douglowder/expo-av-route-picker-view` (0.0.5, Expo Modules API, most recently maintained at 9 months old). It wraps iOS `AVRoutePickerView` natively. No separate audio routing library needed — RNTP already handles audio session routing; `AVRoutePickerView` is purely a UI affordance that triggers the system route picker sheet. iOS-only; render nothing on Android.

2. **Volume fade for sleep timer** — RNTP provides `TrackPlayer.setVolume(n)` (0.0–1.0). There is no native fade API. Implement a JS `setInterval` ramp inside `SleepTimerService` or the coordinator: step volume down linearly over 30s (e.g., 10 ticks × 3s = 0.1 decrement per tick), then call `TrackPlayer.stop()` and restore volume to 1.0. No new package required.

3. **FlashList** — Use `@shopify/flash-list@^2.0.0` (v2.x is new-architecture-only; this project already has `newArchEnabled: true` in app.json). v2 drops the `estimatedItemSize` requirement and is a JS-only rewrite — no native pod install needed. The API is drop-in for FlatList with the addition of `renderItem` type requirements.

4. **Reanimated for height animation / panel migration** — Already installed at `~4.1.1` (Expo SDK 54 standard). `withTiming` + `useSharedValue` + `useAnimatedStyle` are all available in v4. No upgrade or new install needed. The `react-native-worklets` package (`0.5.1`) is already in the tree as Reanimated 4's dependency.

5. **expo-image** — Already in `package.json` at `~3.0.10` (Expo SDK 54 compatible). Only needs to be used — no install. Import from `expo-image` and use the `Image` component as a drop-in replacement for RN's `Image`. Supports blurhash placeholders natively.

6. **Tree shaking** — Expo SDK 54 enables tree shaking by default in production builds. No `EXPO_UNSTABLE_TREE_SHAKING=1` env var needed. The current `metro.config.js` has no tree shaking configuration. Adding `inlineRequires: true` (production-only) to metro config is the one optional enhancement. No new package needed.

---

## Packages to ADD

| Package                                 | Version Target         | Purpose                                                            | Install Method                                                               |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `@douglowder/expo-av-route-picker-view` | `^0.0.5`               | AirPlay route picker UI button (iOS AVRoutePickerView wrapper)     | `npx expo install @douglowder/expo-av-route-picker-view` + `npx pod-install` |
| `@shopify/flash-list`                   | `^2.0.0`               | FlatList replacement — view recycling, no size estimates needed    | `npx expo install @shopify/flash-list`                                       |
| `react-native-performance`              | `^5.x` (verify on npm) | TTI measurement via `performance.mark()` / `performance.measure()` | `npm install react-native-performance` + `npx pod-install`                   |

## Packages Already Installed — Use, Don't Add

| Package                     | Installed Version | What to Do for v1.3                                                                                                     |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `expo-image`                | `~3.0.10`         | Replace `Image` imports with `expo-image` `Image`. No install needed.                                                   |
| `react-native-reanimated`   | `~4.1.1`          | Use `withTiming`, `useSharedValue`, `useAnimatedStyle` for collapsible sections and panel migration. No upgrade needed. |
| `react-native-track-player` | `^4.1.2`          | Use `TrackPlayer.setVolume()` for sleep timer fade. No upgrade.                                                         |
| `react-native-worklets`     | `0.5.1`           | Reanimated 4 dependency already present.                                                                                |

## Packages with Configuration Changes Only

| Package / File    | Change                                    | Why                                                                                |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `metro.config.js` | Add `inlineRequires: true` for production | Lazy-loads modules at eval time; pairs with SDK 54 default tree shaking to cut TTI |
| `app.json`        | `"scheme": "side-shelf"` already present  | Deep link URL scheme for Maestro tests already configured — no change needed       |

---

## Detailed Notes by Feature Area

### AirPlay Route Picker

**Recommended: `@douglowder/expo-av-route-picker-view`**

Why over `react-native-avroutepickerview` (SuperphonicHub, v0.4.0, last updated 3 years ago): the `douglowder` package is built on the Expo Modules API, which is the correct native integration pattern for this project (bare Expo workflow, Expo Modules already in use). It is newer (9 months vs. 3 years) and uses the same `AVRoutePickerView` underneath.

**What it does:** Renders a native iOS button that, when tapped, presents the system AirPlay/Bluetooth route picker sheet. The audio routing itself is handled by iOS and RNTP's audio session — the button is purely a UI trigger.

**What it does NOT do:** It does not require any RNTP changes. RNTP's `UIBackgroundModes: audio` (already in `app.json`) sets up the AVAudioSession that `AVRoutePickerView` operates on.

**API:**

```typescript
import { ExpoAvRoutePickerView } from '@douglowder/expo-av-route-picker-view';

// Render as a styled touchable area — iOS only
<ExpoAvRoutePickerView style={{ width: 44, height: 44 }} />
```

**iOS-only guard required:**

```typescript
import { Platform } from "react-native";
// Wrap render: Platform.OS === 'ios' ? <ExpoAvRoutePickerView .../> : null
```

**Risk:** The package has 0 dependents on npm and is maintained by one person. If it breaks under a future Expo version, the fallback is writing a local Expo Module (< 50 lines of Swift wrapping `AVRoutePickerView`) using `expo generate module`. Flag this for validation in the phase plan.

**Alternative considered — build a local module:** Using `npx create-expo-module --local` generates a local Expo Module inside `modules/`. This is the fallback path if `@douglowder/expo-av-route-picker-view` breaks or doesn't support new-arch. The Swift code for `AVRoutePickerView` is trivial (~30 lines). Document this option in PITFALLS.md.

---

### Sleep Timer Volume Fade

**No new package. Use `TrackPlayer.setVolume()` with a JS interval.**

RNTP does not provide a native volume fade or ramp API (issues #670 and #1486 confirm this is a long-standing feature request with no native implementation). The existing `SleepTimerControl` component already integrates with the coordinator. Volume fade belongs in the sleep timer execution path.

**Implementation pattern:**

```typescript
const FADE_DURATION_MS = 30_000; // 30 seconds
const TICK_INTERVAL_MS = 3_000; // 10 ticks
const TICK_COUNT = FADE_DURATION_MS / TICK_INTERVAL_MS;

async function startVolumeFade(): Promise<void> {
  const initialVolume = await TrackPlayer.getVolume();
  let tick = 0;
  const timer = setInterval(async () => {
    tick++;
    const newVolume = initialVolume * (1 - tick / TICK_COUNT);
    await TrackPlayer.setVolume(Math.max(0, newVolume));
    if (tick >= TICK_COUNT) {
      clearInterval(timer);
      await TrackPlayer.stop();
      await TrackPlayer.setVolume(initialVolume); // restore
    }
  }, TICK_INTERVAL_MS);
}
```

This should be dispatched through the coordinator event system — not called directly from UI — so the coordinator can cancel the fade if the user manually stops playback first.

---

### FlashList v2

**Use `@shopify/flash-list@^2.0.0`.**

This project already has `newArchEnabled: true` in app.json. FlashList v2 is new-architecture-only and runs in JS-only mode (no native pod required in v2). Install via `npx expo install @shopify/flash-list` and let Expo pick the compatible version.

**Key migration points from FlatList:**

- Replace `<FlatList>` with `<FlashList>` — API is ~90% identical
- Remove `estimatedItemSize` (not needed in v2) or leave it (v2 ignores it)
- `keyExtractor` works the same way
- `renderItem` signature is identical
- `onEndReached` / `onEndReachedThreshold` same API

**What v2 does differently:** Pure JS recycling (no native Fabric component). Items are recycled by type via `getItemType`. For the library list (uniform audiobook cards), no `getItemType` override needed.

---

### Reanimated (withTiming, panel animations)

**No install. Use existing `~4.1.1`.**

Reanimated 4 `withTiming` API for height animation:

```typescript
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

const height = useSharedValue(0);
const animatedStyle = useAnimatedStyle(() => ({
  height: withTiming(height.value, { duration: 300 }),
  overflow: "hidden",
}));
```

For collapsible sections showing "first ~100px with fade": use a `LinearGradient` overlay at the bottom of the collapsed peek area (not an animated opacity — the content itself doesn't fade, the gradient masks it). Fade gradient fades out to `transparent` at the bottom edge.

**Performance note:** Animating `height` directly is layout-expensive (triggers Yoga on every frame). For short lists, this is acceptable. For long content in series/authors sections, consider animating `maxHeight` or using a `transform: scaleY` approach if jank is observed.

---

### expo-image

**No install. Already at `~3.0.10`.**

Replace `import { Image } from 'react-native'` with `import { Image } from 'expo-image'` in cover art components. expo-image provides:

- Automatic memory + disk cache (avoids repeated network fetches for cover art)
- `placeholder` prop for blurhash or shimmer while loading
- `contentFit` instead of `resizeMode` (same values: `'cover'`, `'contain'`)
- Better performance on New Architecture via Fabric

No style prop changes needed. The `style` prop still accepts ViewStyle width/height.

---

### Tree Shaking / Metro Config

**SDK 54 already enables tree shaking by default in production.** No `EXPO_UNSTABLE_TREE_SHAKING=1` env var required.

The one recommended `metro.config.js` change is adding `inlineRequires` for production:

```javascript
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("sql");

// Pair with SDK 54 default tree shaking for faster TTI
config.transformer.getTransformOptions = async () => ({
  transform: {
    inlineRequires: true,
  },
});

module.exports = config;
```

`inlineRequires` is safe with tree shaking enabled. Without it, all imports are evaluated at startup even if unused. With it, modules are loaded on first access.

**Known risk:** `inlineRequires` can interact badly with Reanimated worklets. Verify with `npm run ios` and exercise the player after enabling. The existing Reanimated issue (#41620) in expo tree shaking is fixed in SDK 54 patch releases.

---

### react-native-performance (TTI Measurement)

**Add for development/diagnostic use only.**

`react-native-performance` (by `oblador`) provides a Performance Web API polyfill:

- `performance.mark('TTI_START')`
- `performance.mark('TTI_END')`
- `performance.measure('TTI', 'TTI_START', 'TTI_END')`
- Native marks: app launch time, JS bundle load time, first frame

Install: `npm install react-native-performance` + `npx pod-install` for iOS.

This is a diagnostic/development tool. It should be imported conditionally (`__DEV__` guard) or stripped in production builds. Use it to measure cold-start TTI before and after metro `inlineRequires` + FlashList migration to confirm improvements.

---

### Maestro Deep Link Testing

**No new package. URL scheme already configured.**

`app.json` already has `"scheme": "side-shelf"`, which means `sideshelf://` deep links are supported after a native build (`expo run:ios`). Maestro can open deep links with:

```yaml
# In a Maestro flow file
- openLink: "sideshelf://library/item/abc123"
```

Maestro does not require any npm package. The `.maestro/` directory already exists in the repo. The requirement (NAVIGATION-03) is to register the scheme — which is done — and write the test flows.

**Important:** Deep link testing in Maestro requires a native build (not Expo Go). The existing `npm run ios` script (`expo prebuild --clean && expo run:ios`) produces a native build suitable for Maestro testing.

---

## Alternatives Considered

| Feature            | Recommended                             | Alternative                                       | Why Not                                                                                     |
| ------------------ | --------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| AirPlay button     | `@douglowder/expo-av-route-picker-view` | Build local Expo Module                           | Adds 30-50 lines of Swift; use if the npm package breaks under new-arch                     |
| AirPlay button     | `@douglowder/expo-av-route-picker-view` | `react-native-avroutepickerview` (SuperphonicHub) | 3 years since last update; not built on Expo Modules API                                    |
| AirPlay button     | `@douglowder/expo-av-route-picker-view` | `react-native-airplay-ios` (gazedash)             | Uses MPVolumeView (deprecated route picker approach); AVRoutePickerView is the modern API   |
| Volume fade        | JS interval + `TrackPlayer.setVolume()` | `expo-av`                                         | expo-av was removed from Expo Go in SDK 54; this project correctly uses RNTP for all audio  |
| FlashList          | v2.0.x                                  | v1.7.x                                            | v1 is the legacy series; v2 aligns with new-arch (already enabled); no reason to stay on v1 |
| TTI measurement    | `react-native-performance`              | `@shopify/react-native-performance`               | Both are valid; `oblador` version is simpler API and sufficient for basic TTI marking       |
| Collapsible height | Reanimated `withTiming` on `height`     | Reanimated `withTiming` on `maxHeight`            | `height` is more predictable; use `maxHeight` only if layout jank observed                  |

---

## What NOT to Add

| Avoid                                         | Why                                                                                                                   | Use Instead                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `expo-av` for audio routing or AirPlay        | Removed from Expo Go in SDK 54; creates second audio session that conflicts with RNTP                                 | `AVRoutePickerView` UI only; RNTP handles audio session |
| `react-native-airplay-ios`                    | Uses `MPVolumeView` which Apple deprecated for route picking (iOS 13+); `AVRoutePickerView` is the correct modern API | `@douglowder/expo-av-route-picker-view`                 |
| `@shopify/flash-list@^1.x`                    | Legacy series, requires native components, not optimized for new-arch                                                 | `@shopify/flash-list@^2.0.0`                            |
| `EXPO_UNSTABLE_TREE_SHAKING=1` env var        | SDK 54 enables tree shaking by default in production; env var is for older SDKs or dev-mode override                  | Nothing — already active                                |
| `react-native-track-player@5.0.0-alpha0`      | Broken on iOS (issue #2503); shaka-player peer dependency; not production ready                                       | Hold at 4.1.2                                           |
| XState or similar FSM library for sleep timer | The existing coordinator handles state; sleep timer is a simple timed operation                                       | JS `setInterval` + coordinator events                   |

---

## Installation Commands

```bash
# AirPlay route picker (requires native rebuild)
npx expo install @douglowder/expo-av-route-picker-view
npx pod-install   # or: cd ios && pod install

# FlashList v2 (JS-only in v2, no pod-install needed)
npx expo install @shopify/flash-list

# TTI measurement (dev/diagnostic only — requires native rebuild)
npm install react-native-performance
cd ios && pod install

# Rebuild native after any pod changes
npm run ios   # runs: expo prebuild --clean && expo run:ios
```

No new dev dependencies needed.

---

## Version Compatibility Matrix

| Package                                       | Expo SDK 54 / RN 0.81.5 | New Architecture  | Notes                                                                                                             |
| --------------------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@douglowder/expo-av-route-picker-view@0.0.5` | UNVERIFIED              | UNVERIFIED        | Built on Expo Modules API which is new-arch compatible; but not npm-tested against SDK 54 specifically            |
| `@shopify/flash-list@^2.0.0`                  | HIGH confidence         | Required          | v2 is new-arch-only; confirmed compatible via Expo 54 upgrade path (reported upgrade to 2.0.2 in SDK 54 installs) |
| `react-native-reanimated@~4.1.1`              | HIGH confidence         | Required          | SDK 54 standard; already installed                                                                                |
| `expo-image@~3.0.10`                          | HIGH confidence         | Compatible        | SDK 54 standard; already installed                                                                                |
| `react-native-performance@^5.x`               | MEDIUM confidence       | Likely compatible | Needs pod-install; new-arch interop unverified                                                                    |
| `react-native-track-player@4.1.2`             | HIGH confidence         | Via interop       | No change; tested as working                                                                                      |

---

## Confidence Assessment

| Area                                                 | Confidence | Basis                                                                                                          |
| ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| AirPlay package selection                            | MEDIUM     | Multiple search sources; package is small/unmaintained; new-arch compat not explicitly verified                |
| AirPlay approach (AVRoutePickerView vs MPVolumeView) | HIGH       | Apple documentation is clear; `AVRoutePickerView` is the current API                                           |
| Volume fade (JS interval)                            | HIGH       | RNTP issue tracker confirms no native fade; `setVolume()` API is documented                                    |
| FlashList v2                                         | HIGH       | npm-verified; Expo 54 upgrade path confirmed; new-arch alignment matches project config                        |
| Reanimated withTiming                                | HIGH       | Already installed; API documented; used elsewhere in project                                                   |
| expo-image adoption                                  | HIGH       | Already installed; API is a near-drop-in for RN Image                                                          |
| Tree shaking (SDK 54 default)                        | MEDIUM     | Expo docs say "enabled by default in SDK 54" but issues #37528 and #36949 show it was broken in SDK 53 patches |
| react-native-performance                             | MEDIUM     | Package confirmed on npm; version unclear; pod-install pattern confirmed                                       |
| Deep link / Maestro                                  | HIGH       | `scheme: "side-shelf"` confirmed in app.json; Maestro `openLink` command is standard                           |

---

## Sources

- `@douglowder/expo-av-route-picker-view` npm: https://www.npmjs.com/package/@douglowder/expo-av-route-picker-view
- `react-native-avroutepickerview` GitHub: https://github.com/SuperphonicHub/react-native-avroutepickerview
- Apple AVRoutePickerView docs: https://developer.apple.com/documentation/avkit/avroutepickerview
- RNTP sleep timer guide: https://rntp.dev/docs/3.2/guides/sleeptimers
- RNTP volume fade feature request: https://github.com/doublesymmetry/react-native-track-player/issues/1486
- FlashList v2 Shopify engineering post: https://shopify.engineering/flashlist-v2
- FlashList v2 migration guide: https://shopify.github.io/flash-list/docs/v2-migration/
- `@shopify/flash-list` npm: https://www.npmjs.com/package/@shopify/flash-list
- Reanimated accordion example: https://docs.swmansion.com/react-native-reanimated/examples/accordion/
- Expo tree shaking guide: https://docs.expo.dev/guides/tree-shaking/
- Expo SDK 54 changelog: https://expo.dev/changelog/sdk-54
- `react-native-performance` GitHub: https://github.com/oblador/react-native-performance
- Expo deep linking docs: https://docs.expo.dev/linking/into-your-app/
- Expo Maestro integration: https://expo.dev/blog/expo-now-supports-maestro-cloud-testing-in-your-ci-workflow

---

_Stack research for: abs-react-native v1.3 Beta Polish milestone_
_Researched: 2026-03-09_
