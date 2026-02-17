# Codebase Concerns

**Analysis Date:** 2026-02-15

## Tech Debt

**Large service files approaching limits:**

- Issue: Core services (`PlayerService.ts`, `DownloadService.ts`, `ProgressService.ts`) are 1100-1640 lines each
- Files: `src/services/PlayerService.ts` (1640 LOC), `src/services/ProgressService.ts` (1215 LOC), `src/services/DownloadService.ts` (1159 LOC)
- Impact: Difficulty navigating code, harder to test individual features, maintenance burden increases
- Fix approach: Extract related functionality into focused utility modules. Example: Extract position reconciliation logic from PlayerService into `src/lib/positioning/reconciliation.ts`, session management into `src/lib/sessions/sessionManager.ts`, progress syncing into `src/lib/sync/progressSync.ts`

**Incomplete download cleanup:**

- Issue: Force redownload requests don't delete existing files before redownloading; files overwrite in place
- Files: `src/services/DownloadService.ts` (line 684)
- Impact: May create inconsistent file states; orphaned file metadata if overwrite fails partway through
- Fix approach: Implement proper file deletion in `DownloadService.startBackgroundDownload()` before initiating download when `forceRedownload=true`

**Missing database state update on orphaned downloads:**

- Issue: When iOS cleans up downloaded files, the database still marks them as downloaded
- Files: `src/services/DownloadService.ts` (line 471)
- Impact: UI shows files as downloaded when they're missing; next playback attempt fails with file not found
- Fix approach: Implement automatic database cleanup in `verifyIsDownloaded()` - if file missing but DB says downloaded, call `clearAudioFileDownloadStatus()` to sync state

## Type Safety Issues

**Unsafe any array types:**

- Issue: Several critical interfaces use `any[]` instead of properly typed arrays
- Files:
  - `src/types/api.ts` line 51 (`chapters: any[]`)
  - `src/types/components.ts` (`data: any[]`)
  - `src/components/library/LibraryPicker.tsx` (`libraries: any[]`)
  - `src/__tests__/mocks/stores.ts` (`libraries: any[]`, `libraryItems: any[]`)
- Impact: No compile-time validation of array contents; runtime errors when structure differs from expectations
- Fix approach: Define proper types for chapters (already partially defined in `ApiPlaySessionAudioTrack`), library picker data, and mock stores. Use `as const` assertions where types can't be inferred.

**Excessive console.log usage:**

- Issue: 50+ direct `console.log` and `console.error` calls scattered throughout database helpers instead of using the logging framework
- Files: `src/db/helpers/localData.ts`, `src/db/helpers/fullLibraryItems.ts`, `src/db/helpers/homeScreen.ts`, `src/db/helpers/localListeningSessions.ts`, `src/db/helpers/filterData.ts`
- Impact: Unstructured logs that don't integrate with logging UI; inconsistent logging across codebase; impossible to control verbosity
- Fix approach: Replace all `console.log/error` with `logger.forTag("HelperName")` calls. Import logger at top of each helper file.

## Architecture Concerns

**Complex state synchronization between services:**

- Issue: PlayerService, ProgressService, and PlayerBackgroundService maintain overlapping state about playback position, sessions, and progress
- Files: `src/services/PlayerService.ts`, `src/services/ProgressService.ts`, `src/services/PlayerBackgroundService.ts`, `src/stores/slices/playerSlice.ts`
- Impact: Race conditions possible when multiple services update state concurrently; difficult to reason about single source of truth
- Fix approach: Implement phase 2 of PlayerStateCoordinator (from line 19-22 in `src/services/coordinator/PlayerStateCoordinator.ts`) to centralize state transitions and prevent concurrent updates

**Global state in background service:**

- Issue: PlayerBackgroundService stores subscription cleanup functions and initialization timestamps on global object
- Files: `src/services/PlayerBackgroundService.ts` (lines 81-95, 881-898, 902-907)
- Impact: On Android, background and UI contexts are separate processes - global state may not synchronize; difficult to test; potential memory leaks if cleanup fails
- Fix approach: Move global state tracking into class properties or use localStorage instead. Document that background service has separate context on Android and can't share memory with UI.

**Separate coordinator instances on Android:**

- Issue: PlayerStateCoordinator note at line 44-52 in `src/services/coordinator/PlayerStateCoordinator.ts` shows Android runs background service in separate JS context with own coordinator instance
- Files: `src/services/coordinator/PlayerStateCoordinator.ts`, `src/services/PlayerBackgroundService.ts`
- Impact: Two coordinators stay "eventually consistent" by observing native player - no guarantee they're synchronized at any given moment; diagnostic UI shows stale state
- Fix approach: Implement coordinator instance deduplication per context, or use context-aware logging to track which instance processed each event

**Zustand store complexity:**

- Issue: Main store (`appStore.ts`) combines 11+ slices with 1218 lines; individual slices like `librarySlice.ts` (1011 lines) are large
- Files: `src/stores/appStore.ts`, `src/stores/slices/librarySlice.ts`
- Impact: Hard to find specific state; circular dependencies between slices possible; difficult to test individual concerns
- Fix approach: Consider extracting domain-specific sub-stores (e.g., separate store for library management vs player state) and composing them

## Known Bugs

**Potential duplicate session creation:**

- Symptoms: Multiple listening sessions created for same library item when app resumes from background
- Files: `src/services/PlayerBackgroundService.ts` (lines 800-817)
- Trigger: App backgrounded during playback, then resumed; racing between UI-initiated session start and background service session check
- Workaround: Code attempts to detect existing sessions (line 804) but logs as "let it be", relying on downstream code to handle duplicates
- Fix: Implement database uniqueness constraint or mutex on session creation

**Download file deletion may silently fail:**

- Symptoms: Download marked as complete but file disappears on iOS during app suspend/resume
- Files: `src/services/DownloadService.ts` (lines 684-685)
- Trigger: Force redownload when file exists; OS cleans up app container files during low memory
- Workaround: None - next playback attempt will fail with "file not found"
- Fix: Implement `deleteDownloadedFile()` function in `src/lib/fileSystem.ts` that also clears DB state on failure

## Performance Bottlenecks

**Large batch processing without pagination:**

- Problem: `fetchAllLibraryItems()` and batch processing may load entire library into memory
- Files: `src/stores/slices/librarySlice.ts`, `src/lib/api/endpoints.ts`
- Cause: No pagination or chunking visible for large libraries (1000+ items)
- Improvement path: Implement cursor-based pagination in `fetchLibraryItemsBatch()`, process in configurable batch sizes (default 100), and stream results instead of buffering all

**Synchronous file operations:**

- Problem: `fileLifecycleManager.ts` may block JS thread during file moves
- Files: `src/lib/fileLifecycleManager.ts` (comment at line 18: "Synchronous operation - blocks until move is complete")
- Cause: Using synchronous file system APIs instead of async
- Improvement path: Investigate if Expo FileSystem supports async operations; if not, wrap in `InteractionManager.runAfterInteractions()` or worker thread

**Unoptimized progress snapshots:**

- Problem: Every progress update creates database snapshot without culling old ones
- Files: `src/db/helpers/localListeningSessions.ts` (line 364 shows cleanup but no automatic culling)
- Cause: No automatic cleanup of snapshots older than retention period
- Improvement path: Add TTL-based cleanup on session end or implement periodic background cleanup job

## Fragile Areas

**Download state machine:**

- Files: `src/services/DownloadService.ts`
- Why fragile: Multiple manual state transitions (activeDownloads Map, progress callbacks, speed tracking) with no single source of truth
- Safe modification: Always update `activeDownloads` entry atomically with progress callbacks; test with concurrent start/cancel/complete operations
- Test coverage: Limited coverage for race conditions (cancel while downloading, start duplicate download)

**Session synchronization:**

- Files: `src/services/ProgressService.ts`, `src/db/helpers/localListeningSessions.ts`
- Why fragile: Local sessions and server sessions tracked separately; sync can fail at multiple points
- Safe modification: Always test with network failures; verify database state before marking session synced
- Test coverage: Network failure scenarios not fully tested; retry logic not comprehensive

**Audio file path resolution:**

- Files: `src/lib/fileSystem.ts`, `src/services/PlayerService.ts` (lines 23-24, 24)
- Why fragile: File paths constructed differently in different contexts (documents vs cache); iOS container migrations can break paths
- Safe modification: Always use `resolveAppPath()` and `verifyFileExists()` before playback; cache should not be relied on for persistence
- Test coverage: Container migration scenario tested but fragile to OS changes

## Scaling Limits

**Database queries without indices:**

- Current capacity: Works fine up to ~1000 library items
- Limit: Queries like "get all items by library" without index slow down with 10k+ items
- Scaling path: Add database indices on frequently queried columns (libraryId, userId, createdAt); implement query optimization in helpers

**Memory usage with large libraries:**

- Current capacity: Can load ~5000 items into memory (depends on device RAM)
- Limit: Loading 10k+ items causes OOM on low-end devices
- Scaling path: Implement virtual scrolling in library UI (already exists in components), implement lazy loading of item metadata

**Concurrent download limit:**

- Current capacity: Can queue unlimited downloads; only process sequentially
- Limit: No rate limiting; massive queue can cause memory issues
- Scaling path: Implement download queue with concurrent limit (e.g., max 3 concurrent downloads); implement priority queue for user-initiated vs background

## Dependencies at Risk

**react-native-background-downloader (custom fork):**

- Risk: Using custom fork from `github:clayreimann/react-native-background-downloader#spike-event-queue` instead of published version
- Impact: No maintenance from original repo; custom patches may diverge
- Migration plan: Document what patches are required, contribute improvements back upstream if possible; consider switching to maintained alternative like `expo-file-download` if it reaches parity

**Expo managed SDK version lock:**

- Risk: Using Expo 54 with specific dependency pinning; major version upgrades may be painful
- Impact: Can't adopt latest features; security patches delayed
- Migration plan: Establish upgrade cadence (annually?); test thoroughly before each major version bump; use eas-updates for gradual rollout

## Missing Critical Features

**Download pause/resume:**

- Problem: Users can't pause and resume downloads; must restart from beginning
- Blocks: Feature request for better offline UX
- Workaround: Cancel and restart download
- Implementation: Background downloader library supports resumable downloads - implement in `DownloadService.pauseDownload()` and `resumeDownload()`

**Offline mode:**

- Problem: App requires network connectivity to even load library metadata
- Blocks: Usage in offline scenarios (flights, tunnels)
- Workaround: Pre-download before going offline
- Implementation: Cache full library metadata; implement offline mode toggle in settings that disables API calls

**Media quality selection:**

- Problem: No way to choose audio bitrate or format; downloads highest quality always
- Blocks: Users on limited storage/bandwidth
- Implementation: Add quality preference to settings; pass to download service

## Test Coverage Gaps

**Download service race conditions:**

- What's not tested: Concurrent start calls for same item, cancel during download, network failures mid-download
- Files: `src/services/DownloadService.ts`, `src/services/__tests__/` (if tests exist)
- Risk: Silent failures when download corrupted; duplicate downloads; orphaned database entries
- Priority: High - download is critical path

**Progress sync failure recovery:**

- What's not tested: Network interruption during sync, server errors, malformed responses
- Files: `src/services/ProgressService.ts`
- Risk: Progress lost; user progress out of sync with server
- Priority: High - affects core feature

**Player state transitions under stress:**

- What's not tested: Rapid play/pause/seek operations, network changes, app backgrounding during playback
- Files: `src/services/coordinator/PlayerStateCoordinator.ts`
- Risk: Coordinator state diverges from actual player state
- Priority: Medium - diagnostics test some scenarios but not exhaustive

**LibraryItemDetail component lifecycle:**

- What's not tested: Component unmount during async operations, memory leaks with subscriptions
- Files: `src/components/library/LibraryItemDetail.tsx` (620 lines)
- Risk: Memory leaks; stale callbacks after component unmounts
- Priority: Medium - large component with complex state

**Error scenarios in PlayerService:**

- What's not tested: Missing audio files, invalid metadata, corrupted database records
- Files: `src/services/PlayerService.ts` (lines 1-100 show many error paths)
- Risk: App crash when encountering edge cases; no graceful degradation
- Priority: High - user-facing crashes

---

_Concerns audit: 2026-02-15_
