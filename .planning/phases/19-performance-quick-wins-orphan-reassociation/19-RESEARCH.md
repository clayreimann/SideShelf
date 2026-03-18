# Phase 19: Performance Quick Wins + Orphan Reassociation - Research

**Researched:** 2026-03-17
**Domain:** React Native list performance (FlashList, FlatList memoization), expo-image caching, performance measurement, async concurrency, leak cleanup, orphan file DB repair
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Orphan reassociation UX (DEBT-02)**

- "Associate" means re-inserting the missing DB row for that file under the known `libraryItemId` — no item picker needed (the `OrphanFile` type already carries `libraryItemId`)
- Confirmation flow: look up item title by `libraryItemId`, show Alert: "This file belongs to [Title] — repair download record?" with Cancel / Repair
- After confirmation: re-insert appropriate DB record (audioFiles or libraryFiles based on file extension/type), refresh download store, remove orphan from orphan list
- Row affordance: add a link/chain icon button alongside existing trash icon — tap link → confirmation alert; trash behavior unchanged

**FlashList migration (PERF-01)**

- Mode switch strategy: keep `key={viewMode-numColumns}` remount pattern — acceptable cost, preserves current behavior
- `estimatedItemSize`: Claude's discretion — measure from existing `LibraryItem` component styles
- `getItemType`: return `'grid'` or `'list'` based on current `viewMode` prop
- `@shopify/flash-list` must be installed as a new dependency (NOT currently in node_modules)

**expo-image for CoverImage (PERF-08)**

- Cache policy: `cachePolicy='memory-disk'`
- Cache key: `recyclingKey={libraryItemId}` when `libraryItemId` is available
- Overlay preservation: existing offline icon (top-right) and partial badge (top-left amber chip) remain as View overlays — no changes to overlay logic
- Title fallback: when `uri` is null, keep existing Text fallback — do NOT use expo-image placeholder
- Undownloaded item dimming: add semi-transparent dark overlay (40% opacity black `View`) over cover when item has `libraryItemId` but is NOT downloaded — sits between expo-image and icon overlays (z-order: image → dim overlay → offline icon → partial badge)
- Rename file from `CoverImange.tsx` (typo) to `CoverImage.tsx` — update all imports

### Claude's Discretion

- ChapterList memoized renderItem + getItemLayout implementation details (PERF-02)
- Direct import rewrites for root layout icons, AuthProvider, statisticsSlice (PERF-04)
- react-native-performance TTI mark placement (PERF-05) — fire on home screen after skeleton fades and real content renders
- Promise.all for AuthProvider storage reads (PERF-06) — mechanical concurrent refactor
- Coordinator deferred init placement (PERF-07) — move from module scope into initializeApp()
- ChapterList useEffect cleanup returns (PERF-09) — add return () => clearTimeout(id) to each setTimeout useEffect
- NetInfo unsubscribe capture and interval clearing (PERF-10) — capture addEventListener return value, call in resetNetwork()
- Exact dim overlay opacity (40% is starting point; adjust if too heavy/light)

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
  </user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                     | Research Support                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| PERF-01 | LibraryItemList uses FlashList with `estimatedItemSize` and `getItemType` for grid/list modes                                   | FlashList API documented below; existing FlatList in LibraryItemList.tsx fully mapped                                                |
| PERF-02 | ChapterList `renderItem` memoized with `useCallback` and has `getItemLayout` for fixed-height rows                              | Two ChapterList files identified; player/ChapterList.tsx uses FlatList, detail/ChapterList.tsx uses map — different treatment needed |
| PERF-04 | Root layout uses direct icon imports; AuthProvider and statisticsSlice use direct `@/db/helpers` imports                        | Barrel import locations identified in \_layout.tsx, AuthProvider.tsx, statisticsSlice.ts                                             |
| PERF-05 | TTI baseline with `react-native-performance` — `performance.mark('screenInteractive')` on home screen                           | Home screen fade-in animation is the right injection point; library NOT installed                                                    |
| PERF-06 | AuthProvider secure storage reads run concurrently via `Promise.all`                                                            | Sequential reads in AuthProvider useEffect identified — `apiClientService.initialize()` → `getStoredUsername()` are the target       |
| PERF-07 | Coordinator instantiation deferred from module scope into `initializeApp()`                                                     | `const coordinator = getCoordinator()` at line 39 of index.ts is the module-scope call to move                                       |
| PERF-08 | `CoverImage` component uses `expo-image` for memory + disk caching                                                              | expo-image ~3.0.10 already installed; full migration spec in locked decisions                                                        |
| PERF-09 | ChapterList `useEffect` setTimeout calls return cleanup functions                                                               | Two setTimeout useEffects in player/ChapterList.tsx at lines 49 and 80 — both missing cleanup                                        |
| PERF-10 | `NetInfo.addEventListener` unsubscribe captured and called in `resetNetwork()`; `initializeNetwork()` clears existing intervals | networkSlice.ts line 108 discards the unsubscribe return value; resetNetwork() only clears setInterval handles                       |
| DEBT-02 | User can associate an orphaned downloaded file with a known library item from orphan management screen                          | OrphanFile type carries libraryItemId; storage.tsx trashAction pattern is the model; DB re-insertion path researched                 |

</phase_requirements>

---

## Summary

Phase 19 is two parallel workstreams of surgical, mechanical changes. The performance workstream (PERF-01 through PERF-10) contains no new user features — it is a series of drop-in replacements and leak patches across identified hotspots. The orphan reassociation workstream (DEBT-02) adds a single new affordance (link icon + alert flow) to the existing orphan rows in the Storage screen.

The codebase is well-understood. Every target file was read; no surprises were found. The only new dependencies are `@shopify/flash-list` (PERF-01) and `react-native-performance` (PERF-05) — both `expo-image` (PERF-08) and all other libraries are already installed. The orphan repair does not require a new DB helper file because `markAudioFileAsDownloaded` and `markLibraryFileAsDownloaded` in `localData.ts` are the correct insertion points.

The largest implementation risk is PERF-01 (FlashList): the grid layout uses `columnWrapperStyle` and a computed `numColumns`, both of which have FlashList equivalents but with slightly different prop names. The `key={viewMode-numColumns}` remount strategy is locked and sidesteps the most common FlashList migration gotcha.

**Primary recommendation:** Execute the phase as 4 focused plans — (1) list rendering (PERF-01, PERF-02), (2) startup and leak fixes (PERF-04, PERF-06, PERF-07, PERF-09, PERF-10), (3) CoverImage migration (PERF-08), (4) TTI baseline + orphan reassociation (PERF-05, DEBT-02).

---

## Standard Stack

### Core

| Library                  | Version             | Purpose                                              | Why Standard                                                                 |
| ------------------------ | ------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| @shopify/flash-list      | latest (2.x)        | Virtualized list with better recycling than FlatList | Industry standard for RN list performance; Shopify-maintained                |
| expo-image               | ~3.0.10 (INSTALLED) | Image component with memory+disk cache               | expo SDK aligned; replaces RN's Image; stale-while-revalidate support        |
| react-native-performance | latest              | PerformanceObserver + mark/measure API               | Shopify-maintained; wraps native Performance APIs; adds `performance.mark()` |

### Supporting

| Library                         | Version             | Purpose                                                          | When to Use                                               |
| ------------------------------- | ------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| @react-native-community/netinfo | ^11.4.1 (INSTALLED) | Network state; addEventListener returns unsubscribe              | Already used in networkSlice.ts                           |
| react-native (FlatList)         | 0.81.5 (INSTALLED)  | Still used in player/ChapterList.tsx — memoize but keep FlatList | ChapterList is not a grid; FlashList would add no benefit |

### Alternatives Considered

| Instead of               | Could Use               | Tradeoff                                                       |
| ------------------------ | ----------------------- | -------------------------------------------------------------- |
| @shopify/flash-list      | RecyclerListView        | FlashList is the modern successor; simpler API                 |
| expo-image               | RN's Image              | Already replaced; expo-image has caching RN Image lacks        |
| react-native-performance | manual Date.now() marks | react-native-performance surfaces marks in Flipper/Instruments |

**Installation (new packages only):**

```bash
npx expo install @shopify/flash-list react-native-performance
```

---

## Architecture Patterns

### PERF-01: FlashList Migration

**What:** Swap `FlatList` → `FlashList` in `LibraryItemList.tsx`. FlashList re-uses cell components (no unmount/remount on scroll) and requires `estimatedItemSize` for layout.

**Key API differences from FlatList:**

- `columnWrapperStyle` → does NOT exist in FlashList; use `ItemSeparatorComponent` or wrap items — for this grid, the gap is handled differently
- `numColumns` → FlashList supports `numColumns` identically
- `getItemType` → FlashList-specific prop; return a string per row type for recycling-pool isolation
- `estimatedItemSize` → required; used for scroll position estimation

**Sizing the library grid:**

- Grid mode: items fill 1/3 of screen width with `spacing.md` gaps (see `gridColumnWrapper: { gap: spacing.md, paddingHorizontal: spacing.md }`). A typical phone screen is ~390px; each cell is ~(390 - 16 - 16 - 8 - 8) / 3 ≈ 114px wide. Cover images are square-ish. Estimated grid item height: ~160px (cover ~114px + title text ~46px).
- List mode: full-width rows. Estimated list item height: ~80px.

**Recommended estimatedItemSize:** 160 (grid), 80 (list). Since FlashList takes a single `estimatedItemSize`, and the `key` remount already forces a fresh mount on mode switch, the correct value per render is whichever matches current `viewMode`.

**columnWrapperStyle gap in FlashList:** FlashList does not support `columnWrapperStyle`. Use the `contentContainerStyle` with horizontal padding and rely on the items themselves providing margin/gap. The existing `LibraryItem` in grid variant likely has its own margin. Verify during implementation — do not pad the `contentContainerStyle` the same way as FlatList's `columnWrapperStyle`.

```typescript
// Source: FlashList official docs / Shopify GitHub
import { FlashList } from "@shopify/flash-list";

<FlashList
  data={items}
  numColumns={numColumns}
  key={`${viewMode}-${numColumns}`}
  estimatedItemSize={viewMode === "grid" ? 160 : 80}
  getItemType={() => viewMode}   // isolates recycling pools per mode
  renderItem={({ item }) => <LibraryItem item={item} variant={viewMode} />}
  // columnWrapperStyle NOT supported — handle gap inside LibraryItem or via overrideItemLayout
  contentContainerStyle={[...]}
/>
```

**Anti-pattern:** Do NOT pass `columnWrapperStyle` to FlashList — it silently ignores it, leaving no visual gap between grid items. Inspect the `LibraryItem` grid variant for self-contained margins.

### PERF-02: ChapterList Memoization + getItemLayout

There are TWO ChapterList components with different rendering approaches:

**`src/components/player/ChapterList.tsx`** — uses FlatList directly.

- Add `useCallback` to `renderItem`
- Add `getItemLayout` — each chapter row is `paddingVertical: 12` top + bottom = 24px of padding, plus text height. The row renders two text lines: title (~20px) + timestamps (~16px) + marginBottom 4px ≈ 64px total. Use 64 as fixed height.
- `getItemLayout: (_, index) => ({ length: 64, offset: 64 * index, index })`

**`src/components/library/LibraryItemDetail/ChapterList.tsx`** — uses `displayedChapters.map()`, NOT FlatList. No `getItemLayout` applies. Memoize the `handleChapterPress` with `useCallback`.

### PERF-04: Direct Imports

Three files use barrel imports that delay module resolution:

1. **`src/app/_layout.tsx` line 14:** `import { FontAwesome6, MaterialCommunityIcons, Octicons } from "@expo/vector-icons"` — change to three direct imports:

   ```typescript
   import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
   import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
   import Octicons from "@expo/vector-icons/Octicons";
   ```

2. **`src/providers/AuthProvider.tsx` line 1:** `import { authHelpers, mediaProgressHelpers, userHelpers } from "@/db/helpers"` — change to direct file imports:

   ```typescript
   import { extractTokensFromAuthResponse } from "@/db/helpers/tokens";
   import { marshalUserFromAuthResponse, upsertUser } from "@/db/helpers/users";
   import {
     marshalMediaProgressFromAuthResponse,
     upsertMediaProgress,
   } from "@/db/helpers/mediaProgress";
   ```

   Note: existing code calls `authHelpers.extractTokensFromAuthResponse`, `userHelpers.marshalUserFromAuthResponse`, etc. — the direct imports must match the actual exported names in each helper file.

3. **`src/stores/slices/statisticsSlice.ts` line 10:** `import { statisticsHelpers } from "@/db/helpers"` — change to:
   ```typescript
   import * as statisticsHelpers from "@/db/helpers/statistics";
   ```
   (The CLAUDE.md rule: "Never import from `@/db/helpers` barrel inside `src/services/`" — slices are in `src/stores/slices/` and this restriction also applies to reduce startup cost.)

### PERF-05: TTI Mark

**`react-native-performance`** provides `performance.mark(name)` which surfaces in React Native DevTools / Flipper.

Placement in `src/app/(tabs)/home/index.tsx`: fire the mark inside the `useEffect` that triggers the fade-in animation — specifically after `contentOpacity.setValue(0)` and before `Animated.timing(...).start()`. This marks the moment content is interactive and fading in.

```typescript
// Source: react-native-performance README
import { performance } from "react-native-performance";

useEffect(() => {
  if (!isLoadingHome && sections.length > 0) {
    performance.mark("screenInteractive");
    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }
}, [isLoadingHome, sections.length]);
```

### PERF-06: Concurrent Auth Reads

In `AuthProvider.tsx` `useEffect` (lines 48–77), the current flow is sequential:

```typescript
await apiClientService.initialize(); // reads serverUrl + tokens from SecureStore
const username = await getStoredUsername(); // separate SecureStore read
```

These two reads are independent. Refactor:

```typescript
const [, username] = await Promise.all([apiClientService.initialize(), getStoredUsername()]);
```

Then the `getUserByUsername` call that depends on `username` follows after the `Promise.all`.

### PERF-07: Deferred Coordinator Init

In `src/index.ts` lines 38–40:

```typescript
// CURRENT — fires at module import time:
const coordinator = getCoordinator();
export { coordinator };
```

Move into `initializeApp()`:

```typescript
// AFTER — fires at runtime init:
export async function initializeApp(): Promise<void> {
  const coordinator = getCoordinator();
  // ... rest of init
}
```

The `export { coordinator }` must be removed or replaced with a getter function since `coordinator` would no longer be a module-level constant. Check all callers of `coordinator` from `src/index.ts` — the export is used by `export { coordinator }` on line 40 but appears to not be imported elsewhere (the coordinator is accessed via `getCoordinator()` in services). Verify with grep before removing.

### PERF-08: CoverImage Migration

Full file replacement of `src/components/ui/CoverImange.tsx` → `src/components/ui/CoverImage.tsx`.

**Key expo-image props:**

```typescript
import { Image } from "expo-image";  // named export

<Image
  source={{ uri }}
  style={{ width: "100%", height: "100%" }}
  contentFit="cover"          // replaces resizeMode="cover"
  cachePolicy="memory-disk"   // persist to disk
  recyclingKey={libraryItemId}  // stable cache key per item
/>
```

**Z-order in JSX (bottom to top):**

1. `<Image>` (expo-image)
2. `<View>` dim overlay — shown when `libraryItemId && !isDownloaded`
3. `<View>` offline icon (top-right) — existing, unchanged
4. `<View>` partial badge (top-left amber chip) — existing, unchanged

**Dim overlay style:**

```typescript
// Between expo-image and offline icon in JSX
{libraryItemId && !isDownloaded && (
  <View style={styles.dimOverlay} />
)}

// In StyleSheet:
dimOverlay: {
  position: "absolute",
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.4)",
}
```

**File rename:** After creating `CoverImage.tsx`, search for all imports of `CoverImange` and update to `CoverImage`. The `src/components/ui/index.ts` barrel likely exports it — update there too.

### PERF-09: ChapterList setTimeout Cleanup

In `src/components/player/ChapterList.tsx`, two `useEffect` hooks call `setTimeout` without cleanup:

**Line 46–57:**

```typescript
// CURRENT:
setTimeout(() => {
  chapterListRef.current?.scrollToIndex({ ... });
  setHasScrolledToChapter(true);
}, 350);

// FIXED: capture and return
const id = setTimeout(() => {
  chapterListRef.current?.scrollToIndex({ ... });
  setHasScrolledToChapter(true);
}, 350);
return () => clearTimeout(id);
```

**Line 68–88 (second useEffect):**

```typescript
// CURRENT:
setTimeout(() => {
  chapterListRef.current?.scrollToIndex({ ... });
}, 100);

// FIXED:
const id = setTimeout(() => {
  chapterListRef.current?.scrollToIndex({ ... });
}, 100);
return () => clearTimeout(id);
```

Also the `onScrollToIndexFailed` handler at line 176–182 creates a `setTimeout` inside a Promise chain — this is in an event handler, not a useEffect, so it does not need a cleanup return, but the Promise itself could be improved. Leave as-is per scope.

### PERF-10: NetInfo Unsubscribe + Interval Guard

In `networkSlice.ts`:

**Problem 1 — unsubscribe not captured (line 108):**

```typescript
// CURRENT:
NetInfo.addEventListener((netState) => { ... });  // return value discarded

// FIXED: capture in module-scope variable (parallel to serverCheckInterval):
let netInfoUnsubscribe: (() => void) | null = null;
// inside initializeNetwork():
netInfoUnsubscribe = NetInfo.addEventListener((netState) => { ... });
```

**Problem 2 — resetNetwork() must call unsubscribe:**

```typescript
resetNetwork: () => {
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  if (serverCheckInterval) {
    clearInterval(serverCheckInterval);
    serverCheckInterval = null;
  }
  if (networkRefreshInterval) {
    clearInterval(networkRefreshInterval);
    networkRefreshInterval = null;
  }
  // ... rest of reset
};
```

**Problem 3 — initializeNetwork() must clear existing intervals before creating new ones** (prevents double-interval if called twice):

```typescript
initializeNetwork: () => {
  const state = get();
  if (state.network.initialized) {
    return;
  } // existing guard handles this
  // Clear any pre-existing intervals (defensive):
  if (serverCheckInterval) {
    clearInterval(serverCheckInterval);
    serverCheckInterval = null;
  }
  if (networkRefreshInterval) {
    clearInterval(networkRefreshInterval);
    networkRefreshInterval = null;
  }
  // ... rest of init
};
```

The existing `initialized` guard already prevents double-init in normal flow. The interval clearing is belt-and-suspenders for test/hot-reload scenarios.

### DEBT-02: Orphan Reassociation

**Data flow:**

1. `OrphanFile.libraryItemId` — directory name = library item ID (already known)
2. Title lookup: query `mediaMetadata` table by `libraryItemId` (same pattern used in `storage.tsx` lines 234–244)
3. File type determination: check `orphan.filename` extension:
   - `.mp3`, `.m4b`, `.m4a`, `.ogg`, `.opus`, `.flac`, `.aac` → audio file → call `markAudioFileAsDownloaded`
   - All other extensions → library file → call `markLibraryFileAsDownloaded`
4. After DB repair: call `useAppStore.getState().downloads.refreshDownloads()` (or equivalent refresh hook) to update the downloads store; remove orphan from `orphanFiles` state

**UI changes in `storage.tsx`:**

- Add `linkAction?: () => void` to the `ActionItem` type
- Populate `linkAction` on orphan rows (alongside existing `trashAction`)
- In `renderItem`, add a link icon `Pressable` button before the trash icon when `item.linkAction` is defined
- Use `Ionicons name="link-outline"` (already imported via `@expo/vector-icons`)

**Title lookup pattern (from storage.tsx lines 234–244):**

```typescript
const metadataRows = await db
  .select({ title: mediaMetadata.title })
  .from(mediaMetadata)
  .where(eq(mediaMetadata.libraryItemId, orphan.libraryItemId))
  .limit(1);
const title = metadataRows[0]?.title ?? translate("advanced.trackPlayer.unknownItem");
```

**associateOrphanFile callback (mirror of deleteOrphanFile):**

```typescript
const associateOrphanFile = useCallback(async (orphan: OrphanFile) => {
  // 1. Title lookup
  const metadataRows = await db.select({ title: mediaMetadata.title })
    .from(mediaMetadata).where(eq(mediaMetadata.libraryItemId, orphan.libraryItemId)).limit(1);
  const title = metadataRows[0]?.title ?? translate("advanced.trackPlayer.unknownItem");

  // 2. Confirmation alert
  Alert.alert(
    "Repair Download Record",
    `This file belongs to "${title}" — repair download record?`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Repair", onPress: () => void performAssociation(orphan) },
    ]
  );
}, []);

const performAssociation = async (orphan: OrphanFile) => {
  const log = logger.forTag("StorageScreen");
  try {
    const audioExtensions = [".mp3", ".m4b", ".m4a", ".ogg", ".opus", ".flac", ".aac", ".wav"];
    const ext = orphan.filename.slice(orphan.filename.lastIndexOf(".")).toLowerCase();
    if (audioExtensions.includes(ext)) {
      // Need audioFileId — this is the hard part; see Open Questions
      await markAudioFileAsDownloaded(/* audioFileId */, orphan.uri);
    } else {
      await markLibraryFileAsDownloaded(/* libraryFileId */, orphan.uri);
    }
    setOrphanFiles((prev) => prev.filter((f) => f.uri !== orphan.uri));
    // Refresh downloads store
  } catch (error) {
    log.error("[associateOrphanFile] Failed", error as Error);
  }
};
```

### Anti-Patterns to Avoid

- **FlashList + columnWrapperStyle:** FlashList does not support this prop. Do not pass it.
- **Object-returning selectors in CoverImage:** The component uses `useDownloads()` hook correctly — do not add `const { a, b } = useAppStore(state => ({ ... }))` patterns.
- **Awaiting coordinator in module scope:** The point of PERF-07 is to avoid any I/O-heavy work at module import time. `getCoordinator()` is sync but still initiates state machine infrastructure that should defer to runtime.
- **Sequential Promise chains where concurrent is safe:** The AuthProvider fix must use `Promise.all` — do not introduce new sequential awaits.

---

## Don't Hand-Roll

| Problem                                                  | Don't Build           | Use Instead                                   | Why                                                                            |
| -------------------------------------------------------- | --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| List virtualization with type-based recycling            | Custom recycler       | @shopify/flash-list `getItemType`             | FlashList handles pool isolation, blank-area avoidance, and scroll performance |
| Image disk cache + memory cache + stale-while-revalidate | Manual cache layer    | expo-image `cachePolicy='memory-disk'`        | expo-image implements RFC 7234 caching internally                              |
| Native performance marks                                 | Date.now() timestamps | react-native-performance `performance.mark()` | Surfaces in Flipper Performance plugin and Instruments; cross-platform         |

**Key insight:** All three "don't hand-roll" items have well-maintained Expo/Shopify libraries that handle the platform-specific edge cases (iOS container UUID rotation for image cache paths, scroll position estimation for virtualized lists, native bridging for performance marks).

---

## Common Pitfalls

### Pitfall 1: FlashList columnWrapperStyle

**What goes wrong:** FlatList uses `columnWrapperStyle` for gap between grid columns. FlashList does not support this prop. Grid items render with no gaps.
**Why it happens:** Developers copy FlatList props directly.
**How to avoid:** Remove `columnWrapperStyle`. Add horizontal margin to `LibraryItem` grid variant, or use `overrideItemLayout` for fine control.
**Warning signs:** Grid items appear flush with no spacing after migration.

### Pitfall 2: expo-image `contentFit` vs `resizeMode`

**What goes wrong:** `resizeMode="cover"` is a RN Image prop. expo-image uses `contentFit="cover"`.
**Why it happens:** Direct prop rename confusion.
**How to avoid:** Use `contentFit` — it accepts `'cover' | 'contain' | 'fill' | 'none' | 'scale-down'`.

### Pitfall 3: expo-image named export

**What goes wrong:** expo-image's `Image` is a named export, not default. `import Image from 'expo-image'` will be undefined.
**How to avoid:** `import { Image } from 'expo-image'`.

### Pitfall 4: coordinator export removal in PERF-07

**What goes wrong:** `export { coordinator }` from `src/index.ts` is removed, but something imports it.
**How to avoid:** Grep for `from "@/index"` or `from "src/index"` imports of `coordinator` before removing the export. If a caller needs the coordinator, it should call `getCoordinator()` directly.
**Warning signs:** TypeScript compile error "Module has no exported member 'coordinator'".

### Pitfall 5: Orphan association — audioFileId vs downloadPath

**What goes wrong:** `markAudioFileAsDownloaded(audioFileId, downloadPath)` requires the `audioFileId` as a primary key. An orphaned file's `OrphanFile` only carries `uri`, `filename`, `libraryItemId`, and `size` — not the audioFileId.
**Why it happens:** The orphan scanner identifies files by filesystem path, not DB identity.
**How to avoid:** See Open Questions below — this is the key resolution needed.

### Pitfall 6: NetInfo unsubscribe in tests

**What goes wrong:** The existing `networkSlice.test.ts` mocks `NetInfo.addEventListener` to return `jest.fn()` (an unsubscribe function). After PERF-10, `initializeNetwork()` assigns this return value to `netInfoUnsubscribe`. The test already mocks this correctly — no test changes needed for the mock setup, but tests that call `resetNetwork()` should verify the unsubscribe mock was called.

---

## Code Examples

### FlashList with getItemType

```typescript
// Source: @shopify/flash-list GitHub README + official docs
import { FlashList } from "@shopify/flash-list";

<FlashList
  data={items}
  numColumns={numColumns}
  key={`${viewMode}-${numColumns}`}
  estimatedItemSize={viewMode === "grid" ? 160 : 80}
  getItemType={(_item) => viewMode}  // 'grid' | 'list' — isolates recycling pools
  renderItem={({ item }) => <LibraryItem item={item} variant={viewMode} />}
  contentContainerStyle={[...existingStyles]}
/>
```

### expo-image with cachePolicy

```typescript
// Source: expo-image docs https://docs.expo.dev/versions/latest/sdk/image/
import { Image } from "expo-image";

<Image
  source={{ uri }}
  style={{ width: "100%", height: "100%" }}
  contentFit="cover"
  cachePolicy="memory-disk"
  recyclingKey={libraryItemId}
/>
```

### react-native-performance mark

```typescript
// Source: react-native-performance README https://github.com/Shopify/react-native-performance
import { performance } from "react-native-performance";

// In HomeScreen useEffect, before Animated.timing:
performance.mark("screenInteractive");
```

### useCallback memoized renderItem + getItemLayout

```typescript
// Memoized renderItem — stable reference across re-renders
const renderItem = useCallback(({ item, index }: { item: ChapterType; index: number }) => (
  <ChapterRow item={item} index={index} onPress={onChapterPress} />
), [onChapterPress]);

// getItemLayout — eliminates layout measurement on scroll
const ROW_HEIGHT = 64;
const getItemLayout = useCallback(
  (_: unknown, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }),
  []
);

<FlatList
  renderItem={renderItem}
  getItemLayout={getItemLayout}
  ...
/>
```

### Promise.all for auth reads

```typescript
// BEFORE (sequential):
await apiClientService.initialize();
const username = await getStoredUsername();

// AFTER (concurrent):
const [, username] = await Promise.all([apiClientService.initialize(), getStoredUsername()]);
```

---

## Open Questions

1. **DEBT-02: audioFileId for orphan repair**
   - What we know: `markAudioFileAsDownloaded(audioFileId, downloadPath)` needs the `audioFileId` primary key from the `audio_files` table. The orphan only knows its filesystem path and `libraryItemId`.
   - What's unclear: Can we reliably derive the `audioFileId` from the filename and `libraryItemId`? The `audioFiles` table has `filename`, `path`, and `mediaId` (FK to `mediaMetadata` which FK to `libraryItemId`). A join query can find the audio file row by filename + libraryItemId.
   - Recommendation: In `performAssociation`, run: `SELECT audio_files.id FROM audio_files JOIN media_metadata ON audio_files.media_id = media_metadata.id WHERE media_metadata.library_item_id = ? AND audio_files.filename = ?`. If found, use that `id` as `audioFileId`. If not found, the file cannot be reliably repaired (show a failure alert). This same pattern applies to `libraryFiles` for non-audio files (join via `libraryFiles.libraryItemId` directly).

2. **PERF-07: coordinator export callers**
   - What we know: `src/index.ts` exports `coordinator` from `getCoordinator()` at module scope (line 40).
   - What's unclear: Whether any other file imports `coordinator` from `@/index` vs calling `getCoordinator()` directly.
   - Recommendation: Before implementing PERF-07, grep for `coordinator` in all imports from `@/index`. If no callers, remove the export safely. If callers exist, change them to `import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator"` instead.

---

## Validation Architecture

### Test Framework

| Property           | Value                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| Framework          | Jest 29.7.0 + jest-expo                                                            |
| Config file        | `jest.config.js` (jest-expo preset)                                                |
| Quick run command  | `jest --testPathPattern="networkSlice\|ChapterList\|CoverImage" --passWithNoTests` |
| Full suite command | `npm test`                                                                         |

### Phase Requirements → Test Map

| Req ID  | Behavior                                                          | Test Type                                    | Automated Command                                          | File Exists?         |
| ------- | ----------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| PERF-01 | FlashList renders items in grid and list mode                     | manual smoke (no RN component test infra)    | N/A — manual UAT                                           | N/A                  |
| PERF-02 | getItemLayout returns correct offset for nth item                 | unit                                         | `jest src/components/player/__tests__/ChapterList.test.ts` | ❌ Wave 0            |
| PERF-04 | Build compiles with direct imports (no barrel)                    | TypeScript compile                           | `npx tsc --noEmit`                                         | N/A (compile check)  |
| PERF-05 | performance.mark called after content renders                     | unit (mock performance)                      | `jest src/app/**/__tests__/home.test.ts`                   | ❌ Wave 0 (optional) |
| PERF-06 | Promise.all issues concurrent reads                               | unit (spy on initialize + getStoredUsername) | `jest src/providers/__tests__/AuthProvider.test.ts`        | ❌ Wave 0 (optional) |
| PERF-07 | coordinator not initialized at module import                      | unit (import order test)                     | N/A — manual verify                                        | N/A                  |
| PERF-08 | CoverImage uses expo-image, dim overlay shown when not downloaded | unit                                         | `jest src/components/ui/__tests__/CoverImage.test.tsx`     | ❌ Wave 0            |
| PERF-09 | setTimeout cleanup returned from useEffect                        | unit (jest.useFakeTimers)                    | `jest src/components/player/__tests__/ChapterList.test.ts` | ❌ Wave 0            |
| PERF-10 | resetNetwork calls NetInfo unsubscribe                            | unit                                         | `jest src/stores/slices/__tests__/networkSlice.test.ts`    | ✅ EXISTS            |
| DEBT-02 | Associate action triggers DB repair and removes orphan from list  | unit (db test helper)                        | `jest src/lib/__tests__/orphanAssociation.test.ts`         | ❌ Wave 0            |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit && npm test -- --testPathPattern="networkSlice" --passWithNoTests`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/components/player/__tests__/ChapterList.test.ts` — covers PERF-02 (getItemLayout), PERF-09 (setTimeout cleanup)
- [ ] `src/components/ui/__tests__/CoverImage.test.tsx` — covers PERF-08 (expo-image usage, dim overlay)
- [ ] Framework install: `npx expo install @shopify/flash-list react-native-performance` — required before PERF-01 and PERF-05

The existing `networkSlice.test.ts` covers the PERF-10 mock setup but needs a new test case: `resetNetwork() calls the NetInfo unsubscribe function`. This is an addition to an existing file, not a new Wave 0 file.

---

## Sources

### Primary (HIGH confidence)

- Source code read directly — `src/components/library/LibraryItemList.tsx`, `src/components/ui/CoverImange.tsx`, `src/components/player/ChapterList.tsx`, `src/components/library/LibraryItemDetail/ChapterList.tsx`, `src/stores/slices/networkSlice.ts`, `src/stores/slices/statisticsSlice.ts`, `src/providers/AuthProvider.tsx`, `src/app/_layout.tsx`, `src/index.ts`, `src/app/(tabs)/more/storage.tsx`, `src/lib/orphanScanner.ts`, `src/db/helpers/localData.ts`
- `package.json` — confirmed `expo-image ~3.0.10` installed; `@shopify/flash-list` and `react-native-performance` NOT installed
- `node_modules` check — confirmed @shopify and react-native-performance absent

### Secondary (MEDIUM confidence)

- expo-image API (`contentFit`, `cachePolicy`, `recyclingKey`) — based on expo-image ~3.0.10 installed version; consistent with expo SDK 54 docs
- FlashList `getItemType`, `estimatedItemSize`, `numColumns` — well-documented stable API across Flash List 1.x and 2.x
- react-native-performance `performance.mark()` — standard Web Performance API polyfill; stable since 2021

### Tertiary (LOW confidence)

- Estimated item heights (160px grid, 80px list, 64px chapter row) — computed from StyleSheet values in source; not measured on device. These are starting values to tune after TTI baseline is established.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — installed packages verified from package.json and node_modules; new packages identified
- Architecture: HIGH — all target files read, current code behavior fully mapped
- Pitfalls: HIGH for known issues (FlashList columnWrapperStyle, expo-image props); MEDIUM for orphan audioFileId resolution (requires a DB query pattern that is new but straightforward)

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable libraries; expo-image and FlashList APIs are stable)
