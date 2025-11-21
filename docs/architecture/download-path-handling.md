# Download Path Handling and iOS Container Path Changes

## Overview

This document explains how the app handles file download paths and the specific iOS behavior that requires special handling.

## The iOS Container Path Problem

### What Happens

iOS applications store their data in a sandboxed container with a unique identifier. The full path looks like:

```
file:///var/mobile/Containers/Data/Application/ABC12345-XXXX-XXXX-XXXX-XXXXXXXXXXXX/Library/Caches/downloads/...
```

**The Problem:** This container identifier can change between app launches. When it does:
1. Files on disk are moved to the new container path
2. Absolute paths stored in the database become invalid
3. The app can't find files even though they still exist on disk

### Impact on Downloads

When a user downloads an audiobook:
1. The file is saved to the downloads directory
2. The file path is stored in the database
3. If the path is absolute (not relative), it includes the container ID
4. On next app launch, if the container ID changed, the stored path is broken
5. The app thinks the file isn't downloaded, even though it is

## Solution: Relative Path Storage

### Implementation

The app uses a two-function approach in `src/lib/fileSystem.ts`:

1. **`toAppRelativePath(path: string)`**: Converts absolute paths to relative paths before storing
   ```typescript
   // Before storing: file://.../ABC123/.../downloads/book.m4b
   // After: downloads/book.m4b
   ```

2. **`resolveAppPath(path: string)`**: Resolves relative paths back to absolute when reading
   ```typescript
   // Stored: downloads/book.m4b
   // Resolved: file://.../XYZ789/.../downloads/book.m4b (with current container)
   ```

### Database Storage

All download paths are stored in the `local_audio_file_downloads` table:

```sql
CREATE TABLE local_audio_file_downloads (
  audio_file_id TEXT PRIMARY KEY,
  is_downloaded BOOLEAN NOT NULL DEFAULT TRUE,
  download_path TEXT NOT NULL,  -- Stored as RELATIVE path
  downloaded_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

## Automatic Repair Mechanism

### Why It's Needed

Despite relative path storage, some paths may still be absolute in the database:
- Paths from before the relative path migration
- Paths that couldn't be converted to relative (edge cases)
- Corrupted data from crashes during writes

### How It Works

The `DownloadService.repairDownloadStatus()` function is called automatically when:
- The item details screen is opened
- Any component needs to verify download status

The repair process:

1. **Check stored path**: Does the file exist at the path in the database?
2. **If not, try expected path**: Calculate where the file should be (using current container)
3. **If found, update database**: Store the corrected path
4. **If not found, clear status**: The file was truly deleted (iOS storage cleanup)

```typescript
// Example repair flow
Stored path:   file://.../ABC123/.../downloads/book.m4b  ❌ (old container)
Expected path: file://.../XYZ789/.../downloads/book.m4b  ✓ (current container)
Action: Update database with expected path
```

### Logging

The repair function logs all actions at INFO level:

```
[DownloadService] Repairing download status for item-123...
[DownloadService] File marked as downloaded but missing at stored path: book.m4b
  Stored path: file://.../ABC123/.../downloads/book.m4b
  ✓ Found file at expected path: file://.../XYZ789/.../downloads/book.m4b
  Updating database with corrected path...
  ✓ Repaired download path for book.m4b
[DownloadService] Repaired 1 file(s) for library item item-123
```

## User Experience

### Before Automatic Repair

1. User downloads a book
2. App restarts (container ID changes)
3. Item details screen shows book as "not downloaded"
4. User taps download button
5. App checks disk, finds file, marks as downloaded
6. **Annoying**: User had to tap download for a book they already have

### After Automatic Repair

1. User downloads a book
2. App restarts (container ID changes)
3. Item details screen opens
4. **Automatic repair runs silently**
5. File is found and path is updated
6. Screen shows book as downloaded
7. **Seamless**: No user action needed

## Migration Considerations

### Initial Migration

The `preserveExistingLocalData()` function in `src/db/helpers/migrationHelpers.ts` migrates old download data:

```typescript
// Reads old absolute paths
const existingAudioDownloads = sqliteDb.getAllSync(`
  SELECT id, download_path, downloaded_at
  FROM audio_files
  WHERE is_downloaded = 1 AND download_path IS NOT NULL
`);

// Stores them using relative path conversion
for (const row of existingAudioDownloads) {
  await markAudioFileAsDownloaded(row.id, row.download_path);
  // markAudioFileAsDownloaded calls toAppRelativePath internally
}
```

### Edge Case

If the container ID changed between when the old data was created and when the migration runs:
- `toAppRelativePath()` can't convert the path (it's not under current base directory)
- The absolute path is stored as-is
- **Automatic repair will fix it** on next item details view

## Code Locations

- **Path conversion**: `src/lib/fileSystem.ts`
  - `toAppRelativePath()`
  - `resolveAppPath()`

- **Database helpers**: `src/db/helpers/localData.ts`
  - `markAudioFileAsDownloaded()` - uses `toAppRelativePath()`
  - `getAudioFileDownloadInfo()` - uses `resolveAppPath()`

- **Repair mechanism**: `src/services/DownloadService.ts`
  - `repairDownloadStatus()`

- **Automatic trigger**: `src/components/library/LibraryItemDetail.tsx`
  - Called in `useEffect` when component loads

## Testing

### Manual Test

1. Download a book
2. Check the database path:
   ```sql
   SELECT download_path FROM local_audio_file_downloads LIMIT 1;
   ```
3. Should see relative path like: `downloads/abc-123/book.m4b`
4. Close and reopen app
5. Open item details
6. Book should still show as downloaded

### Simulating Container Change

Since we can't force iOS to change the container ID, the automatic repair can be tested by:

1. Manually updating database with an absolute path with fake container ID
2. Opening item details screen
3. Checking logs for repair messages

## Future Improvements

1. **Batch repair on app startup**: Currently repairs per-item, could batch all items
2. **Background repair**: Run repair during idle time instead of on-demand
3. **Metrics**: Track how often repairs are needed to understand frequency

## Related Issues

- iOS storage cleanup: iOS may delete cached files to free space
- Migration timing: Container changes during migration can create absolute paths
- User confusion: Downloaded items appearing as not downloaded
