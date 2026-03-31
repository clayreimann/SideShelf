# Phase 19: Performance Quick Wins + Orphan Reassociation - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Two parallel workstreams:

1. **Performance quick wins (PERF-01, 02, 04–10):** Mechanical rendering and startup improvements — FlashList for the library list, expo-image for cover caching, TTI baseline mark, memory/subscriber leak fixes, concurrent auth reads, deferred coordinator init. No new user-visible features.
2. **Orphan reassociation (DEBT-02):** Adds an "associate" action to the existing orphan file rows in the Storage screen. Users can repair a missing DB record (linking the orphaned file back to the library item that owns its directory), not only delete it.

New capabilities (e.g., search-and-pick for arbitrary item association, cover-art dimming logic in list/grid cells outside CoverImage) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Orphan reassociation UX (DEBT-02)

- **What "associate" means:** The `OrphanFile` type already carries `libraryItemId` (from the file's directory location). "Associate" means re-inserting the missing DB row for that file under the known `libraryItemId` — no item picker needed.
- **Confirmation flow:** Look up the item title by `libraryItemId`, show an Alert: "This file belongs to [Title] — repair download record?" with Cancel / Repair. One-tap with context.
- **After confirmation:** Re-insert the appropriate DB record (audioFiles or libraryFiles, based on file extension/type), refresh the download store so the item shows as downloaded, remove the orphan from the orphan list.
- **Row affordance:** Add a link/chain icon button alongside the existing trash icon in each orphan row. Tap link → confirmation alert. Existing trash behavior unchanged.

### FlashList migration (PERF-01)

- **Mode switch strategy:** Keep the `key={viewMode-numColumns}` remount pattern. Grid↔list is a rare user action; the momentary remount cost is acceptable and preserves current behavior exactly.
- **estimatedItemSize:** Claude's discretion — measure from existing `LibraryItem` component styles and pick reasonable defaults (grid and list values differ). Can be tuned after TTI baseline is established.
- **getItemType:** Return `'grid'` or `'list'` based on current `viewMode` prop — FlashList uses this to recycle the correct cell type.
- **@shopify/flash-list** must be installed as a new dependency.

### expo-image for CoverImage (PERF-08)

- **Cache policy:** `cachePolicy='memory-disk'` — covers can change on the server (user updates cover art), so persistent disk cache with stale-while-revalidate is correct. Not immutable.
- **Cache key:** Use `recyclingKey={libraryItemId}` when `libraryItemId` is available, so the cache entry is keyed to the item rather than the exact URL (handles server URL token changes).
- **Overlay preservation:** The existing offline icon (top-right) and partial-download badge (top-left amber chip) remain as View overlays on top of expo-image — no changes to overlay logic.
- **Title fallback:** When `uri` is null, keep the existing Text fallback (item title centered in the cell). Do not replace with expo-image placeholder.
- **Undownloaded item dimming (new):** Add a semi-transparent dark overlay (40% opacity black `View`) over the cover when the item has `libraryItemId` but is NOT downloaded. This makes downloaded items stand out visually. Overlay sits between expo-image and the existing icon overlays (z-index order: image → dim overlay → offline icon → partial badge).
- **Note:** The file is currently named `CoverImange.tsx` (typo) — fix the typo to `CoverImage.tsx` during this migration.

### Claude's Discretion

- ChapterList memoized renderItem + getItemLayout implementation details (PERF-02)
- Direct import rewrites for root layout icons, AuthProvider, statisticsSlice (PERF-04) — mechanical find-and-replace
- react-native-performance TTI mark placement (PERF-05) — fire on home screen after skeleton fades and real content renders
- Promise.all for AuthProvider storage reads (PERF-06) — mechanical concurrent refactor
- Coordinator deferred init placement (PERF-07) — move from module scope into initializeApp()
- ChapterList useEffect cleanup returns (PERF-09) — add return () => clearTimeout(id) to each setTimeout useEffect
- NetInfo unsubscribe capture and interval clearing (PERF-10) — capture addEventListener return value, call in resetNetwork()
- Exact dim overlay opacity (40% is the starting point; adjust if too heavy/light)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Performance requirements

- `.planning/REQUIREMENTS.md` §Performance — PERF-01 through PERF-10 requirement specs
- `.planning/REQUIREMENTS.md` §Technical Debt — DEBT-02 requirement spec

### Existing code to modify

- `src/components/library/LibraryItemList.tsx` — FlatList → FlashList migration target
- `src/components/ui/CoverImange.tsx` — expo-image migration target (also rename file)
- `src/components/library/LibraryItemDetail/ChapterList.tsx` and `src/components/player/ChapterList.tsx` — memoization + getItemLayout targets
- `src/app/(tabs)/more/storage.tsx` — orphan row UI, add link icon + association handler
- `src/lib/orphanScanner.ts` — OrphanFile type reference (has libraryItemId)

### Integration points

- `src/providers/AuthProvider.tsx` — concurrent storage reads (PERF-06)
- `src/app/_layout.tsx` — coordinator deferred init (PERF-07), direct icon imports (PERF-04)
- `src/stores/slices/statisticsSlice.ts` — direct db/helpers import (PERF-04)
- `src/services/NetworkService.ts` (or equivalent) — NetInfo unsubscribe (PERF-10)
- `src/app/(tabs)/home/index.tsx` (or equivalent) — TTI mark placement (PERF-05)

No external specs — requirements are fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `OrphanFile` type (`src/lib/orphanScanner.ts`): Already has `libraryItemId` — association flow doesn't need a picker, just a title lookup + DB repair
- `deleteOrphanFile` callback in storage.tsx: Pattern to follow for the new `associateOrphanFile` callback
- `expo-image` (`~3.0.10`): Already installed — no new dependency needed for PERF-08
- `src/db/helpers/localData.ts`: `getAllDownloadedAudioFiles` / `getAllDownloadedLibraryFiles` — reference for what a valid DB record looks like; re-insertion should mirror these row shapes

### Established Patterns

- `key={viewMode-numColumns}` remount pattern: Preserved intentionally for FlashList — mode switch remount is acceptable
- Partial badge (top-left amber chip): Must survive CoverImage migration — overlay pattern unchanged
- `useDownloads()` store hook: Used in CoverImage to check `isItemDownloaded` — also drives the new dim overlay
- `useFloatingPlayerPadding()`: Used in LibraryItemList — must be preserved in FlashList migration (contentContainerStyle)
- Tagged logger (`logger.forTag`): Use in any new service-level code added for orphan reassociation

### Integration Points

- `src/app/(tabs)/more/storage.tsx` → orphan section (line ~559): Add link icon and `associateOrphanFile` handler alongside existing `trashAction`
- `src/components/ui/CoverImange.tsx` → full file swap from `Image` to `expo-image`, add dim overlay, rename file
- `src/components/library/LibraryItemList.tsx` → swap `FlatList` import to `FlashList` from `@shopify/flash-list`

</code_context>

<specifics>
## Specific Ideas

- "Fade undownloaded items so downloaded items stand out" — 40% opacity black overlay on non-downloaded covers. Downloaded items render at full brightness. This is a visual hierarchy signal, not a functional change.
- Orphan association: show item title in the confirmation alert so users know they're repairing the right item. The title lookup should use the existing DB (mediaMetadata or similar) by libraryItemId.
- CoverImange.tsx typo fix: rename to CoverImage.tsx as part of the migration — update all imports.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

_Phase: 19-performance-quick-wins-orphan-reassociation_
_Context gathered: 2026-03-17_
