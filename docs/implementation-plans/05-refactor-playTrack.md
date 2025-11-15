# Implementation Plan: Refactor playTrack()

**Priority:** P1 - Critical
**Risk Level:** High
**Estimated Effort:** 2-3 days
**Impact:** Improves maintainability of core playback function (180 lines)

---

## Overview

Refactor `playTrack()` in PlayerService.ts (180 lines, 205-385) into smaller, testable functions.

**Responsibilities:**
1. User authentication (8 lines) → Use `getCurrentUserId()` helper
2. Library item & metadata fetching (30 lines) → Extract
3. Audio file validation (25 lines) → Extract
4. Track building (40 lines) → Extract
5. Queue management (20 lines) → Extract
6. Resume position (25 lines) → Extract
7. Playback settings (15 lines) → Extract
8. Error handling & cleanup (17 lines) → Extract

---

## Refactoring Strategy

### Extract 7 Helper Functions

```typescript
// 1. Load track data (~40 lines)
private async loadTrackData(
  userId: string,
  libraryItemId: string
): Promise<{ item: LibraryItemRow; metadata: MediaMetadataRow; audioFiles: AudioFileRow[] }>

// 2. Validate audio files (~25 lines)
private validateAudioFiles(audioFiles: AudioFileRow[], libraryItemId: string): void

// 3. Build tracks (~40 lines - use existing buildTrackList)
// Already exists, just call it directly

// 4. Setup queue (~25 lines)
private async setupPlaybackQueue(tracks: Track[], libraryItemId: string): Promise<void>

// 5. Determine resume position (~25 lines - use existing)
// Already exists: determineResumePosition()

// 6. Apply resume position (~25 lines)
private async applyResumePosition(resumeInfo: ResumeInfo): Promise<void>

// 7. Apply playback settings (~15 lines)
private async applyPlaybackSettings(): Promise<void>
```

### New Main Function (~50 lines)

```typescript
async playTrack(libraryItemId: string): Promise<void> {
  log.info('playTrack called', { libraryItemId });

  try {
    // 1. Authenticate user
    const userId = await getCurrentUserId();

    // 2. Load track data
    const { item, metadata, audioFiles } = await this.loadTrackData(userId, libraryItemId);

    // 3. Validate audio files
    this.validateAudioFiles(audioFiles, libraryItemId);

    // 4. Build tracks
    const tracks = await this.buildTrackList(item, metadata, audioFiles);

    // 5. Setup queue
    await this.setupPlaybackQueue(tracks, libraryItemId);

    // 6. Determine and apply resume position
    const resumeInfo = await this.determineResumePosition(libraryItemId);
    await this.applyResumePosition(resumeInfo);

    // 7. Apply playback settings
    await this.applyPlaybackSettings();

    log.info('Playback started successfully', { libraryItemId });
  } catch (error) {
    await this.handlePlaybackError(error, libraryItemId);
  }
}
```

---

## Code Deduplication

### Apply Resume Position (Duplicated in reloadTrackPlayerQueue)

**Extract to shared helper:**

```typescript
/**
 * Apply resume position to TrackPlayer and sync store
 *
 * @param resumeInfo - Resume position info
 * @param updateStore - Whether to update the store (default: true)
 */
private async applyResumePosition(
  resumeInfo: ResumeInfo,
  updateStore: boolean = true
): Promise<void> {
  // Sync AsyncStorage if positions differ
  if (
    resumeInfo.authoritativePosition !== null &&
    resumeInfo.asyncStoragePosition !== resumeInfo.authoritativePosition
  ) {
    await saveItem(ASYNC_KEYS.position, resumeInfo.authoritativePosition);
    log.info(
      `Synced AsyncStorage position to ${formatTime(resumeInfo.authoritativePosition)}s from ${resumeInfo.source}`
    );
  }

  // Apply position if > 0
  if (resumeInfo.position > 0) {
    if (updateStore) {
      const store = useAppStore.getState();
      store.updatePosition(resumeInfo.position);
    }

    await TrackPlayer.seekTo(resumeInfo.position);

    log.info(
      `${updateStore ? 'Resuming playback' : 'Prepared resume position'} from ${resumeInfo.source}: ${formatTime(resumeInfo.position)}s`
    );
  }
}
```

**Eliminate ~40 lines** of duplication between `playTrack` and `reloadTrackPlayerQueue`.

### Apply Playback Settings (Duplicated in reloadTrackPlayerQueue)

**Extract to shared helper:**

```typescript
/**
 * Apply playback rate and volume from store
 */
private async applyPlaybackSettings(): Promise<void> {
  const store = useAppStore.getState();
  const { playbackRate, volume } = store.player;

  if (playbackRate !== 1.0) {
    await TrackPlayer.setRate(playbackRate);
    log.info(`Applied playback rate from store: ${playbackRate}`);
  }

  if (volume !== 1.0) {
    await TrackPlayer.setVolume(volume);
    log.info(`Applied volume from store: ${volume}`);
  }
}
```

**Eliminate ~20 lines** of duplication.

---

## Testing Strategy

```typescript
describe('PlayerService.playTrack', () => {
  it('should play track successfully', async () => {
    // Test complete flow
  });

  it('should handle missing user', async () => {
    // Test auth error
  });

  it('should handle missing library item', async () => {
    // Test validation
  });

  it('should handle missing audio files', async () => {
    // Test audio validation
  });

  it('should resume from correct position', async () => {
    // Test resume logic
  });

  it('should apply playback settings', async () => {
    // Test rate/volume
  });
});
```

---

## Benefits

- **Line reduction:** 180 → ~140 lines (~22% reduction)
- **Deduplication:** ~60 lines eliminated across `playTrack` + `reloadTrackPlayerQueue`
- **Testability:** Can test each step independently
- **Maintainability:** Clear, single-purpose functions
- **Reusability:** Shared helpers used in multiple places

---

## Timeline

| Phase | Duration |
|-------|----------|
| Extract helpers | 1 day |
| Refactor main function | 0.5 day |
| Deduplication | 0.5 day |
| Testing | 1 day |
| **Total** | **3 days** |

---

## References

- Current: `src/services/PlayerService.ts:205-385`
- Duplicate logic: `src/services/PlayerService.ts:525-563`
