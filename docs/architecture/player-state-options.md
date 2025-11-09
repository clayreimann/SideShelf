# Player State Architecture Options

This document outlines three architectural approaches for managing player state across the application, addressing the complexity of state synchronization between `PlayerService`, `ProgressService`, `PlayerBackgroundService`, and `playerSlice`.

## Current Problems

1. **State Duplication**: `currentTrack` exists in 3 places:
   - `PlayerService.currentTrack` (in-memory singleton)
   - `playerSlice.currentTrack` (Zustand + AsyncStorage)
   - `ProgressService.currentSession` (DB-backed, contains libraryItemId)

2. **Coordination Complexity**: `PlayerBackgroundService` must query all three sources to coordinate state

3. **Reconciliation Overhead**: Complex logic to sync TrackPlayer ↔ PlayerService ↔ playerSlice ↔ ProgressService

4. **Multiple Restoration Paths**: Each component restores independently, causing race conditions

---

## Option 1: Single Source of Truth (playerSlice as Primary)

### Principle

Make `playerSlice` the single source of truth for all player state. Services become functional utilities that operate on data passed as parameters or read from the store.

### Changes

#### PlayerService → Pure Functions

- **Remove**: `currentTrack`, `currentUsername`, `currentPlaySessionId`, `lastPauseTime` instance state
- **Keep**: `initialized`, `initializationTimestamp` (operational state only)
- **Methods**:
  - `playTrack(track: PlayerTrack, username: string, ...)` - takes all parameters
  - `getCurrentTrack()` → reads from `playerSlice`
  - `getCurrentLibraryItemId()` → reads from `playerSlice`
  - All other methods read from `playerSlice` when needed

#### ProgressService → Pure Functions

- **Remove**: `currentSession`, `currentUsername` in-memory state
- **Keep**: Sync interval timers (operational state)
- **Methods**:
  - `startSession(sessionData)` - takes all parameters
  - `updateProgress(sessionId, progress)` - takes session ID
  - `getCurrentSession()` → queries DB (no instance cache)
  - Always fetch session from DB when needed

#### PlayerBackgroundService → Pure Event Handlers

- Read state from `playerSlice` when needed
- Update `playerSlice` directly (single mutation point)
- All coordination logic simplified - no need to query multiple sources

#### playerSlice → Single Source of Truth

- Holds: `currentTrack`, `position`, `isPlaying`, `playbackRate`, `volume`, `currentPlaySessionId`, `lastPauseTime`
- Persists to AsyncStorage (for fast initial render)
- All services read from and write to this slice

### Benefits

- ✅ Single source of truth eliminates reconciliation
- ✅ Easier to reason about state flow
- ✅ Better testability (pure functions)
- ✅ Easier debugging (one state location)
- ✅ Minimal state duplication

### Trade-offs

- ⚠️ More calls to `useAppStore.getState()` (but already happening)
- ⚠️ DB queries may increase (can cache query results if needed)
- ⚠️ Tight coupling to Zustand store (but acceptable since it's already the UI state store)

### Use Case

Best when you want the simplest possible architecture with minimal state synchronization. All player state lives in one place, making it easy to debug and reason about.

---

## Option 2: Domain-Driven Separation (DB as Single Source)

### Principle

Database is the single source of truth. Services synchronize from DB to their operational needs. UI state is derived reactively from DB queries.

### Changes

#### playerSlice → UI-Only Reactive State

- Derives from DB session queries
- No persistence logic (DB is persistent)
- Reactive subscriptions to DB changes (if using reactive DB queries)
- Holds minimal UI state: `isPlaying`, `position` (derived), `playbackRate`, `volume`

#### PlayerService → Thin Wrapper

- No track state (reads from DB when needed)
- Methods take all required parameters
- `playTrack()` queries DB for track metadata before playing

#### ProgressService → Pure DB Operations

- All methods take session IDs and data
- No in-memory session cache
- Always queries DB for current state

#### New Component: PlayerStateManager (Optional)

- Orchestrates DB → TrackPlayer → UI flow
- Single coordination point
- Handles state synchronization logic

### Benefits

- ✅ DB is always authoritative - no sync issues
- ✅ No state synchronization problems
- ✅ Clean separation of concerns
- ✅ Database transactions ensure consistency

### Trade-offs

- ⚠️ More DB queries (may need caching layer)
- ⚠️ May need reactive DB subscriptions (e.g., SQLite reactive queries)
- ⚠️ More complex initialization (must wait for DB queries)
- ⚠️ UI updates may be slower (waiting for DB queries)
- ⚠️ Less intuitive for developers (state not visible in store)

### Use Case

Best when you prioritize data consistency and want the database to be the single source of truth. Useful when you have complex multi-user scenarios or need strong consistency guarantees.

---

## Option 3: Hybrid Approach (Selected)

### Principle

Balance between Options 1 and 2. `playerSlice` holds UI state for fast reactivity, DB holds persistent state, services are functional utilities.

### Changes

#### PlayerService → Functional Utility

- **Remove**: `currentTrack`, `currentUsername`, `currentPlaySessionId`, `lastPauseTime`
- **Keep**: `initialized`, `initializationTimestamp` (operational state only)
- **Methods**:
  - `playTrack(track: PlayerTrack, ...)` - receives track from caller (usually `playerSlice`)
  - `getCurrentTrack()` → reads from `playerSlice`
  - `getCurrentLibraryItemId()` → reads from `playerSlice`
  - Smart rewind uses DB to get last pause time when needed

#### ProgressService → Functional with DB Queries

- **Remove**: `currentSession`, `currentUsername` in-memory state
- **Keep**: Sync interval timers (operational state)
- **Methods**:
  - `startSession(libraryItemId, userId, ...)` - takes all parameters
  - `updateProgress(libraryItemId, userId, currentTime, ...)` - queries DB for session
  - `getCurrentSession(libraryItemId, userId)` → queries DB (no caching initially)
  - All methods query DB when needed

#### playerSlice → Single Source for UI State

- **Keep**: All existing state (`currentTrack`, `position`, `isPlaying`, etc.)
- **Add**: `currentPlaySessionId` (for streaming sessions)
- **Add**: `lastPauseTime` (for smart rewind)
- Becomes the authoritative source for current track
- Services read from slice, update slice
- Persistence remains in AsyncStorage for fast initial render

#### PlayerBackgroundService → Pure Event Handlers

- Read current state from `playerSlice` instead of `PlayerService`/`ProgressService`
- Update `playerSlice` directly
- Pass `libraryItemId` from `playerSlice` to `ProgressService` methods
- Remove queries to `playerService.getCurrentTrack()` in favor of store

### Benefits

- ✅ Clear separation: UI state in slice, persistent state in DB
- ✅ Services become testable pure functions
- ✅ Minimal state duplication
- ✅ Fast UI updates (playerSlice reactivity)
- ✅ DB remains authoritative for persistence
- ✅ Easier to test and maintain than current architecture

### Trade-offs

- ⚠️ Some state duplication (UI state vs DB state)
- ⚠️ Need to sync UI state with DB periodically
- ⚠️ Initial implementation requires careful coordination

### Use Case

Best when you want fast UI reactivity while maintaining DB as the persistent source of truth. Balances simplicity with performance and consistency.

---

## Comparison Matrix

| Aspect               | Option 1 (playerSlice) | Option 2 (DB)       | Option 3 (Hybrid)    |
| -------------------- | ---------------------- | ------------------- | -------------------- |
| **State Location**   | playerSlice only       | DB only             | playerSlice + DB     |
| **UI Performance**   | Fast (in-memory)       | Slower (DB queries) | Fast (in-memory)     |
| **Data Consistency** | Good                   | Excellent           | Good (sync required) |
| **Complexity**       | Low                    | Medium              | Medium               |
| **Testability**      | Excellent              | Good                | Excellent            |
| **Debugging**        | Easy (one place)       | Medium (DB queries) | Easy (slice + DB)    |
| **Initialization**   | Fast                   | Slower              | Fast                 |
| **DB Queries**       | Moderate               | High                | Moderate             |

## Selected: Option 3 (Hybrid)

We chose Option 3 because it:

1. Maintains fast UI updates (playerSlice reactivity)
2. Keeps DB as authoritative for persistence
3. Makes services testable pure functions
4. Reduces complexity without major architectural overhaul
5. Provides good balance between performance and consistency

## Migration Notes

When migrating from the current architecture to Option 3:

1. Move `currentTrack` read/write to `playerSlice` only
2. Remove `PlayerService.currentTrack` and related state
3. Make `ProgressService` methods take `libraryItemId` instead of using `currentSession`
4. Update `PlayerBackgroundService` to read from `playerSlice`
5. Simplify reconciliation logic (only needed for TrackPlayer ↔ playerSlice)
6. Add `currentPlaySessionId` and `lastPauseTime` to `playerSlice`

If Option 3 doesn't work out, consider migrating to Option 1 for simplicity or Option 2 for stronger consistency guarantees.
