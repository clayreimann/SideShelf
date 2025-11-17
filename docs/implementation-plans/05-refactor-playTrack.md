# Implementation Plan: Refactor playTrack()

**Priority:** P1 | **Risk:** High | **Effort:** 2-3 days | **Impact:** Eliminates 60+ lines duplication

---

## Problem

Single 180-line function (PlayerService.ts:205-385) handling:
- User authentication (8 lines)
- Library item & metadata fetching (30 lines)
- Audio file validation (25 lines)
- Track building (40 lines)
- Queue management (20 lines)
- Resume position application (25 lines)
- Playback settings application (15 lines)

**Additional Issue:** 60+ lines duplicated with `reloadTrackPlayerQueue()` (lines 525-563)

---

## Solution

Extract 7 helper functions:

**1. loadTrackData(userId, libraryItemId)**
- Fetch library item, metadata, audio files
- Return validated data

**2. validateAudioFiles(audioFiles, libraryItemId)**
- Check audio files exist
- Throw if missing

**3. setupPlaybackQueue(tracks, libraryItemId)**
- Reset queue
- Add tracks
- Set active track

**4. applyResumePosition(resumeInfo)** [SHARED]
- Sync AsyncStorage if positions differ
- Apply position to TrackPlayer
- Update store
- **Eliminates duplication with reloadTrackPlayerQueue**

**5. applyPlaybackSettings()** [SHARED]
- Apply playback rate from store
- Apply volume from store
- **Eliminates duplication with reloadTrackPlayerQueue**

---

## Implementation

### Main Function (~50 lines)

```typescript
async playTrack(libraryItemId: string) {
  log.info('playTrack called', { libraryItemId });

  try {
    // 1. Authenticate
    const userId = await getCurrentUserId();

    // 2. Load data
    const { item, metadata, audioFiles } = await this.loadTrackData(userId, libraryItemId);

    // 3. Validate audio files
    this.validateAudioFiles(audioFiles, libraryItemId);

    // 4. Build tracks (existing method)
    const tracks = await this.buildTrackList(item, metadata, audioFiles);

    // 5. Setup queue
    await this.setupPlaybackQueue(tracks, libraryItemId);

    // 6. Apply resume position
    const resumeInfo = await this.determineResumePosition(libraryItemId);
    await this.applyResumePosition(resumeInfo);

    // 7. Apply settings
    await this.applyPlaybackSettings();

    log.info('Playback started successfully', { libraryItemId });
  } catch (error) {
    await this.handlePlaybackError(error, libraryItemId);
  }
}
```

### Shared Helper Example (~25 lines)

```typescript
private async applyResumePosition(resumeInfo: ResumeInfo, updateStore = true) {
  // Sync AsyncStorage if positions differ
  if (resumeInfo.authoritativePosition !== null &&
      resumeInfo.asyncStoragePosition !== resumeInfo.authoritativePosition) {
    await saveItem(ASYNC_KEYS.position, resumeInfo.authoritativePosition);
    log.info(`Synced AsyncStorage position from ${resumeInfo.source}`);
  }

  // Apply position if > 0
  if (resumeInfo.position > 0) {
    if (updateStore) {
      useAppStore.getState().updatePosition(resumeInfo.position);
    }
    await TrackPlayer.seekTo(resumeInfo.position);
    log.info(`Resuming from ${resumeInfo.source}: ${formatTime(resumeInfo.position)}s`);
  }
}
```

**Note:** `applyPlaybackSettings()` follows same pattern (~15 lines)

---

## Deduplication Impact

**Before:**
- `playTrack()`: 180 lines
- `reloadTrackPlayerQueue()`: Contains ~40 lines duplicated logic

**After:**
- `playTrack()`: ~140 lines
- `reloadTrackPlayerQueue()`: Uses shared `applyResumePosition()` and `applyPlaybackSettings()`
- **~60 lines eliminated**

---

## Testing Strategy

### Unit Tests
- Test each helper in isolation
- Test error cases (missing user, item, audio files)
- Test resume position application
- Test playback settings application

### Integration Tests
- Test complete playTrack flow
- Test reloadTrackPlayerQueue with shared helpers
- Verify no duplication

---

## Migration Checklist

**Day 1:**
- [ ] Extract loadTrackData, validateAudioFiles, setupPlaybackQueue
- [ ] Write unit tests

**Day 2:**
- [ ] Extract applyResumePosition, applyPlaybackSettings (shared)
- [ ] Update reloadTrackPlayerQueue to use shared helpers
- [ ] Write integration tests

**Day 3:**
- [ ] Refactor main playTrack function
- [ ] Full testing and code review

---

## Success Metrics

- [ ] playTrack reduced to ~140 lines
- [ ] 60+ lines of duplication eliminated
- [ ] Test coverage: 85%+
- [ ] All existing tests pass
- [ ] Playback works correctly

---

## Risks

**Risk:** Breaking core playback
**Mitigation:** Comprehensive tests, careful extraction, preserve exact behavior

**Rollback:** `git revert <commit>`

---

## References

- Current: `src/services/PlayerService.ts:205-385`
- Duplication: `src/services/PlayerService.ts:525-563`
