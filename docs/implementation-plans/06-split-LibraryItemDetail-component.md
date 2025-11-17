# Implementation Plan: Split LibraryItemDetail Component

**Priority:** P3 | **Risk:** Medium | **Effort:** 4-5 days | **Impact:** 30-40% performance improvement

---

## Problem

Single 767-line component (LibraryItemDetail.tsx:96-863) with:
- 6+ useEffect hooks
- Complex state management
- Poor re-render performance (entire component re-renders on any state change)
- Difficult to test individual sections

---

## Solution

Split into 8 focused components + 4 custom hooks:

### Components

**1. LibraryItemHeader**
- Cover image, title, author links, series links

**2. LibraryItemProgress**
- Progress bar with live updates

**3. LibraryItemActions**
- Play, download, menu buttons

**4. LibraryItemMetadata**
- Duration, year, genres, tags

**5. LibraryItemDescription**
- Collapsible description text

**6. LibraryItemChapters**
- Chapter list with timestamps

**7. LibraryItemAudioFiles**
- Audio file list

**8. LibraryItemMenu**
- Bottom sheet actions menu

### Custom Hooks

**1. useItemDetails(itemId)**
- Load library item and metadata
- Handle loading and error states

**2. useItemProgress(itemId, userId)**
- Track playback progress
- Subscribe to position updates

**3. useDownloadState(itemId)**
- Track download status
- Subscribe to download updates

**4. usePlaybackState(itemId)**
- Track if item is currently playing
- Subscribe to playback state

---

## Implementation

### Main Orchestrator (~100 lines)

```typescript
export function LibraryItemDetail({ route }: Props) {
  const { itemId } = route.params;
  const userId = useCurrentUserId();

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

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error} />;
  if (!item || !metadata) return <NotFoundScreen />;

  return (
    <ScrollView>
      <LibraryItemHeader item={item} metadata={metadata} onPlayPress={handlePlayPress} />
      <LibraryItemProgress progress={progress} progressPercent={progressPercent} />
      <LibraryItemActions
        isCurrentlyPlaying={isCurrentlyPlaying}
        isDownloaded={isDownloaded}
        downloadProgress={downloadProgress}
        onPlayPress={handlePlayPress}
        onDownloadPress={handleDownloadPress}
      />
      <LibraryItemMetadata metadata={metadata} />
      <LibraryItemDescription description={metadata.description} />
      <LibraryItemChapters itemId={itemId} />
      <LibraryItemAudioFiles itemId={itemId} />
    </ScrollView>
  );
}
```

### Custom Hook Example (~40 lines)

```typescript
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

    // Subscribe to position updates
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

---

## Performance Improvements

**Before:**
- Any state change → Entire 767-line component re-renders
- Progress updates → Re-render everything
- Download updates → Re-render everything

**After:**
- Progress updates → Only `LibraryItemProgress` re-renders
- Download updates → Only `LibraryItemActions` re-renders
- Playback state → Only `LibraryItemActions` re-renders

**Expected:** 30-40% reduction in render time

---

## Testing Strategy

### Unit Tests for Hooks
```typescript
describe('useItemDetails', () => {
  it('should load item details');
  it('should handle errors');
  it('should cleanup on unmount');
});
```

### Component Tests
```typescript
describe('LibraryItemHeader', () => {
  it('should render item title and author');
  it('should handle play press');
});
```

### Integration Tests
- Test complete detail screen flow
- Test progress updates
- Test download state changes
- Test playback actions

---

## Migration Checklist

**Day 1:**
- [ ] Extract useItemDetails, useItemProgress, useDownloadState, usePlaybackState
- [ ] Test all hooks

**Day 2-3:**
- [ ] Extract LibraryItemHeader, Progress, Actions, Metadata
- [ ] Extract Description, Chapters, AudioFiles, Menu
- [ ] Test all components

**Day 4:**
- [ ] Refactor main LibraryItemDetail component
- [ ] Integration testing

**Day 5:**
- [ ] Performance testing
- [ ] Visual regression testing
- [ ] Code review and deployment

---

## Success Metrics

- [ ] 767 lines → ~450 lines total across files
- [ ] Render performance: 30-40% faster
- [ ] Test coverage: 85%+
- [ ] All visual elements work correctly
- [ ] No regressions in functionality

---

## Risks

**Risk:** Visual regressions or broken UI
**Mitigation:** Visual regression tests, extensive manual testing

**Risk:** Performance not improved
**Mitigation:** Performance profiling before/after, React DevTools profiling

**Rollback:** `git revert <commit>`

---

## References

- Current: `src/components/library/LibraryItemDetail.tsx:96-863`
- React Performance: https://react.dev/learn/render-and-commit
