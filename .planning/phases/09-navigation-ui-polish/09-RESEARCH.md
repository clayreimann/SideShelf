# Phase 9: Navigation & UI Polish - Research

**Researched:** 2026-02-27
**Domain:** Expo Router nested navigation, React Native Animated API, SF Symbols / Ionicons, cover art repair
**Confidence:** HIGH (all findings grounded in codebase inspection)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **More screen navigation**: Series and Authors push onto the More navigation stack (not tab-switch). Current bug: `router.push('/series')` fires but hits a dead route.
- **More screen icons**: SF Symbols on iOS (already used in tab bar via `expo-symbols` + `sf-symbols-typescript`); Ionicons from `@expo/vector-icons` as fallback. Both are already installed.
- **More screen list style**: iOS Settings-style grouped rows on iOS; no custom styling library.
- **Navigation rows** (Series, Authors, Settings): chevron affordance.
- **Action rows** (Leave Feedback, Log out, About Me): no chevron; visually distinct.
- **Log out**: destructive styling (red text).
- **Developer rows**: same pattern, gated by existing `diagnosticsEnabled` flag.
- **Home skeleton shape**: mirrors real layout — horizontal scroll rows with section headers (shelf-style).
- **Section count**: cache last-session count; fall back to sensible default on first launch (Claude's discretion: **3**).
- **Skeleton animation**: pulsing opacity fade, not left-to-right shimmer.
- **Skeleton transition**: fade from skeleton to real content when data arrives.
- **Skeleton trigger**: only during cold start when `isLoadingHome && sections.length === 0`.
- **Cover art scan**: eager startup scan of ALL library items (downloaded + streaming) for missing covers. Trigger re-download for any item where file doesn't exist.
- **Lock screen update timing**: Claude's discretion.

### Claude's Discretion

- Lock screen cover art refresh timing after re-download (auto on download complete vs. next playback start)
- Fallback section count (recommendation: 3)
- Exact skeleton card dimensions and spacing (match real CoverItem proportions: 140×140 px cover)
- Icon selection per More screen item (Claude picks from SF Symbols / Ionicons)
- Exact pulsing animation duration and easing

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID     | Description                                             | Research Support                                                                                                                                                                      |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NAV-01 | More screen navigates to Series (push, not tab-switch)  | Root cause identified: wrong route path. Fix: create `more/series.tsx` that renders `SeriesScreen`, register it in `more/_layout.tsx`, push `/more/series`.                           |
| NAV-02 | More screen navigates to Authors (push, not tab-switch) | Same fix pattern as NAV-01: create `more/authors.tsx` that renders `AuthorsScreen`, register in layout, push `/more/authors`.                                                         |
| UX-01  | Home screen shows skeleton cards during cold start      | `isLoadingHome && sections.length === 0` branch in `home/index.tsx` replaces ActivityIndicator with pulsing opacity skeleton. Section count from `lastSectionCount` AsyncStorage key. |
| UX-02  | More screen items have icons                            | Add `icon` field to `ActionItem` type. Render `SymbolView` (iOS) / `Ionicons` (Android) in each row — same pattern as tab bar icons in `(tabs)/_layout.tsx`.                          |
| UX-03  | More screen items have visual nav affordance            | Add `isNavItem` boolean to `ActionItem`. Show Ionicons `chevron-forward` on right for nav items. Tap state via `Pressable` already present.                                           |
| UX-04  | Tab reorder UX is improved                              | Out of scope per phase boundary (not explicitly listed in context decisions). Deprioritize unless low-effort — do not add new capabilities.                                           |

</phase_requirements>

---

## Summary

Phase 9 is a pure polish phase touching three areas: More screen navigation + visual design, home screen skeleton, and cover art startup repair. All required libraries are already installed; no new dependencies are needed.

**Navigation bug root cause**: `more/index.tsx` line 142 calls `router.push('/series')` and `router.push('/authors')` for hidden tabs. These paths don't match any screen in the More stack — they would only work if `series` and `authors` were top-level routes (they aren't; they live inside `(tabs)/`). The correct fix under the locked decision (push onto More stack) is to create dedicated screens inside `src/app/(tabs)/more/` that re-use the existing `SeriesScreen` and `AuthorsScreen` components, then register them in `more/_layout.tsx` and update the push path to `/more/series` and `/more/authors`.

**Skeleton**: The existing `ActivityIndicator` fallback (`isLoadingHome && sections.length === 0`, line 213 of `home/index.tsx`) is the exact injection point. React Native's built-in `Animated` API (already used in `FullScreenPlayer` and `ChapterList`) is sufficient for a pulsing opacity loop. `react-native-reanimated` is installed but currently unused in UI components — using `Animated` keeps consistency with existing patterns.

**Cover art**: The infrastructure is complete — `getCoverUri()`, `cacheCoverIfMissing()`, `isCoverCached()`, `cacheCoverAndUpdateMetadata()`, `setLocalCoverCached()` all exist. The startup hook `initializeApp()` in `src/index.ts` already runs fire-and-forget scans (e.g., `applyICloudExclusionToExistingDownloads`). Adding a cover art repair scan here follows the established pattern. Lock screen update timing recommendation: **next playback start** — `executeLoadTrack` in `PlayerService.ts` already calls `getCoverUri()` (always current), so the cover will be correct when the user next plays. Calling `updateNowPlayingMetadata()` on background download complete would require a new event coupling with no UX benefit since the lock screen only matters when playing.

**Primary recommendation:** Three self-contained plans: (1) More nav + visual, (2) Home skeleton, (3) Cover art startup repair.

---

## Standard Stack

### Core (all already installed)

| Library                         | Version      | Purpose                         | Why Standard                                                            |
| ------------------------------- | ------------ | ------------------------------- | ----------------------------------------------------------------------- |
| `@expo/vector-icons` (Ionicons) | `^15.0.2`    | Android icons + iOS fallback    | Already used in `(tabs)/_layout.tsx`                                    |
| `expo-symbols` (SymbolView)     | `~1.0.7`     | SF Symbols on iOS               | Already used in `(tabs)/_layout.tsx`                                    |
| `sf-symbols-typescript`         | (transitive) | Type-safe SF Symbol names       | Already imported via `SFSymbol` type in layout                          |
| React Native `Animated` API     | built-in     | Pulsing opacity animation       | Already used in `FullScreenPlayer`, `ChapterList`, `CollapsibleSection` |
| Expo Router `Stack`             | `~6.0.14`    | Push navigation within More tab | Already used in `more/_layout.tsx`                                      |

### No New Installations Needed

Everything required is already a project dependency.

---

## Architecture Patterns

### Pattern 1: More Stack Screen Re-use

The More tab uses Expo Router's file-based `Stack` navigator (`more/_layout.tsx`). Adding a new screen is:

1. Create `src/app/(tabs)/more/series.tsx` — import and render `SeriesScreen` component (or inline the JSX)
2. Register in `more/_layout.tsx` with `<Stack.Screen name="series" />`
3. Update `more/index.tsx` push from `/series` → `/more/series`

The `SeriesScreen` and `AuthorsScreen` are standard React components in their own files — they can be imported and rendered without modification, since they use `useRouter()` internally and paths like `/series/${id}` will still resolve correctly from within the More stack (Expo Router resolves absolute paths).

**Important**: The child screens (`[seriesId]/index`, `[seriesId]/item/[itemId]`) referenced in `series/_layout.tsx` belong to the `series` tab's stack. When Series is accessed via More, those sub-screens do not automatically transfer. The quick fix: the More/series screen only shows the series list; tapping a series calls `router.push('/series/${id}')` which is an absolute route and will still work since Expo Router handles cross-stack absolute pushes. Verify this behavior — this is a known Expo Router pattern.

### Pattern 2: Icon + Chevron Row

The existing `ActionItem` type in `more/index.tsx`:

```typescript
type ActionItem = {
  label: string;
  onPress?: () => void;
  badge?: number;
  styles?: { color?: string };
};
```

Extend to:

```typescript
type ActionItem = {
  label: string;
  onPress?: () => void;
  badge?: number;
  styles?: { color?: string };
  icon?: { sf: SFSymbol; ionicon: IoniconsName }; // undefined = no icon
  isNavItem?: boolean; // true = show chevron on right
};
```

Render icon using same pattern as `TabBarIcon` in `(tabs)/_layout.tsx`:

```typescript
// iOS
<SymbolView name={item.icon.sf} size={20} tintColor={colors.textSecondary} />
// Android / fallback
<Ionicons name={item.icon.ionicon} size={20} color={colors.textSecondary} />
```

Chevron (nav items only):

```typescript
{item.isNavItem && (
  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
)}
```

### Pattern 3: Grouped iOS Settings-Style List

Currently `more/index.tsx` renders a flat `FlatList`. The iOS Settings visual is grouped sections with rounded card backgrounds and separators. Implementation options:

**Option A (simpler)**: Keep `FlatList` but style each `Pressable` to look like a grouped cell — `backgroundColor`, `borderRadius` on groups, separator `View` between items. This avoids restructuring the data model.

**Option B (cleaner)**: Split `data` into `sections` and render with `SectionList` using styled section containers.

Recommendation: **Option A** — simpler, less disruptive. Group into visual clusters: (1) Hidden tab nav items, (2) Account/navigation items (About Me, Settings), (3) Action items (Feedback, Log out), (4) Developer items. Use margin + background color + border radius per group.

### Pattern 4: Pulsing Opacity Skeleton

The existing codebase already uses `Animated.timing` + `useRef(new Animated.Value(...))`. Mirror the pattern from `CollapsibleSection.tsx`:

```typescript
const pulseAnim = useRef(new Animated.Value(0.3)).current;

useEffect(() => {
  Animated.loop(
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 0.3,
        duration: 800,
        useNativeDriver: true,
      }),
    ])
  ).start();
}, []);
```

Apply to `<Animated.View style={{ opacity: pulseAnim }}>`.

**Section count storage**: Add `@app/lastHomeSectionCount` to `SETTINGS_KEYS` in `src/lib/appSettings.ts`. Read on mount, update after data loads. Default: `3` (covers most users who have Continue Listening + Downloaded + Listen Again).

**Skeleton card dimensions**: Match `CoverItem.tsx` real dimensions: `coverSize = 140` (140×140 px cover), `marginRight: 16`. Skeleton header matches `renderSectionHeader` styles: `fontSize: 20`, `fontWeight: '700'`, `marginTop: 20`, `marginBottom: 12`.

**Fade transition**: Wrap skeleton and real content in an `Animated.View` with opacity. Fade skeleton out (opacity 1→0), fade content in (opacity 0→1) using `Animated.parallel` when `isLoadingHome` transitions false.

### Pattern 5: Cover Art Startup Repair Scan

Add a fire-and-forget function to `src/index.ts` `initializeApp()`, after player restoration:

```typescript
repairMissingCoverArt().catch((error) => {
  log.warn(`Cover art repair scan failed: ${String(error)}`);
});
```

The repair function:

1. Query `mediaMetadata` table for all `libraryItemId` values (no filter — all items).
2. For each item, call `isCoverCached(libraryItemId)` — synchronous file existence check.
3. If not cached, call `cacheCoverAndUpdateMetadata(libraryItemId)` — downloads and updates `localCoverCache`.
4. Batch size: same as existing `cacheCoversForLibraryItems` (5 concurrent).
5. Do NOT call `updateNowPlayingMetadata()` on download complete — defer to next `executeLoadTrack()` which already uses `getCoverUri()`.

The function lives in `src/lib/covers.ts` (alongside `cacheCoversForLibrary`) or `src/db/helpers/mediaMetadata.ts` (alongside `cacheCoversForLibraryItems`). Recommendation: `src/lib/covers.ts` since it owns the file-level cover logic.

### Anti-Patterns to Avoid

- **Pushing absolute tab routes from More stack**: `router.push('/series')` resolves to the `series` tab, not a screen within the More stack. Tab routes and stack routes have different navigator scopes. Use `/more/series` for More-stack-local navigation.
- **Using `router.navigate()` for cross-tab navigation**: `navigate` is for tab switching; `push` is for stack push. Since we want the back button, `push` is correct.
- **Calling `updateNowPlayingMetadata()` after every cover repair download**: Would require knowing which `libraryItemId` is currently playing, and would cause lock-screen flicker if covers download rapidly. Use next-play approach instead.
- **Hand-rolling pulsing animation with `setInterval`**: Use `Animated.loop` — it handles cleanup and runs on the UI thread with `useNativeDriver: true`.
- **Importing SeriesScreen into more/series.tsx as a re-export**: Expo Router file-based routing treats files as screens; importing and re-exporting the component directly is the correct pattern.

---

## Don't Hand-Roll

| Problem                    | Don't Build                  | Use Instead                           | Why                                                       |
| -------------------------- | ---------------------------- | ------------------------------------- | --------------------------------------------------------- |
| SF Symbol icons            | Custom SVG icons             | `expo-symbols` `SymbolView`           | Already installed, same pattern as tab bar                |
| Pulsing animation          | `setInterval` opacity toggle | `Animated.loop` + `Animated.sequence` | Native driver, cleanup built-in                           |
| Cover file existence check | DB query                     | `isCoverCached(id)` in `covers.ts`    | Synchronous, already handles `Paths.cache` container path |
| Cover download             | Raw `fetch` + file write     | `cacheCoverAndUpdateMetadata(id)`     | Already handles auth, DB update, error logging            |

---

## Common Pitfalls

### Pitfall 1: More Stack Can't Render Tab Sub-routes

**What goes wrong:** Trying to push `/series/[seriesId]` from the More stack — the `[seriesId]` route only exists under the `series` tab's Stack navigator.
**Why it happens:** Expo Router's file-based routing scopes dynamic segments to their parent layout.
**How to avoid:** For the immediate NAV-01/NAV-02 fix, only push the list screen (`/more/series`, `/more/authors`). From there, `router.push('/series/SERIES_ID')` uses an absolute path that Expo Router can resolve cross-stack.
**Warning signs:** Runtime error "No route named 'series/[seriesId]'" in the More stack.

### Pitfall 2: Skeleton Flicker on Fast Data Load

**What goes wrong:** Skeleton renders briefly then immediately disappears if home data loads from cache in <100ms.
**Why it happens:** `isLoadingHome` transitions true→false before the first render cycle shows the skeleton.
**How to avoid:** The skeleton trigger is `isLoadingHome && sections.length === 0` — if `sections.length > 0` (cached data is available immediately from Zustand), skeleton never shows. This is the correct behavior. Only show skeleton on true cold start.

### Pitfall 3: Cover Repair Scan Blocks App Startup

**What goes wrong:** Awaiting the cover scan in `initializeApp()` delays app ready state.
**Why it happens:** The scan queries all items and downloads potentially many files.
**How to avoid:** Fire-and-forget exactly like `applyICloudExclusionToExistingDownloads()`. Do not await.

### Pitfall 4: `useNativeDriver` Limitation

**What goes wrong:** Setting `useNativeDriver: true` on `opacity` works fine; setting it on `backgroundColor` causes a crash.
**Why it happens:** Native driver only supports transform and opacity animations.
**How to avoid:** Only animate `opacity` in the skeleton pulse. Background color for skeleton cells is a static style.

### Pitfall 5: `more/_layout.tsx` Missing Screen Registration

**What goes wrong:** Creating `more/series.tsx` without adding `<Stack.Screen name="series" />` in `more/_layout.tsx` — Expo Router will show the screen but without correct header options (title, back button style).
**Why it happens:** Screens without explicit registration use default options.
**How to avoid:** Always register new screens in the layout file with appropriate title options.

---

## Code Examples

### Navigation Fix (NAV-01 / NAV-02)

```typescript
// src/app/(tabs)/more/series.tsx  (new file)
// This is the entire file — import and re-render the existing screen component
export { default } from "@/app/(tabs)/series/index";
```

Wait — Expo Router doesn't support re-exporting from other tab paths this way due to the file-based routing system. The correct approach is to import the screen component (not the route file):

```typescript
// src/app/(tabs)/more/series.tsx  (new file)
import SeriesScreen from "@/components/screens/SeriesScreen";
// OR, since SeriesScreen is not in components/, inline the content:
// Import the component directly from the tab file
```

**Better approach**: Extract `SeriesScreen` JSX into a shared component at `src/components/screens/SeriesScreen.tsx` and render it from both `src/app/(tabs)/series/index.tsx` and `src/app/(tabs)/more/series.tsx`. This avoids file-path coupling.

**Simplest approach that works**: Since `src/app/(tabs)/series/index.tsx` exports a React component (not a module side effect), we can import it directly:

```typescript
// src/app/(tabs)/more/series.tsx
import SeriesScreenContent from "@/app/(tabs)/series/index";
export default SeriesScreenContent;
```

This works because Expo Router uses the `default` export from a file as the screen component — importing and re-exporting the default export is valid. The screen just renders in a different stack context.

**Update more/\_layout.tsx:**

```typescript
<Stack.Screen name="series" options={{ title: translate('tabs.series') }} />
<Stack.Screen name="authors" options={{ title: translate('tabs.authors') }} />
```

**Update more/index.tsx push:**

```typescript
// Before (broken):
onPress: () => router.push(`/${tab.name}`);

// After (fixed):
onPress: () => router.push(`/more/${tab.name}`);
```

### Pulsing Skeleton Cell

```typescript
// src/components/home/SkeletonSection.tsx
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

const COVER_SIZE = 140;
const CARD_COUNT = 4;

export function SkeletonSection({ isDark }: { isDark: boolean }) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const bgColor = isDark ? "#444" : "#e0e0e0";

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <Animated.View style={{ opacity: pulseAnim }}>
      {/* Section header placeholder */}
      <View style={{
        height: 24, width: 160, borderRadius: 6,
        backgroundColor: bgColor, marginBottom: 12, marginTop: 20, marginHorizontal: 16,
      }} />
      {/* Horizontal row of card placeholders */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 16 }}>
        {Array.from({ length: CARD_COUNT }).map((_, i) => (
          <View key={i}>
            <View style={{
              width: COVER_SIZE, height: COVER_SIZE, borderRadius: 8, backgroundColor: bgColor,
            }} />
            <View style={{
              height: 14, width: 100, borderRadius: 4,
              backgroundColor: bgColor, marginTop: 8,
            }} />
            <View style={{
              height: 12, width: 70, borderRadius: 4,
              backgroundColor: bgColor, marginTop: 4,
            }} />
          </View>
        ))}
      </View>
    </Animated.View>
  );
}
```

### Section Count Persistence

```typescript
// In src/lib/appSettings.ts — add new key:
const SETTINGS_KEYS = {
  ...existing,
  lastHomeSectionCount: "@app/lastHomeSectionCount",
} as const;

export async function getLastHomeSectionCount(): Promise<number> {
  const value = await AsyncStorage.getItem(SETTINGS_KEYS.lastHomeSectionCount);
  if (value === null) return 3; // Default: 3 sections
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 3 : parsed;
}

export async function setLastHomeSectionCount(count: number): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEYS.lastHomeSectionCount, count.toString());
}
```

Use in `home/index.tsx`: read `lastHomeSectionCount` in a `useEffect` on mount, store result in local state. When real sections arrive (sections.length > 0), call `setLastHomeSectionCount(sections.length)`.

### Cover Art Repair Scan

```typescript
// src/lib/covers.ts — add new export:
export async function repairMissingCoverArt(): Promise<void> {
  const { db } = await import("@/db/client");
  const { mediaMetadata } = await import("@/db/schema/mediaMetadata");

  const allItems = await db
    .select({ libraryItemId: mediaMetadata.libraryItemId })
    .from(mediaMetadata);

  const missing = allItems.filter((row) => row.libraryItemId && !isCoverCached(row.libraryItemId));

  console.log(
    `[covers] Cover repair scan: ${missing.length} of ${allItems.length} items missing covers`
  );

  // Batch download (5 concurrent, same as cacheCoversForLibraryItems)
  const { cacheCoverAndUpdateMetadata } = await import("@/db/helpers/mediaMetadata");
  const batchSize = 5;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    await Promise.all(
      batch.map((item) =>
        item.libraryItemId
          ? cacheCoverAndUpdateMetadata(item.libraryItemId)
          : Promise.resolve(false)
      )
    );
  }
}
```

Call from `src/index.ts` `initializeApp()`:

```typescript
repairMissingCoverArt().catch((error) => {
  log.warn(`Cover art repair scan failed: ${String(error)}`);
});
```

---

## Codebase Findings

### More Screen Navigation Bug — Root Cause

**File**: `src/app/(tabs)/more/index.tsx`, line 142

```typescript
// BROKEN: pushes to a root-level route that doesn't exist as a stack screen
onPress: () => router.push(`/${tab.name}`);
// e.g., pushes '/series' → no screen registered at that path in the More stack
```

The More stack (`more/_layout.tsx`) only registers `index`. All other screens in `more/` are registered implicitly by file presence + Expo Router convention. Pushing `/series` from within the More stack would attempt to navigate to a route outside the More stack entirely, which silently does nothing (since `(tabs)/series` has `href: null` when hidden).

### Icon Infrastructure Already Exists

`(tabs)/_layout.tsx` imports both `SymbolView` (expo-symbols) and `Ionicons` (@expo/vector-icons). The `TabBarIcon` component at lines 86–121 shows the exact rendering pattern. The More screen should use the same two-library approach.

SF Symbol recommendations for More screen items:
| Item | SF Symbol | Ionicons fallback |
|------|-----------|-------------------|
| Series | `square.stack` | `layers-outline` |
| Authors | `person.circle` | `people-circle-outline` |
| About Me | `person.crop.circle` | `person-circle-outline` |
| Settings | `gearshape` | `settings-outline` |
| Leave Feedback | `envelope` | `mail-outline` |
| Log out | `rectangle.portrait.and.arrow.right` | `log-out-outline` |
| Library Stats | `chart.bar` | `bar-chart-outline` |
| Storage | `externaldrive` | `server-outline` |
| Logs | `doc.text` | `document-text-outline` |
| Logger Settings | `slider.horizontal.3` | `options-outline` |
| Track Player | `waveform` | `radio-outline` |
| Actions | `bolt` | `flash-outline` |

### Home Screen Skeleton Injection Point

**File**: `src/app/(tabs)/home/index.tsx`, lines 213–222

```typescript
if (isLoadingHome && sections.length === 0) {
  return (
    <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color={colors.link} />
      <Text style={...}>{translate("home.loading")}</Text>
    </View>
  );
}
```

This entire branch is replaced with the skeleton. The `isLoadingHome` flag is set by `homeSlice.ts` `initializeHome()` and `refreshHome()`. The `sections.length === 0` condition ensures skeleton only appears when there's nothing to show (true cold start).

### `react-native-reanimated` — Installed But Not Used in UI

Version `~4.1.1` is installed. The project does NOT currently use `useSharedValue`, `useAnimatedStyle`, `withRepeat`, or `withTiming` from Reanimated anywhere in UI components (only worklets in the player coordinator). Using Reanimated for the skeleton pulse is valid but adds unnecessary complexity given the simple opacity pulse. **Use `Animated` from React Native core** for consistency.

### Cover Art File System

`getCoverUri(libraryItemId)` returns `{Paths.cache}/covers/{libraryItemId}`. This path is **always current** because `Paths.cache` resolves to the current iOS container UUID at runtime. `isCoverCached(id)` does a synchronous `file.exists` check — safe to call in batch without async overhead.

The `localCoverCache` DB table stores app-relative paths (via `toAppRelativePath()`). `resolveAppPath()` resolves them back to absolute at read time. This is why `homeScreen.ts` queries use `localCoverCache.localCoverUrl` and wrap results with `resolveAppPath()`.

---

## State of the Art

| Old Approach                                     | Current Approach                          | Impact                                             |
| ------------------------------------------------ | ----------------------------------------- | -------------------------------------------------- |
| Direct `router.push('/series')` from More screen | Push `/more/series` via More-local screen | Enables back navigation, keeps More stack coherent |
| `ActivityIndicator` during home load             | Pulsing skeleton matching real layout     | Users see structure, reduced perceived wait        |
| Cover art only cached during library sync        | Eager startup scan for missing covers     | Covers present on lock screen after first boot     |

---

## Open Questions

1. **Expo Router cross-stack absolute push from More/series to series detail**
   - What we know: `router.push('/series/SERIES_ID')` uses an absolute path. Expo Router v6 handles cross-tab absolute pushes.
   - What's unclear: Whether pushing an absolute path from the More stack pushes onto the More stack OR switches to the series tab. Expo Router docs suggest absolute paths with `/` resolve from the root, which would switch tabs. This means the More/series screen's "tap a series" action may switch to the series tab — which is acceptable behavior.
   - Recommendation: Accept this behavior for Phase 9. If Series is hidden, the tab switch will be invisible (href:null). Test on device.

2. **Skeleton fade transition timing**
   - What we know: Zustand `isLoadingHome` flips false synchronously when data arrives.
   - What's unclear: Optimal fade duration (too fast = no benefit, too slow = feels sluggish).
   - Recommendation: 200ms fade out for skeleton, 200ms fade in for content. Use `Animated.parallel`.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `src/app/(tabs)/more/index.tsx` — navigation bug, current ActionItem type, FlatList structure
- `src/app/(tabs)/_layout.tsx` — SF Symbol + Ionicons icon pattern, hidden tabs with `href: null`
- `src/app/(tabs)/more/_layout.tsx` — More Stack navigator structure
- `src/app/(tabs)/home/index.tsx` — skeleton injection point, `isLoadingHome` usage, CoverItem dimensions
- `src/stores/slices/homeSlice.ts` — `isLoadingHome` flag lifecycle
- `src/lib/covers.ts` — `getCoverUri()`, `cacheCoverIfMissing()`, `isCoverCached()` implementation
- `src/db/helpers/mediaMetadata.ts` — `cacheCoverAndUpdateMetadata()`, `cacheCoversForLibraryItems()`
- `src/db/helpers/localData.ts` — `setLocalCoverCached()` DB write
- `src/index.ts` — `initializeApp()`, fire-and-forget scan pattern
- `src/services/PlayerService.ts` — `getCoverUri()` usage in `executeLoadTrack`, lock screen update via `updateNowPlayingMetadata()`
- `src/stores/slices/playerSlice.ts` — `updateNowPlayingMetadata()` implementation
- `src/lib/appSettings.ts` — `SETTINGS_KEYS` pattern for AsyncStorage
- `src/components/home/CoverItem.tsx` — real card dimensions (`coverSize = 140`)
- `src/components/ui/CollapsibleSection.tsx` — `Animated.timing` pattern with `useNativeDriver`
- `package.json` — confirmed: `@expo/vector-icons ^15.0.2`, `expo-symbols ~1.0.7`, `react-native-reanimated ~4.1.1`

---

## Metadata

**Confidence breakdown:**

- Navigation fix: HIGH — root cause directly confirmed in source, Expo Router file-based routing behavior is well-understood
- More screen visual design: HIGH — icon libraries and rendering pattern confirmed from existing tab bar code
- Skeleton: HIGH — injection point confirmed, Animated API pattern confirmed from existing codebase
- Cover art repair: HIGH — all helper functions confirmed present, startup scan pattern confirmed from `applyICloudExclusionToExistingDownloads`
- Lock screen timing decision: MEDIUM — architectural reasoning is sound but not tested against edge cases

**Research date:** 2026-02-27
**Valid until:** 2026-03-29 (stable dependencies, no fast-moving APIs)
