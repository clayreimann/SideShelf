---
phase: 19-performance-quick-wins-orphan-reassociation
verified: 2026-03-18T00:00:00Z
status: gaps_found
score: 9/10 must-haves verified
re_verification: false
gaps:
  - truth: "Library item list uses FlashList with estimatedItemSize and getItemType for grid/list modes"
    status: partial
    reason: "FlashList is used and getItemType is present, but estimatedItemSize prop is absent from the FlashList component. PERF-01 per REQUIREMENTS.md requires both."
    artifacts:
      - path: "src/components/library/LibraryItemList.tsx"
        issue: "estimatedItemSize prop missing from <FlashList> — FlashList will emit a warning and fall back to auto-sizing, defeating the performance goal"
    missing:
      - "Add estimatedItemSize={viewMode === 'grid' ? 160 : 80} prop to the <FlashList> component in LibraryItemList.tsx"
  - truth: "REQUIREMENTS.md traceability table accurately reflects implementation status"
    status: failed
    reason: "PERF-04, PERF-07, and PERF-10 are marked 'Pending' in the REQUIREMENTS.md traceability table, but all three are fully implemented in code. The table was not updated after implementation."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "PERF-04 shows Pending (line 136), PERF-07 shows Pending (line 139), PERF-10 shows Pending (line 142) — code evidence confirms all three are implemented"
    missing:
      - "Update REQUIREMENTS.md traceability table: change PERF-04 to Complete, PERF-07 to Complete, PERF-10 to Complete"
      - "Update REQUIREMENTS.md requirement checkboxes: PERF-04 (line 56), PERF-07 (line 59), PERF-10 (line 62) from [ ] to [x]"
---

# Phase 19: Performance Quick-Wins + Orphan Reassociation Verification Report

**Phase Goal:** Apply targeted performance quick-wins and implement orphan file reassociation
**Verified:** 2026-03-18
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                | Status   | Evidence                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | @shopify/flash-list and react-native-performance are installed in package.json                       | VERIFIED | package.json lines: `"@shopify/flash-list": "2.0.2"`, `"react-native-performance": "^6.0.0"`                                                            |
| 2   | Five test stub files exist with failing describe/it blocks                                           | VERIFIED | All 5 files present; ChapterList(9), AuthProvider(2), orphanAssociation(5), home(2) stubs                                                               |
| 3   | Library item list uses FlashList with estimatedItemSize and getItemType                              | PARTIAL  | FlashList + getItemType verified; estimatedItemSize ABSENT from LibraryItemList.tsx                                                                     |
| 4   | Chapter list renderItem memoized with useCallback and getItemLayout for fixed-height rows            | VERIFIED | `const renderItem = useCallback` at line 106, `getItemLayout` with ROW_HEIGHT=64 at line 101                                                            |
| 5   | ChapterList useEffect setTimeout calls return cleanup functions                                      | VERIFIED | clearTimeout called at lines 66 and 95 in cleanup returns                                                                                               |
| 6   | CoverImage uses expo-image with cachePolicy memory-disk and dim overlay                              | VERIFIED | `import { Image } from "expo-image"`, `cachePolicy="memory-disk"`, `recyclingKey`, dim overlay with testID                                              |
| 7   | Root layout uses direct icon imports; AuthProvider and statisticsSlice use direct db/helpers imports | VERIFIED | \_layout.tsx lines 14-16 direct icon imports; AuthProvider uses @/db/helpers/tokens, users, mediaProgress; statisticsSlice uses @/db/helpers/statistics |
| 8   | TTI mark fires when home screen content becomes interactive                                          | VERIFIED | `performance.mark("screenInteractive")` at home/index.tsx line 89                                                                                       |
| 9   | AuthProvider secure storage reads run concurrently via Promise.all                                   | VERIFIED | `Promise.all([apiClientService.initialize(), getStoredUsername()])` at AuthProvider.tsx line 58                                                         |
| 10  | Coordinator instantiation deferred from module scope into initializeApp()                            | VERIFIED | src/index.ts: `getCoordinator()` inside `initializeApp()` at line 47; no module-scope export                                                            |
| 11  | NetInfo addEventListener unsubscribe is captured and called in resetNetwork()                        | VERIFIED | `netInfoUnsubscribe = NetInfo.addEventListener(...)` at line 123; called in resetNetwork at lines 306-308                                               |
| 12  | User can associate orphaned file with library item from orphan management screen                     | VERIFIED | `associateOrphanFile` callback in storage.tsx; `linkAction` on orphan rows; "Repair Download Record" alert                                              |

**Score:** 10/12 truths verified (PERF-01 partial, REQUIREMENTS.md not updated)

---

## Required Artifacts

### Plan 00 (Wave 0: TDD scaffolding)

| Artifact                                              | Expected                                       | Status   | Details                                                |
| ----------------------------------------------------- | ---------------------------------------------- | -------- | ------------------------------------------------------ |
| `package.json`                                        | @shopify/flash-list + react-native-performance | VERIFIED | Both deps present at 2.0.2 and ^6.0.0                  |
| `src/components/player/__tests__/ChapterList.test.ts` | Stubs for PERF-02, PERF-09                     | VERIFIED | 9 "not yet implemented" stubs present                  |
| `src/components/ui/__tests__/CoverImage.test.tsx`     | Stubs for PERF-08                              | AHEAD    | Full implementation (not stubs) — 6 real tests passing |
| `src/providers/__tests__/AuthProvider.test.ts`        | Stubs for PERF-06                              | VERIFIED | 2 "not yet implemented" stubs present                  |
| `src/lib/__tests__/orphanAssociation.test.ts`         | Stubs for DEBT-02                              | VERIFIED | 5 "not yet implemented" stubs present                  |
| `src/app/(tabs)/home/__tests__/home.test.ts`          | Stubs for PERF-05                              | VERIFIED | 2 "not yet implemented" stubs present                  |

### Plan 01 (PERF-01, PERF-02, PERF-09)

| Artifact                                                   | Expected                                               | Status   | Details                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------ | -------- | --------------------------------------------------------- |
| `src/components/library/LibraryItemList.tsx`               | FlashList with estimatedItemSize and getItemType       | PARTIAL  | FlashList + getItemType present; estimatedItemSize ABSENT |
| `src/components/player/ChapterList.tsx`                    | Memoized renderItem, getItemLayout, setTimeout cleanup | VERIFIED | All three present and wired                               |
| `src/components/library/LibraryItemDetail/ChapterList.tsx` | Memoized handleChapterPress                            | VERIFIED | `useCallback` wraps `handleChapterPress` at line 78       |

### Plan 02 (PERF-08)

| Artifact                            | Expected                                   | Status   | Details                                                            |
| ----------------------------------- | ------------------------------------------ | -------- | ------------------------------------------------------------------ |
| `src/components/ui/CoverImage.tsx`  | expo-image, memory-disk cache, dim overlay | VERIFIED | All four: expo-image import, cachePolicy, recyclingKey, dimOverlay |
| `src/components/ui/CoverImange.tsx` | DELETED                                    | VERIFIED | File does not exist                                                |

Import site sweep: zero remaining `CoverImange` references in src/ (confirmed via grep).

### Plan 03 (PERF-04, PERF-05, PERF-06, PERF-07, PERF-10)

| Artifact                               | Expected                                           | Status   | Details                                                                        |
| -------------------------------------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `src/app/_layout.tsx`                  | Direct icon imports from @expo/vector-icons/{Name} | VERIFIED | Lines 14-16: FontAwesome6, MaterialCommunityIcons, Octicons                    |
| `src/providers/AuthProvider.tsx`       | Direct @/db/helpers imports + Promise.all          | VERIFIED | Imports from tokens, users, mediaProgress; Promise.all at line 58              |
| `src/stores/slices/statisticsSlice.ts` | Direct @/db/helpers/statistics import              | VERIFIED | `import * as statisticsHelpers from "@/db/helpers/statistics"` at line 10      |
| `src/index.ts`                         | Deferred coordinator init inside initializeApp     | VERIFIED | getCoordinator() inside initializeApp(); no module-scope export                |
| `src/stores/slices/networkSlice.ts`    | netInfoUnsubscribe variable + capture + cleanup    | VERIFIED | Variable declared, captured at line 123, cleared in resetNetwork lines 306-308 |
| `src/app/(tabs)/home/index.tsx`        | performance.mark("screenInteractive")              | VERIFIED | Import + mark present at lines 15 and 89                                       |

### Plan 04 (DEBT-02)

| Artifact                          | Expected                                     | Status   | Details                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/(tabs)/more/storage.tsx` | associateOrphanFile + linkAction + DB repair | VERIFIED | All key symbols present: associateOrphanFile, linkAction, markAudioFileAsDownloaded, markLibraryFileAsDownloaded, "Repair Download Record", "Cannot Repair", link-outline icon |

---

## Key Link Verification

| From                       | To                                                | Via                                  | Status | Details                                                                            |
| -------------------------- | ------------------------------------------------- | ------------------------------------ | ------ | ---------------------------------------------------------------------------------- |
| `LibraryItemList.tsx`      | `@shopify/flash-list`                             | `import { FlashList }`               | WIRED  | Import + JSX usage at lines 6 and 100                                              |
| `ChapterList.tsx (player)` | `FlatList`                                        | `getItemLayout` prop                 | WIRED  | `getItemLayout={getItemLayout}` at line 190                                        |
| `CoverImage.tsx`           | `expo-image`                                      | `import { Image } from "expo-image"` | WIRED  | Line 4 import + JSX usage with cachePolicy/recyclingKey                            |
| `CoverImage.tsx`           | `useDownloads`                                    | `isItemDownloaded` check             | WIRED  | Used in dim overlay condition at line 46                                           |
| `AuthProvider.tsx`         | `apiClientService.initialize + getStoredUsername` | `Promise.all` concurrent call        | WIRED  | `const [, username] = await Promise.all([...])` at line 58                         |
| `networkSlice.ts`          | `NetInfo.addEventListener`                        | captured unsubscribe return          | WIRED  | `netInfoUnsubscribe = NetInfo.addEventListener(...)` at line 123                   |
| `storage.tsx`              | `@/db/schema/mediaMetadata`                       | title lookup by libraryItemId        | WIRED  | Query at line 486: `.where(eq(mediaMetadata.libraryItemId, orphan.libraryItemId))` |
| `storage.tsx`              | `@/db/helpers/localData`                          | markAudio/LibraryFileAsDownloaded    | WIRED  | Imported at lines 14-15, called at lines 546/548                                   |

---

## Requirements Coverage

| Requirement | Source Plan  | Description                                                                       | Status    | Evidence                                                             |
| ----------- | ------------ | --------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| PERF-01     | 19-01        | LibraryItemList uses FlashList with estimatedItemSize and getItemType             | PARTIAL   | FlashList + getItemType present; estimatedItemSize missing           |
| PERF-02     | 19-01        | ChapterList renderItem memoized with useCallback, getItemLayout for rows          | SATISFIED | useCallback + getItemLayout(ROW_HEIGHT=64) verified                  |
| PERF-04     | 19-03        | Direct icon imports; direct @/db/helpers imports in AuthProvider, statisticsSlice | SATISFIED | \_layout.tsx + AuthProvider + statisticsSlice all use direct imports |
| PERF-05     | 19-03        | TTI baseline with performance.mark("screenInteractive")                           | SATISFIED | Import + mark present in home/index.tsx                              |
| PERF-06     | 19-00, 19-03 | AuthProvider secure storage reads concurrent via Promise.all                      | SATISFIED | Promise.all at AuthProvider.tsx line 58                              |
| PERF-07     | 19-03        | Coordinator instantiation deferred into initializeApp()                           | SATISFIED | getCoordinator() inside initializeApp at index.ts line 47            |
| PERF-08     | 19-02        | CoverImage uses expo-image for memory + disk caching                              | SATISFIED | expo-image, cachePolicy, recyclingKey, dim overlay all present       |
| PERF-09     | 19-01        | ChapterList useEffect setTimeout calls return cleanup functions                   | SATISFIED | clearTimeout in both useEffect returns at lines 66 and 95            |
| PERF-10     | 19-03        | NetInfo.addEventListener unsubscribe captured and called in resetNetwork          | SATISFIED | netInfoUnsubscribe variable, capture, and cleanup all present        |
| DEBT-02     | 19-04        | User can associate orphaned file with known library item                          | SATISFIED | Full associateOrphanFile flow implemented in storage.tsx             |

**Note on REQUIREMENTS.md tracking:** The requirements checkboxes and traceability table in `.planning/REQUIREMENTS.md` show PERF-04, PERF-07, and PERF-10 as unchecked/Pending. The code confirms all three are implemented. The tracking document was not updated — this is a documentation gap, not a code gap.

---

## Anti-Patterns Found

| File                                         | Line | Pattern                          | Severity | Impact                                                                                                            |
| -------------------------------------------- | ---- | -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/components/library/LibraryItemList.tsx` | 100  | Missing `estimatedItemSize` prop | Blocker  | FlashList will warn at runtime and fall back to auto-sizing, negating the core PERF-01 virtualization improvement |

---

## Human Verification Required

### 1. FlashList grid/list visual layout

**Test:** Open the library screen in both grid mode and list mode. Scroll through a large library.
**Expected:** Items render correctly with consistent spacing in both modes. No visual regressions from FlatList removal (particularly the `columnWrapperStyle` gap that was handled by margin in LibraryItem).
**Why human:** Cannot verify visual grid gap behavior programmatically.

### 2. Dim overlay visibility

**Test:** Open the library screen with some downloaded and some undownloaded items.
**Expected:** Undownloaded items show a subtle dark overlay (40% opacity) on their cover art. Downloaded items show no overlay.
**Why human:** Cannot verify visual rendering and opacity perception without a running device.

### 3. Orphan association end-to-end

**Test:** Navigate to More > Storage. If orphan files exist, tap the blue link icon on an orphan row.
**Expected:** An alert appears showing the item title. Tapping "Repair" removes the orphan from the list. If no DB record exists, "Cannot Repair" alert shows instead.
**Why human:** Requires actual orphaned files on device to test. Alert interaction cannot be verified programmatically without running tests.

### 4. TTI mark measurability

**Test:** Open the app and navigate to the home screen. Use a Performance profiler or check for the mark in a performance timeline.
**Expected:** `screenInteractive` mark appears in the performance timeline when home screen content first renders.
**Why human:** Performance marks require instrumented runtime to observe.

---

## Gaps Summary

Two gaps were found:

**Gap 1 (Blocking — PERF-01 partially unmet):** `estimatedItemSize` is absent from `<FlashList>` in `LibraryItemList.tsx`. The PERF-01 requirement explicitly states "FlashList with `estimatedItemSize` and `getItemType`". Without `estimatedItemSize`, FlashList emits a console warning in development and may fall back to layout-on-demand rendering, which reduces the performance benefit of the migration. The fix is a single-line addition: `estimatedItemSize={viewMode === "grid" ? 160 : 80}` as a prop on the `<FlashList>` component.

**Gap 2 (Documentation — REQUIREMENTS.md not updated):** Three requirements implemented in Phase 19 are still marked "Pending" in the REQUIREMENTS.md traceability table and have unchecked checkboxes: PERF-04 (direct imports), PERF-07 (deferred coordinator), PERF-10 (NetInfo unsubscribe). The code correctly implements all three. The tracking document needs to be updated to reflect completion.

These two gaps are independent and can be addressed in a single patch plan.

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
