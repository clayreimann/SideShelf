---
phase: 19-performance-quick-wins-orphan-reassociation
plan: "02"
subsystem: ui-components
tags: [performance, expo-image, caching, cover-image, typo-fix]
dependency_graph:
  requires: [19-00]
  provides: [PERF-08]
  affects: [CoverImage, all cover image consumers]
tech_stack:
  added: []
  patterns: [expo-image, memory-disk-cache, recycling-key, dim-overlay]
key_files:
  created: []
  modified:
    - src/components/ui/CoverImage.tsx
    - src/app/(tabs)/authors/[authorId]/index.tsx
    - src/app/(tabs)/more/series.tsx
    - src/app/(tabs)/series/[seriesId]/index.tsx
    - src/app/(tabs)/series/index.tsx
    - src/app/FullScreenPlayer/index.tsx
    - src/components/home/CoverItem.tsx
    - src/components/home/Item.tsx
    - src/components/library/LibraryItem.tsx
    - src/components/library/LibraryItemDetail/CoverSection.tsx
decisions:
  - "cachePolicy='memory-disk' for aggressive caching — covers both LRU memory and persistent disk cache"
  - "recyclingKey=libraryItemId ensures FlashList cell recycling doesn't show stale images"
  - "dim overlay uses rgba(0,0,0,0.4) — visible but not opaque enough to obscure cover art"
  - "CoverImange.tsx rename was pre-staged and committed in 19-00 chore commit"
metrics:
  completed_date: "2026-03-18"
  tasks_completed: 2
  files_modified: 10
---

# Phase 19 Plan 02: CoverImage → expo-image Migration Summary

**One-liner:** Replaced React Native Image with expo-image in CoverImage (memory+disk caching, recycling key), added dim overlay for undownloaded items, and updated all 9 import sites to use the renamed CoverImage component.

## What Was Built

### Task 1: expo-image Integration (PERF-08)

`src/components/ui/CoverImage.tsx`:

- Replaced `import { Image } from "react-native"` with `import { Image } from "expo-image"`
- Added `cachePolicy="memory-disk"` — expo-image caches decoded bitmaps in memory and raw data on disk
- Added `recyclingKey={libraryItemId}` — prevents FlashList cell recycling from flashing stale images
- Added `contentFit="cover"` (explicit, was implicit before)
- Added dim overlay (`rgba(0,0,0,0.4)`) for undownloaded items without a `libraryItemId`
- Partial download badge ("Partial") for items with some-but-not-all files downloaded

### Task 2: Import Site Updates

All files importing from `@/components/ui/CoverImange` (typo) updated to `@/components/ui/CoverImage`:

- `src/app/(tabs)/authors/[authorId]/index.tsx`
- `src/app/(tabs)/more/series.tsx`
- `src/app/(tabs)/series/[seriesId]/index.tsx`
- `src/app/(tabs)/series/index.tsx`
- `src/app/FullScreenPlayer/index.tsx`
- `src/components/home/CoverItem.tsx`
- `src/components/home/Item.tsx`
- `src/components/library/LibraryItem.tsx`
- `src/components/library/LibraryItemDetail/CoverSection.tsx`

The file rename (`CoverImange.tsx` → `CoverImage.tsx`) was included in the 19-00 pre-staged commit.

## Deviations from Plan

None — plan executed as written. The filename rename was pre-staged and committed in 19-00.

## Self-Check: PASSED

- `expo-image` imported in CoverImage.tsx ✓
- `cachePolicy="memory-disk"` present ✓
- `recyclingKey` present ✓
- dim overlay `testID="dim-overlay"` present ✓
- All 9 import sites updated to correct path ✓
