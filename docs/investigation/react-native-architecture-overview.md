# React Native App Architecture Overview

## User Settings/Preferences Storage and UI

### Storage Layer
**File:** `/home/user/SideShelf/src/lib/appSettings.ts`
- Uses **AsyncStorage** for persisting user preferences
- Implements functions for managing:
  - `jumpForwardInterval` (default: 30 seconds) - Skip forward amount
  - `jumpBackwardInterval` (default: 15 seconds) - Skip backward amount
  - `smartRewindEnabled` (default: true) - Auto-rewind on resume feature
  - `homeLayout` (default: "list") - Home screen layout preference (list or cover)
  - `enablePeriodicNowPlayingUpdates` (default: true) - Periodic metadata sync
  - `enableDiagnostics` (default: false) - Developer/diagnostics mode

### State Management
**File:** `/home/user/SideShelf/src/stores/slices/settingsSlice.ts`
- Uses **Zustand** for reactive state management
- Actions provide getters/setters for all settings with optimistic updates
- Automatically persists changes to AsyncStorage
- Includes error handling with rollback on save failures

### UI Component
**File:** `/home/user/SideShelf/src/app/(tabs)/more/settings.tsx`
- Settings screen component showing:
  - **Library Selection** - Choose active library from available options
  - **Playback Controls** - Configure jump intervals (5-90 seconds)
  - **Smart Rewind Toggle** - Enable/disable auto-rewind on pause/resume
  - **Developer Section** - Diagnostics mode toggle
  
**Architecture Pattern:**
```
UI (settings.tsx)
  └─> useSettings() hook
       └─> SettingsSlice (Zustand)
            └─> AppSettings module (AsyncStorage)
```

---

## Background Player Service Implementation

### Main Background Service
**File:** `/home/user/SideShelf/src/services/PlayerBackgroundService.ts`

This is a critical service required by `react-native-track-player` for handling background playback and remote control events.

#### Key Responsibilities:
1. **Remote Control Handlers** - Respond to device remote controls/headset buttons
2. **Playback Events** - Handle play/pause/stop state changes
3. **Progress Tracking** - Continuously update playback position
4. **Progress Syncing** - Sync progress to database and server
5. **Sleep Timer** - Monitor and enforce sleep timer expirations
6. **Chapter Navigation** - Track chapter changes and update metadata
7. **Smart Rewind** - Apply smart rewind logic on resume from pause

#### Event Handlers Implemented:
- **Remote Play/Pause** - Applies smart rewind on play
- **Remote Next/Previous** - Skip to next/previous track
- **Remote Seek** - Manual seeking with progress sync
- **Remote Jump Forward/Backward** - Skip by configured intervals
- **Audio Duck** - Handle audio focus loss (calls, notifications)
- **Playback State Changed** - Track play/pause/stop transitions
- **Playback Progress Updated** - Called every second during playback
  - Updates progress in database (ProgressService)
  - Checks chapter changes
  - Updates now-playing metadata
  - Evaluates sleep timer
  - Determines if server sync is needed
- **Active Track Changed** - Started when track changes in queue
  - Creates new listening session
  - Tracks playback start time and position
- **Playback Error** - Handles playback errors, ends session

#### Architecture Pattern:
```
TrackPlayer (native library)
  └─> PlayerBackgroundService module
       ├─> Event Handlers (track player events)
       ├─> ProgressService (progress tracking/syncing)
       ├─> useAppStore (state updates)
       ├─> AppSettings (smart rewind check)
       └─> Progress sync to database
```

### Supporting Player Service
**File:** `/home/user/SideShelf/src/services/PlayerService.ts`
- Initializes and configures the TrackPlayer
- Handles track playback (local and remote files)
- Manages playlist/queue operations
- Reconciles state between TrackPlayer, Store, and Database
- Manages play sessions with progress service

---

## Download Queue and Download Initiation Logic

### Download Service
**File:** `/home/user/SideShelf/src/services/DownloadService.ts`

**Singleton Pattern Implementation:**
```typescript
DownloadService.getInstance() // Get or create singleton instance
```

#### Core Features:
1. **Download Initiation**
   - `startDownload(itemId, serverUrl, token)` - Starts downloading all audio files for an item
   - Fetches metadata and audio files from database
   - Creates parallel download tasks for all files
   - Reports progress via callbacks

2. **Progress Tracking**
   - Maintains `activeDownloads` Map with per-file progress
   - Calculates smoothed download speed using speed tracker
   - Debounces progress updates for UI efficiency
   - Tracks states: downloading, paused, completed, error, cancelled

3. **Download Control**
   - `pauseDownload()` / `resumeDownload()` - Control active downloads
   - `cancelDownload()` - Stop and cleanup
   - `isDownloadActive()` - Check if item is downloading

4. **Persistence**
   - Checks for existing background downloads on app resume
   - Restores download tracking for in-flight downloads
   - Marks audio files as downloaded in database with file path

5. **Completion Tracking**
   - Verifies file existence on disk
   - Updates database to mark files as downloaded
   - Removes from active downloads map

#### Implementation Details:
- Uses `react-native-background-downloader` library for background downloads
- Stores metadata in download tasks for recovery on app restart
- File path format: `<app-documents>/downloads/{libraryItemId}/{filename}`
- Calculates total progress across multiple files

### Download State Management
**File:** `/home/user/SideShelf/src/stores/slices/downloadSlice.ts`

**State Tracking:**
```typescript
downloads: {
  activeDownloads: Record<string, DownloadProgress>;  // By library item ID
  downloadedItems: Set<string>;                        // Completed items
  initialized: boolean;
  isLoading: boolean;
}
```

**Actions:**
- `initializeDownloads()` - Load downloaded items from database on app start
- `startDownload()` - Initiate download with progress callback
- `updateDownloadProgress()` - Update UI state with download progress
- `completeDownload()` - Mark item as fully downloaded
- `deleteDownload()` - Delete downloaded files and update DB
- `isItemDownloaded()` - Check if item is fully downloaded

#### Architecture Pattern:
```
UI Component (DownloadButton, DownloadProgressView)
  └─> useAppStore().startDownload()
       └─> DownloadSlice.startDownload()
            ├─> DownloadService.startDownload()
            │    ├─> Fetches metadata & audio files from DB
            │    ├─> Creates parallel RNBackgroundDownloader tasks
            │    ├─> Monitors progress via callbacks
            │    ├─> Marks files as downloaded in DB
            │    └─> Cleanup on completion
            └─> Updates Redux state on progress callbacks
                 └─> UI re-renders with progress
```

---

## Series/Podcast Progression and "Next Item" Logic

### Current State (NOT YET IMPLEMENTED)
This is the feature being developed on the `claude/auto-queue-next-item-01Kov6rZD6ThTCxVkcmLD7XQ` branch.

### Series Data Model
**File:** `/home/user/SideShelf/src/db/helpers/series.ts`

#### Series Structure:
```typescript
interface SeriesWithBooks {
  id: string;
  name: string;
  description: string | null;
  books: SeriesBookRow[];  // Ordered by sequence
}

interface SeriesBookRow {
  libraryItemId: string;
  mediaId: string;
  title: string;
  authorName: string;
  sequence: number;        // Order in series (determines "next")
  coverUrl: string | null;
  duration: number | null;
}
```

#### Key Functions:
- `getAllSeries()` - Returns all series with books ordered by sequence
- `getSeriesById(id)` - Get specific series
- `upsertSeries()` - Create/update series in database

### Series State Management
**File:** `/home/user/SideShelf/src/stores/slices/seriesSlice.ts`

**State:**
```typescript
series: {
  series: SeriesWithBooks[];           // Full series data
  rawItems: SeriesListRow[];           // Display format (unsorted)
  items: SeriesListRow[];              // Display format (sorted)
  sortConfig: SeriesSortConfig;        // Sort preferences (persisted)
  loading: LoadingStates;
  initialized: boolean;
  ready: boolean;                      // API and DB ready
}
```

**Actions:**
- `initializeSeries()` - Load from storage and database
- `refetchSeries()` - Refresh from database
- `setSeriesSortConfig()` - Configure sort order (persisted to AsyncStorage)

### Missing Implementation: Auto-Queue Next Item

The following needs to be implemented on this branch:

#### 1. **Settings Storage** (AppSettings)
Need to add to `/home/user/SideShelf/src/lib/appSettings.ts`:
```typescript
// New settings keys needed:
continueNarrativeEnabled: boolean        // Auto-play next series item
playNextSeriesItemAutomatically: boolean // Queue next item on completion
```

#### 2. **Settings UI** (SettingsScreen)
Add toggles to `/home/user/SideShelf/src/app/(tabs)/more/settings.tsx`:
- Enable/disable auto-play of next series item
- Configure behavior on book completion

#### 3. **Queue Management** (New Slice)
Create new slice: `/home/user/SideShelf/src/stores/slices/queueSlice.ts`
```typescript
queue: {
  items: PlaylistItem[];     // Queued items
  currentIndex: number;
  autoPlayNextEnabled: boolean;
  upcomingItems: {
    next: PlaylistItem | null;
    series: SeriesWithBooks | null;
  };
}
```

#### 4. **Progression Logic** (PlayerService/Background Service)
Needs enhancement to:
- On track completion (end of current item):
  - Check if item is part of a series
  - Look up next sequential item by series sequence number
  - Determine if auto-play setting is enabled
  - Queue next item automatically
  - Update UI with upcoming item preview

#### 5. **Database Query**
Add helper to series.ts:
```typescript
async function getNextSeriesBook(
  currentSeriesId: string,
  currentSequence: number
): Promise<SeriesBookRow | null> {
  // Get the next book after current sequence number
}
```

#### 6. **Progress Service Integration**
When session ends in `/home/user/SideShelf/src/services/ProgressService.ts`:
- Check for next item in series
- Trigger auto-queue if enabled
- Send event to update UI

### Related Progress Tracking
**File:** `/home/user/SideShelf/src/services/ProgressService.ts`

This service manages listening sessions and progress tracking. Needs to be integrated with next-item logic:
- Detects when item finishes (position reaches duration)
- Can trigger callbacks for next-item queuing
- Tracks which series item is currently playing

---

## Database Schema Relationships

### Key Tables for Series Progression:
1. **series** - Series metadata
2. **mediaJoins/mediaSeries** - Links media to series with `sequence` number
3. **mediaMetadata** - Metadata for each book/episode
4. **libraryItems** - Library item metadata
5. **localListeningSessions** - Track playback sessions
6. **mediaProgress** - Store progress for each item

The `sequence` field in `mediaSeries` table is crucial for determining "next item" in a series.

---

## State Management Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│           UI Components (React Native)              │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│      Zustand Store (useAppStore)                   │
│  ├─ PlayerSlice (playback state)                   │
│  ├─ SettingsSlice (user preferences)               │
│  ├─ SeriesSlice (series/books data)                │
│  ├─ DownloadSlice (download state)                 │
│  ├─ LibrarySlice (library items)                   │
│  └─ [QueueSlice - TO BE IMPLEMENTED]              │
└──────────────┬──────────────────────────────────────┘
               │
      ┌────────┼─────────┬────────────┐
      │        │         │            │
┌─────▼──┐ ┌───▼─────┐ ┌─▼───────┐ ┌─▼──────────┐
│ Services  │ Libraries  │Database  │ AsyncStorage
│           │            │         │
│ Player    │ TrackPlayer│ Drizzle │ Settings
│ Download  │ NetInfo    │ SQLite  │ Progress
│ Progress  │ Background │         │ Preferences
│           │ Downloader │         │
└───────────┴────────────┴─────────┴─────────────┘
```

---

## Key Files and Their Purposes (Quick Reference)

### Settings & User Preferences
- `/home/user/SideShelf/src/lib/appSettings.ts` - AsyncStorage persistence layer
- `/home/user/SideShelf/src/stores/slices/settingsSlice.ts` - Settings state + actions
- `/home/user/SideShelf/src/app/(tabs)/more/settings.tsx` - Settings UI

### Background Playback
- `/home/user/SideShelf/src/services/PlayerBackgroundService.ts` - Background event handlers
- `/home/user/SideShelf/src/services/PlayerService.ts` - Player initialization and control
- `/home/user/SideShelf/src/stores/slices/playerSlice.ts` - Player state

### Downloads
- `/home/user/SideShelf/src/services/DownloadService.ts` - Download orchestration
- `/home/user/SideShelf/src/stores/slices/downloadSlice.ts` - Download UI state
- `/home/user/SideShelf/src/lib/fileSystem.ts` - File system operations
- `/home/user/SideShelf/src/db/helpers/audioFiles.ts` - Audio file database operations

### Series & Progression
- `/home/user/SideShelf/src/db/helpers/series.ts` - Series database queries
- `/home/user/SideShelf/src/stores/slices/seriesSlice.ts` - Series display state
- `/home/user/SideShelf/src/services/ProgressService.ts` - Session tracking and progress sync
- `/home/user/SideShelf/src/db/helpers/mediaProgress.ts` - Progress database operations
- `/home/user/SideShelf/src/db/schema/mediaJoins.ts` - Series-media relationships (has sequence field!)

---

## Feature Development Notes

### For Auto-Queue Next Item Feature:
1. Add settings for auto-play next series item to `appSettings.ts`
2. Update `settingsSlice.ts` and Settings UI to expose toggle
3. Create `queueSlice.ts` to manage upcoming items
4. Modify `PlayerBackgroundService.ts` to check for next item on track completion
5. Implement `getNextSeriesBook()` helper in `series.ts` (ordered by sequence)
6. Update `ProgressService.ts` to trigger next-item logic when session ends
7. Add UI to show upcoming item preview when in a series

### Testing Considerations:
- Test with multi-book series to verify correct sequence ordering
- Test with single-book series (should not auto-queue)
- Test with items not in any series
- Test setting enable/disable during playback
- Test on app resume with next item queued
