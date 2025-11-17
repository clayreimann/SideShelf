# Implementation Plan: Refactor handlePlaybackProgressUpdated()

**Priority:** P1 | **Risk:** High | **Effort:** 3-4 days | **Impact:** Breaks 234-line function into 15 functions

---

## Problem

Single 234-line function (PlayerBackgroundService.ts:395-628) handling 6+ responsibilities:
- Progress tracking and position updates
- Chapter change detection
- Periodic metadata updates
- Sleep timer checking
- Server sync coordination
- Session rehydration and recovery

Deep nesting (4+ levels), difficult to test, high cognitive load.

---

## Solution

Extract into focused functions:

**1. updatePlaybackProgress()**
- Update session progress in database
- Sync store position from session
- Fallback to TrackPlayer position

**2. handleChapterChangeIfNeeded()**
- Detect chapter transitions
- Update now playing metadata on change

**3. updateNowPlayingMetadataIfNeeded()**
- Periodic updates (throttled to 2-second intervals)
- Gated by user setting

**4. checkAndHandleSleepTimer()**
- Check duration-based timers
- Check chapter-based timers
- Pause playback when expired

**5. syncToServerIfNeeded()**
- Check if sync needed (adaptive intervals)
- Trigger server sync

**6. attemptSessionRehydration()**
- Restore missing sessions from database
- Create new session if rehydration fails
- Fallback position updates

---

## Implementation

### Main Orchestrator (~40 lines)

```typescript
async function handlePlaybackProgressUpdated(event: PlaybackProgressUpdatedEvent) {
  try {
    const store = useAppStore.getState();
    const ids = await getUserIdAndLibraryItemId();
    const previousChapter = store.player.currentChapter;

    if (ids) {
      await handleProgressUpdateWithSession(ids, event, previousChapter);
    } else if (store.player.currentTrack) {
      const state = await TrackPlayer.getPlaybackState();
      await attemptSessionRehydration(currentTrack, event.position, isPlaying);
    } else {
      store.updatePosition(event.position);
    }
  } catch (error) {
    handleProgressUpdateError(error);
  }
}
```

### Helper Flow (~20-60 lines each)

```typescript
async function handleProgressUpdateWithSession(ids, event, previousChapter) {
  const isPlaying = (await TrackPlayer.getPlaybackState()).state === State.Playing;

  // 1. Update progress
  await updatePlaybackProgress(ids.userId, ids.libraryItemId, event.position, isPlaying);

  // 2. Handle chapter changes
  await handleChapterChangeIfNeeded(previousChapter, store.player.currentChapter);

  // 3. Periodic metadata
  await updateNowPlayingMetadataIfNeeded(event.position);

  // 4. Sleep timer
  await checkAndHandleSleepTimer(event.position, isPlaying);

  // 5. Server sync
  await syncToServerIfNeeded(ids.userId, ids.libraryItemId);
}
```

---

## Testing Strategy

### Unit Tests
- Test each helper in isolation
- Mock TrackPlayer, progressService, store
- Test edge cases (missing session, errors, state transitions)
- Target: 90%+ coverage

### Integration Tests
- Test complete progress update flow
- Test session rehydration scenarios
- Test chapter changes with metadata updates
- Test sleep timer expiration

### Manual Tests
- Normal playback progress
- Chapter transitions
- Sleep timer (duration and chapter-based)
- Background playback
- Session rehydration after app restart

---

## Migration Checklist

**Day 1:**
- [ ] Extract updatePlaybackProgress, handleChapterChangeIfNeeded, updateNowPlayingMetadataIfNeeded
- [ ] Write unit tests for each
- [ ] Verify tests pass

**Day 2:**
- [ ] Extract sleep timer functions (checkAndHandleSleepTimer, determineShouldPause, pauseForSleepTimer)
- [ ] Extract syncToServerIfNeeded
- [ ] Write unit tests

**Day 3:**
- [ ] Extract session rehydration functions (6 helpers)
- [ ] Implement new main orchestrator
- [ ] Write integration tests

**Day 4:**
- [ ] Full test suite
- [ ] Extensive manual testing
- [ ] Code review and deployment

---

## Success Metrics

- [ ] Function length: Max 60 lines per function
- [ ] Cyclomatic complexity: Reduced 40%+
- [ ] Test coverage: 90%+ for helpers, 80%+ integration
- [ ] All existing tests pass
- [ ] No regressions in playback tracking

---

## Risks

**Risk:** Breaking playback progress tracking
**Mitigation:** Comprehensive tests, extensive manual testing, monitor error rates

**Risk:** Session rehydration failures
**Mitigation:** Preserve exact rehydration logic, test all scenarios, detailed logging

**Rollback:** `git revert <commit>` or revert main function only

---

## References

- Current: `src/services/PlayerBackgroundService.ts:395-628`
- Dependencies: ProgressService, PlayerStore, TrackPlayer
