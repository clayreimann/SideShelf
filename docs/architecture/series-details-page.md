# Series Details Page Implementation

This document describes the current implementation of the Series Details page and its related components.

## File Structure

### Series Detail Page Components
- **Series List Page**: `/home/user/SideShelf/src/app/(tabs)/series/[seriesId]/index.tsx`
  - Main series detail page that displays a list of all books in a series
  - Shows basic book information: title, author, sequence number, duration
  
- **Series Item Detail Page**: `/home/user/SideShelf/src/app/(tabs)/series/[seriesId]/item/[itemId].tsx`
  - Shows individual library item detail (reuses LibraryItemDetail component)
  - Navigates to when clicking a specific book in the series

### Core Library Item Detail Component
- **LibraryItemDetail**: `/home/user/SideShelf/src/components/library/LibraryItemDetail.tsx` (939 lines)
  - Main component for displaying full details of any audiobook/podcast item
  - Used by both series item view and standalone item views
  - Handles progress tracking, downloads, and playback

### Supporting Components
- **DownloadProgressView**: `/home/user/SideShelf/src/components/library/LibraryItemDetail/DownloadProgressView.tsx`
  - Displays download progress with dual progress bars (overall + current file)
  - Shows download statistics (speed, ETA, file count)
  - Provides pause/resume/cancel controls

### Database & Store
- **Series Store Slice**: `/home/user/SideShelf/src/stores/slices/seriesSlice.ts`
  - Manages all series state (list, sorting, loading states)
  - Handles initialization and persistence to AsyncStorage

- **Series DB Helpers**: `/home/user/SideShelf/src/db/helpers/series.ts`
  - `getAllSeries()` - fetches all series with associated books
  - Transforms raw database rows to display format
  - Returns `SeriesWithBooks` type with nested book information

- **Download Slice**: `/home/user/SideShelf/src/stores/slices/downloadSlice.ts`
  - Tracks active downloads, completed downloads
  - Manages download progress updates and state changes

### Services
- **ProgressService**: `/home/user/SideShelf/src/services/ProgressService.ts` (1183 lines)
  - Manages playback session tracking and progress synchronization
  - Handles listening time tracking across sessions
  - Syncs progress to server periodically
  - Detects and handles stale sessions

- **DownloadService**: `/home/user/SideShelf/src/services/DownloadService.ts` (972 lines)
  - Manages audio file downloads using RNBackgroundDownloader
  - Tracks download progress with speed calculation
  - Supports pause, resume, and cancel operations
  - Handles concurrent multi-file downloads

## Current Series Detail Page Layout (index.tsx)

```typescript
Series Detail Screen
├── Header: Series name from series list
├── FlatList of Books
│   ├── Book Row (per book)
│   │   ├── Cover Image (64x96)
│   │   ├── Title (max 2 lines)
│   │   ├── Author Name (if available)
│   │   ├── Sequence Label ("Book N")
│   │   └── Duration (formatted)
│   └── OnPress: Navigate to /series/{seriesId}/item/{libraryItemId}
└── Empty state message
```

### Navigation Flow
- Series List → Tap Book → SeriesItemDetailScreen → LibraryItemDetail Component
- LibraryItemDetail provides:
  - Full metadata display (title, author, narrator, series, duration)
  - Cover image (60% of screen width)
  - Progress tracking with visual progress bar
  - Genre and tag chips
  - Description (collapsible)
  - Chapter list (collapsible)
  - Audio files list (collapsible)
  - Play button with state indicator
  - Action menu (ellipsis icon in header)

## How Series Items Are Displayed

### In Series List (series/[seriesId]/index.tsx)
```typescript
// Data structure from database helper
interface SeriesBookRow {
  libraryItemId: string;      // Used for navigation
  mediaId: string;            // Media identifier
  title: string;              // Book title
  authorName: string | null;  // Author
  sequence: string | null;    // Book position in series
  coverUrl: string | null;    // Local cover path
  duration: number | null;    // In seconds
}

// Fetched via: const series = await getAllSeries()
// Returns: SeriesWithBooks[] where each has: { ...SeriesRow, books: SeriesBookRow[] }
```

### In Item Detail (uses LibraryItemDetail component)
```typescript
// Displays comprehensive information about selected book
- Metadata from mediaMetadata table
- Cover image from local cache or API
- Progress from mediaProgress table
- Audio files from audioFiles table (for chapters/tracks)
- Author/Narrator/Series navigation links
```

## Progress Tracking Implementation

### How Progress is Tracked

**Database Storage:**
- `mediaProgress` table stores: userId, libraryItemId, currentTime, duration, progress, isFinished, lastUpdate
- `localListeningSessions` table tracks active playback sessions with detailed timing

**Live Progress in LibraryItemDetail:**
```typescript
// Effective progress = latest server/local value + live player position if currently playing
const effectiveProgress = useMemo(() => {
  if (!progress || !item) return null;
  
  // If this item is currently playing, use live position from player store
  const isThisItemPlaying = currentTrack?.libraryItemId === item.id;
  
  if (isThisItemPlaying && position !== undefined) {
    return {
      ...progress,
      currentTime: position,  // Live position updated every second
      progress: position / duration,
    };
  }
  
  // Otherwise use stored progress
  return progress;
}, [progress, currentTrack, position]);
```

### Progress Bar Display (LibraryItemDetail line 720-740)
- Shows visual progress bar with current time / total duration
- Displays percentage completion
- Only shown if item has progress (currentTime > 0) OR is finished
- Updates in real-time if item is currently playing

### Server Synchronization
- **Automatic**: progressService.fetchServerProgress() called on item detail load
- **On Pause**: Immediate sync to server when playback pauses
- **Periodic**: Background sync every 15s on unmetered (WiFi), 60s on metered
- **Manual**: "Force Resync Position" action available in menu

## Downloads Implementation

### Download State Flow
1. User taps Menu (ellipsis) → "Download" action
2. `handleDownload()` calls `startDownload(itemId, serverUrl, accessToken)`
3. DownloadService:
   - Fetches metadata and audio files
   - Creates background download tasks via RNBackgroundDownloader
   - Tracks progress across all files
   - Marks files as downloaded in database when complete

### Download Progress Tracking
```typescript
// DownloadProgressView shows:
- Overall progress bar (all files combined)
- Current file progress bar (if multiple files)
- Download speed (KB/s, MB/s with smoothing)
- Estimated time remaining (ETA)
- File count (X/Y files downloaded)
- Size info (bytes/total)
- Control buttons: Pause, Resume, Cancel

// Can pause/resume individual downloads
// Status: downloading, paused, completed, error, cancelled
```

### Download Storage
- Files stored locally using RNBackgroundDownloader
- Metadata tracked in database (audioFiles.downloadInfo)
- Concurrent downloads of multiple files
- Download survival across app restarts

## Navigation Menu & Action Buttons

### Series Detail Page Header
- Title: Series name
- No additional header actions shown in current implementation

### Library Item Detail Page Header (top-right menu)
**Menu Actions:**
- **Download** (if not downloaded and server reachable)
  - Action ID: "download"
  - Icon: arrow.down.circle
  
- **Delete Download** (if already downloaded)
  - Action ID: "delete"
  - Icon: trash
  - Style: Destructive (red)
  
- **Mark as Finished/Unfinished** (if has progress)
  - Action ID: "mark-finished"
  - Icon: checkmark.circle (finished) or arrow.uturn.backward.circle (unfinished)
  - Conditional on having progress
  
- **Force Resync Position** (if has progress or currently playing)
  - Action ID: "force-resync"
  - Icon: arrow.clockwise.circle
  - Syncs position from server

**Implementation:**
```typescript
// Uses @react-native-menu/menu MenuView component
<MenuView
  title="Options"
  onPressAction={({ nativeEvent }) => {
    handleMenuAction(nativeEvent.event);
  }}
  actions={menuActions}  // Dynamically built based on state
>
  <Ionicons name="ellipsis-horizontal" size={24} />
</MenuView>
```

### Primary Action Buttons (Below Cover)
- **Play Button** (green, #34C759)
  - Label changes based on state:
    - "Play" - default
    - "Pause" - if currently playing this item
    - "Loading" - while track is being loaded
    - "Offline" - if not downloaded and server unreachable
  - Disabled if: loading track OR (not downloaded AND offline)

## Key Implementation Details

### Series Display (series/[seriesId]/index.tsx)
- Uses `useSeries()` hook from store
- Fetches series with `refetchSeries()` on focus
- Shows loading indicator while fetching
- Books sorted by sequence number (from database query)
- Each book row is a TouchableOpacity for navigation

### Item Detail Display (LibraryItemDetail)
- Fetches full metadata via `fetchItemDetails(itemId, userId)`
- Caches data in store: `useLibraryItemDetails().getCachedItem(itemId)`
- Derives all display data from cache:
  - metadata (title, description, author, narrator, etc.)
  - progress (current position, duration, finished status)
  - chapters from audio files
  - genres and tags from metadata
  
### Progress Calculation
- Server progress stored in mediaProgress table
- Live position from player service (TrackPlayer)
- Effective progress = server progress + live delta if playing
- Only displays if progress > 0 OR is finished

### Download State Management
- Store tracks: `activeDownloads[itemId]` and `downloadedItems` Set
- Service tracks detailed progress: bytesDownloaded, downloadSpeed, fileProgress
- Download subscription model for UI updates:
  ```typescript
  const downloadProgress = activeDownloads[itemId];
  const isDownloaded = isItemDownloaded(itemId);
  ```

## Store Integration Points

### Series Slice
- `useSeries()` provides: series list, sorting, loading states, ready flag
- Called in series detail page to fetch books for display

### LibraryItemDetails Slice
- `useLibraryItemDetails()` provides: item metadata, progress, chapters, files
- Caches fetch results to avoid repeated API calls
- `updateItemProgress(itemId, progressData)` called after sync

### Download Slice
- `useDownloads()` provides: activeDownloads map, downloadedItems set
- Actions: `startDownload()`, `deleteDownload()`, `isItemDownloaded()`
- Subscribes to DownloadService progress updates

### Network Slice
- `useNetwork()` provides: serverReachable boolean
- Used to disable play button when offline and not downloaded

## Potential Enhancement Areas

1. **Series Progress Overview**
   - Could add series-level progress indicator showing % books completed
   - Could add book progress preview in series list

2. **Download Management**
   - Series-level download (download all books at once)
   - Download queue management
   - Download prioritization

3. **Series Navigation**
   - Quick nav buttons for next/previous book
   - Chapter-based navigation between books

4. **Batch Operations**
   - Mark all books in series as finished
   - Delete all downloads for a series

5. **Series Metadata**
   - Series description display
   - Series image/cover
   - Total series duration

## Testing Notes

- Series detail page requires series to be in database (populated via library sync)
- Each book must have metadata and audio files in database
- Progress requires user to be logged in and have listening sessions
- Downloads require server connectivity and valid access token
