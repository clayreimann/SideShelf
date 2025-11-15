# Implementation Plan: Refactor handlePlaybackProgressUpdated()

**Priority:** P1 - Critical
**Risk Level:** High
**Estimated Effort:** 3-4 days
**Impact:** Improves maintainability of most complex function (234 lines)

---

## Overview

Refactor `handlePlaybackProgressUpdated()` in PlayerBackgroundService.ts from a monolithic 234-line function into smaller, testable, single-responsibility functions.

**Current State:**
- Single 234-line function (lines 395-628)
- Handles 6+ distinct responsibilities
- Deep nesting (4+ levels)
- Difficult to test individual behaviors
- Complex async flow with multiple error cases

**Target State:**
- Main orchestrator function (~40-50 lines)
- 6-8 smaller helper functions (20-40 lines each)
- Clear separation of concerns
- Easier to test and maintain
- Better error handling and logging

---

## Responsibility Analysis

### Current Responsibilities (6 major concerns)

1. **Progress Tracking** (Lines 405-438)
   - Update session progress in database
   - Sync store position from session

2. **Chapter Change Detection** (Lines 440-448)
   - Detect chapter transitions
   - Update now playing metadata

3. **Periodic Metadata Updates** (Lines 450-456)
   - Check settings for periodic updates
   - Throttle to every 2 seconds

4. **Sleep Timer Management** (Lines 458-491)
   - Check duration-based timers
   - Check chapter-based timers
   - Pause playback when expired

5. **Server Sync Coordination** (Lines 493-501)
   - Check if sync needed
   - Trigger server sync

6. **Session Rehydration** (Lines 502-614)
   - Detect missing sessions
   - Attempt rehydration from database
   - Fallback to creating new session
   - Error recovery and fallbacks

---

## Step 1: Extract Progress Update Logic

### New Function: `updatePlaybackProgress()`

**File:** `src/services/PlayerBackgroundService.ts`

```typescript
/**
 * Update session progress and sync store position
 *
 * @param userId - The user ID
 * @param libraryItemId - The library item ID
 * @param position - Current playback position
 * @param isPlaying - Whether playback is active
 * @returns The updated session, or null if not found
 */
async function updatePlaybackProgress(
  userId: string,
  libraryItemId: string,
  position: number,
  isPlaying: boolean
): Promise<MediaProgressRow | null> {
  const store = useAppStore.getState();

  // Get current playback state
  const playbackRate = await TrackPlayer.getRate();
  const volume = await TrackPlayer.getVolume();

  // Update session progress (DB is source of truth)
  await progressService.updateProgress(
    userId,
    libraryItemId,
    position,
    playbackRate,
    volume,
    undefined,
    isPlaying
  );

  // Sync store position from session (DB is source of truth after updateProgress)
  const updatedSession = await progressService.getCurrentSession(userId, libraryItemId);

  if (updatedSession) {
    // Use session position as source of truth, not TrackPlayer position directly
    store.updatePosition(updatedSession.currentTime);
    return updatedSession;
  } else {
    // Fallback to TrackPlayer position if session not found
    store.updatePosition(position);
    return null;
  }
}
```

---

## Step 2: Extract Chapter Change Detection

### New Function: `handleChapterChangeIfNeeded()`

**File:** `src/services/PlayerBackgroundService.ts`

```typescript
/**
 * Detect and handle chapter changes
 *
 * Updates now playing metadata immediately when chapter changes (non-gated update)
 *
 * @param previousChapter - The previous chapter state
 * @param currentChapter - The current chapter state
 */
async function handleChapterChangeIfNeeded(
  previousChapter: CurrentChapter | null,
  currentChapter: CurrentChapter | null
): Promise<void> {
  if (!currentChapter) {
    return;
  }

  // Check if chapter actually changed
  const chapterChanged = previousChapter?.chapter.id !== currentChapter.chapter.id;

  if (chapterChanged) {
    log.info(
      `Chapter changed from ${previousChapter?.chapter.id || "none"} to ${currentChapter.chapter.id}, updating now playing metadata`
    );

    const store = useAppStore.getState();
    await store.updateNowPlayingMetadata();
  }
}
```

---

## Step 3: Extract Periodic Metadata Updates

### New Function: `updateNowPlayingMetadataIfNeeded()`

**File:** `src/services/PlayerBackgroundService.ts`

```typescript
/**
 * Update now playing metadata periodically (gated by setting)
 *
 * Throttles to every 2 seconds to avoid excessive updates
 *
 * @param position - Current playback position (used for throttling)
 */
async function updateNowPlayingMetadataIfNeeded(position: number): Promise<void> {
  // Only update on even seconds (throttle to 2-second intervals)
  if (Math.floor(position) % 2 !== 0) {
    return;
  }

  // Check if periodic updates are enabled
  const { getPeriodicNowPlayingUpdatesEnabled } = await import("@/lib/appSettings");
  const periodicUpdatesEnabled = await getPeriodicNowPlayingUpdatesEnabled();

  if (!periodicUpdatesEnabled) {
    return;
  }

  const store = useAppStore.getState();
  await store.updateNowPlayingMetadata();
}
```

---

## Step 4: Extract Sleep Timer Logic

### New Function: `checkAndHandleSleepTimer()`

**File:** `src/services/PlayerBackgroundService.ts`

```typescript
/**
 * Check sleep timer and pause playback if expired
 *
 * Supports both duration-based and chapter-based timers
 *
 * @param position - Current playback position
 * @param isPlaying - Whether playback is active
 */
async function checkAndHandleSleepTimer(
  position: number,
  isPlaying: boolean
): Promise<void> {
  const store = useAppStore.getState();
  const { sleepTimer } = store.player;
  const currentTrack = store.player.currentTrack;
  const currentChapter = store.player.currentChapter;

  // Only check if timer is active and playback is active
  if (!sleepTimer.type || !isPlaying) {
    return;
  }

  const shouldPause = determineShouldPause(
    sleepTimer,
    currentChapter,
    currentTrack,
    position
  );

  if (shouldPause) {
    await pauseForSleepTimer(sleepTimer);
  }
}

/**
 * Determine if sleep timer has expired
 */
function determineShouldPause(
  sleepTimer: SleepTimer,
  currentChapter: CurrentChapter | null,
  currentTrack: Track | null,
  position: number
): boolean {
  if (sleepTimer.type === "duration" && sleepTimer.endTime) {
    // Time-based timer
    return Date.now() >= sleepTimer.endTime;
  }

  if (sleepTimer.type === "chapter" && currentChapter && currentTrack) {
    // Chapter-based timer
    const targetChapter =
      sleepTimer.chapterTarget === "current"
        ? currentChapter.chapter
        : currentTrack.chapters.find((ch) => ch.start === currentChapter.chapter.end);

    return targetChapter ? position >= targetChapter.end : false;
  }

  return false;
}

/**
 * Pause playback due to sleep timer expiration
 */
async function pauseForSleepTimer(sleepTimer: SleepTimer): Promise<void> {
  const store = useAppStore.getState();

  const timerType =
    sleepTimer.type === "duration"
      ? "duration-based"
      : `end of ${sleepTimer.chapterTarget} chapter`;

  log.info(`Sleep timer expired (${timerType}), pausing playback`);

  // Cancel the timer and pause playback
  store.cancelSleepTimer();
  const pauseTime = Date.now();
  store._setLastPauseTime(pauseTime);
  await TrackPlayer.pause();
}
```

---

## Step 5: Extract Server Sync Logic

### New Function: `syncToServerIfNeeded()`

**File:** `src/services/PlayerBackgroundService.ts`

```typescript
/**
 * Check if server sync is needed and execute if so
 *
 * Uses adaptive intervals based on network type
 *
 * @param userId - The user ID
 * @param libraryItemId - The library item ID
 */
async function syncToServerIfNeeded(
  userId: string,
  libraryItemId: string
): Promise<void> {
  const syncCheck = await progressService.shouldSyncToServer(userId, libraryItemId);

  if (!syncCheck.shouldSync) {
    return;
  }

  const session = await progressService.getCurrentSession(userId, libraryItemId);

  log.info(
    `Syncing to server: ${syncCheck.reason} appState=${AppState.currentState} session=${session?.sessionId || "none"} item=${libraryItemId}`
  );

  await progressService.syncSessionToServer(userId, libraryItemId);
}
```

---

## Step 6: Extract Session Rehydration Logic

### New Functions: Session Rehydration

**File:** `src/services/PlayerBackgroundService.ts`

```typescript
/**
 * Attempt to rehydrate missing session from database
 *
 * This handles the case where TrackPlayer has a track loaded but no active session exists.
 * Tries to restore from database or create a new session.
 *
 * @param currentTrack - The current track from player state
 * @param position - Current playback position
 * @param isPlaying - Whether playback is active
 */
async function attemptSessionRehydration(
  currentTrack: Track,
  position: number,
  isPlaying: boolean
): Promise<void> {
  const store = useAppStore.getState();

  log.info(
    `No session, attempting rehydration: position=${formatTime(position)}s appState=${AppState.currentState} item=${currentTrack.libraryItemId}`
  );

  // Try to rehydrate from database
  await progressService.forceRehydrateSession(currentTrack.libraryItemId);

  // Check if rehydration succeeded
  const rehydratedIds = await getUserIdAndLibraryItemId();

  if (!rehydratedIds) {
    log.info(`No current track in playerSlice, cannot rehydrate or start session`);
    store.updatePosition(position);
    return;
  }

  const session = await progressService.getCurrentSession(
    rehydratedIds.userId,
    rehydratedIds.libraryItemId
  );

  if (session) {
    await handleSuccessfulRehydration(rehydratedIds, position, isPlaying);
  } else if (isPlaying) {
    await handleFailedRehydrationWithActivePlayback(currentTrack, position, isPlaying);
  } else {
    handleFailedRehydrationWithInactivePlayback(position);
  }
}

/**
 * Handle successful session rehydration
 */
async function handleSuccessfulRehydration(
  ids: { userId: string; libraryItemId: string },
  position: number,
  isPlaying: boolean
): Promise<void> {
  const store = useAppStore.getState();
  const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);

  log.info(
    `Session rehydrated successfully, updating progress session=${session?.sessionId} item=${ids.libraryItemId}`
  );

  const playbackRate = await TrackPlayer.getRate();
  const volume = await TrackPlayer.getVolume();

  await progressService.updateProgress(
    ids.userId,
    ids.libraryItemId,
    position,
    playbackRate,
    volume,
    undefined,
    isPlaying
  );

  // Sync store position from rehydrated session (DB is source of truth)
  const updatedSession = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
  if (updatedSession) {
    store.updatePosition(updatedSession.currentTime);
  }
}

/**
 * Handle failed rehydration when playback is active
 *
 * Creates a new session to ensure progress tracking continues
 */
async function handleFailedRehydrationWithActivePlayback(
  currentTrack: Track,
  position: number,
  isPlaying: boolean
): Promise<void> {
  const store = useAppStore.getState();

  log.info(
    `Rehydration failed but playback is active, starting new session item=${currentTrack.libraryItemId}`
  );

  const username = await getStoredUsername();

  if (!username) {
    log.warn(
      `No username available, cannot start new session item=${currentTrack.libraryItemId}`
    );
    store.updatePosition(position);
    return;
  }

  try {
    await startNewSessionForActivePlayback(currentTrack, position, isPlaying);
  } catch (error) {
    log.error(
      `Failed to start new session after stale session cleared: ${(error as Error).message} item=${currentTrack.libraryItemId}`
    );
    // Fallback: update store from TrackPlayer position
    store.updatePosition(position);
  }
}

/**
 * Start a new session when rehydration failed but playback is active
 */
async function startNewSessionForActivePlayback(
  currentTrack: Track,
  position: number,
  isPlaying: boolean
): Promise<void> {
  const store = useAppStore.getState();
  const playbackRate = await TrackPlayer.getRate();
  const volume = await TrackPlayer.getVolume();
  const sessionId = store.player.currentPlaySessionId;
  const username = await getStoredUsername();

  if (!username) {
    throw new Error("No username available");
  }

  await progressService.startSession(
    username,
    currentTrack.libraryItemId,
    currentTrack.mediaId,
    position,
    currentTrack.duration,
    playbackRate,
    volume,
    sessionId || undefined
  );

  // Now update progress with the new session
  const newIds = await getUserIdAndLibraryItemId();

  if (newIds) {
    await progressService.updateProgress(
      newIds.userId,
      newIds.libraryItemId,
      position,
      playbackRate,
      volume,
      undefined,
      isPlaying
    );

    // Sync store position from new session
    const newSession = await progressService.getCurrentSession(
      newIds.userId,
      newIds.libraryItemId
    );
    if (newSession) {
      store.updatePosition(newSession.currentTime);
    }
  }
}

/**
 * Handle failed rehydration when playback is inactive
 */
function handleFailedRehydrationWithInactivePlayback(position: number): void {
  const store = useAppStore.getState();

  log.warn(
    `Failed to rehydrate session, and playback is not active`
  );

  // Fallback: update store from TrackPlayer position if no session
  store.updatePosition(position);
}
```

---

## Step 7: Refactored Main Function

### New Orchestrator: `handlePlaybackProgressUpdated()`

```typescript
/**
 * Handle playback progress updates
 *
 * This is the main entry point for the Event.PlaybackProgressUpdated event.
 * Orchestrates progress tracking, chapter detection, sleep timer, and server sync.
 *
 * @param event - The playback progress update event
 */
async function handlePlaybackProgressUpdated(event: PlaybackProgressUpdatedEvent): Promise<void> {
  try {
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    const previousChapter = store.player.currentChapter;

    // Get user and library item IDs
    const ids = await getUserIdAndLibraryItemId();

    if (ids) {
      // Normal flow: we have a valid session
      await handleProgressUpdateWithSession(ids, event, previousChapter);
    } else if (currentTrack) {
      // No session but track is loaded: attempt rehydration
      const state = await TrackPlayer.getPlaybackState();
      const isPlaying = state.state === State.Playing;
      await attemptSessionRehydration(currentTrack, event.position, isPlaying);
    } else {
      // No session and no track: just update position
      store.updatePosition(event.position);
    }
  } catch (error) {
    handleProgressUpdateError(error);
  }
}

/**
 * Handle progress update when we have a valid session
 */
async function handleProgressUpdateWithSession(
  ids: { userId: string; libraryItemId: string },
  event: PlaybackProgressUpdatedEvent,
  previousChapter: CurrentChapter | null
): Promise<void> {
  const store = useAppStore.getState();

  // Log progress periodically (every 5 seconds)
  if (Math.floor(event.position) % 5 === 0) {
    logProgressUpdate(ids, event.position);
  }

  // Get current playback state
  const state = await TrackPlayer.getPlaybackState();
  const isPlaying = state.state === State.Playing;

  // 1. Update progress and sync store position
  await updatePlaybackProgress(ids.userId, ids.libraryItemId, event.position, isPlaying);

  // 2. Handle chapter changes
  const currentChapter = store.player.currentChapter;
  await handleChapterChangeIfNeeded(previousChapter, currentChapter);

  // 3. Periodic now playing metadata updates
  await updateNowPlayingMetadataIfNeeded(event.position);

  // 4. Check and handle sleep timer
  await checkAndHandleSleepTimer(event.position, isPlaying);

  // 5. Sync to server if needed
  await syncToServerIfNeeded(ids.userId, ids.libraryItemId);
}

/**
 * Log progress update (throttled to every 5 seconds)
 */
async function logProgressUpdate(
  ids: { userId: string; libraryItemId: string },
  position: number
): Promise<void> {
  const store = useAppStore.getState();
  const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
  const { id, title } = store.player.currentChapter?.chapter || { id: null, title: null };

  log.info(
    `Playback progress updated: position=${formatTime(position)} appState=${AppState.currentState} uuid=${MODULE_INSTANCE_UUID} session=${session?.sessionId || "none"} item=${ids.libraryItemId} chapter=${JSON.stringify({ id, title })}`
  );
}

/**
 * Handle errors during progress updates
 */
async function handleProgressUpdateError(error: unknown): Promise<void> {
  const ids = await getUserIdAndLibraryItemId();
  const store = useAppStore.getState();
  const currentTrack = store.player.currentTrack;

  log.error(
    `Progress update error: ${(error as Error).message} item=${ids?.libraryItemId || currentTrack?.libraryItemId || "unknown"}`,
    error as Error
  );
}
```

---

## Step 8: Before/After Comparison

### Before (234 lines, 1 function)

```typescript
async function handlePlaybackProgressUpdated(event: PlaybackProgressUpdatedEvent): Promise<void> {
  try {
    // 234 lines of mixed responsibilities
    // - Progress tracking
    // - Chapter detection
    // - Metadata updates
    // - Sleep timer
    // - Server sync
    // - Session rehydration
    // - Error handling
  } catch (error) {
    // Error handling
  }
}
```

### After (~180 lines total, 15 functions)

```typescript
// Main orchestrator (~40 lines)
async function handlePlaybackProgressUpdated(event: PlaybackProgressUpdatedEvent): Promise<void>

// Session-based progress update (~30 lines)
async function handleProgressUpdateWithSession(...)

// Progress tracking (~25 lines)
async function updatePlaybackProgress(...)

// Chapter detection (~15 lines)
async function handleChapterChangeIfNeeded(...)

// Metadata updates (~15 lines)
async function updateNowPlayingMetadataIfNeeded(...)

// Sleep timer (~60 lines total)
async function checkAndHandleSleepTimer(...)
function determineShouldPause(...)
async function pauseForSleepTimer(...)

// Server sync (~15 lines)
async function syncToServerIfNeeded(...)

// Session rehydration (~100 lines total)
async function attemptSessionRehydration(...)
async function handleSuccessfulRehydration(...)
async function handleFailedRehydrationWithActivePlayback(...)
async function startNewSessionForActivePlayback(...)
function handleFailedRehydrationWithInactivePlayback(...)

// Utilities (~10 lines each)
async function logProgressUpdate(...)
async function handleProgressUpdateError(...)
```

**Benefits:**
- Each function has clear, single responsibility
- Functions are 10-60 lines (manageable size)
- Much easier to test individually
- Better error handling isolation
- Clearer code flow
- Easier to modify one aspect without affecting others

---

## Step 9: Testing Strategy

### Unit Tests for Each Helper

**File:** `src/services/__tests__/PlayerBackgroundService.helpers.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from '@jest/globals';
import {
  updatePlaybackProgress,
  handleChapterChangeIfNeeded,
  updateNowPlayingMetadataIfNeeded,
  determineShouldPause,
  syncToServerIfNeeded,
} from '../PlayerBackgroundService';

// Mock dependencies
vi.mock('react-native-track-player');
vi.mock('@/services/ProgressService');
vi.mock('@/stores/useAppStore');

describe('PlayerBackgroundService Helpers', () => {
  describe('updatePlaybackProgress', () => {
    it('should update progress and return session', async () => {
      // Test implementation
    });

    it('should fallback to TrackPlayer position when no session', async () => {
      // Test implementation
    });
  });

  describe('handleChapterChangeIfNeeded', () => {
    it('should update metadata when chapter changes', async () => {
      // Test implementation
    });

    it('should not update metadata when chapter unchanged', async () => {
      // Test implementation
    });

    it('should handle null chapters', async () => {
      // Test implementation
    });
  });

  describe('updateNowPlayingMetadataIfNeeded', () => {
    it('should update on even seconds when enabled', async () => {
      // Test implementation
    });

    it('should not update on odd seconds', async () => {
      // Test implementation
    });

    it('should not update when disabled', async () => {
      // Test implementation
    });
  });

  describe('determineShouldPause', () => {
    it('should pause for expired duration timer', () => {
      const sleepTimer = {
        type: 'duration' as const,
        endTime: Date.now() - 1000, // Expired
      };

      const shouldPause = determineShouldPause(sleepTimer, null, null, 100);
      expect(shouldPause).toBe(true);
    });

    it('should not pause for active duration timer', () => {
      const sleepTimer = {
        type: 'duration' as const,
        endTime: Date.now() + 60000, // 1 minute remaining
      };

      const shouldPause = determineShouldPause(sleepTimer, null, null, 100);
      expect(shouldPause).toBe(false);
    });

    it('should pause at end of current chapter', () => {
      const currentChapter = {
        chapter: { id: '1', start: 0, end: 100, title: 'Chapter 1' },
        indexInBook: 0,
      };

      const sleepTimer = {
        type: 'chapter' as const,
        chapterTarget: 'current' as const,
      };

      const shouldPause = determineShouldPause(sleepTimer, currentChapter, {} as any, 100);
      expect(shouldPause).toBe(true);
    });
  });

  describe('syncToServerIfNeeded', () => {
    it('should sync when shouldSync is true', async () => {
      // Test implementation
    });

    it('should not sync when shouldSync is false', async () => {
      // Test implementation
    });
  });
});
```

### Integration Tests

**File:** `src/services/__tests__/PlayerBackgroundService.integration.test.ts`

```typescript
describe('handlePlaybackProgressUpdated Integration', () => {
  it('should handle complete progress update flow', async () => {
    // Setup mocks for successful session update
    // Call handlePlaybackProgressUpdated
    // Verify all steps executed in correct order
  });

  it('should handle session rehydration', async () => {
    // Setup mocks for missing session
    // Call handlePlaybackProgressUpdated
    // Verify rehydration attempted
  });

  it('should handle chapter changes', async () => {
    // Setup mocks for chapter change
    // Call handlePlaybackProgressUpdated
    // Verify metadata updated
  });

  it('should handle sleep timer expiration', async () => {
    // Setup mocks for expired timer
    // Call handlePlaybackProgressUpdated
    // Verify playback paused
  });
});
```

---

## Step 10: Migration Checklist

### Phase 1: Preparation (Day 1 Morning)
- [ ] Create feature branch: `refactor/playback-progress-handler`
- [ ] Review current implementation thoroughly
- [ ] Document all edge cases and behaviors
- [ ] Set up comprehensive test data

### Phase 2: Extract Helper Functions (Day 1 Afternoon - Day 2)
- [ ] Extract `updatePlaybackProgress()`
  - [ ] Write unit tests
  - [ ] Verify tests pass
- [ ] Extract `handleChapterChangeIfNeeded()`
  - [ ] Write unit tests
  - [ ] Verify tests pass
- [ ] Extract `updateNowPlayingMetadataIfNeeded()`
  - [ ] Write unit tests
  - [ ] Verify tests pass
- [ ] Extract sleep timer functions
  - [ ] Extract `checkAndHandleSleepTimer()`
  - [ ] Extract `determineShouldPause()`
  - [ ] Extract `pauseForSleepTimer()`
  - [ ] Write unit tests
  - [ ] Verify tests pass
- [ ] Extract `syncToServerIfNeeded()`
  - [ ] Write unit tests
  - [ ] Verify tests pass
- [ ] Extract session rehydration functions
  - [ ] Extract all rehydration helpers
  - [ ] Write unit tests
  - [ ] Verify tests pass

### Phase 3: Refactor Main Function (Day 3)
- [ ] Implement new `handlePlaybackProgressUpdated()`
- [ ] Implement `handleProgressUpdateWithSession()`
- [ ] Implement utility functions (`logProgressUpdate`, `handleProgressUpdateError`)
- [ ] Write integration tests
- [ ] Ensure all tests pass

### Phase 4: Testing & Validation (Day 3-4)
- [ ] Run full test suite
- [ ] Manual testing:
  - [ ] Normal playback progress
  - [ ] Chapter transitions
  - [ ] Sleep timer (duration-based)
  - [ ] Sleep timer (chapter-based)
  - [ ] Session rehydration
  - [ ] Server sync
  - [ ] Background playback
  - [ ] App backgrounded/foregrounded
  - [ ] Network changes
- [ ] Performance testing
- [ ] Error scenario testing

### Phase 5: Code Review & Deployment (Day 4)
- [ ] Code review with team
- [ ] Address feedback
- [ ] Final testing
- [ ] Merge to main branch
- [ ] Monitor for issues

---

## Step 11: Risk Mitigation

### Risk 1: Breaking Playback Progress Tracking
**Probability:** Medium
**Impact:** Critical
**Mitigation:**
- Comprehensive test coverage (90%+ for helpers)
- Integration tests for complete flow
- Extensive manual testing
- Feature flag to enable/disable new code
- Monitor error rates after deployment

### Risk 2: Session Rehydration Failures
**Probability:** Low
**Impact:** High
**Mitigation:**
- Keep rehydration logic intact
- Test all rehydration scenarios
- Preserve fallback behavior
- Add detailed logging

### Risk 3: Sleep Timer Regression
**Probability:** Low
**Impact:** Medium
**Mitigation:**
- Test both timer types thoroughly
- Verify pause behavior
- Test edge cases (chapter boundaries)

### Risk 4: Performance Degradation
**Probability:** Very Low
**Impact:** Medium
**Mitigation:**
- No additional async operations
- Function calls are lightweight
- Benchmark before/after
- Monitor performance metrics

---

## Step 12: Rollback Plan

### Quick Rollback (If Critical Issues)

```bash
# Revert the commit
git revert <commit-hash>
git push

# Or checkout previous version
git checkout <previous-commit> -- src/services/PlayerBackgroundService.ts
git commit -m "Rollback playback progress handler refactoring"
git push
```

### Partial Rollback (Keep Helpers, Revert Main Function)

If helpers are good but main orchestrator has issues:
1. Keep all extracted helper functions
2. Revert only the main `handlePlaybackProgressUpdated()` function
3. Fix issues in helpers
4. Re-attempt refactoring of main function

---

## Step 13: Success Metrics

### Code Quality
- [ ] Function length: Max 60 lines per function
- [ ] Cyclomatic complexity: Reduced by 40%+
- [ ] Test coverage: 90%+ for all helpers
- [ ] Integration test coverage: 80%+

### Functionality
- [ ] All existing tests pass
- [ ] No regressions in manual testing
- [ ] Progress tracking works correctly
- [ ] Chapter changes detected
- [ ] Sleep timer functions properly
- [ ] Server sync works
- [ ] Session rehydration works

### Performance
- [ ] No increase in progress update latency
- [ ] No increase in memory usage
- [ ] Background service performance unchanged

### Maintainability
- [ ] Easier to understand code flow
- [ ] Easier to modify individual behaviors
- [ ] Easier to add new features
- [ ] Better test coverage

---

## Step 14: Documentation Updates

### Code Comments

Add comprehensive JSDoc to all new functions:

```typescript
/**
 * Update session progress and sync store position
 *
 * This function is the source of truth for playback progress. It:
 * 1. Updates the session progress in the database
 * 2. Syncs the store position from the updated session
 * 3. Falls back to TrackPlayer position if session not found
 *
 * @param userId - The user ID
 * @param libraryItemId - The library item ID
 * @param position - Current playback position in seconds
 * @param isPlaying - Whether playback is currently active
 * @returns The updated session, or null if not found
 *
 * @example
 * const session = await updatePlaybackProgress(
 *   'user-123',
 *   'item-456',
 *   120.5,
 *   true
 * );
 */
async function updatePlaybackProgress(...) { }
```

### Architecture Documentation

Update architecture docs to reflect new structure:

```markdown
## PlayerBackgroundService: Progress Update Flow

The `handlePlaybackProgressUpdated` function orchestrates multiple concerns:

1. **Progress Tracking** (`updatePlaybackProgress`)
   - Updates database session
   - Syncs store position

2. **Chapter Detection** (`handleChapterChangeIfNeeded`)
   - Detects chapter transitions
   - Updates now playing metadata

3. **Metadata Updates** (`updateNowPlayingMetadataIfNeeded`)
   - Periodic updates (every 2 seconds)
   - Gated by user setting

4. **Sleep Timer** (`checkAndHandleSleepTimer`)
   - Duration-based timers
   - Chapter-based timers

5. **Server Sync** (`syncToServerIfNeeded`)
   - Adaptive sync intervals
   - Network-aware

6. **Session Rehydration** (`attemptSessionRehydration`)
   - Restores missing sessions
   - Creates new sessions when needed
```

---

## Timeline Summary

| Day | Tasks | Hours |
|-----|-------|-------|
| **Day 1 AM** | Preparation, extract first 3 helpers | 4 |
| **Day 1 PM** | Extract sleep timer & sync helpers | 4 |
| **Day 2** | Extract rehydration helpers, write tests | 8 |
| **Day 3** | Refactor main function, integration tests | 8 |
| **Day 4** | Testing, code review, deployment | 8 |
| **Total** | | **32 hours** |

---

## Benefits Summary

### Immediate Benefits
- **Testability:** Each concern can be tested in isolation
- **Maintainability:** Easier to understand and modify
- **Debuggability:** Clearer stack traces and logging
- **Code clarity:** Self-documenting function names

### Long-term Benefits
- **Feature additions:** Easy to add new concerns (e.g., analytics)
- **Bug fixes:** Issues isolated to specific functions
- **Refactoring:** Can optimize individual functions
- **Documentation:** Clearer architecture

---

## Next Steps

1. **Review this plan** with team
2. **Get approval** for the approach
3. **Create feature branch**
4. **Start with Day 1** tasks
5. **Daily check-ins** to track progress
6. **Code review** after each major extraction

---

## References

- Current Implementation: `src/services/PlayerBackgroundService.ts:395-628`
- ProgressService: `src/services/ProgressService.ts`
- Player Store: `src/stores/slices/playerSlice.ts`
- TrackPlayer Docs: https://rntp.dev/docs/api/events
