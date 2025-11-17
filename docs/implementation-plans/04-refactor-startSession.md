# Implementation Plan: Refactor startSession()

**Priority:** P1 | **Risk:** High | **Effort:** 3-4 days | **Impact:** Breaks 227-line function into 11 functions

---

## Problem

Single 227-line function (ProgressService.ts:189-415) handling 7+ responsibilities:
- Mutex locking for concurrent calls
- User and library item validation
- Duplicate session detection and cleanup
- Resume position determination from multiple sources
- Other session cleanup
- New session creation
- Server synchronization

Complex async flow, high risk for bugs when modifying.

---

## Solution

Extract into focused functions:

**1. acquireStartSessionLock() + checkForExistingSession()**
- Mutex management to prevent race conditions
- Wait for existing locks, check for sessions created by concurrent calls

**2. validateStartSessionRequest()**
- Validate library item exists
- Validate user exists
- Return validated data

**3. cleanupDuplicateSessions()**
- Find all active sessions for item
- Sort by recency, keep best session
- End duplicate/stale sessions

**4. determineResumePosition()**
- Check active session (if recent and valid)
- Check saved progress (fallback)
- Use start argument (default)
- Return position, source, and whether to end existing session

**5. cleanupOtherActiveSessions()**
- End sessions for different items
- End stale session for current item if flagged

**6. createAndSyncSession()**
- Create new session in database
- Handle existing server session ID or sync new session

---

## Implementation

### Main Orchestrator (~40 lines)

```typescript
async startSession(username, libraryItemId, mediaId, startTime, ...) {
  let releaseLock = null;

  try {
    // 1. Acquire mutex lock
    releaseLock = await this.acquireStartSessionLock(libraryItemId, username);

    // 2. Validate request
    const { user, libraryItem } = await this.validateStartSessionRequest(username, libraryItemId);

    // 3. Clean up duplicates
    const { bestSession } = await this.cleanupDuplicateSessions(user.id, libraryItemId);

    // 4. Determine resume position
    const resumePosition = await this.determineResumePosition(user.id, libraryItemId, startTime, bestSession);

    // 5. End other sessions
    await this.cleanupOtherActiveSessions(user.id, libraryItemId, resumePosition.shouldEndExistingSession);

    // 6. Create and sync new session
    await this.createAndSyncSession(user.id, libraryItemId, mediaId, resumePosition.position, ...);

  } catch (error) {
    log.error("Failed to start session:", error);
    throw error;
  } finally {
    if (releaseLock) releaseLock();
  }
}
```

### Key Helper Example (~30 lines)

```typescript
private async determineResumePosition(userId, libraryItemId, startTime, existingSession) {
  const savedProgress = await getMediaProgressForLibraryItem(libraryItemId, userId);

  if (!existingSession) {
    return {
      position: savedProgress?.currentTime || startTime,
      source: savedProgress?.currentTime ? "savedProgress" : "startArgument",
      shouldEndExistingSession: false,
    };
  }

  // Check if stale (>10 min)
  const isStale = (Date.now() - existingSession.updatedAt.getTime()) > 10 * 60 * 1000;
  if (isStale) {
    return { position: savedProgress?.currentTime || startTime, shouldEndExistingSession: true };
  }

  // Use session position or fallback to saved progress
  if (existingSession.currentTime > 1) {
    return { position: existingSession.currentTime, source: "activeSession", shouldEndExistingSession: false };
  } else if (savedProgress?.currentTime) {
    return { position: savedProgress.currentTime, source: "savedProgress", shouldEndExistingSession: false };
  }

  return { position: existingSession.currentTime, source: "activeSession", shouldEndExistingSession: false };
}
```

---

## Testing Strategy

### Unit Tests
- Test mutex locking with concurrent calls
- Test validation with missing user/item
- Test duplicate cleanup logic
- Test resume position selection (all sources)
- Target: 90%+ coverage

### Integration Tests
- Test complete session start flow
- Test race conditions with concurrent starts
- Test stale session handling
- Test resume from various sources

---

## Migration Checklist

**Day 1:**
- [ ] Extract mutex management and validation helpers
- [ ] Write unit tests

**Day 2:**
- [ ] Extract duplicate cleanup and resume position helpers
- [ ] Write unit tests

**Day 3:**
- [ ] Extract other session cleanup and creation helpers
- [ ] Implement new main orchestrator
- [ ] Write integration tests

**Day 4:**
- [ ] Full testing (unit + integration + manual)
- [ ] Code review and deployment

---

## Success Metrics

- [ ] Average function length: <25 lines
- [ ] Test coverage: 90%+ for helpers
- [ ] All existing tests pass
- [ ] Mutex prevents race conditions
- [ ] Resume position correct in all scenarios

---

## Risks

**Risk:** Mutex logic breaks
**Mitigation:** Extensive testing of concurrent calls, preserve exact behavior, integration tests for race conditions

**Risk:** Resume position incorrect
**Mitigation:** Test all resume scenarios, verify against current behavior, detailed logging

**Rollback:** `git revert <commit>` or keep helpers and revert main function only

---

## References

- Current: `src/services/ProgressService.ts:189-415`
- Dependencies: Session DB helpers, Progress DB helpers
