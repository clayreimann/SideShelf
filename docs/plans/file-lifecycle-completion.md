# File Lifecycle Management - Completion Plan

**Status**: Phase 1 Complete (Core Logic + Tests + Tracking)
**Started**: 2025-01-22
**Last Updated**: 2025-01-22

## Overview

This document outlines the remaining work to complete the intelligent file lifecycle management system for audiobook downloads. The system moves files between Documents (persistent) and Caches (reclaimable by iOS) based on usage patterns and completion status.

## What's Been Completed ✅

### 1. Core File System Infrastructure

**Files Modified**: `src/lib/fileSystem.ts`

- Added `StorageLocation` type: `'documents' | 'caches'`
- Implemented `getDocumentsDirectory()` and `getCachesDirectory()`
- Added `getAudioFileLocation()` to detect current file location
- Implemented `moveAudioFile()` for atomic file movement (copy → verify → delete)
- Updated all functions to accept optional `location` parameter with backward-compatible defaults

### 2. Database Schema & Helpers

**Files Modified**:

- `src/db/schema/localData.ts` - Added lifecycle fields
- `src/db/migrations/0011_natural_betty_ross.sql` - Migration generated
- `src/db/helpers/localData.ts` - Added helper functions

**Schema Changes**:

```sql
ALTER TABLE `local_audio_file_downloads` ADD `storage_location` text DEFAULT 'caches' NOT NULL;
ALTER TABLE `local_audio_file_downloads` ADD `last_accessed_at` integer;
ALTER TABLE `local_audio_file_downloads` ADD `moved_to_cache_at` integer;
```

**New Helper Functions**:

- `updateAudioFileStorageLocation(audioFileId, location, path)`
- `updateAudioFileLastAccessed(libraryItemId)` - Updates all files for an item
- `updateAudioFileDownloadPath(audioFileId, path)`

### 3. File Lifecycle Manager

**File Created**: `src/lib/fileLifecycleManager.ts` (383 lines)

**Core Functions Implemented**:

- ✅ `moveItemToDocuments(libraryItemId)` - Moves all files to Documents with iCloud exclusion
- ✅ `moveItemToCaches(libraryItemId)` - Moves all files to Caches
- ✅ `ensureItemInDocuments(libraryItemId)` - Synchronous check & move for playback
- ✅ `shouldMoveToCache(libraryItemId, userId)` - Determines eligibility (finished OR 2-week inactive)
- ✅ `detectCleanedUpFiles()` - Scans for iOS-removed files
- 🚧 `performPeriodicCleanup(userId)` - **Skeleton only, needs FileCleanupService**

**Test Coverage**: 25/25 tests passing

- File movement in both directions
- iCloud backup exclusion application
- Database updates
- Error handling and graceful degradation
- Cleanup detection logic
- Activity-based cache migration

### 4. Download Service Integration

**File Modified**: `src/services/DownloadService.ts`

**Changes**:

- Downloads now go to Documents directory (was Caches)
- iCloud backup exclusion applied after successful download
- `markAudioFileAsDownloaded()` calls updated to pass `'documents'` location
- `deleteDownloadedLibraryItem()` checks both directories

### 5. Player Service Integration

**File Modified**: `src/services/PlayerService.ts`

**Changes**:

- Added file location check in `playTrack()` method
- Calls `ensureItemInDocuments()` before playback starts
- Synchronous operation - playback waits for file movement
- Graceful failure - logs warning but allows playback to continue

### 6. Meaningful Listening Tracking

**File Modified**: `src/services/PlayerBackgroundService.ts`

**Implementation**:

- Tracks cumulative listening time per library item
- Threshold: 2 minutes (120 seconds)
- Updates `lastAccessedAt` in database after threshold reached
- Only updates once per session (prevents spam)
- Cleanup on stop, track change, and service shutdown

**Key Constants**:

```typescript
const MEANINGFUL_LISTEN_THRESHOLD = 2 * 60; // 2 minutes in seconds
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000; // In fileLifecycleManager.ts
```

### 7. Shared Mock Library (Testing Infrastructure)

**Files Modified**:

- `src/__tests__/mocks/database.ts` - Added file system & database helper mocks
- `src/__tests__/mocks/index.ts` - Exported new mocks

**Created Factories**:

- `createMockFileSystemHelpers()`
- `createMockLocalDataHelpers()`
- `createMockCombinedQueriesHelpers()`
- `createMockMediaMetadataHelpers()`
- `createMockMediaProgressHelpers()`
- `createMockICloudBackupHelpers()`
- `createFileLifecycleMocks()` - Combined factory

**Note**: While these factories were created, the actual tests use inline mocking due to Jest's hoisting requirements. The factories remain useful for integration tests or future use cases where hoisting isn't an issue.

## Remaining Work 🚧

### Phase 2: Periodic Cleanup Service

#### Task 1: Create FileCleanupService

**New File**: `src/services/FileCleanupService.ts`

**Purpose**: Background service that periodically moves stale audiobooks from Documents to Caches.

**Requirements**:

1. **Initialization**:
   - Should start when app launches
   - Register with background task scheduler (if available)
   - Run on app startup and every 24 hours

2. **Core Logic**:

   ```typescript
   async function performCleanup(userId: string): Promise<{
     movedItems: string[];
     errors: Array<{ libraryItemId: string; error: string }>;
   }> {
     // 1. Get all downloaded items from database
     const downloadedFiles = await getAllDownloadedAudioFiles();

     // 2. Group by library item
     const itemMap = groupByLibraryItem(downloadedFiles);

     // 3. For each item, check if it should move to cache
     const results = { movedItems: [], errors: [] };

     for (const [libraryItemId, files] of itemMap) {
       const shouldMove = await shouldMoveToCache(libraryItemId, userId);

       if (shouldMove) {
         try {
           const success = await moveItemToCaches(libraryItemId);
           if (success) {
             results.movedItems.push(libraryItemId);
             log.info(`Cleanup: moved ${libraryItemId} to Caches`);
           } else {
             results.errors.push({ libraryItemId, error: "Move failed" });
           }
         } catch (error) {
           results.errors.push({ libraryItemId, error: error.message });
         }
       }
     }

     return results;
   }
   ```

3. **Scheduling Strategy**:
   - **App Startup**: Run cleanup on every app launch (after user is loaded)
   - **Periodic**: Use `setInterval()` with 24-hour interval when app is active
   - **Background Tasks**: Consider `expo-task-manager` for true background execution
   - **Manual Trigger**: Export function for user-initiated cleanup (settings menu)

4. **Integration Points**:
   - Call from `src/index.ts` in `handleAppUpdate()` after user load
   - Store last cleanup time in AsyncStorage to avoid duplicate runs
   - Respect user's network preferences (only run on WiFi if setting enabled)

5. **Error Handling**:
   - Log all errors but don't throw (cleanup should never crash the app)
   - Track failure count per item (after 3 failures, stop trying)
   - Report errors to analytics/crash reporting if available

6. **Testing**:
   - Unit tests for cleanup logic
   - Mock database and file system helpers
   - Test scheduling behavior
   - Test error scenarios (file locked, disk full, etc.)

**Estimated Effort**: 2-3 hours

#### Task 2: Update fileLifecycleManager.ts

**File**: `src/lib/fileLifecycleManager.ts`

**Changes Needed**:

1. Complete the `performPeriodicCleanup()` function (currently just a skeleton)
2. Add helper to group files by library item:

   ```typescript
   function groupByLibraryItem(files: DownloadedFile[]): Map<string, DownloadedFile[]> {
     const map = new Map();
     for (const file of files) {
       const libraryItemId = file.libraryItemId; // Extract from metadata
       if (!map.has(libraryItemId)) {
         map.set(libraryItemId, []);
       }
       map.get(libraryItemId).push(file);
     }
     return map;
   }
   ```

3. Add cleanup tracking to prevent spam:

   ```typescript
   // Track failed cleanup attempts
   const cleanupFailures = new Map<string, number>();
   const MAX_CLEANUP_FAILURES = 3;

   export function shouldRetryCleanup(libraryItemId: string): boolean {
     const failures = cleanupFailures.get(libraryItemId) || 0;
     return failures < MAX_CLEANUP_FAILURES;
   }
   ```

**Estimated Effort**: 1 hour

### Phase 3: Startup Cleanup Detection & User Notification

#### Task 3: Implement Cleanup Detection on Startup

**File**: `src/index.ts`

**Integration Point**: `handleAppUpdate()` function

**Implementation**:

```typescript
async function handleAppUpdate() {
  // ... existing app update logic ...

  // After user is loaded and app is ready
  try {
    const { detectCleanedUpFiles } = await import("@/lib/fileLifecycleManager");
    const cleanedFiles = await detectCleanedUpFiles();

    if (cleanedFiles.length > 0) {
      // Show notification to user
      await notifyUserOfCleanedFiles(cleanedFiles);
    }
  } catch (error) {
    log.error("Failed to detect cleaned up files:", error);
    // Don't block app startup on failure
  }

  // Run periodic cleanup
  try {
    const { performPeriodicCleanup } = await import("@/services/FileCleanupService");
    const user = await getCurrentUser();
    if (user) {
      await performPeriodicCleanup(user.id);
    }
  } catch (error) {
    log.error("Failed to run periodic cleanup:", error);
  }
}
```

**Estimated Effort**: 30 minutes

#### Task 4: Create User Notification System

**New File**: `src/lib/notifications/fileCleanupNotifications.ts`

**Purpose**: Show user-friendly alerts when iOS has cleaned up audiobook files.

**Requirements**:

1. **Notification Display**:
   - Use React Native `Alert` for modal notification
   - Show on app startup after detection completes
   - Non-blocking - user can dismiss

2. **Message Format**:

   ```typescript
   async function notifyUserOfCleanedFiles(cleanedFiles: CleanedUpFile[]): Promise<void> {
     // Group by library item and get titles
     const itemTitles = await getItemTitles(cleanedFiles);

     const message =
       cleanedFiles.length === 1
         ? `iOS removed "${itemTitles[0]}" to free up storage space. You can re-download it anytime.`
         : `iOS removed ${cleanedFiles.length} audiobooks to free up storage space:\n\n${itemTitles
             .slice(0, 5)
             .map((t) => `• ${t}`)
             .join(
               "\n"
             )}${cleanedFiles.length > 5 ? `\n\n...and ${cleanedFiles.length - 5} more` : ""}\n\nYou can re-download them anytime.`;

     Alert.alert("Storage Cleanup", message, [
       {
         text: "OK",
         style: "default",
       },
       {
         text: "View Items",
         onPress: () => {
           // Navigate to downloads screen
           navigateToDownloads();
         },
       },
     ]);
   }
   ```

3. **Helper to Get Titles**:

   ```typescript
   async function getItemTitles(cleanedFiles: CleanedUpFile[]): Promise<string[]> {
     // Use the title from CleanedUpFile (already in the object)
     return cleanedFiles.map((f) => f.title);
   }
   ```

4. **User Settings**:
   - Add setting to disable cleanup notifications (some users may not care)
   - Store in `src/lib/appSettings.ts`:

     ```typescript
     export async function getShowCleanupNotifications(): Promise<boolean> {
       return (await AsyncStorage.getItem("showCleanupNotifications")) !== "false";
     }

     export async function setShowCleanupNotifications(enabled: boolean): Promise<void> {
       await AsyncStorage.setItem("showCleanupNotifications", String(enabled));
     }
     ```

**Estimated Effort**: 1-2 hours

### Phase 4: UI Updates (Optional)

#### Task 5: Add Storage Location Indicator

**File**: `src/components/library/LibraryItemDetail.tsx`

**Purpose**: Show users where their audiobook files are stored and allow manual management.

**UI Mockup**:

```
┌─────────────────────────────────────┐
│ The Hobbit                          │
│ by J.R.R. Tolkien                   │
├─────────────────────────────────────┤
│                                     │
│ [▶ Play]  [⬇ Download]             │
│                                     │
│ Downloaded: 3 files (256 MB)       │
│ Storage: Documents (Protected)      │ <- New indicator
│                                     │
│ ⓘ Files in Documents won't be      │
│   removed by iOS. Finished or       │
│   inactive books move to Caches     │
│   after 2 weeks.                    │
│                                     │
│ [Move to Caches Now]                │ <- Optional: Manual override
└─────────────────────────────────────┘
```

**Implementation**:

1. Query current storage location for downloaded items
2. Show badge: "Documents (Protected)" or "Caches (May be removed)"
3. Add info tooltip explaining the system
4. Optional: Add manual "Move to Caches" button for power users

**Estimated Effort**: 2-3 hours

#### Task 6: Add Settings Toggle

**File**: `src/screens/SettingsScreen.tsx`

**New Settings**:

1. **Enable File Lifecycle Management** (default: ON)
   - When OFF: Files stay in Documents forever
   - When ON: System manages movement based on usage

2. **Cleanup Notifications** (default: ON)
   - Show/hide notifications when iOS cleans up files

3. **Manual Cleanup Button**:
   - "Clean Up Now" - triggers immediate cleanup
   - Shows results in toast: "Moved 3 audiobooks to Caches"

**Estimated Effort**: 1-2 hours

### Phase 5: Documentation & Polish

#### Task 7: Write Architecture Documentation

**New File**: `docs/architecture/file-lifecycle-management.md`

**Sections to Cover**:

1. **Overview**: Problem statement and solution approach
2. **System Design**:
   - File flow diagram (Download → Documents → Caches → iOS Cleanup)
   - State machine diagram
   - Database schema
3. **Key Components**:
   - FileLifecycleManager responsibilities
   - FileCleanupService scheduling
   - PlayerBackgroundService tracking
4. **Decision Log**:
   - Why 2-minute threshold for meaningful listening
   - Why synchronous file movement before playback
   - Why Documents + iCloud exclusion (not just Caches)
5. **Edge Cases & Handling**:
   - What if file move fails during playback?
   - What if user manually deletes files?
   - What if disk is full?
6. **Testing Strategy**: How to test the system end-to-end
7. **Future Improvements**: Known limitations and potential enhancements

**Estimated Effort**: 2-3 hours

#### Task 8: Add Inline Code Documentation

**Files to Document**:

- `src/lib/fileLifecycleManager.ts` - Add JSDoc for all exported functions
- `src/services/FileCleanupService.ts` - Document scheduling behavior
- `src/lib/fileSystem.ts` - Document atomic move guarantees

**Example JSDoc Format**:

````typescript
/**
 * Moves all audio files for a library item from Caches to Documents directory
 * and applies iCloud backup exclusion to prevent backup bloat.
 *
 * This operation is atomic per file: copy → verify → delete. If any step fails,
 * the file remains in its original location.
 *
 * @param libraryItemId - The library item ID to move
 * @returns Promise<boolean> - true if ALL files moved successfully, false if ANY failed
 *
 * @remarks
 * - Called automatically by PlayerService before playback starts
 * - Updates database storage_location field for all affected files
 * - Applies iCloud exclusion even if files are already in Documents
 * - Gracefully handles missing metadata or empty file lists
 *
 * @example
 * ```typescript
 * const success = await moveItemToDocuments('library-item-123');
 * if (success) {
 *   console.log('Ready for playback');
 * } else {
 *   console.warn('Some files failed to move, but playback may continue from cache');
 * }
 * ```
 */
export async function moveItemToDocuments(libraryItemId: string): Promise<boolean>;
````

**Estimated Effort**: 1-2 hours

## Testing Checklist

### Unit Tests ✅

- [x] File lifecycle manager (25 tests)
- [ ] FileCleanupService (to be written)
- [ ] Notification helpers (to be written)

### Integration Tests

- [ ] End-to-end flow: Download → Play 2min → Wait 2 weeks → Cleanup → Verify in Caches
- [ ] Playback with files in Caches (verify auto-move to Documents)
- [ ] iOS cleanup detection (simulate by deleting files)
- [ ] Multiple concurrent downloads

### Manual Testing Scenarios

1. **Download Flow**:
   - Download audiobook → Verify in Documents → Check iCloud exclusion set

2. **Playback Flow**:
   - Download → Move to Caches manually → Play → Verify auto-move to Documents
   - Play for 1 minute → Stop → Check lastAccessedAt NOT updated
   - Play for 3 minutes → Stop → Check lastAccessedAt updated

3. **Cleanup Flow**:
   - Download → Mark as finished → Wait for cleanup → Verify in Caches
   - Download → Play → Wait 14 days (simulate by changing lastAccessedAt) → Run cleanup → Verify in Caches

4. **iOS Cleanup Simulation**:
   - Download → Move to Caches → Delete files manually → Restart app → Verify notification shown
   - Dismiss notification → Verify item shows as "Not Downloaded"

5. **Error Scenarios**:
   - Full disk → Try to move → Verify graceful failure
   - Corrupted file → Try to move → Verify error logged
   - Network interruption during download → Verify cleanup of partial files

## Migration Guide

### For Users

No action required. The system works automatically:

- Existing downloads remain in Caches (backward compatible)
- New downloads go to Documents
- Over time, the system will migrate files based on usage

### For Developers

1. **Database Migration**: Already generated (`0011_natural_betty_ross.sql`)
   - Run automatically on next app update
   - Non-destructive - adds columns with default values

2. **Breaking Changes**: None
   - All file system functions have backward-compatible defaults
   - Existing code continues to work without changes

3. **New Dependencies**: None
   - Uses existing iCloud backup exclusion native module
   - No new npm packages required

## Performance Considerations

### Storage Impact

- **Before**: All files in Caches (~500MB average audiobook)
- **After**: Active files in Documents, inactive in Caches
- **Net Impact**: ~same (Documents + iCloud exclusion = no backup bloat)

### CPU Impact

- **Startup**: ~100-200ms for cleanup detection (runs once)
- **Playback**: ~50-100ms for file location check (runs once per track)
- **Background**: ~1-2s for periodic cleanup (runs every 24h)

### Battery Impact

- Minimal - cleanup only runs when app is active
- File moves use native file system APIs (efficient)
- No polling or frequent timers

## Known Limitations

1. **No True Background Cleanup**:
   - Cleanup only runs when app is active
   - iOS limitations prevent true background file operations
   - Workaround: Run on app startup (covers most usage patterns)

2. **2-Week Detection Accuracy**:
   - Based on `lastAccessedAt` timestamp, not iOS's internal file metadata
   - If user never plays for ≥2min, timestamp never updates
   - Workaround: Also check "finished" status

3. **File Move During Playback**:
   - Synchronous operation blocks playback start
   - For large files (>500MB), could take 5-10 seconds
   - Workaround: Graceful failure allows playback from cache

4. **Multiple Devices**:
   - Storage location is per-device (not synced via API)
   - User may see different behavior across devices
   - Not a bug - intentional (each device has different storage constraints)

## Future Enhancements

1. **Smart Prefetch**:
   - When user is on WiFi with battery >50%, proactively move likely-to-play items to Documents
   - Use listening history to predict next book

2. **Storage Pressure Response**:
   - Integrate with iOS storage API to detect low space
   - Automatically move more items to Caches when space is tight

3. **Analytics**:
   - Track how often iOS cleans up files
   - Track storage space saved
   - Track user behavior patterns (do users re-download frequently?)

4. **User Controls**:
   - Per-book override: "Always keep in Documents"
   - Bulk operations: "Move all finished books to Caches"
   - Storage visualization: Pie chart of storage usage

5. **Cloud Sync**:
   - Upload finished/inactive audiobooks to user's cloud storage
   - Download on demand when needed
   - Requires API changes on server

## Risk Assessment

| Risk                    | Likelihood | Impact | Mitigation                                    |
| ----------------------- | ---------- | ------ | --------------------------------------------- |
| Data Loss               | Low        | High   | Atomic file moves; verify before delete       |
| Performance Degradation | Low        | Medium | Async operations; throttled cleanup           |
| User Confusion          | Medium     | Low    | Clear notifications; documentation            |
| Storage Bloat           | Low        | Medium | iCloud exclusion; periodic cleanup            |
| iOS API Changes         | Low        | High   | Abstract file system ops; comprehensive tests |

## Success Metrics

After deployment, measure:

1. **Storage Efficiency**: Average Documents directory size (expect: 50% reduction over time)
2. **User Impact**: Number of cleanup notifications shown (expect: <1 per week per user)
3. **Performance**: P95 playback start time (expect: no significant change)
4. **Errors**: File move failure rate (expect: <0.1%)
5. **Re-downloads**: Frequency of re-downloading cleaned files (expect: <5% of cleanups)

## Timeline Estimate

| Phase     | Tasks                             | Effort          | Priority |
| --------- | --------------------------------- | --------------- | -------- |
| Phase 2   | FileCleanupService                | 3-4 hours       | **High** |
| Phase 3   | Cleanup Detection & Notifications | 2-3 hours       | **High** |
| Phase 4   | UI Updates                        | 3-5 hours       | Medium   |
| Phase 5   | Documentation                     | 3-5 hours       | Medium   |
| **Total** |                                   | **11-17 hours** |          |

**Recommended Approach**: Complete Phases 2-3 first (core functionality), then Phase 5 (documentation). Phase 4 (UI) can be deferred to a future release.

## Questions for Product Review

Before proceeding with remaining implementation:

1. **Notification Frequency**: Should we limit cleanup notifications to once per day, even if multiple cleanups occur?

2. **Manual Controls**: Do we want to expose manual file management in the UI, or keep it fully automatic?

3. **Settings Discoverability**: Should file lifecycle settings be in main Settings, or hidden in Developer/Advanced?

4. **Analytics**: What metrics should we track to measure success?

5. **Beta Testing**: Should we test with a subset of users first, or full rollout?

## Related Documentation

- `docs/architecture/file-lifecycle-management.md` - Comprehensive architecture doc (to be written)
- `src/lib/fileLifecycleManager.ts` - Core implementation with inline docs
- `src/__tests__/mocks/README.md` - Shared mock library patterns
- Database schema: `src/db/schema/localData.ts`

## References

- iOS File System: https://developer.apple.com/documentation/foundation/file_system
- iCloud Backup Exclusion: https://developer.apple.com/documentation/foundation/nsurlisexcludedfrombackupkey
- React Native TrackPlayer Events: https://rntp.dev/docs/api/events
- Expo Task Manager: https://docs.expo.dev/versions/latest/sdk/task-manager/

---

**Document Version**: 1.0
**Last Updated**: 2025-01-22
**Status**: Ready for Phase 2 Implementation
