# useEffect Data Loading Audit

**Date:** 2026-02-28
**Scope:** src/app/(tabs)/, src/app/, src/components/

## Summary

- **Total useEffect data-loading instances found: 14**
- Remove candidates: 1
- Centralize candidates: 5
- Consolidate candidates: 3
- Keep (legitimately local): 5

---

## Priority Fixes (Ordered by Impact)

**1. Remove `useEffect` in `ConsolidatedPlayerControls` for jump intervals**
`src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx` ~line 37

- Impact: HIGH — fires two AsyncStorage reads on every library item open while playing
- Fix: Replace with `const { jumpForwardInterval, jumpBackwardInterval } = useSettings()`
- Already in `settingsSlice` — `FullScreenPlayer` correctly uses `useSettings()` already

**2. Remove redundant `progressService.fetchServerProgress()` in `LibraryItemDetail`**
`src/components/library/LibraryItemDetail.tsx` ~line 175

- Impact: HIGH — every item detail open fires an HTTP request that is already triggered by `HomeScreen` on focus and `_layout.tsx` on foreground
- Fix: Remove the mount-time fetch from `LibraryItemDetail`

**3. Centralize `getUserByUsername` by adding `userId` to AuthProvider/authSlice**

- Impact: HIGH — eliminates 5+ repeated DB reads across HomeScreen, LibraryItemDetail, SeriesDetailScreen, handleToggleFinished
- Files: `src/app/(tabs)/home/index.tsx` (~118), `src/components/library/LibraryItemDetail.tsx` (~104, ~178, ~231), `src/app/(tabs)/series/[seriesId]/index.tsx` (~53)
- Fix: Store numeric userId in auth context at login time; expose via `useAuth()`

**4. Move author/series navigation IDs into `fetchItemDetails` store action**
`src/components/library/LibraryItemDetail.tsx` ~line 140

- Impact: MEDIUM — eliminates a separate useEffect with two parallel DB queries per item mount
- Fix: Include `getMediaAuthors`/`getMediaSeries` in `libraryItemDetailsSlice.fetchItemDetails`

**5. Simplify `MoreScreen` app version to synchronous reads**
`src/app/(tabs)/more/index.tsx` ~line 72

- Impact: LOW — `DeviceInfo.getVersion()` is synchronous; no useEffect needed
- Fix: Read at module scope or useMemo

---

## All Instances

### ConsolidatedPlayerControls — `src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx`

**Line:** ~37
**Loads:** Jump forward/backward intervals from AsyncStorage via `getJumpForwardInterval()` / `getJumpBackwardInterval()`
**Already in store:** YES — `settingsSlice` holds both values; `useSettings()` exposes them
**Also loaded in:** `FullScreenPlayer/index.tsx` correctly uses `useSettings()` instead
**Recommendation:** REMOVE
**Rationale:** Redundant AsyncStorage read when values are already in Zustand settingsSlice.

---

### LibraryItemDetail — `src/components/library/LibraryItemDetail.tsx`

**Line:** ~98
**Loads:** Item details from DB via `fetchItemDetails()` (libraryItemDetailsSlice action), `downloadService.repairDownloadStatus()`, `getUserByUsername()`
**Already in store:** fetchItemDetails → yes (correct pattern). getUserByUsername → should be in auth context.
**Recommendation:** CENTRALIZE (getUserByUsername only)
**Rationale:** `fetchItemDetails` is the right pattern. `getUserByUsername` is redundant — userId should come from auth context.

**Line:** ~140
**Loads:** Author and series IDs from DB via `getMediaAuthors(metadata.id)` and `getMediaSeries(metadata.id)` — used for navigation links
**Already in store:** No — author/series IDs not in libraryItemDetailsSlice (has names but not IDs)
**Also loaded in:** Nowhere else
**Recommendation:** CENTRALIZE — include in `fetchItemDetails`
**Rationale:** These DB reads belong in the store action alongside chapters/genres/tags already fetched there.

**Line:** ~169
**Loads:** Latest progress from server via `progressService.fetchServerProgress()`, then re-reads local progress from DB
**Already in store:** Yes — progress already in `cachedData.progress`
**Also loaded in:** Also triggered in HomeScreen on focus, \_layout.tsx on foreground, handleToggleFinished
**Recommendation:** REMOVE (the mount-time fetch only)
**Rationale:** Redundant HTTP request on every item open. Foreground and home-focus triggers already keep progress current.

---

### AuthorDetailScreen — `src/app/(tabs)/authors/[authorId]/index.tsx`

**Line:** ~37
**Loads:** Author record from DB via `getAuthorById(authorId)` when author not in store list
**Already in store:** Partially — authors list slice exists but may miss authors on deep link / cross-stack nav
**Recommendation:** CENTRALIZE
**Rationale:** Should be a `getAuthorById` store action with cache-miss DB fetch rather than raw DB call in screen.

---

### SeriesDetailScreen — `src/app/(tabs)/series/[seriesId]/index.tsx`

**Line:** ~48
**Loads:** Media progress for every book in series via `getMediaProgressForLibraryItem` (N+1 pattern) + `getUserByUsername`
**Already in store:** No dedicated series-progress structure
**Also loaded in:** Per-item progress also read in LibraryItemDetail.tsx (~169)
**Recommendation:** CENTRALIZE
**Rationale:** N+1 DB query — one call per book. Should be a bulk progress fetch or selector in the store. getUserByUsername redundant (see priority fix #3).

---

### LogsScreen + LoggerSettingsScreen — getAllTags duplication

**Lines:** LogsScreen ~366, LoggerSettingsScreen ~85
**Loads:** `getAllTags()` independently in both screens
**Recommendation:** CONSOLIDATE — expose `availableTags` in `loggerSlice`
**Rationale:** Same in-memory tag set fetched twice in separate screens. loggerSlice already tracks errorCount — add availableTags.

---

### MoreScreen — `src/app/(tabs)/more/index.tsx`

**Line:** ~72
**Loads:** App version / build number via `DeviceInfo.getVersion()` / `DeviceInfo.getBuildNumber()`
**Already in store:** No
**Recommendation:** REMOVE (simplify to module-scope constants)
**Rationale:** Both methods are synchronous — useEffect + useState pattern is unnecessary overhead.

---

### LibraryStatsScreen — `src/app/(tabs)/more/library-stats.tsx`

**Line:** ~43
**Loads:** Statistics counts via `refreshStatistics()` from `useStatistics` store slice (respects 1-min cache)
**Already in store:** Yes — statisticsSlice with cache
**Recommendation:** KEEP
**Rationale:** Correct store pattern usage — triggers refresh action which respects cache.

---

## Consolidation Opportunities

### `getUserByUsername` — 4+ locations

Called in HomeScreen, LibraryItemDetail (×3), SeriesDetailScreen, handleToggleFinished.
**Fix:** Add `userId` to `AuthProvider`/authSlice at login; expose via `useAuth()`.

### `progressService.fetchServerProgress()` — 4 locations

Mount trigger in LibraryItemDetail is redundant — app foreground and home focus already handle this.
**Fix:** Remove from LibraryItemDetail mount effect only.

### `getAllTags()` — 2 screens

LogsScreen and LoggerSettingsScreen independently fetch the same set.
**Fix:** Add `availableTags` to `loggerSlice`.

### Jump intervals — ConsolidatedPlayerControls vs FullScreenPlayer

ConsolidatedPlayerControls does AsyncStorage reads; FullScreenPlayer uses `useSettings()` correctly.
**Fix:** Align ConsolidatedPlayerControls to `useSettings()`.

---

_Audit completed: 2026-02-28_
