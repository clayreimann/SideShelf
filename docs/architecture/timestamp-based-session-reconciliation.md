# Timestamp-Based Session Reconciliation

**Status**: Approved
**Author**: Claude Code
**Date**: 2025-11-11
**Related Issue**: Session reset to 0:00 bug + Multi-device position sync

## Problem Statement

The app currently has issues with multi-device playback synchronization:

1. **Position resets to 0:00**: SmartRewind race condition causes playback to reset when returning from background
2. **No multi-device awareness**: When listening on Device A then switching to Device B, positions don't reconcile properly
3. **Stale position data**: AsyncStorage and local DB can have outdated positions when server has newer data
4. **No conflict detection**: App doesn't detect or notify users when position jumps occur
5. **Session lifecycle unclear**: Local sessions persist even when server has newer sessions from other devices

## Architecture Overview

### Current State

**Three Sources of Position Data**:

1. **AsyncStorage**: Persisted position from last session (can be stale)
2. **Local Session DB** (`localListeningSessions`): Active session tracking per device
3. **Server Progress** (`mediaProgress`): Server's view of current position (updated when synced)

**Current Reconciliation** (in `PlayerService.determineResumePosition()`):

- Priority: AsyncStorage > Local Session > Server Progress > Store
- Simple timestamp comparison (newer wins) only when positions differ by >30s
- No device awareness, no conflict notifications

### Proposed Architecture

**Timestamp-Based Reconciliation Flow**:

```
App Foreground
    ↓
Fetch Server Progress (/api/me/progress/:id)
    ↓
Fetch Server Sessions (/api/me/listening-sessions) [cached, debounced]
    ↓
Cache Server Sessions Locally (serverListeningSessions table)
    ↓
Get Local Active Session
    ↓
Compare Timestamps:
  - server.lastUpdate vs local.updatedAt
  - >30s difference → position jump detected
    ↓
Reconciliation Decision:
  - use_server: Server is newer → update player, show toast
  - use_local: Local is newer → sync to server
  - no_change: Timestamps within 30s → no action
    ↓
Execute Action:
  - use_server: End local session, seek to server position, show undo toast
  - use_local: Trigger server sync
  - no_change: Continue playback
```

**Session Caching Strategy**:

- Server sessions fetched via pagination from `/api/me/listening-sessions`
- Cached in local DB (`serverListeningSessions` table)
- Debounced: Only refetch if last fetch was >5 minutes ago
- Reduces API calls while keeping data fresh

**Position Jump Notification**:

- Toast appears when position jumps >30s
- Shows: "Position synced: 14:37 → 15:42 (jumped forward 1:05)"
- "Undo" button available for 10 seconds
- Undo restores previous position (optionally restarts ended session)

## Data Models

### SessionReconciliationResult

```typescript
interface SessionReconciliationResult {
  action: "use_server" | "use_local" | "no_change";
  previousPosition: number; // Position before reconciliation
  newPosition: number; // Position after reconciliation
  reason: "newer_server_progress" | "newer_local_session" | "no_conflict";
  shouldShowUndo: boolean; // Whether to show undo toast
  sessionEndedLocally?: string; // Local session ID if ended
  serverSessionInfo?: {
    updatedAt: Date;
    sessionId: string;
  };
}
```

### PositionJumpInfo

```typescript
interface PositionJumpInfo {
  from: number; // Previous position (seconds)
  to: number; // New position (seconds)
  delta: number; // Absolute difference (seconds)
  direction: "forward" | "backward";
  serverTimestamp: Date;
  localTimestamp: Date;
}
```

### SessionHistoryItem

```typescript
interface SessionHistoryItem {
  id: string;
  sessionStart: Date;
  sessionEnd: Date | null;
  startTime: number; // Starting position (seconds)
  currentTime: number; // Current/final position (seconds)
  timeListening: number; // Duration listened (seconds)
  updatedAt: Date;
  deviceInfo?: string; // Device name from mediaPlayer field
  source: "local" | "server";
  isSynced?: boolean; // Only for local sessions
}
```

## Database Schema

### New Table: `serverListeningSessions`

Caches server sessions to reduce API calls.

```sql
CREATE TABLE serverListeningSessions (
  id TEXT PRIMARY KEY,              -- Server session ID
  userId TEXT NOT NULL,
  libraryItemId TEXT NOT NULL,
  libraryId TEXT,
  episodeId TEXT,
  mediaType TEXT,
  displayTitle TEXT,
  displayAuthor TEXT,
  coverPath TEXT,
  duration REAL,
  playMethod INTEGER,
  mediaPlayer TEXT,                 -- Device info
  startTime REAL,
  currentTime REAL,
  startedAt TIMESTAMP,
  updatedAt TIMESTAMP,
  timeListening REAL,
  dayOfWeek TEXT,
  date TEXT,
  fetchedAt TIMESTAMP NOT NULL,     -- When we fetched from server
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX idx_server_sessions_item ON serverListeningSessions(libraryItemId, updatedAt);
CREATE INDEX idx_server_sessions_user ON serverListeningSessions(userId);
```

**Fields**:

- `id`: Server's session ID (unique identifier)
- `fetchedAt`: Timestamp when we cached this session
- Other fields mirror server response structure

**Indexes**:

- `(libraryItemId, updatedAt)`: Fast lookup for session history
- `userId`: Fast user-level queries

## API Endpoints

### GET `/api/me/listening-sessions`

**Fetches all listening sessions for the current user**

**Query Parameters**:

- `itemsPerPage`: Number of sessions per page (default: 10)
- `page`: Page number (default: 0)

**Response**:

```typescript
{
  sessions: ApiListeningSession[],
  total: number,
  page: number,
  itemsPerPage: number
}
```

**ApiListeningSession Structure**:

```typescript
{
  id: string,
  userId: string,
  libraryId: string,
  libraryItemId: string,
  episodeId?: string,
  mediaType: string,
  displayTitle: string,
  displayAuthor: string,
  coverPath: string,
  duration: number,
  playMethod: number,
  mediaPlayer: string,
  startTime: number,
  currentTime: number,
  startedAt: number,        // Unix timestamp
  updatedAt: number,        // Unix timestamp
  timeListening: number,
  dayOfWeek: string,
  date: string
}
```

**Error Handling**:

- 404: Endpoint not available (server doesn't support sessions) → graceful fallback
- 401: Authentication error → re-authenticate
- 500: Server error → log and continue with local data

## Implementation Phases

### Phase 1: API Integration & Types

**Files**:

- `src/types/session.ts` - New types
- `src/lib/api/endpoints.ts` - Add `fetchListeningSessions()`
- `src/db/schema/localData.ts` - Add `serverListeningSessions` table
- `src/db/helpers/serverListeningSessions.ts` - CRUD helpers
- `src/db/migrations/XXX_add_server_sessions_cache.ts` - Migration

**Deliverables**:

- Session types defined
- API endpoint implemented
- Database schema created
- Helper functions for session CRUD

### Phase 2: Core Reconciliation Logic

**Files**:

- `src/services/ProgressService.ts` - Add reconciliation methods
- `src/services/PlayerService.ts` - Update `determineResumePosition()`

**Key Methods**:

- `ProgressService.fetchAndCacheServerSessions()` - Fetch with pagination, cache, debounce
- `ProgressService.reconcileWithServerProgress()` - Compare timestamps, decide action
- `ProgressService.detectPositionJump()` - Calculate jump info
- `PlayerService.determineResumePosition()` - Use reconciliation result

**Deliverables**:

- Session fetching with caching
- Timestamp-based reconciliation
- Position jump detection
- Updated resume position logic

### Phase 3: Foreground Reconciliation Flow

**Files**:

- `src/app/_layout.tsx` - Update foreground handler

**Changes**:

- Replace `fetchServerProgress() + syncPositionFromDatabase()` with `reconcileWithServerProgress()`
- Handle reconciliation result (`use_server`, `use_local`, `no_change`)
- End stale sessions when needed
- Trigger position updates

**Deliverables**:

- Automatic reconciliation on app foreground
- Session lifecycle management
- Server sync when local is newer

### Phase 4: Position Jump Notification UI

**Files**:

- `src/components/ui/PositionJumpToast.tsx` - New component
- `src/stores/slices/playerSlice.ts` - Add undo state

**Features**:

- Toast notification for position jumps >30s
- Shows: from/to positions, delta, direction (forward/backward)
- "Undo" button (available for 10 seconds)
- Auto-dismiss after 10 seconds
- Platform-specific (ToastAndroid vs custom iOS toast)

**Deliverables**:

- Toast component
- Undo state management
- Undo functionality

### Phase 5: Session History Foundation

**Files**:

- `src/db/helpers/serverListeningSessions.ts` - Query methods
- `src/services/ProgressService.ts` - Add `getSessionHistory()`

**Features**:

- Query local sessions
- Query cached server sessions (filtered by libraryItemId)
- Merge and deduplicate (prefer local if serverSessionId matches)
- Sort by updatedAt DESC
- Return unified session history

**Deliverables**:

- Session history data layer
- Foundation for future UI

**Note**: UI implementation deferred to separate PR

### Phase 6: Database Migration

**Files**:

- `src/db/migrations/XXX_add_server_sessions_cache.ts`

**Migration Steps**:

1. Create `serverListeningSessions` table
2. Add indexes for performance
3. Handle migration errors gracefully

**Rollback**: Migration is optional - app works without it (sessions not cached)

### Phase 7: Testing

**Files**:

- `src/services/__tests__/ProgressService.reconciliation.test.ts`
- `src/__tests__/multiDeviceReconciliation.integration.test.ts`

**Unit Test Scenarios**:

- Server newer (>30s) → action='use_server'
- Local newer → action='use_local'
- Within threshold (30s) → action='no_change'
- No local session → action='use_server'
- No server progress → use local
- Forward jump detection
- Backward jump detection
- Undo functionality
- Session caching and debouncing
- Pagination handling

**Integration Test Scenarios**:

- Device A at 1000s, Device B syncs 1500s → A jumps forward
- Device A at 1500s, Device B syncs 1000s → A jumps backward
- Undo restores previous position
- Local session ended when server newer
- Session fetch caching (no re-fetch within 5 min)
- Server session pagination

**Manual Testing**:

- Test with two physical devices
- Verify toast appears on jumps >30s
- Verify undo works
- Verify sessions properly ended
- Verify forward/backward jumps work
- Verify no jump within 30s threshold
- Verify session caching reduces API calls

## Reconciliation Algorithm

### Decision Logic

```typescript
async reconcileWithServerProgress(userId, libraryItemId): SessionReconciliationResult {
  // 1. Fetch current state
  const serverProgress = await fetchMediaProgress(libraryItemId);
  const localSession = await getActiveSession(userId, libraryItemId);

  // 2. Handle missing data
  if (!localSession) {
    return {
      action: 'use_server',
      previousPosition: 0,
      newPosition: serverProgress.currentTime,
      reason: 'newer_server_progress',
      shouldShowUndo: false
    };
  }

  if (!serverProgress) {
    return {
      action: 'use_local',
      previousPosition: localSession.currentTime,
      newPosition: localSession.currentTime,
      reason: 'newer_local_session',
      shouldShowUndo: false
    };
  }

  // 3. Compare timestamps
  const serverTimestamp = new Date(serverProgress.lastUpdate);
  const localTimestamp = localSession.updatedAt;
  const timeDiff = Math.abs(serverTimestamp.getTime() - localTimestamp.getTime());
  const positionDiff = Math.abs(serverProgress.currentTime - localSession.currentTime);

  // 4. Within threshold - no action needed
  if (timeDiff < 30000 || positionDiff < 30) {
    return {
      action: 'no_change',
      previousPosition: localSession.currentTime,
      newPosition: localSession.currentTime,
      reason: 'no_conflict',
      shouldShowUndo: false
    };
  }

  // 5. Server is newer - use server position
  if (serverTimestamp > localTimestamp) {
    // End local session (it's stale)
    await endListeningSession(localSession.id, localSession.currentTime);

    return {
      action: 'use_server',
      previousPosition: localSession.currentTime,
      newPosition: serverProgress.currentTime,
      reason: 'newer_server_progress',
      shouldShowUndo: true,  // Position jump - allow undo
      sessionEndedLocally: localSession.id,
      serverSessionInfo: {
        updatedAt: serverTimestamp,
        sessionId: serverProgress.id
      }
    };
  }

  // 6. Local is newer - sync to server
  return {
    action: 'use_local',
    previousPosition: localSession.currentTime,
    newPosition: localSession.currentTime,
    reason: 'newer_local_session',
    shouldShowUndo: false
  };
}
```

### Session Caching Logic

```typescript
async fetchAndCacheServerSessions(userId, forceRefresh = false): Promise<void> {
  // 1. Check last fetch time (debounce)
  const lastFetch = await getLastSessionFetchTime(userId);
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

  if (lastFetch && lastFetch.getTime() > fiveMinutesAgo && !forceRefresh) {
    log.info('Skipping session fetch - last fetched within 5 minutes');
    return;
  }

  // 2. Fetch all pages
  let page = 0;
  let hasMore = true;
  const allSessions = [];

  while (hasMore) {
    const response = await fetchListeningSessions(page);
    allSessions.push(...response.sessions);

    hasMore = (page + 1) * response.itemsPerPage < response.total;
    page++;
  }

  // 3. Persist to DB
  await upsertServerSessions(allSessions);

  // 4. Update last fetch time
  await setLastSessionFetchTime(userId, new Date());

  log.info(`Fetched and cached ${allSessions.length} server sessions`);
}
```

## Edge Cases & Error Handling

### Missing Server Session Endpoint

**Scenario**: Server doesn't support `/api/me/listening-sessions` (404)

**Handling**:

- Catch 404 error
- Log warning
- Fall back to mediaProgress-only reconciliation
- Continue normal operation

### Network Failures

**Scenario**: Network error during session fetch

**Handling**:

- Catch network error
- Use cached server sessions (may be stale)
- Use local session data
- Continue playback
- Retry on next foreground

### Timestamp Conflicts

**Scenario**: Exact timestamp match between local and server

**Handling**:

- action='no_change'
- Use current position
- No notification

### Simultaneous Updates

**Scenario**: Device A and Device B update position at same exact time

**Handling**:

- Last-write-wins on server (server's responsibility)
- Next device to foreground gets reconciled to server's final state
- No client-side conflict resolution needed

### Undo After Session End

**Scenario**: User undoes position jump after local session was ended

**Handling**:

- Seek to previous position
- Optionally create new session at previous position
- Or just update current position without new session

### Large Position Jumps

**Scenario**: Position jump >1 hour (e.g., podcast vs audiobook confusion)

**Handling**:

- Still use timestamp-based reconciliation
- Show undo option
- User can undo if mistake

### Rapid Foreground/Background Cycles

**Scenario**: User rapidly switches apps

**Handling**:

- Debouncing prevents excessive API calls (5 min cache)
- Reconciliation still happens each foreground
- May use cached data if recent

## Performance Considerations

### API Call Optimization

- **Session Fetch Debouncing**: Max once per 5 minutes
- **Pagination**: Fetch 10 sessions per page, loop until done
- **Caching**: Store in local DB, query locally
- **Conditional Fetch**: Skip if last fetch recent

### Database Query Optimization

- **Indexes**: `(libraryItemId, updatedAt)` for session queries
- **Limit Clauses**: Default limit 20 for session history
- **Prepared Statements**: Use drizzle ORM (already optimized)

### Memory Management

- **Batch Insert**: Use `upsertServerSessions()` for bulk inserts
- **Cleanup**: Delete server sessions older than 90 days
- **Lazy Loading**: Fetch sessions only when needed

### UI Performance

- **Toast Debouncing**: Only show one toast at a time
- **Auto-Dismiss**: Toast auto-dismisses after 10s
- **Non-Blocking**: Toast doesn't block playback

## Migration Strategy

### Database Migration

**Migration File**: `XXX_add_server_sessions_cache.ts`

```typescript
export async function up(db: BetterSQLite3Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS serverListeningSessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      libraryItemId TEXT NOT NULL,
      libraryId TEXT,
      episodeId TEXT,
      mediaType TEXT,
      displayTitle TEXT,
      displayAuthor TEXT,
      coverPath TEXT,
      duration REAL,
      playMethod INTEGER,
      mediaPlayer TEXT,
      startTime REAL,
      currentTime REAL,
      startedAt TIMESTAMP,
      updatedAt TIMESTAMP,
      timeListening REAL,
      dayOfWeek TEXT,
      date TEXT,
      fetchedAt TIMESTAMP NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_server_sessions_item
    ON serverListeningSessions(libraryItemId, updatedAt)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_server_sessions_user
    ON serverListeningSessions(userId)
  `);
}

export async function down(db: BetterSQLite3Database) {
  db.run(`DROP TABLE IF EXISTS serverListeningSessions`);
}
```

**Rollout**:

- Migration runs automatically on app start
- Non-destructive (only adds table)
- App works without migration (sessions not cached)

### Backward Compatibility

- Works with or without server session endpoint
- Works with existing local sessions
- No changes to existing sync flow
- Only adds new reconciliation layer on top

### Feature Flags

Optional settings for gradual rollout:

- `enableSessionReconciliation`: Enable/disable reconciliation (default: true)
- `enablePositionJumpNotifications`: Enable/disable toast (default: true)
- `sessionCacheDuration`: How long to cache sessions (default: 5 min)

## Success Metrics

### Correctness

- ✅ No more position resets to 0:00
- ✅ Multi-device position jumps handled correctly
- ✅ Stale sessions properly ended
- ✅ Timestamps compared correctly

### User Experience

- ✅ Toast notifications appear for jumps >30s
- ✅ Undo functionality works as expected
- ✅ Smooth playback across device switches
- ✅ No unnecessary position jumps (<30s threshold)

### Performance

- ✅ API calls reduced via caching (max once per 5 min)
- ✅ Database queries optimized with indexes
- ✅ No UI blocking during reconciliation
- ✅ Toast auto-dismisses (doesn't accumulate)

### Testing

- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Manual testing on two devices successful
- ✅ No regressions in existing functionality

## Future Enhancements

### Phase 2 (Deferred)

1. **Session History UI**
   - Display session list on item details page
   - Show device, time range, duration
   - Filter by date range
   - Export session data

2. **Advanced Conflict Resolution**
   - Merge sessions intelligently (combine listening time)
   - Detect and warn about concurrent playback
   - Option to "resume from this device" vs "sync to other device"

3. **Device Management**
   - List all devices with active sessions
   - Remote session control (pause other devices)
   - Device naming and identification

4. **Analytics**
   - Track position jump frequency
   - Monitor multi-device usage patterns
   - Sync latency metrics

5. **Offline Support**
   - Queue reconciliation for when network returns
   - Conflict resolution when both devices offline then reconnect

## References

- Original issue: Session reset to 0:00 bug
- SmartRewind race condition fix: `applySmartRewind(currentPosition)`
- Existing reconciliation: `PlayerService.determineResumePosition()`
- Server session endpoint: `GET /api/me/listening-sessions`
- Related: Force resync button (to be replaced by automatic reconciliation)

## Glossary

- **Reconciliation**: Process of comparing and merging position data from multiple sources
- **Session**: A continuous listening period tracked locally or on server
- **Position Jump**: Significant difference (>30s) between positions from different sources
- **Timestamp**: Wall-clock time when data was last updated (not media playback time)
- **Stale Session**: Session not updated in >15 minutes (or overridden by newer server data)
- **Source of Truth**: Most authoritative data source (server progress for multi-device, local session for single device)
