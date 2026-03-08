# React Native Best Practices Audit

General review of RN performance best practices. Each area is audited sequentially and findings captured here for follow-up work.

---

## Area 1: FPS & Re-renders

**Audit date:** 2026-03-07
**Status:** Complete — no fixes applied yet

### Findings

#### ✅ Already Good

- React Compiler enabled via `app.json` `experiments.reactCompiler: true`
- All 9 FlatLists have `keyExtractor`
- `useCallback` on `renderItem` in authors, series, home, logs screens
- `React.memo` on list items in logs screen (`LogItem`, `FilterButton`, etc.)
- `ScrollView` + `.map()` only used for small fixed-size datasets (low risk)

#### ⚠️ Issues

**1. LibraryItemList uses FlatList — should use FlashList**
File: `src/components/library/LibraryItemList.tsx:95`
FlatList creates new views on scroll; FlashList recycles them. Benchmarks: ~45 FPS (FlatList) vs ~54 FPS (FlashList). This is the primary list in the app — user's entire audiobook collection.
Fix: Replace `FlatList` with `FlashList` from `@shopify/flash-list`, add `estimatedItemSize` (measure average item height), add `getItemType` if grid/list modes render different components.

**2. No `getItemLayout` on any FlatList**
All 9 FlatList instances are missing `getItemLayout`. RN must measure every item height on layout — expensive. Especially problematic for `ChapterList`, which calls `scrollToIndex()` without it (may warn or scroll inaccurately).
Fix: Add `getItemLayout` to `ChapterList` first (chapters have fixed height — easy). Then evaluate other lists.

**3. Inline `renderItem` without memoization**
Files:

- `src/components/player/ChapterList.tsx:135` — inline arrow function, recreated every render
- `src/app/(tabs)/more/index.tsx:272` — large JSX block inline, recreated every render

React Compiler _may_ auto-memoize these, but compiler skips complex or non-compliant components.
Fix: Extract to named `useCallback` handlers. Verify with React DevTools (`Memo ✨` badge).

**4. React Compiler not verified**
Compiler is enabled via config but hasn't been confirmed working. Components that violate Rules of React are silently skipped.
Fix: Open React DevTools → Profiler → check for `Memo ✨` badges. Run `npx react-compiler-healthcheck@latest` to find violations.

### Recommended Fix Order

1. Verify React Compiler is working (free win — no code changes)
2. Wrap `ChapterList` renderItem in `useCallback` (trivial)
3. Add `getItemLayout` to `ChapterList` (chapters are fixed height)
4. Migrate `LibraryItemList` to FlashList (biggest user impact)

---

## Area 2: Bundle Size

**Audit date:** 2026-03-07
**Status:** Complete — no fixes applied yet

### Findings

#### ✅ Already Good

- No lodash, moment, or date-fns (no heavyweight utility libraries)
- `Platform.OS` always imported as `import { Platform } from 'react-native'` — platform shaking works correctly
- Most icon imports use direct file paths (e.g., `from "@expo/vector-icons/MaterialIcons"`)
- All `require()` calls are intentional (background services, circular dep avoidance)

#### ⚠️ Issues

**1. Tree shaking not enabled**
`metro.config.js` has only a `.sql` extension addition. No `experimentalImportSupport`, no `.env` flags.
Fix: Add to `.env`:

```
EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
EXPO_UNSTABLE_TREE_SHAKING=1
```

And in `metro.config.js`, add:

```js
config.transformer.getTransformOptions = async () => ({
  transform: { experimentalImportSupport: true },
});
```

Expected: ~10–15% bundle size reduction. Only applies to production builds.

**2. `@/stores` barrel imported in 16 files**
File: `src/stores/index.ts` — 87-line barrel exporting all Zustand hooks and slice types.
Without tree shaking, every importer evaluates the entire store module graph. This barrel is in the critical startup path.
Affected files include: `(tabs)/_layout.tsx`, `home/index.tsx`, `series/index.tsx`, `authors/index.tsx`, and most `more/*.tsx` screens.
Fix: Import directly from slice files (e.g., `from '@/stores/slices/playerSlice'`). Or rely on tree shaking (fix #1 above).

**3. Root layout imports 3 icon families from barrel**
File: `src/app/_layout.tsx:13`

```ts
import { FontAwesome6, MaterialCommunityIcons, Octicons } from "@expo/vector-icons";
```

Root layout is on the critical startup path — evaluated before any screen renders.
Fix: Use direct imports:

```ts
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Octicons from "@expo/vector-icons/Octicons";
```

**4. `@/db/helpers` barrel used outside services**
Files:

- `src/providers/AuthProvider.tsx` — imports 3 helper namespaces via barrel
- `src/stores/slices/statisticsSlice.ts` — imports 1 helper namespace via barrel
  CLAUDE.md prohibits this in services; providers and slices should also use direct imports.
  Fix: Import from specific helper files (e.g., `from '@/db/helpers/users'`).

### Recommended Fix Order

1. Enable Expo tree shaking (`.env` + `metro.config.js`) — no refactoring, catches all barrel issues
2. Fix `_layout.tsx` icon imports — root layout, critical path, 3-line change
3. Fix `@/db/helpers` barrel in `AuthProvider` + `statisticsSlice` — 2 files, low effort
4. Migrate `@/stores` imports to slice-direct across 16 files — mechanical but high file count

## Area 3: TTI (Startup Time)

**Audit date:** 2026-03-07
**Status:** Complete — no fixes applied yet

### Findings

#### ✅ Already Good

- Android bundle compression already disabled by default in Expo SDK 54 / RN 0.81 — no action needed
- Cleanup operations (iCloud exclusion, cover art repair, download reconciliation) are fire-and-forget, non-blocking
- TrackPlayer init + state restoration deferred to `useEffect`, not before first render
- Splash screen correctly uses `preventAutoHideAsync()` + conditional `hideAsync()` pattern
- WAL mode enabled — DB reads/writes don't block each other

#### ⚠️ Issues

**1. No TTI measurement**
`react-native-performance` is not installed. There is no baseline cold-start TTI metric and no way to validate improvements. This is the prerequisite for all TTI optimization work.
Fix: `npm install react-native-performance`, add `performance.mark('screenInteractive')` in home screen's first `useEffect`.

**2. Database migrations block first render**
`src/providers/DbProvider.tsx:52–54` — `useMigrations()` renders `null` until migrations complete. The entire app tree is gated behind this. On first install, migrations can take 1–2 seconds. No loading skeleton is shown during this window — just the splash screen.
Fix: No easy code fix; this is a Drizzle constraint. Mitigation: measure migration duration on existing installs. If fast (<100ms), not worth addressing. If slow, consider running migrations outside the render tree.

**3. Auth initialization gates initial route**
`src/providers/AuthProvider.tsx:48–77` — sequential async chain: wait for dbInitialized → read secure storage (x2) → DB query. Until complete, `src/app/index.tsx` cannot determine the initial route.
Fix: Parallelize secure storage reads (both `apiClientService.initialize()` and `getStoredUsername()` can run concurrently with `Promise.all`).

**4. PlayerStateCoordinator instantiated at module load**
`src/index.ts:38` — `getCoordinator()` runs at module evaluation time before any React renders. Constructor sets up event subscriptions and diagnostic logging synchronously.
Fix: Defer `getCoordinator()` call into `initializeApp()` instead of module scope.

### Recommended Fix Order

1. Add `react-native-performance` and establish a baseline (prerequisite for everything else)
2. Parallelize auth secure storage reads in `AuthProvider` (low effort, measurable impact)
3. Defer coordinator instantiation to `initializeApp()` (trivial move)
4. Investigate migration timing on existing installs — only address if >100ms

## Area 4: Native Performance

**Audit date:** 2026-03-07
**Status:** Complete — no fixes applied yet

### Findings

#### ✅ Already Good

- No Intl polyfills — custom lightweight i18n (en/es static dictionaries, no CLDR data)
- No crypto-js — no JS-side crypto overhead
- Navigation: Expo Router Stack wraps `native-stack`; tabs use `unstable-native-tabs` — both optimal
- `react-native-screens` installed and auto-enabled by Expo Router (no manual `enableScreens()` needed)
- Single custom native module (`ios/SideShelf/Modules/ICloudBackupExclusion.m`) — lightweight, `requiresMainQueueSetup = NO`
- No heavy JS-thread blocking: no large sorts, no large JSON parsing on critical paths
- All intervals (sync, diagnostic, batch) are properly cleared on cleanup — no memory leaks

#### ⚠️ Issues

**1. Cover art uses `Image` instead of `expo-image`**
File: `src/components/ui/CoverImange.tsx:28`
Core RN `Image` has no disk cache — every cold start re-fetches cover art from the server. `expo-image` is already in `package.json` (~3.0.10) but unused. For a media app showing hundreds of covers, this means avoidable network requests on every launch.
`expo-image` provides: memory + disk cache, placeholder/blurhash while loading, better native memory management.
Fix: Replace `import { Image } from 'react-native'` with `import { Image } from 'expo-image'`. API is nearly identical.

**2. `react-native-render-html` parses HTML on JS thread**
Used for book descriptions on the detail screen. Acceptable for infrequent navigation, but can cause a perceptible JS-thread stall when first rendering long HTML strings.
No action needed now — only investigate if the detail screen feels slow to open.

### Recommended Fix Order

1. Swap `Image` → `expo-image` in `CoverImange.tsx` (15-minute change, meaningful cache win for media app)
2. Watch `react-native-render-html` — no action unless detail screen performance becomes a concern

## Area 5: Memory

**Audit date:** 2026-03-07
**Status:** Complete — no fixes applied yet

### Findings

#### ✅ Already Good

- AppState listeners: both instances properly `.remove()`d in useEffect cleanup
- Zustand subscriptions: AuthProvider cleans up; singleton services intentionally lifetime-scoped
- TrackPlayer event listeners: all stored in `subscriptions` array, fully cleared on shutdown/reconnect
- Singleton bounded arrays: `transitionHistory`, `processingTimes`, `eventHistory` all capped at 100 with `.shift()`
- Component state: no unbounded arrays in `useState` — large data stays in Zustand slices
- `Linking.addEventListener` properly cleaned up in `_layout.tsx`

#### ⚠️ Issues

**1. ChapterList setTimeout without cleanup (2 instances)**
File: `src/components/player/ChapterList.tsx:71–78` and `:101–107`
Both useEffect blocks fire `setTimeout` for scroll-to-index but don't return a cleanup function. If the component unmounts before the timeout fires, the callback runs against an unmounted component — stale ref access, potential state update on unmounted component warning.
Fix:

```ts
useEffect(() => {
  const id = setTimeout(() => { chapterListRef.current?.scrollToIndex(...) }, 350);
  return () => clearTimeout(id);
}, [somedep]);
```

**2. NetInfo listener leaks on re-initialization**
File: `src/stores/slices/networkSlice.ts:108`
`NetInfo.addEventListener(...)` is called in `initializeNetwork()` but the returned unsubscribe function is discarded. A comment acknowledges this as "intentional for app lifetime" — but if `initializeNetwork()` is called again (e.g., after logout), a second orphaned listener accumulates with no way to remove the first.
`resetNetwork()` (line 277) clears intervals but does NOT call unsubscribe.
Fix: Capture unsubscribe in slice state; call it in `resetNetwork()` before re-initializing.

**3. Network intervals not cleared before re-initialization**
File: `src/stores/slices/networkSlice.ts:86–151`
`initializeNetwork()` sets `serverCheckInterval` and `networkRefreshInterval` without clearing pre-existing values. A double-init creates orphaned intervals.
Fix: Call `clearInterval` on existing values at the top of `initializeNetwork()` before creating new ones.

### Recommended Fix Order

1. Fix ChapterList setTimeout cleanup — 2-line change, eliminates stale-callback risk
2. Capture NetInfo unsubscribe and call it in `resetNetwork()` — prevents listener accumulation across logout/login cycles
3. Guard `initializeNetwork()` against double-init — clear existing intervals before setting new ones

## Area 6: Animations

**Audit date:** 2026-03-07
**Status:** Complete — no fixes applied yet

### Findings

#### ✅ Already Good

- Babel plugin: auto-injected by `babel-preset-expo` when `react-native-worklets` is installed — no manual config needed
- `useNativeDriver: true` correctly applied for opacity/transform animations (home fade, skeleton shimmer, chapter scroll)
- `useNativeDriver: false` correctly applied where layout properties (height/width) are animated — these can't use the native driver
- No mixed `Animated` imports (no file imports from both `react-native` and `react-native-reanimated`)
- Reanimated v4 usage in `tab-bar-settings.tsx` is correct: `useSharedValue`, `useAnimatedStyle`, `Gesture.Pan()` — no deprecated v3 APIs
- Worklet bodies are lightweight (simple conditionals + value reads, no heavy computation)
- Modern Gesture API v2 (`Gesture.Pan()` + `GestureDetector`) — deprecated `useAnimatedGestureHandler` not used

#### ⚠️ Issues

**1. `CollapsibleSection` uses legacy Animated with `useNativeDriver: false`**
File: `src/components/ui/CollapsibleSection.tsx:34`
Height collapse/expand animation runs on the JS thread. Used throughout the app wherever sections expand/collapse. If JS is busy (e.g., loading library), these animations jank.
Fix: Migrate to `useSharedValue` + `useAnimatedStyle` from Reanimated. Height animations become UI-thread via `withTiming`.

**2. `FullScreenPlayer` panel animations use legacy Animated with `useNativeDriver: false`**
File: `src/app/FullScreenPlayer/index.tsx:97,102`
Slide-in/out and width/height animations for the player panel run on the JS thread. High-visibility interaction — user opens/closes the player frequently.
Fix: Migrate to Reanimated `useSharedValue` + `useAnimatedStyle`.

**3. Skeleton shimmer and home fade-in use legacy Animated (lower priority)**
Files: `src/components/home/SkeletonSection.tsx`, `src/app/(tabs)/home/index.tsx`
Both use `useNativeDriver: true` so they are already running natively — no jank risk. Reanimated would simplify the code but is not required.

### Recommended Fix Order

1. Migrate `CollapsibleSection` to Reanimated — used across the app, JS-thread height animation most likely to cause visible jank
2. Migrate `FullScreenPlayer` panel animation to Reanimated — high-visibility open/close interaction
3. Leave skeleton shimmer and home fade — already native-driver, no action needed

---

## Overall Summary

| Area                      | Key Issues                                                                                           | Priority Fixes                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **1. FPS & Re-renders**   | No FlashList; missing `getItemLayout` on ChapterList; inline renderItem in ChapterList               | Migrate LibraryItemList → FlashList; add `getItemLayout` + `useCallback` to ChapterList |
| **2. Bundle Size**        | Tree shaking not enabled; `@/stores` barrel in 16 files; root layout icon barrel imports             | Enable Expo tree shaking in `.env` + `metro.config.js`; fix `_layout.tsx` icon imports  |
| **3. TTI**                | No TTI measurement; auth reads are sequential; coordinator init at module scope                      | Add `react-native-performance`; parallelize AuthProvider secure storage reads           |
| **4. Native Performance** | `Image` instead of `expo-image` for cover art (cache miss on every cold start)                       | Swap `CoverImange.tsx` to use `expo-image`                                              |
| **5. Memory**             | ChapterList setTimeout without cleanup; NetInfo listener leaks on re-init; double-init interval risk | Fix ChapterList cleanup; capture NetInfo unsubscribe in networkSlice                    |
| **6. Animations**         | `CollapsibleSection` + `FullScreenPlayer` use legacy Animated on JS thread for layout animations     | Migrate both to Reanimated `useAnimatedStyle`                                           |
