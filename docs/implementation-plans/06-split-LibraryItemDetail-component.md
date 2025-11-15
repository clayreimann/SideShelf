# Implementation Plan: Split LibraryItemDetail Component

**Priority:** P3 - Medium
**Risk Level:** Medium
**Estimated Effort:** 4-5 days
**Impact:** Improves performance and maintainability of large component (767 lines)

---

## Overview

Split `LibraryItemDetail.tsx` (767 lines, 96-863) into modular, reusable components.

**Current Issues:**
- Single 767-line component
- 6+ useEffect hooks
- Complex state management
- Poor re-render performance
- Difficult to test

**Target State:**
- Main orchestrator component (~100 lines)
- 8 smaller sub-components (30-80 lines each)
- 4 custom hooks
- Better performance through selective re-rendering

---

## Component Breakdown

### New Component Structure

```
LibraryItemDetail (orchestrator)
├── LibraryItemHeader
│   ├── Cover image
│   ├── Title
│   ├── Author links
│   └── Series links
├── LibraryItemMetadata
│   ├── Duration
│   ├── Year
│   ├── Genres
│   └── Tags
├── LibraryItemProgress
│   ├── Progress bar
│   └── Time remaining
├── LibraryItemActions
│   ├── Play button
│   ├── Download button
│   └── Menu button
├── LibraryItemDescription
│   └── Collapsible description
├── LibraryItemChapters
│   └── Chapter list
├── LibraryItemAudioFiles
│   └── Audio file list
└── LibraryItemMenu
    └── Actions menu
```

---

## Step 1: Extract Custom Hooks

### Hook 1: useItemDetails

```typescript
/**
 * Load and manage library item details
 */
function useItemDetails(itemId: string) {
  const [item, setItem] = useState<LibraryItemRow | null>(null);
  const [metadata, setMetadata] = useState<MediaMetadataRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadItem() {
      try {
        setLoading(true);
        const [itemData, metadataData] = await Promise.all([
          getLibraryItemById(itemId),
          getMediaMetadataForItem(itemId),
        ]);

        if (!cancelled) {
          setItem(itemData);
          setMetadata(metadataData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadItem();
    return () => { cancelled = true; };
  }, [itemId]);

  return { item, metadata, loading, error };
}
```

### Hook 2: useItemProgress

```typescript
/**
 * Track playback progress for an item
 */
function useItemProgress(itemId: string, userId: string | null) {
  const [progress, setProgress] = useState<MediaProgressRow | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    if (!userId || !itemId) return;

    let cancelled = false;

    async function loadProgress() {
      const progressData = await getMediaProgressForLibraryItem(itemId, userId);
      if (!cancelled) {
        setProgress(progressData);
        if (progressData) {
          const percent = (progressData.currentTime / progressData.duration) * 100;
          setProgressPercent(Math.min(percent, 100));
        }
      }
    }

    loadProgress();

    // Subscribe to progress updates
    const unsubscribe = useAppStore.subscribe(
      (state) => state.player.currentPosition,
      (position) => {
        if (!cancelled && progress) {
          const percent = (position / progress.duration) * 100;
          setProgressPercent(Math.min(percent, 100));
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [itemId, userId]);

  return { progress, progressPercent };
}
```

### Hook 3: useDownloadState

```typescript
/**
 * Track download state for an item
 */
function useDownloadState(itemId: string) {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkDownload() {
      const downloaded = await checkIfItemIsDownloaded(itemId);
      if (!cancelled) {
        setIsDownloaded(downloaded);
      }
    }

    checkDownload();

    // Subscribe to download updates
    const unsubscribe = useAppStore.subscribe(
      (state) => state.downloads.activeDownloads,
      (downloads) => {
        if (!cancelled) {
          const itemDownload = downloads.find((d) => d.itemId === itemId);
          setDownloadProgress(itemDownload || null);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [itemId]);

  return { isDownloaded, downloadProgress };
}
```

### Hook 4: usePlaybackState

```typescript
/**
 * Track if this item is currently playing
 */
function usePlaybackState(itemId: string) {
  const currentTrack = useAppStore((state) => state.player.currentTrack);
  const isPlaying = useAppStore((state) => state.player.isPlaying);

  const isCurrentItem = currentTrack?.libraryItemId === itemId;
  const isCurrentlyPlaying = isCurrentItem && isPlaying;

  return { isCurrentItem, isCurrentlyPlaying };
}
```

---

## Step 2: Extract Sub-Components

### Component 1: LibraryItemHeader

```typescript
interface LibraryItemHeaderProps {
  item: LibraryItemRow;
  metadata: MediaMetadataRow;
  onPlayPress: () => void;
}

export function LibraryItemHeader({ item, metadata, onPlayPress }: LibraryItemHeaderProps) {
  return (
    <View style={styles.header}>
      <Image source={{ uri: item.coverUrl }} style={styles.cover} />
      <Text style={styles.title}>{metadata.title}</Text>
      {metadata.authorName && (
        <Text style={styles.author}>{metadata.authorName}</Text>
      )}
      {metadata.seriesName && (
        <Text style={styles.series}>{metadata.seriesName}</Text>
      )}
    </View>
  );
}
```

### Component 2: LibraryItemProgress

```typescript
interface LibraryItemProgressProps {
  progress: MediaProgressRow | null;
  progressPercent: number;
}

export function LibraryItemProgress({ progress, progressPercent }: LibraryItemProgressProps) {
  if (!progress) return null;

  const timeRemaining = progress.duration - progress.currentTime;

  return (
    <View style={styles.progressContainer}>
      <ProgressBar progress={progressPercent / 100} />
      <View style={styles.progressText}>
        <Text>{formatTime(progress.currentTime)}</Text>
        <Text>{formatTime(timeRemaining)} remaining</Text>
      </View>
    </View>
  );
}
```

### Component 3: LibraryItemActions

```typescript
interface LibraryItemActionsProps {
  isCurrentlyPlaying: boolean;
  isDownloaded: boolean;
  downloadProgress: DownloadProgress | null;
  onPlayPress: () => void;
  onDownloadPress: () => void;
  onMenuPress: () => void;
}

export function LibraryItemActions({
  isCurrentlyPlaying,
  isDownloaded,
  downloadProgress,
  onPlayPress,
  onDownloadPress,
  onMenuPress,
}: LibraryItemActionsProps) {
  return (
    <View style={styles.actions}>
      <Button
        title={isCurrentlyPlaying ? "Pause" : "Play"}
        onPress={onPlayPress}
        icon="play"
      />
      <Button
        title={isDownloaded ? "Downloaded" : "Download"}
        onPress={onDownloadPress}
        icon="download"
        disabled={!!downloadProgress}
      />
      <IconButton icon="dots-vertical" onPress={onMenuPress} />
    </View>
  );
}
```

### Component 4: LibraryItemDescription

```typescript
interface LibraryItemDescriptionProps {
  description: string | null;
}

export function LibraryItemDescription({ description }: LibraryItemDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!description) return null;

  return (
    <View style={styles.descriptionContainer}>
      <Text numberOfLines={expanded ? undefined : 3} style={styles.description}>
        {description}
      </Text>
      <Button
        title={expanded ? "Show less" : "Show more"}
        onPress={() => setExpanded(!expanded)}
        variant="text"
      />
    </View>
  );
}
```

### Components 5-8: Similar Pattern

- **LibraryItemMetadata:** Display duration, year, genres, tags
- **LibraryItemChapters:** List chapters with timestamps
- **LibraryItemAudioFiles:** List audio files
- **LibraryItemMenu:** Bottom sheet menu with actions

---

## Step 3: Main Orchestrator Component

```typescript
export function LibraryItemDetail({ route }: Props) {
  const { itemId } = route.params;
  const userId = useCurrentUserId(); // Custom hook

  // Load data with custom hooks
  const { item, metadata, loading, error } = useItemDetails(itemId);
  const { progress, progressPercent } = useItemProgress(itemId, userId);
  const { isDownloaded, downloadProgress } = useDownloadState(itemId);
  const { isCurrentlyPlaying } = usePlaybackState(itemId);

  // Action handlers
  const handlePlayPress = useCallback(async () => {
    await playerService.playTrack(itemId);
  }, [itemId]);

  const handleDownloadPress = useCallback(async () => {
    await downloadService.startDownload(itemId);
  }, [itemId]);

  const handleMenuPress = useCallback(() => {
    // Show menu
  }, []);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error} />;
  if (!item || !metadata) return <NotFoundScreen />;

  return (
    <ScrollView>
      <LibraryItemHeader
        item={item}
        metadata={metadata}
        onPlayPress={handlePlayPress}
      />

      <LibraryItemProgress
        progress={progress}
        progressPercent={progressPercent}
      />

      <LibraryItemActions
        isCurrentlyPlaying={isCurrentlyPlaying}
        isDownloaded={isDownloaded}
        downloadProgress={downloadProgress}
        onPlayPress={handlePlayPress}
        onDownloadPress={handleDownloadPress}
        onMenuPress={handleMenuPress}
      />

      <LibraryItemMetadata metadata={metadata} />

      <LibraryItemDescription description={metadata.description} />

      <LibraryItemChapters itemId={itemId} />

      <LibraryItemAudioFiles itemId={itemId} />

      <LibraryItemMenu
        itemId={itemId}
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
      />
    </ScrollView>
  );
}
```

---

## Performance Improvements

### Before (Single Component)
- **Any state change** → Entire 767-line component re-renders
- **Progress updates** → Re-render everything
- **Download updates** → Re-render everything

### After (Split Components)
- **Progress updates** → Only `LibraryItemProgress` re-renders
- **Download updates** → Only `LibraryItemActions` re-renders
- **Playback state** → Only `LibraryItemActions` re-renders

**Expected Performance Gain:** 30-40% reduction in render time

---

## Testing Strategy

### Unit Tests for Hooks

```typescript
describe('useItemDetails', () => {
  it('should load item details', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useItemDetails('item-123')
    );

    expect(result.current.loading).toBe(true);
    await waitForNextUpdate();
    expect(result.current.item).toBeDefined();
  });
});
```

### Component Tests

```typescript
describe('LibraryItemHeader', () => {
  it('should render item title and author', () => {
    const { getByText } = render(
      <LibraryItemHeader item={mockItem} metadata={mockMetadata} onPlayPress={jest.fn()} />
    );

    expect(getByText('Test Book')).toBeTruthy();
    expect(getByText('Test Author')).toBeTruthy();
  });
});
```

---

## Migration Strategy

### Phase 1: Create Hooks (Day 1)
- [ ] Extract `useItemDetails`
- [ ] Extract `useItemProgress`
- [ ] Extract `useDownloadState`
- [ ] Extract `usePlaybackState`
- [ ] Test all hooks

### Phase 2: Create Components (Day 2-3)
- [ ] Extract `LibraryItemHeader`
- [ ] Extract `LibraryItemProgress`
- [ ] Extract `LibraryItemActions`
- [ ] Extract `LibraryItemMetadata`
- [ ] Extract `LibraryItemDescription`
- [ ] Extract `LibraryItemChapters`
- [ ] Extract `LibraryItemAudioFiles`
- [ ] Extract `LibraryItemMenu`

### Phase 3: Refactor Main Component (Day 4)
- [ ] Use custom hooks
- [ ] Compose sub-components
- [ ] Test complete flow

### Phase 4: Testing & Optimization (Day 5)
- [ ] Performance testing
- [ ] Visual regression testing
- [ ] Manual testing
- [ ] Optimize re-renders

---

## Benefits

- **Line reduction:** 767 → ~450 lines total (~41% reduction per file)
- **Render performance:** 30-40% improvement
- **Testability:** Can test each component independently
- **Reusability:** Components can be reused elsewhere
- **Maintainability:** Easier to modify individual sections

---

## Timeline

| Phase | Duration |
|-------|----------|
| Extract hooks | 1 day |
| Create components | 2 days |
| Refactor main | 1 day |
| Testing | 1 day |
| **Total** | **5 days** |

---

## References

- Current: `src/components/library/LibraryItemDetail.tsx:96-863`
- Similar components: Other detail screens for patterns
