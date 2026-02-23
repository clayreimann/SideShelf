# Project Research Summary

**Project:** abs-react-native (SideShelf) — v1.1 Bug Fixes & Polish
**Domain:** React Native Expo audiobook player — coordinator-driven architecture
**Researched:** 2026-02-20
**Confidence:** HIGH — all findings grounded in direct codebase analysis

## Executive Summary

The v1.1 milestone is a focused bug-fix and polish pass on a mature codebase that completed a five-phase PlayerStateCoordinator migration. The architecture is correct and the coordinator is fully operational. What remains are six discrete gaps: two are behavior bugs visible on every user interaction (lock screen stale after skip, download badge lying about file state), one is a silent data-loss issue (iCloud backup exclusion not working, audiobook files silently backing up to iCloud), two are UX polish items (loading skeleton on cold start, skip interval persistence), and one is a routing correctness question (More screen tab switching). None require architectural change — the coordinator, services, and store patterns are all correct and complete. All fixes are additive and targeted.

The most important finding from research is the resolution of the iCloud exclusion mystery. The native Obj-C implementation (`ICloudBackupExclusion.m` + `.h`) is complete and correct — it lives in `plugins/excludeFromBackup/ios/`. The `withExcludeFromBackup` Expo config plugin is also complete. However, `withExcludeFromBackup` is absent from the `plugins:` array in `app.config.js`. Because the plugin was never registered, `expo prebuild` never ran it, so the files were never copied to `ios/SideShelf/Modules/` and never compiled into the Xcode project. `NativeModules.ICloudBackupExclusion` resolves to null at runtime, making every `setExcludeFromBackup()` call a silent no-op. The fix is one line in `app.config.js` plus `expo prebuild --clean` — minutes of work, not hours. See the Conflict Resolution section for full investigation details.

The primary risks in this milestone are: (1) the download reconciliation scan racing active downloads and prematurely marking partial files as complete; (2) the iCloud exclusion attribute silently resetting after iOS container path migrations unless `repairDownloadStatus` is updated to re-apply it; (3) the Expo Router `router.push` vs `router.navigate` distinction for tab-switching, which is version-sensitive and needs hands-on verification before coding. None of these are blockers — each has a documented prevention strategy from research.

## Key Findings

### Recommended Stack

No new native modules are needed for this milestone. The only new package is `react-native-shimmer-placeholder` (JS-only, wraps the already-installed `expo-linear-gradient`). The iCloud exclusion module already exists in Obj-C — it needs plugin registration, not implementation. All other fixes work with the existing stack and no `expo prebuild` beyond the one required for the iCloud plugin.

**Core technologies for this milestone:**

- `react-native-track-player` 4.1.2: `updateNowPlayingMetadata()` (not `updateMetadataForTrack()`) for lock screen elapsed time — the `elapsedTime` field on `NowPlayingMetadata` is the correct API; the current code works around the missing field with `@ts-ignore`
- `expo-linear-gradient` (already installed): powering shimmer skeleton via `react-native-shimmer-placeholder` factory — zero new native installs
- `withExcludeFromBackup` (Expo config plugin, already written in full): add to `app.config.js` plugins array and run `expo prebuild --clean`
- Expo Router `router.push` / `router.navigate`: behavior is version-sensitive for tab switching — needs hands-on verification against Expo 54 / Expo Router v3

**New package required:** `react-native-shimmer-placeholder` (JS-only, no native install)

**New native install required:** None.

See `.planning/research/STACK.md` for full version table, alternatives considered, and what NOT to add.

### Expected Features

Research confirmed six feature gaps. Priority order per impact and severity:

**Must have (table stakes — bugs, not polish):**

- Now playing metadata updates after every skip — Apple WWDC22 explicitly states "whenever we seek to a new time we need to publish new Now Playing info"; the gap is that within-chapter seeks do not call `updateNowPlayingMetadata`; chapter-crossing seeks already work correctly via the coordinator bridge
- Download file tracking recovery — `isLibraryItemDownloaded` has an explicit `// TODO: Could mark as not downloaded in database here` comment; the detection exists, the correction does not; stale "downloaded" badges cause playback failure on tap
- iCloud exclusion working — currently silently no-ops because the plugin is unregistered; users' audiobook libraries are being backed up to iCloud

**Should have (UX quality — user-visible on daily use):**

- Skip interval persistence — selected skip interval resets on every app open; needs two new settings store keys (`skipForwardInterval`, `skipBackwardInterval`) and wiring of the existing `SkipButton.onJump` callback to the settings slice
- More screen tab navigation correctness — `router.push` may push onto the More stack rather than switching tabs; needs verification and likely a one-line fix

**Defer (polish):**

- Loading skeletons for home screen cold start — `ActivityIndicator` path works; skeleton is perceptual improvement, not a bug
- Reverse reconciliation (orphaned files on disk not in DB) — implement stale-record clearing first; the reverse direction follows naturally

See `.planning/research/FEATURES.md` for full table-stakes / differentiators / anti-features breakdown per feature.

### Architecture Approach

The PlayerStateCoordinator architecture is complete and correct. All five v1.x phases are done. The coordinator bridge (`syncStateToStore` / `syncPositionToStore`) already handles now-playing metadata via the `lastSyncedChapterId` debounce — no new call paths should be added to that bridge from outside. Downloads are not in the state machine and should stay out of Zustand. All download state lives in SQLite (source of truth) and the `DownloadService` in-memory `activeDownloads` Map (transient). The reconciliation pass belongs in `DownloadService.initialize()`.

**Components that change in this milestone:**

| Component                                               | Status              | What Changes                                                                                            |
| ------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `app.config.js`                                         | MODIFIED            | Add `withExcludeFromBackup` to plugins array                                                            |
| `plugins/excludeFromBackup/ios/ICloudBackupExclusion.m` | NO CHANGE           | Implementation is complete and correct                                                                  |
| `src/services/DownloadService.ts`                       | MODIFIED            | Add startup reconciliation pass in `initialize()`; add `setExcludeFromBackup` to `repairDownloadStatus` |
| `src/services/coordinator/PlayerStateCoordinator.ts`    | MODIFIED (targeted) | Add `updateNowPlayingMetadata` call in `syncPositionToStore` when seeking state clears                  |
| `src/stores/slices/settingsSlice.ts`                    | MODIFIED            | Add `skipForwardInterval`, `skipBackwardInterval` keys                                                  |
| `src/components/player/SkipButton.tsx`                  | MODIFIED            | Wire `onJump` callback to settings store                                                                |
| `src/app/(tabs)/home/index.tsx`                         | MODIFIED            | Replace `ActivityIndicator` with shimmer skeleton cards                                                 |
| `src/app/(tabs)/more/index.tsx`                         | POSSIBLY MODIFIED   | Verify and fix tab navigation pattern if needed                                                         |

**Patterns to maintain:**

- Do NOT add a third `updateNowPlayingMetadata` call site outside the coordinator bridge — the `lastSyncedChapterId` deduplication must be preserved
- Do NOT add download state to Zustand — progress is delivered via callbacks subscribed directly to `DownloadService`
- Do NOT implement iCloud exclusion as an Expo Module (Option B) — the TypeScript wrapper uses `NativeModules`, and the Obj-C Option A requires zero TypeScript changes

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, component boundary table, and build order recommendation.

### Critical Pitfalls

Research surfaced 12 pitfalls across the milestone. Top 5:

1. **Download reconciliation races active downloads** — a startup scan calling `verifyFileExists` on a partial in-progress file marks it as fully downloaded; guard by checking `isDownloadActive(libraryItemId)` before reconciling any item, or compare file size on disk against expected size in DB
2. **iCloud exclusion attribute resets after container path repair** — `repairDownloadStatus` updates the DB path but never re-applies `setExcludeFromBackup`; every iOS app update silently re-enables iCloud backup for all previously downloaded files; fix: add `setExcludeFromBackup(expectedPath)` immediately after `markAudioFileAsDownloaded` in `repairDownloadStatus`
3. **iCloud exclusion applied before file exists on disk** — `setResourceValue:forKey:error:` fails silently if the file is not yet flushed after download completion; add `FileManager.default.fileExists` check in the native module before calling `setResourceValues`; log a warning (not silent continue) when `success: false`
4. **Expo Router `router.push` opens route in current tab stack** — `router.push('/series')` may push Series onto the More stack rather than switching tabs; behavior changed in Expo Router v4 (`router.navigate` now equals `router.push`); needs hands-on verification on the actual Expo 54 build before writing any code
5. **Skeleton flash on fast content load** — if cached data arrives in <50ms, the skeleton flashes for one frame which is more jarring than showing no skeleton; implement a minimum display duration (~150ms) before dismissal, or only show skeleton when `sections.length === 0 && isLoading`

See `.planning/research/PITFALLS.md` for the complete list including moderate pitfalls (Android artwork bug in `updateMetadataForTrack`, `configureTrackPlayer` feedback loop risk, skeleton animation memory leak, skeleton layout shift).

## Conflict Resolution: iCloud Exclusion — Config Change vs. Native Implementation

STACK.md and ARCHITECTURE.md appeared to contradict each other on the iCloud exclusion fix. Direct file investigation resolved the conflict in favor of STACK.md's diagnosis.

**What STACK.md said:** `withExcludeFromBackup` is absent from `app.config.js` plugins array; add it and run `expo prebuild --clean`.

**What ARCHITECTURE.md said:** `NativeModules.ICloudBackupExclusion` resolves to null on iOS because no Swift implementation exists in `ios/SideShelf/`.

**Ground truth (verified by direct file inspection):**

The Obj-C implementation (`ICloudBackupExclusion.m` + `ICloudBackupExclusion.h`) exists and is correct — at `plugins/excludeFromBackup/ios/`. The `withExcludeFromBackup.js` Expo config plugin is complete and implements both the file-copy step (to `ios/SideShelf/Modules/`) and the Xcode project registration step. However, `withExcludeFromBackup` is NOT in the `app.config.js` `plugins:` array — confirmed by reading the file, which shows only `expo-router`, `expo-splash-screen`, `expo-font`, and `expo-web-browser`.

Because the plugin was never registered, `expo prebuild` never ran it, so `ios/SideShelf/Modules/` does not exist (directory confirmed absent). ARCHITECTURE.md observed the absence of files in `ios/SideShelf/` and correctly deduced that `NativeModules.ICloudBackupExclusion` is null at runtime — but the implementation is present in the plugin source directory, awaiting prebuild to copy and register it.

**The fix is a config change (minutes), not a native module implementation (hours):**

1. Add `withExcludeFromBackup` to `plugins:` in `app.config.js`
2. Run `expo prebuild --clean` (already part of `npm run ios`)
3. The plugin copies `.m`/`.h` files to `ios/SideShelf/Modules/` and registers them in the Xcode project

**Confidence:** HIGH — verified by reading `app.config.js` (plugin absent), `plugins/excludeFromBackup/ios/` (Obj-C implementation present and correct), and confirming `ios/SideShelf/Modules/` does not exist.

**No further investigation needed during planning.** The fix path is clear.

## Implications for Roadmap

Based on combined research, the milestone maps to four phases ordered by dependency and impact:

### Phase 1: iCloud Exclusion (Plugin Registration + Native Hardening)

**Rationale:** Highest silent user impact (audiobook files backing up to iCloud quota); fastest core fix (one-line config change + prebuild); foundational dependency for the download reconciliation scan, which should re-apply exclusion during file repair
**Delivers:** Working `setExcludeFromBackup` calls for all new downloads; `repairDownloadStatus` re-applies exclusion after path migration; native module guards against file-not-yet-flushed edge case
**Addresses:** Feature 5 (iCloud exclusion), Pitfalls 1, 2, 12
**Key tasks:**

- Add `withExcludeFromBackup` to `app.config.js` plugins
- Run `expo prebuild --clean`
- Add `FileManager.default.fileExists` check in `ICloudBackupExclusion.m` before calling `setResourceValues`; log warning on `success: false`
- Add `setExcludeFromBackup(expectedPath)` to `repairDownloadStatus` after `markAudioFileAsDownloaded`
- Update Android log message at `DownloadService.ts:286` from generic "success" to "skipped (non-iOS)"
  **Research flag:** None — fix path fully specified and verified; Obj-C code is correct as-is

### Phase 2: Download Tracking Reconciliation

**Rationale:** Depends on Phase 1 (startup scan should call `setExcludeFromBackup` during repair, so the native module must be working); directly fixes the user-visible bug where "downloaded" badges cause playback failure
**Delivers:** Startup reconciliation pass in `DownloadService.initialize()`; `isLibraryItemDownloaded` implements its TODO; partial files guarded before any scan marks them complete
**Addresses:** Feature 2 (download recovery), Pitfalls 3, 10, 11
**Key tasks:**

- Implement the `// TODO: Could mark as not downloaded` in `isLibraryItemDownloaded`
- Add reconciliation pass to `DownloadService.initialize()` after `restoreExistingDownloads`
- Guard scan: check `isDownloadActive(libraryItemId)` before reconciling any item
- Batch file existence checks (process 20 at a time with `Promise.all` and yield between batches) to avoid JS thread blocking on large libraries
- Integrate `setExcludeFromBackup` call during repair (from Phase 1)
  **Research flag:** None — architecture is documented, all helpers exist; this is additive to the existing `initialize()` method

### Phase 3: Now Playing Metadata on Skip + Skip Interval Persistence

**Rationale:** Groups the two player-facing features since both touch the skip code path and the settings layer; the metadata fix is a targeted addition within the existing coordinator bridge (not a new external call site)
**Delivers:** Lock screen elapsed time updates after same-chapter skips; skip interval persists across app sessions per direction (forward and backward independently)
**Addresses:** Feature 1 (now playing metadata), Feature 6 (skip persistence), Pitfalls 4, 5
**Key tasks:**

- Add `updateNowPlayingMetadata` call to `syncPositionToStore` on the `NATIVE_PROGRESS_UPDATED` event that clears the seeking state (not in `executeSeek` directly — preserve the coordinator bridge as the only call site)
- Verify `configureTrackPlayer()` inside `updateNowPlayingMetadata` does not cause re-entrant coordinator events; add re-entrant guard if needed
- Test `updateMetadataForTrack` on physical Android device during chapter transition — check for artwork loss (bug #2287); switch to `updateNowPlayingMetadata` if loss confirmed
- Add `skipForwardInterval` and `skipBackwardInterval` to settings slice with defaults (30s / 15s)
- Wire `SkipButton.onJump` callback to persist to settings store
- `FullScreenPlayer` and `FloatingPlayer` read intervals from settings store (not hardcoded)
  **Research flag:** Android artwork bug (#2287) requires device test before marking complete — test on physical Android or emulator before shipping

### Phase 4: More Screen Navigation + Loading Skeletons

**Rationale:** Both are UX polish with no service dependencies; grouped as the final phase since they are lowest severity and neither blocks the milestone if deferred
**Delivers:** Correct tab switching from More screen; shimmer skeleton loading cards on home screen cold start matching `CoverItem` 140x140 dimensions
**Addresses:** Feature 3 (More screen navigation), Feature 4 (loading skeletons), Pitfalls 6, 7, 8, 9
**Key tasks:**

- Verify `router.push` vs `router.navigate` vs `router.replace` behavior for sibling-tab switching in Expo Router v3 on Expo 54 — test on physical device before writing any code
- Fix More screen routing if `router.push` is confirmed to push onto the More stack; use `router.navigate` to the index route with `replace` semantics if applicable
- Install `react-native-shimmer-placeholder`; implement `createShimmerPlaceholder(LinearGradient)` factory
- Build skeleton cards matching `CoverItem` 140x140 rounded-rect dimensions + two text block placeholders
- Implement minimum display duration (~150ms) guard to prevent skeleton flash on cache hits
- Add animation cleanup (`animation.stop()`) in skeleton `useEffect` cleanup return
- Pin skeleton item dimensions to measured real content dimensions to prevent layout shift
  **Research flag:** Expo Router tab navigation behavior must be verified hands-on before writing code — `router.navigate` semantics changed between Expo Router versions and this codebase uses `NativeTabs` which adds another variable

### Phase Ordering Rationale

- Phase 1 before Phase 2: The startup reconciliation scan should call `setExcludeFromBackup` during repair; the native module must be working before the scan runs to avoid re-excluding files with a no-op
- Phase 2 before Phase 3: No hard dependency, but fixing the data layer (downloads) before the interaction layer (player) is safer; download reconciliation could expose edge cases that affect player state transitions
- Phases 3 and 4 last: Both are improvements on already-functional systems; each can be deferred independently without blocking the others

### Research Flags

**Phases needing hands-on verification before coding:**

- **Phase 3 (Android artwork):** Test `updateMetadataForTrack` on physical Android during a chapter transition — the library bug is confirmed but the workaround decision depends on observed behavior in this codebase's specific usage pattern
- **Phase 4 (Expo Router tab navigation):** Write a minimal navigation test before committing to any API — behavior changed across Expo Router versions; hands-on verification on the Expo 54 build is required

**Phases with well-documented patterns (no research-phase needed):**

- **Phase 1 (iCloud exclusion):** Fix path fully specified; Obj-C code is correct; just needs registration and one native guard
- **Phase 2 (download reconciliation):** All helpers exist; architecture is documented; pattern is additive to `initialize()` with a simple active-download guard
- **Phase 3 (skip interval persistence):** Two new store keys and callback wiring; standard settings-slice pattern

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                  |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | Library sources read directly from `node_modules`; package versions confirmed; plugin source code verified by file inspection          |
| Features     | HIGH       | All six gaps confirmed by reading source code and finding the actual TODO comments, missing calls, and unregistered plugin             |
| Architecture | HIGH       | Direct codebase analysis of coordinator bridge, DownloadService, playerSlice; data flows verified line by line                         |
| Pitfalls     | HIGH       | Critical pitfalls grounded in Apple documentation + library bug reports with issue numbers; moderate pitfalls grounded in code reading |

**Overall confidence:** HIGH

### Gaps to Address

- **Expo Router tab-switching API (Phase 4):** PITFALLS.md notes that `router.navigate` behavior changed in Expo Router v4 to match `router.push`. This codebase runs Expo Router v3 (Expo 54), but the behavior still needs hands-on verification. Resolve by writing a minimal test navigation before coding the More screen fix.
- **Android `updateMetadataForTrack` artwork bug (Phase 3):** Confirmed as a library bug in v4.1.1+ but the workaround (switch to `updateNowPlayingMetadata`) must be tested on device to confirm the artwork is actually lost in this codebase's usage pattern. The bug exists but severity here is unverified.
- **Minimum skeleton display duration (Phase 4):** The 150ms threshold is an industry heuristic, not a precise measurement. Tune based on observed flash behavior on device during testing.

## Sources

### Primary (HIGH confidence — direct codebase analysis)

- `plugins/excludeFromBackup/ios/ICloudBackupExclusion.m` — Obj-C implementation (confirmed complete and correct)
- `plugins/excludeFromBackup/withExcludeFromBackup.js` — Expo config plugin (confirmed complete)
- `app.config.js` — plugins array (confirmed `withExcludeFromBackup` absent)
- `src/services/coordinator/PlayerStateCoordinator.ts` — bridge implementation, `lastSyncedChapterId` debounce, `syncPositionToStore` and `syncStateToStore` flows
- `src/services/DownloadService.ts` — `isLibraryItemDownloaded` TODO (line 471), `repairDownloadStatus`, `initialize()` structure, iCloud call sites (lines 286, 329, 955)
- `src/lib/iCloudBackupExclusion.ts` — TypeScript wrapper (complete)
- `src/stores/slices/playerSlice.ts` — `updateNowPlayingMetadata` implementation (lines 576–627), `configureTrackPlayer()` call (line 619)
- `src/app/(tabs)/more/index.tsx` — `router.push` pattern for hidden tab navigation (line 144)
- `src/app/(tabs)/home/index.tsx` — cold-start `ActivityIndicator` path (lines 213–222)
- `node_modules/react-native-track-player/src/trackPlayer.ts` — `updateNowPlayingMetadata` vs `updateMetadataForTrack` API surface
- `node_modules/react-native-track-player/src/interfaces/NowPlayingMetadata.ts` — `elapsedTime?: number` field on `NowPlayingMetadata`

### Secondary (HIGH confidence — official documentation)

- Apple Developer Documentation: `NSURLIsExcludedFromBackupKey`, `NSURL setResourceValue:forKey:error:`, Apple QA1719
- Apple WWDC22 "Explore media metadata publishing and playback interactions" — `MPNowPlayingInfoPropertyElapsedPlaybackTime` requirement after seek
- Expo SDK 54 changelog — New Architecture interop layer supports legacy `RCT_EXPORT_MODULE` modules in RN 0.81

### Secondary (MEDIUM confidence — library issues and community)

- react-native-track-player GitHub issue #2287 — `updateMetadataForTrack` clears artwork on Android v4.1.1+
- Expo Router issue #35212 — `router.navigate` behavior change in v4 to match `router.push` (no longer unwinds to existing routes)
- Expo Router docs — `router.push` vs `router.navigate` vs `router.replace` (https://docs.expo.dev/router/basics/navigation/)
- Eidinger blog — `NSURLIsExcludedFromBackupKey` attribute resets on file copy operations

---

_Research completed: 2026-02-20_
_Ready for roadmap: yes_
