# Series Details Page - Quick Reference

## Critical File Paths

| Purpose | Path |
|---------|------|
| Series List Page | `/home/user/SideShelf/src/app/(tabs)/series/[seriesId]/index.tsx` |
| Series Item Detail | `/home/user/SideShelf/src/app/(tabs)/series/[seriesId]/item/[itemId].tsx` |
| Item Detail Component | `/home/user/SideShelf/src/components/library/LibraryItemDetail.tsx` |
| Download Progress UI | `/home/user/SideShelf/src/components/library/LibraryItemDetail/DownloadProgressView.tsx` |
| Series Store | `/home/user/SideShelf/src/stores/slices/seriesSlice.ts` |
| Series DB Helpers | `/home/user/SideShelf/src/db/helpers/series.ts` |
| Download Service | `/home/user/SideShelf/src/services/DownloadService.ts` |
| Progress Service | `/home/user/SideShelf/src/services/ProgressService.ts` |
| Download Store | `/home/user/SideShelf/src/stores/slices/downloadSlice.ts` |

## Key Types

### SeriesBookRow (from series.ts, line 165-173)
```typescript
interface SeriesBookRow {
  libraryItemId: string;      // Navigation key
  mediaId: string;
  title: string;
  authorName: string | null;
  sequence: string | null;    // "1", "1.5", etc
  coverUrl: string | null;    // Local path from cache
  duration: number | null;    // Seconds
}
```

### SeriesWithBooks (from series.ts, line 178-180)
```typescript
type SeriesWithBooks = SeriesRow & {
  books: SeriesBookRow[];
};
```

### DownloadProgress (from DownloadService.ts, line 25)
```typescript
interface DownloadProgress {
  libraryItemId: string;
  totalFiles: number;
  downloadedFiles: number;
  currentFile: string;
  fileProgress: number;         // 0-1
  totalProgress: number;        // 0-1
  bytesDownloaded: number;
  totalBytes: number;
  fileBytesDownloaded: number;
  fileTotalBytes: number;
  downloadSpeed: number;        // bytes/sec
  speedSampleCount: number;
  status: "downloading" | "paused" | "completed" | "error" | "cancelled";
  error?: string;
  canPause: boolean;
  canResume: boolean;
}
```

### MediaProgress (for tracking listening)
```typescript
interface MediaProgress {
  id: string;
  userId: string;
  libraryItemId: string;
  episodeId?: string | null;    // For podcasts
  duration: number | null;      // Total duration
  progress: number;             // 0-1
  currentTime: number;          // Seconds played
  isFinished: boolean;
  hideFromContinueListening?: boolean;
  lastUpdate: Date;
  startedAt?: Date;
  finishedAt?: Date | null;
}
```

## Hook Usage

### In Series List Page
```typescript
const { series: seriesList, ready, isInitializing, refetchSeries } = useSeries();

const selectedSeries = useMemo(
  () => seriesList.find(serie => serie.id === seriesId),
  [seriesList, seriesId]
);

useFocusEffect(
  useCallback(() => {
    if (!ready || selectedSeries) return;
    refetchSeries().catch(error => {
      console.error('[SeriesDetailScreen] Failed to refetch series:', error);
    });
  }, [ready, selectedSeries, refetchSeries])
);
```

### In Library Item Detail
```typescript
const { fetchItemDetails, getCachedItem, updateItemProgress } = useLibraryItemDetails();
const { activeDownloads, isItemDownloaded, startDownload, deleteDownload } = useDownloads();
const { currentTrack, position, isPlaying } = usePlayer();

const cachedData = getCachedItem(itemId);
const item = cachedData?.item || null;
const metadata = cachedData?.metadata || null;
const progress = cachedData?.progress || null;
const downloadProgress = activeDownloads[itemId] || null;
const isDownloaded = isItemDownloaded(itemId);
```

## Data Fetching Flow

### Series Detail Page Load
1. `useSeries()` provides cached series list
2. Find selected series by ID from query params
3. On focus, if not ready, call `refetchSeries()`
4. `refetchSeries()` calls DB `getAllSeries()`
5. Store caches in `series.series: SeriesWithBooks[]`
6. UI renders books from `selectedSeries.books`

### Item Detail Load
1. `useLibraryItemDetails().fetchItemDetails(itemId, userId)`
2. Fetches full item metadata from DB/store
3. Fetches progress via `getMediaProgressForLibraryItem()`
4. Fetches author/series for navigation
5. Caches all data in store
6. UI consumes from `getCachedItem(itemId)`

### Download Flow
1. User taps "Download" menu action
2. Calls `handleDownload()` → `startDownload(itemId, serverUrl, accessToken)`
3. DownloadService:
   - Gets metadata and audio files from DB
   - Creates download tasks via RNBackgroundDownloader
   - Emits progress updates to store subscribers
4. UI subscribes to `activeDownloads[itemId]` updates
5. DownloadProgressView displays real-time progress

## Menu Actions Implementation

### Action Creation (LibraryItemDetail, line 483-531)
```typescript
const menuActions = useMemo(() => {
  const actions = [];
  
  // Download/Delete
  if (isDownloaded) {
    actions.push({
      id: "delete",
      title: "Delete Download",
      attributes: { destructive: true },
      image: "trash",
    });
  } else if (!isDownloading && serverReachable !== false) {
    actions.push({
      id: "download",
      title: "Download",
      image: "arrow.down.circle",
    });
  }
  
  // Mark Finished/Unfinished
  if (effectiveProgress) {
    actions.push({
      id: "mark-finished",
      title: effectiveProgress.isFinished 
        ? "Mark Unfinished" 
        : "Mark Finished",
      image: "checkmark.circle",
    });
  }
  
  // Force Resync
  if (effectiveProgress || currentTrack?.libraryItemId === itemId) {
    actions.push({
      id: "force-resync",
      title: "Force Resync Position",
      image: "arrow.clockwise.circle",
    });
  }
  
  return actions;
}, [isDownloaded, isDownloading, effectiveProgress, currentTrack, itemId, serverReachable]);
```

### Action Handler (LibraryItemDetail, line 460-480)
```typescript
const handleMenuAction = useCallback(
  (actionId: string) => {
    switch (actionId) {
      case "download":
        handleDownload();
        break;
      case "delete":
        handleDeleteDownload();
        break;
      case "mark-finished":
        handleToggleFinished();
        break;
      case "force-resync":
        handleForceResync();
        break;
    }
  },
  [handleDownload, handleDeleteDownload, handleToggleFinished, handleForceResync]
);
```

## Progress Display Logic

### Effective Progress Calculation (LibraryItemDetail, line 235-263)
```typescript
const effectiveProgress = useMemo(() => {
  if (!progress || !item) return null;
  
  const isThisItemPlaying = currentTrack?.libraryItemId === item.id;
  
  let computedProgress = progress;
  if (isThisItemPlaying && position !== undefined) {
    // Use live position from player
    computedProgress = {
      ...progress,
      currentTime: position,
      progress: progress.duration ? position / progress.duration : 0,
    };
  }
  
  // Only show if has progress or finished
  const hasProgress =
    (computedProgress.currentTime && computedProgress.currentTime > 0) ||
    (computedProgress.progress && computedProgress.progress > 0);
  
  if (computedProgress.isFinished || hasProgress) {
    return computedProgress;
  }
  
  return null;
}, [progress, item?.id, currentTrack?.libraryItemId, position]);
```

### Progress Display (LibraryItemDetail, line 720-740)
```typescript
{effectiveProgress && (
  <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
    <View
      style={{
        backgroundColor: isDark ? "#333" : "#f5f5f5",
        borderRadius: 8,
        padding: 12,
      }}
    >
      <ProgressBar
        progress={effectiveProgress.progress || 0}
        variant="medium"
        showTimeLabels={!!(effectiveProgress.currentTime && effectiveProgress.duration)}
        currentTime={effectiveProgress.currentTime || undefined}
        duration={effectiveProgress.duration || undefined}
        showPercentage={true}
      />
    </View>
  </View>
)}
```

## Series Book Display (series/[seriesId]/index.tsx)

### Rendering (line 43-87)
```typescript
const renderBook = useCallback(
  ({ item }: { item: SeriesBookRow }) => {
    const sequenceLabel = item.sequence ? `Book ${item.sequence}` : null;
    return (
      <TouchableOpacity
        onPress={() => seriesId && router.push(`/series/${seriesId}/item/${item.libraryItemId}`)}
        style={{
          flexDirection: 'row',
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: (styles.text.color || '#000000') + '20',
          gap: 12,
        }}
      >
        <View style={{ width: 64, height: 96, borderRadius: 6, overflow: 'hidden' }}>
          <CoverImage uri={item.coverUrl} title={item.title} fontSize={12} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.text, { fontSize: 16, fontWeight: '600' }]} numberOfLines={2}>
            {item.title}
          </Text>
          {item.authorName && (
            <Text style={[styles.text, { opacity: 0.7, marginTop: 2 }]} numberOfLines={1}>
              {item.authorName}
            </Text>
          )}
          {sequenceLabel && (
            <Text style={[styles.text, { opacity: 0.6, fontSize: 12, marginTop: 4 }]}>
              {sequenceLabel}
            </Text>
          )}
          {item.duration !== null && (
            <Text style={[styles.text, { opacity: 0.6, fontSize: 12, marginTop: 2 }]}>
              {formatTime(item.duration)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  },
  [colors.coverBackground, router, seriesId, styles.text.color]
);
```

## Download Control Methods

### Start Download (DownloadService.ts, line 157)
```typescript
public async startDownload(
  libraryItemId: string,
  serverUrl: string,
  token: string,
  onProgress?: DownloadProgressCallback,
  options?: { forceRedownload?: boolean }
): Promise<void>
```

### Pause/Resume/Cancel (DownloadService.ts, line 323-370)
```typescript
public pauseDownload(libraryItemId: string): void
public resumeDownload(libraryItemId: string): void
public cancelDownload(libraryItemId: string): void
```

## Data Paths for UI Updates

1. **Series Name** → `selectedSeries.name` (store: `series.series[].name`)
2. **Series Books** → `selectedSeries.books` (store: `series.series[].books`)
3. **Book Title** → `item.title` (store: `libraryItemDetails[itemId].metadata.title`)
4. **Progress Bar** → `effectiveProgress.progress` (0-1 or null)
5. **Current Time** → `effectiveProgress.currentTime` (live from player if playing)
6. **Download Progress** → `activeDownloads[itemId]` (store: updates real-time)
7. **Downloaded Status** → `downloadedItems.has(itemId)` (store: Set)

## Common Debug Points

- Series loading: Check `useSeries().ready` and `isInitializing` flags
- Item detail loading: Check `useLibraryItemDetails().loading[itemId]`
- Progress updates: Check `usePlayer().position` (updated every second)
- Download tracking: Check `useDownloads().activeDownloads[itemId].status`
- Downloaded files: Check DB via `getAudioFilesWithDownloadInfo()`
