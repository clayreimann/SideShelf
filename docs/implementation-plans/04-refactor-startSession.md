# Implementation Plan: Refactor startSession()

**Priority:** P1 - Critical
**Risk Level:** High
**Estimated Effort:** 3-4 days
**Impact:** Improves maintainability of critical session management function (227 lines)

---

## Overview

Refactor `startSession()` in ProgressService.ts from a monolithic 227-line function into smaller, testable, single-responsibility functions.

**Current State:**
- Single 227-line function (lines 189-415)
- Handles 7+ distinct responsibilities
- Complex mutex locking logic
- Multiple nested conditions
- Difficult to test individual behaviors
- High risk for bugs when modifying

**Target State:**
- Main orchestrator function (~30-40 lines)
- 8-10 smaller helper functions (15-30 lines each)
- Clear separation of concerns
- Easier to test and maintain
- Better error handling

---

## Responsibility Analysis

### Current Responsibilities (7 major concerns)

1. **Mutex Management** (Lines 199-228)
   - Wait for existing locks
   - Create new locks
   - Release locks in finally block

2. **Validation** (Lines 230-248)
   - Library item existence
   - User existence
   - Basic parameter validation

3. **Duplicate Session Detection & Cleanup** (Lines 250-308)
   - Find all active sessions for item
   - Detect duplicates
   - Clean up old/invalid sessions
   - Select best session to keep

4. **Resume Position Determination** (Lines 310-378)
   - Check for existing session
   - Check for stale sessions
   - Get saved progress as fallback
   - Determine authoritative resume position

5. **Other Session Cleanup** (Lines 355-365)
   - End sessions for different items
   - End stale session for current item

6. **Session Creation** (Lines 380-389)
   - Create new session in database
   - Set initial position

7. **Server Sync** (Lines 393-402)
   - Handle existing server session ID
   - Sync new session to server

---

## Step 1: Extract Mutex Management

### New Helper: Session Lock Manager

**File:** `src/services/ProgressService.ts`

```typescript
/**
 * Acquire a lock for starting a session
 *
 * Ensures only one startSession call executes at a time per library item
 *
 * @param libraryItemId - The library item ID
 * @param username - The username to check for existing sessions
 * @returns Lock release function
 */
private async acquireStartSessionLock(
  libraryItemId: string,
  username: string
): Promise<() => void> {
  // Wait for any existing lock
  const existingLock = this.startSessionLocks.get(libraryItemId);
  if (existingLock) {
    log.info(`Waiting for existing startSession call to complete for ${libraryItemId}`);
    await existingLock;

    // After waiting, check if a session now exists
    const existingSession = await this.checkForExistingSession(libraryItemId, username);
    if (existingSession) {
      log.info(
        `Session already created by previous call, skipping duplicate startSession item=${libraryItemId} session=${existingSession.id}`
      );
      throw new SessionAlreadyExistsError(existingSession);
    }
  }

  // Create a new lock promise
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  this.startSessionLocks.set(libraryItemId, lockPromise);

  // Return the release function
  return () => {
    releaseLock!();
    this.startSessionLocks.delete(libraryItemId);
  };
}

/**
 * Check if a session already exists for this item
 */
private async checkForExistingSession(
  libraryItemId: string,
  username: string
): Promise<LocalListeningSessionRow | null> {
  try {
    const user = await getUserByUsername(username);
    if (user?.id) {
      return await getActiveSession(user.id, libraryItemId);
    }
  } catch (error) {
    log.warn(`Failed to check for session after lock: ${error}`);
  }
  return null;
}

/**
 * Custom error for when session already exists
 */
class SessionAlreadyExistsError extends Error {
  constructor(public session: LocalListeningSessionRow) {
    super('Session already exists');
    this.name = 'SessionAlreadyExistsError';
  }
}
```

---

## Step 2: Extract Validation Logic

### New Helper: Validate Start Session Request

```typescript
/**
 * Validation result for start session request
 */
interface StartSessionValidation {
  user: UserRow;
  libraryItem: LibraryItemRow;
}

/**
 * Validate that all required data exists for starting a session
 *
 * @param username - The username
 * @param libraryItemId - The library item ID
 * @throws {Error} If validation fails
 * @returns Validated user and library item
 */
private async validateStartSessionRequest(
  username: string,
  libraryItemId: string
): Promise<StartSessionValidation> {
  // Validate library item exists
  const libraryItem = await getLibraryItemById(libraryItemId);
  if (!libraryItem) {
    log.error(`Library item ${libraryItemId} not found in local database`);
    throw new Error(`Library item ${libraryItemId} not found locally`);
  }

  log.info(`Found library item: ${libraryItem.mediaType} in library ${libraryItem.libraryId}`);

  // Validate user exists
  const user = await getUserByUsername(username);
  if (!user?.id) {
    log.error(`User ${username} not found in database`);
    throw new Error("User not found");
  }

  return { user, libraryItem };
}
```

---

## Step 3: Extract Duplicate Session Cleanup

### New Helper: Clean Up Duplicate Sessions

```typescript
/**
 * Result of duplicate session cleanup
 */
interface DuplicateCleanupResult {
  bestSession: LocalListeningSessionRow | null;
  sessionsEnded: number;
}

/**
 * Find and clean up duplicate active sessions for an item
 *
 * When multiple active sessions exist for the same item (race condition),
 * this keeps the most recent one and ends the others.
 *
 * @param userId - The user ID
 * @param libraryItemId - The library item ID
 * @returns The best session to keep (if any) and count of sessions ended
 */
private async cleanupDuplicateSessions(
  userId: string,
  libraryItemId: string
): Promise<DuplicateCleanupResult> {
  // Get all active sessions for this item
  const allActiveSessionsForItem = (await getAllActiveSessionsForUser(userId)).filter(
    (s) => s.libraryItemId === libraryItemId
  );

  // Log found sessions for diagnostics
  if (allActiveSessionsForItem.length > 0) {
    this.logFoundSessions(allActiveSessionsForItem, libraryItemId);
  }

  // No duplicates - return early
  if (allActiveSessionsForItem.length <= 1) {
    return {
      bestSession: allActiveSessionsForItem[0] || null,
      sessionsEnded: 0,
    };
  }

  // Handle duplicates
  log.warn(
    `Found ${allActiveSessionsForItem.length} active sessions for item ${libraryItemId}, cleaning up duplicates`
  );

  // Sort by updatedAt DESC (most recent first)
  const sortedSessions = allActiveSessionsForItem.sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  const bestSession = sortedSessions[0];
  const sessionsToEnd = sortedSessions.slice(1);

  // End duplicate sessions
  for (const session of sessionsToEnd) {
    await this.endDuplicateSession(session, bestSession, libraryItemId);
  }

  return {
    bestSession,
    sessionsEnded: sessionsToEnd.length,
  };
}

/**
 * Log found sessions for diagnostics
 */
private logFoundSessions(
  sessions: LocalListeningSessionRow[],
  libraryItemId: string
): void {
  const now = Date.now();
  const sessionDetails = sessions
    .map((s) => {
      const age = now - s.createdAt.getTime();
      const isBrandNew = s.currentTime === s.startTime;
      return `${s.id.slice(0, 8)}(age=${age}ms, brandNew=${isBrandNew}, pos=${formatTime(s.currentTime)}s)`;
    })
    .join(", ");

  log.info(
    `Found ${sessions.length} active session(s) for ${libraryItemId}: ${sessionDetails}`
  );
}

/**
 * End a duplicate session with appropriate logic
 */
private async endDuplicateSession(
  session: LocalListeningSessionRow,
  bestSession: LocalListeningSessionRow,
  libraryItemId: string
): Promise<void> {
  const hasInvalidProgress = session.currentTime < 5;
  const isMuchOlder =
    bestSession.updatedAt.getTime() - session.updatedAt.getTime() > 10 * 60 * 1000; // 10 minutes

  if (hasInvalidProgress || isMuchOlder) {
    log.info(
      `Ending duplicate session ${session.id} (currentTime=${session.currentTime}, updatedAt=${session.updatedAt.toISOString()}) session=${session.id} item=${libraryItemId}`
    );
  } else {
    log.warn(
      `Multiple valid sessions found, keeping most recent (${bestSession.id}) session=${bestSession.id} item=${libraryItemId}`
    );
  }

  await endListeningSession(session.id, session.currentTime);
}
```

---

## Step 4: Extract Resume Position Logic

### New Helper: Determine Resume Position

```typescript
/**
 * Resume position result
 */
interface ResumePositionResult {
  position: number;
  source: "startArgument" | "activeSession" | "savedProgress";
  shouldEndExistingSession: boolean;
  existingSession: LocalListeningSessionRow | null;
}

/**
 * Determine the resume position for a new session
 *
 * Checks multiple sources in priority order:
 * 1. Active session (if recent and valid)
 * 2. Saved progress (fallback)
 * 3. Start argument (default)
 *
 * @param userId - The user ID
 * @param libraryItemId - The library item ID
 * @param startTime - Requested start time (fallback)
 * @param existingSession - Existing active session (if any)
 * @returns Resume position, source, and whether to end existing session
 */
private async determineResumePosition(
  userId: string,
  libraryItemId: string,
  startTime: number,
  existingSession: LocalListeningSessionRow | null
): Promise<ResumePositionResult> {
  // Get saved progress as fallback
  const savedProgress = await getMediaProgressForLibraryItem(libraryItemId, userId);

  // No existing session - use saved progress or start time
  if (!existingSession) {
    return {
      position: savedProgress?.currentTime || startTime,
      source: savedProgress?.currentTime ? "savedProgress" : "startArgument",
      shouldEndExistingSession: false,
      existingSession: null,
    };
  }

  // Check if session is stale
  const sessionAge = Date.now() - existingSession.updatedAt.getTime();
  const isStale = sessionAge > 10 * 60 * 1000; // 10 minutes

  if (isStale) {
    log.info("Found stale active session (>10 min), ending it");
    return {
      position: savedProgress?.currentTime || startTime,
      source: savedProgress?.currentTime ? "savedProgress" : "startArgument",
      shouldEndExistingSession: true,
      existingSession,
    };
  }

  // Session is recent - use it
  log.info("Found recent active session for same item, will resume");

  // If session has valid position (> 1s), use it
  if (existingSession.currentTime > 1) {
    log.info(`Resuming from active session: ${existingSession.currentTime}`);
    return {
      position: existingSession.currentTime,
      source: "activeSession",
      shouldEndExistingSession: false,
      existingSession,
    };
  }

  // Session position is invalid, try saved progress
  if (savedProgress?.currentTime) {
    log.info(
      `Resuming from saved progress (session currentTime was ${existingSession.currentTime}): ${savedProgress.currentTime}`
    );
    return {
      position: savedProgress.currentTime,
      source: "savedProgress",
      shouldEndExistingSession: false,
      existingSession,
    };
  }

  // Fallback to session position
  log.info(`Resuming from active session: ${existingSession.currentTime}`);
  return {
    position: existingSession.currentTime,
    source: "activeSession",
    shouldEndExistingSession: false,
    existingSession,
  };
}

/**
 * Log the resolved resume position for diagnostics
 */
private logResumePosition(
  resumePosition: ResumePositionResult,
  libraryItemId: string,
  savedProgress: MediaProgressRow | null
): void {
  const resumeParts = [
    `position=${formatTime(resumePosition.position)}s`,
    `source=${resumePosition.source}`,
  ];

  if (resumePosition.existingSession) {
    const session = resumePosition.existingSession;
    resumeParts.push(`dbCurrent=${formatTime(session.currentTime)}s`);
    if (session.startTime != null) {
      resumeParts.push(`dbStart=${formatTime(session.startTime)}s`);
    }
    resumeParts.push(`dbUpdatedAt=${session.updatedAt.toISOString()}`);
  } else if (savedProgress?.currentTime) {
    resumeParts.push(`savedProgress=${formatTime(savedProgress.currentTime)}s`);
  }

  log.info(`Resolved resume position for ${libraryItemId}: ${resumeParts.join(" ")}`);
}
```

---

## Step 5: Extract Other Session Cleanup

### New Helper: Clean Up Other Sessions

```typescript
/**
 * End all other active sessions for this user
 *
 * This includes:
 * - Sessions for different library items
 * - Stale session for current item (if flagged)
 *
 * @param userId - The user ID
 * @param currentLibraryItemId - The current library item ID
 * @param shouldEndCurrentItemSession - Whether to end stale session for current item
 */
private async cleanupOtherActiveSessions(
  userId: string,
  currentLibraryItemId: string,
  shouldEndCurrentItemSession: boolean
): Promise<void> {
  const allActiveSessions = await getAllActiveSessionsForUser(userId);

  for (const session of allActiveSessions) {
    if (session.libraryItemId !== currentLibraryItemId) {
      log.info(`Ending active session for different item: ${session.libraryItemId}`);
      await endListeningSession(session.id, session.currentTime);
    } else if (shouldEndCurrentItemSession) {
      log.info(`Ending stale session for current item: ${session.libraryItemId}`);
      await endListeningSession(session.id, session.currentTime);
    }
  }
}
```

---

## Step 6: Extract Session Creation & Sync

### New Helper: Create And Sync Session

```typescript
/**
 * Create a new session and sync to server
 *
 * @param userId - The user ID
 * @param libraryItemId - The library item ID
 * @param mediaId - The media ID
 * @param resumePosition - The position to resume from
 * @param duration - The total duration
 * @param playbackRate - The playback rate
 * @param volume - The volume
 * @param existingServerSessionId - Existing server session ID (optional)
 * @returns The created session ID
 */
private async createAndSyncSession(
  userId: string,
  libraryItemId: string,
  mediaId: string,
  resumePosition: number,
  duration: number,
  playbackRate: number,
  volume: number,
  existingServerSessionId?: string
): Promise<string> {
  // Create new session in database
  const sessionId = await startListeningSession(
    userId,
    libraryItemId,
    mediaId,
    resumePosition,
    duration,
    playbackRate,
    volume
  );

  // Handle server synchronization
  if (existingServerSessionId) {
    // Use existing server session ID (from streaming)
    log.info(`Using existing server session ID: ${existingServerSessionId}`);
    await updateServerSessionId(sessionId, existingServerSessionId);
    await markSessionAsSynced(sessionId);
  } else {
    // Sync new session to server (for downloaded content)
    await this.syncSessionToServer(userId, libraryItemId, sessionId);
  }

  log.info(
    `Started session ${sessionId} for ${libraryItemId} at position ${resumePosition} session=${sessionId} item=${libraryItemId}`
  );

  return sessionId;
}
```

---

## Step 7: Refactored Main Function

### New Orchestrator: `startSession()`

```typescript
/**
 * Start a new listening session
 *
 * This is a complex operation that:
 * 1. Acquires a mutex lock to prevent race conditions
 * 2. Validates request data
 * 3. Cleans up duplicate sessions
 * 4. Determines resume position from multiple sources
 * 5. Ends other active sessions
 * 6. Creates new session and syncs to server
 *
 * @param username - The username
 * @param libraryItemId - The library item ID
 * @param mediaId - The media ID
 * @param startTime - Requested start time (fallback)
 * @param duration - Total duration
 * @param playbackRate - Playback rate
 * @param volume - Volume level
 * @param existingServerSessionId - Existing server session ID (for streaming)
 */
async startSession(
  username: string,
  libraryItemId: string,
  mediaId: string,
  startTime: number,
  duration: number,
  playbackRate: number = 1.0,
  volume: number = 1.0,
  existingServerSessionId?: string
): Promise<void> {
  log.info(`Starting session for library item ${libraryItemId}, media ${mediaId}`);
  if (existingServerSessionId) {
    log.info(`Using existing streaming session: ${existingServerSessionId}`);
  }

  // Acquire mutex lock
  let releaseLock: (() => void) | null = null;

  try {
    releaseLock = await this.acquireStartSessionLock(libraryItemId, username);
  } catch (error) {
    // Session already exists (created by concurrent call)
    if (error instanceof SessionAlreadyExistsError) {
      return; // Nothing to do
    }
    throw error;
  }

  try {
    // 1. Validate request
    const { user, libraryItem } = await this.validateStartSessionRequest(
      username,
      libraryItemId
    );

    // 2. Clean up duplicate sessions
    const { bestSession } = await this.cleanupDuplicateSessions(user.id, libraryItemId);

    // 3. Determine resume position
    const resumePosition = await this.determineResumePosition(
      user.id,
      libraryItemId,
      startTime,
      bestSession
    );

    // Log resume position for diagnostics
    const savedProgress = await getMediaProgressForLibraryItem(libraryItemId, user.id);
    this.logResumePosition(resumePosition, libraryItemId, savedProgress);

    // 4. End other active sessions
    await this.cleanupOtherActiveSessions(
      user.id,
      libraryItemId,
      resumePosition.shouldEndExistingSession
    );

    // 5. Create and sync new session
    await this.createAndSyncSession(
      user.id,
      libraryItemId,
      mediaId,
      resumePosition.position,
      duration,
      playbackRate,
      volume,
      existingServerSessionId
    );
  } catch (error) {
    log.error("Failed to start session:", error as Error);
    throw error;
  } finally {
    // Always release the mutex lock
    if (releaseLock) {
      releaseLock();
    }
  }
}
```

---

## Step 8: Before/After Comparison

### Before (227 lines, 1 function)

```typescript
async startSession(...): Promise<void> {
  // 227 lines handling:
  // - Mutex locking
  // - Validation
  // - Duplicate cleanup
  // - Resume position logic
  // - Other session cleanup
  // - Session creation
  // - Server sync
}
```

### After (~200 lines total, 11 functions)

```typescript
// Main orchestrator (~40 lines)
async startSession(...)

// Mutex management (~40 lines)
private async acquireStartSessionLock(...)
private async checkForExistingSession(...)
class SessionAlreadyExistsError

// Validation (~20 lines)
private async validateStartSessionRequest(...)

// Duplicate cleanup (~80 lines)
private async cleanupDuplicateSessions(...)
private logFoundSessions(...)
private async endDuplicateSession(...)

// Resume position (~70 lines)
private async determineResumePosition(...)
private logResumePosition(...)

// Other session cleanup (~15 lines)
private async cleanupOtherActiveSessions(...)

// Session creation (~25 lines)
private async createAndSyncSession(...)
```

**Line Reduction:** 227 → ~200 lines (~12% reduction)
**Function Count:** 1 → 11 functions
**Average Function Size:** 227 lines → ~18 lines

---

## Step 9: Testing Strategy

### Unit Tests for Each Helper

**File:** `src/services/__tests__/ProgressService.startSession.test.ts`

```typescript
describe('ProgressService.startSession helpers', () => {
  describe('validateStartSessionRequest', () => {
    it('should validate successfully with valid data', async () => {
      // Mock library item and user
      const result = await service['validateStartSessionRequest']('testuser', 'item-123');
      expect(result.user).toBeDefined();
      expect(result.libraryItem).toBeDefined();
    });

    it('should throw when library item not found', async () => {
      // Mock missing library item
      await expect(
        service['validateStartSessionRequest']('testuser', 'invalid')
      ).rejects.toThrow('not found locally');
    });

    it('should throw when user not found', async () => {
      // Mock missing user
      await expect(
        service['validateStartSessionRequest']('invalid', 'item-123')
      ).rejects.toThrow('User not found');
    });
  });

  describe('cleanupDuplicateSessions', () => {
    it('should keep most recent session when duplicates exist', async () => {
      // Mock multiple sessions
      const result = await service['cleanupDuplicateSessions']('user-123', 'item-456');
      expect(result.bestSession).toBeDefined();
      expect(result.sessionsEnded).toBe(2); // Ended 2 duplicates
    });

    it('should handle no duplicates', async () => {
      // Mock single session
      const result = await service['cleanupDuplicateSessions']('user-123', 'item-456');
      expect(result.sessionsEnded).toBe(0);
    });
  });

  describe('determineResumePosition', () => {
    it('should use active session when recent', async () => {
      const mockSession = {
        currentTime: 120,
        updatedAt: new Date(Date.now() - 1000), // 1 second ago
      } as LocalListeningSessionRow;

      const result = await service['determineResumePosition'](
        'user-123',
        'item-456',
        0,
        mockSession
      );

      expect(result.position).toBe(120);
      expect(result.source).toBe('activeSession');
      expect(result.shouldEndExistingSession).toBe(false);
    });

    it('should end stale session', async () => {
      const mockSession = {
        currentTime: 120,
        updatedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      } as LocalListeningSessionRow;

      const result = await service['determineResumePosition'](
        'user-123',
        'item-456',
        0,
        mockSession
      );

      expect(result.shouldEndExistingSession).toBe(true);
    });

    it('should fall back to saved progress', async () => {
      // Mock saved progress, no active session
      const result = await service['determineResumePosition'](
        'user-123',
        'item-456',
        0,
        null
      );

      expect(result.source).toBe('savedProgress');
    });
  });
});
```

---

## Step 10: Migration Checklist

### Phase 1: Preparation (Day 1 Morning)
- [ ] Create feature branch: `refactor/start-session`
- [ ] Review current implementation
- [ ] Document all edge cases
- [ ] Set up test fixtures

### Phase 2: Extract Helpers (Day 1-2)
- [ ] Extract mutex management
  - [ ] Write tests
  - [ ] Verify tests pass
- [ ] Extract validation
  - [ ] Write tests
  - [ ] Verify tests pass
- [ ] Extract duplicate cleanup
  - [ ] Write tests
  - [ ] Verify tests pass
- [ ] Extract resume position logic
  - [ ] Write tests
  - [ ] Verify tests pass
- [ ] Extract other session cleanup
  - [ ] Write tests
  - [ ] Verify tests pass
- [ ] Extract session creation
  - [ ] Write tests
  - [ ] Verify tests pass

### Phase 3: Refactor Main Function (Day 3)
- [ ] Implement new orchestrator
- [ ] Write integration tests
- [ ] Ensure all tests pass

### Phase 4: Testing (Day 3-4)
- [ ] Run full test suite
- [ ] Manual testing:
  - [ ] Start new session
  - [ ] Resume existing session
  - [ ] Handle duplicates
  - [ ] Handle stale sessions
  - [ ] Concurrent session starts
  - [ ] Streaming vs downloaded
- [ ] Performance testing
- [ ] Error scenario testing

### Phase 5: Deployment (Day 4)
- [ ] Code review
- [ ] Address feedback
- [ ] Final testing
- [ ] Merge to main

---

## Step 11: Success Metrics

### Code Quality
- [ ] Average function length: <25 lines
- [ ] Test coverage: 90%+ for helpers
- [ ] Integration test coverage: 85%+
- [ ] No regressions

### Functionality
- [ ] All existing tests pass
- [ ] Session creation works
- [ ] Duplicate detection works
- [ ] Resume position correct
- [ ] Mutex prevents race conditions

### Performance
- [ ] No increase in session start latency
- [ ] Memory usage unchanged

---

## Timeline

| Day | Tasks | Hours |
|-----|-------|-------|
| **Day 1** | Preparation, extract first helpers | 8 |
| **Day 2** | Extract remaining helpers, tests | 8 |
| **Day 3** | Refactor main function, integration tests | 8 |
| **Day 4** | Testing, code review, deployment | 8 |
| **Total** | | **32 hours** |

---

## Risks and Mitigation

### Risk 1: Mutex Logic Breaks
**Probability:** Low
**Impact:** Critical
**Mitigation:**
- Extensive testing of concurrent calls
- Preserve exact mutex behavior
- Add integration tests for race conditions

### Risk 2: Resume Position Incorrect
**Probability:** Low
**Impact:** High
**Mitigation:**
- Test all resume scenarios
- Verify against current behavior
- Add detailed logging

### Risk 3: Session Duplication
**Probability:** Low
**Impact:** High
**Mitigation:**
- Test duplicate detection thoroughly
- Preserve cleanup logic exactly
- Monitor for duplicates after deployment

---

## References

- Current Implementation: `src/services/ProgressService.ts:189-415`
- Session DB Helpers: `src/db/helpers/listeningSessions.ts`
- Progress DB Helpers: `src/db/helpers/mediaProgress.ts`
