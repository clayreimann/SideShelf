# Phase 12: Service Decomposition - Research

**Researched:** 2026-03-04
**Domain:** TypeScript service decomposition — facade pattern, collaborator extraction, testability
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Decomposition goal**

- The purpose is **testability and complexity reduction**, not file size reduction
- A service should be split if and only if its behaviors cannot be tested in isolation without mocking unrelated dependencies
- Mixed responsibilities within single methods (DB + network + state in one method) is the secondary signal

**Scope — what gets audited**

- **Primary candidates:** PlayerService, DownloadService, PlayerBackgroundService, ProgressService
- **Secondary:** All other files in `src/services/` — researcher validates these are already small and testable
- Researcher reads all service files and applies the testability acid test
- Number of plans is research-driven — one plan per service that warrants decomposition

**Services that pass the audit**

- If a service passes the testability audit (no split needed), the plan must **explicitly document "no split needed" with reasoning** — not just skip it silently

**Collaborator instantiation**

- Facade creates collaborators in its constructor (`new XCollaborator(facadeRef)`)
- Collaborators hold a reference to a **public facade API** — not the entire facade, but broader than just a few callbacks
- Explicit TypeScript interfaces per collaborator (e.g., `ITrackLoadingCollaborator`) — enables mocking in facade tests

**Shared state ownership**

- **All state lives in the facade** — collaborators do not own or retain mutable state
- Collaborators access facade state via **method parameters** — facade passes everything needed at call time
- Collaborators signal state changes via **return values** — facade applies the mutation after the call

**DownloadService: what stays in the facade**

- **Lifecycle + Progress Tracking stay in the facade** — they share the `activeDownloads` Map too tightly
- Only Status Queries and Repair/Reconciliation are extracted to collaborators
- Whether those are one or two collaborator files: Claude's Discretion

**PlayerService: collaborator grouping**

- Roadmap defines 5 concern groups: track loading, playback control, progress restore, path repair, background reconnect
- Claude decides whether those map 1:1 to files or some are combined

**Execution order**

- 12-01: PlayerService first — sets the collaborator pattern
- 12-02: DownloadService follows — applies same pattern
- Additional plans added if researcher finds other services need splitting

### Claude's Discretion

- File and directory structure for collaborators
- Exact collaborator groupings within each service (merge or keep 1:1 from roadmap groups)
- Which specific methods stay in the facade vs get extracted
- How to handle overlap between existing facade tests and new collaborator tests
- How collaborators are mocked in facade tests (jest.mock vs constructor injection vs real collaborators)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID        | Description                                                                                                                                            | Research Support                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| DECOMP-01 | PlayerService concern groups extracted to private collaborators behind public facade (coordinator dispatch contract and singleton interface preserved) | Audit reveals 4 distinct concern groups that fail testability acid test; facade pattern with TypeScript interfaces enables collaborator mocking |
| DECOMP-02 | DownloadService concern groups extracted to private collaborators behind public facade (status queries, lifecycle, repair separated)                   | Status queries and repair are independently testable; lifecycle + progress share `activeDownloads` Map tightly and stay in facade               |

</phase_requirements>

---

## Summary

Phase 12 decomposes `PlayerService` and `DownloadService` into facade + collaborator structures. After reading every service file and applying the testability acid test ("Can I test this one behavior in isolation with minimal mocking?"), the audit finds that **PlayerService and DownloadService fail the test** due to methods that mix DB queries, TrackPlayer calls, network requests, and Zustand store mutations in a single execution path. The other four services pass the audit without needing a split.

The pattern is straightforward: the facade retains all public interface methods and all mutable state. Collaborators receive state as parameters, perform a focused operation, and return results. This makes each collaborator independently testable with only 1–2 mocks, compared to the current 10+ mocks needed for a PlayerService test. The existing `PlayerService.test.ts` (35 tests, 36% statement coverage) must be preserved and extended to reach the 90% coverage target.

**Primary recommendation:** Extract collaborators using TypeScript constructor injection interfaces; keep all state in the facade singleton; use a `services/player/` subdirectory for PlayerService collaborators and `services/download/` for DownloadService collaborators.

---

## Audit Results

### Services That Fail the Testability Acid Test (Need Splitting)

#### PlayerService.ts (~1,100 lines)

**Testability verdict: FAIL — split required**

Reason: `executeLoadTrack` (189 lines) mixes DB lookups, file system path repair, network streaming session creation, TrackPlayer queue building, and coordinator event dispatch in one sequential chain. Testing a single concern (e.g., "does it seek to the saved position?") requires mocking 10+ unrelated dependencies. The current test file confirms this: 35 tests require 13 `jest.mock()` call sites and only achieve 36% statement coverage.

Distinct concern groups found:

| Group                                 | Methods                                                                                                                          | Testability Problem                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Track Loading**                     | `executeLoadTrack`, `buildTrackList`, `reloadTrackPlayerQueue`                                                                   | DB + network + TrackPlayer + store all entangled                                                                               |
| **Playback Control**                  | `executePlay`, `executePause`, `executeStop`, `executeSeek`, `executeSetRate`, `executeSetVolume`, `rebuildCurrentTrackIfNeeded` | `executePlay` calls `rebuildCurrentTrackIfNeeded` which calls `restorePlayerServiceFromSession` — 3 levels of DB + TrackPlayer |
| **Progress Restore**                  | `restorePlayerServiceFromSession`, `syncPositionFromDatabase`                                                                    | DB + ProgressService + TrackPlayer — cannot test DB fallback logic without mocking player                                      |
| **Path Repair / Container Migration** | `refreshFilePathsAfterContainerChange`                                                                                           | Testable in isolation (store read + cover URI + metadata update) but tightly coupled to track loading today                    |
| **Background Reconnect**              | `reconnectBackgroundService`                                                                                                     | Dynamic `require()` + module cache manipulation — completely untestable without extraction                                     |

**Recommendation:** Merge path repair into the track loading collaborator (they share `ensureItemInDocuments` + `repairDownloadStatus` and always run together). This yields **4 collaborator files** rather than 5:

1. `TrackLoadingCollaborator` — `executeLoadTrack`, `buildTrackList`, `reloadTrackPlayerQueue`, path repair prep
2. `PlaybackControlCollaborator` — `executePlay`, `executePause`, `executeStop`, `executeSeek`, `executeSetRate`, `executeSetVolume`
3. `ProgressRestoreCollaborator` — `restorePlayerServiceFromSession`, `syncPositionFromDatabase`, `rebuildCurrentTrackIfNeeded`
4. `BackgroundReconnectCollaborator` — `reconnectBackgroundService`, `refreshFilePathsAfterContainerChange`

#### DownloadService.ts (~1,170 lines)

**Testability verdict: FAIL — partial split required**

Reason: `isLibraryItemDownloaded` and `getDownloadProgress` each perform DB queries + file system verification but are currently embedded in the class alongside the `activeDownloads` Map that only lifecycle methods need. `repairDownloadStatus` performs DB reads + file system operations + DB writes — a self-contained concern that can be tested with mocks for `verifyFileExists`, `markAudioFileAsDownloaded`, and `clearAudioFileDownloadStatus` only.

What stays in the facade (share `activeDownloads` too tightly):

- `startDownload`, `pauseDownload`, `resumeDownload`, `cancelDownload`
- `subscribeToProgress`, `unsubscribeFromProgress`, `rewireProgressCallbacks`, `getCurrentProgress`
- All private helpers: `downloadAudioFile`, `updateProgress`, `notifyProgressCallbacks`, `triggerProgressUpdate`, `restoreExistingDownloads`, `handleTaskCompletion`, `handleTaskProgress`, `cleanupDownload`, `handleDownloadError`

What extracts to collaborators:

- `DownloadStatusCollaborator` — `isLibraryItemDownloaded`, `getDownloadProgress`, `getDownloadedSize`, `isDownloadActive`, `getDownloadStatus`
- `DownloadRepairCollaborator` — `repairDownloadStatus`, `deleteDownloadedLibraryItem`

**Recommendation:** Two collaborator files (status queries are read-only and can be grouped; repair is write-heavy but also independent):

1. `DownloadStatusCollaborator` — pure queries against DB + file system; no `activeDownloads` access needed
2. `DownloadRepairCollaborator` — DB read + file system check + DB write; no `activeDownloads` access needed

### Services That Pass the Testability Audit (No Split Needed)

#### PlayerBackgroundService.ts (~980 lines) — NO SPLIT NEEDED

**Testability verdict: PASS**

Reason: This file is a module of top-level functions, not a class. Each handler function (`handleRemotePlay`, `handleRemotePause`, `handleRemoteSeek`, etc.) has a single responsibility: translate a TrackPlayer remote event into a coordinator event dispatch plus a ProgressService update call. Each can be tested by mocking `dispatchPlayerEvent` + `progressService` — exactly 2 mocks for any handler. The `handlePlaybackProgressUpdated` function is long but its branches (has session, no session, rehydrate) are independently reachable. The sleep timer check is the only mixed concern but is a guard clause, not a collaborator.

Splitting would fragment the event registration table and create harder-to-follow dispatch chains without improving testability.

**Documentation note for plan:** "No split needed. PlayerBackgroundService is already a module of focused event-handler functions. Each handler dispatches one coordinator event and calls one ProgressService method — testable with 2 mocks. Splitting would obscure the event registration table without testability gain."

#### ProgressService.ts (~850+ lines) — NO SPLIT NEEDED (per REQUIREMENTS.md)

**Testability verdict: DEFERRED by decision**

REQUIREMENTS.md explicitly defers DECOMP-03 (ProgressService decomposition): _"background service contract complexity warrants a standalone phase after DECOMP-01/02 settle."_

Audit observation (informational only, not blocking): `startSession` mixes DB lookups, duplicate session cleanup, position resolution, and coordinator event dispatch in 120+ lines. `syncSessionToServer` mixes NetInfo check + API call + DB update. These would fail the testability acid test. However, per REQUIREMENTS.md, this is out of scope for Phase 12.

**Documentation note for plan:** "No split in Phase 12. ProgressService decomposition is explicitly deferred to DECOMP-03 (post Phase 12) per REQUIREMENTS.md. Audit confirms it would benefit from decomposition, but that work belongs to a dedicated future phase."

#### ApiClientService.ts (~270 lines) — NO SPLIT NEEDED

**Testability verdict: PASS**

Single responsibility: credential storage and token refresh. All methods operate on private fields (`baseUrl`, `accessToken`, `refreshToken`). `performTokenRefresh` uses `fetch` + `saveItem` — 2 mocks. No DB, no TrackPlayer, no coordinator. Clean and testable as-is.

#### BundleService.ts (~220 lines) — NO SPLIT NEEDED

**Testability verdict: PASS**

Single dependency: `expo-updates`. All methods call one `Updates.*` function. Each testable with 1 mock. No splitting warranted.

#### libraryItemBatchService.ts (~100 lines) — NO SPLIT NEEDED

**Testability verdict: PASS**

Two methods (`processItemsWithProgress`, `processBackgroundQueue`), each doing one job: fetch a batch + upsert. Testable with 2 mocks (`fetchLibraryItemsBatch`, `processFullLibraryItems`). Minor code quality issues (raw `console.log` instead of logger) but not a testability problem.

---

## Architecture Patterns

### Facade + Collaborator Pattern (Project-specific)

This is not a generic Gang-of-Four facade. The constraints are:

- **All state lives in the facade.** Collaborators are stateless.
- **Collaborators receive state as parameters.** No `this.facade.someState` access.
- **Collaborators return results.** The facade applies mutations after the call.
- **Collaborators hold a typed interface reference to the facade** — so they can call back for shared operations (e.g., `dispatchPlayerEvent`, `getApiInfo`).

```typescript
// Source: CONTEXT.md locked decisions

// 1. Define the facade API interface the collaborator needs
export interface IPlayerServiceFacade {
  dispatchPlayerEvent: typeof dispatchPlayerEvent;
  getApiInfo(): { baseUrl: string; accessToken: string } | null;
  // ... only what collaborator actually calls
}

// 2. Define the collaborator interface (enables mocking in facade tests)
export interface ITrackLoadingCollaborator {
  executeLoadTrack(libraryItemId: string, episodeId?: string): Promise<void>;
  buildTrackList(track: PlayerTrack): Promise<Track[]>;
}

// 3. Concrete collaborator — stateless, receives all state via params
export class TrackLoadingCollaborator implements ITrackLoadingCollaborator {
  constructor(private facade: IPlayerServiceFacade) {}

  async executeLoadTrack(libraryItemId: string, episodeId?: string): Promise<void> {
    // Only mocks needed: DB helpers + TrackPlayer
    // facade.dispatchPlayerEvent is injected, not imported directly
  }
}

// 4. Facade creates collaborators in constructor
export class PlayerService {
  private trackLoading: ITrackLoadingCollaborator;

  private constructor() {
    this.trackLoading = new TrackLoadingCollaborator(this);
  }

  // Public API delegates to collaborator
  async executeLoadTrack(id: string, epId?: string): Promise<void> {
    return this.trackLoading.executeLoadTrack(id, epId);
  }
}
```

### Recommended Directory Structure

```
src/services/
├── PlayerService.ts                    # Facade (singleton, public API)
├── player/
│   ├── TrackLoadingCollaborator.ts     # executeLoadTrack, buildTrackList, path repair
│   ├── PlaybackControlCollaborator.ts  # executePlay/Pause/Stop/Seek/SetRate/SetVolume
│   ├── ProgressRestoreCollaborator.ts  # restorePlayerServiceFromSession, syncPositionFromDatabase, rebuildCurrentTrackIfNeeded
│   └── BackgroundReconnectCollaborator.ts # reconnectBackgroundService, refreshFilePathsAfterContainerChange
├── DownloadService.ts                  # Facade (singleton, public API)
├── download/
│   ├── DownloadStatusCollaborator.ts   # isLibraryItemDownloaded, getDownloadProgress, getDownloadedSize
│   └── DownloadRepairCollaborator.ts   # repairDownloadStatus, deleteDownloadedLibraryItem
├── PlayerBackgroundService.ts          # No change (passes audit)
├── ProgressService.ts                  # No change (deferred)
├── ApiClientService.ts                 # No change (passes audit)
├── BundleService.ts                    # No change (passes audit)
├── libraryItemBatchService.ts          # No change (passes audit)
└── coordinator/                        # No change
```

### Anti-Patterns to Avoid

- **Collaborator reads facade state directly.** Collaborators must receive state as params. Retained references to the full facade instance enable this pattern to degrade into the original problem.
- **Collaborator maintains its own Map or cache.** All mutable state (e.g., `activeDownloads`) stays in the facade.
- **Interface too narrow.** If `IPlayerServiceFacade` only exposes 2 methods but the collaborator actually needs 6, future changes leak collaborator internals back into the facade. Start with the right scope.
- **Splitting for file size.** `rebuildCurrentTrackIfNeeded` could be split out but it serves `executePlay` exclusively — keep it with PlaybackControl.
- **Re-exporting collaborators publicly.** Collaborators are private to their facade. No other service should import from `src/services/player/TrackLoadingCollaborator` directly.

---

## Don't Hand-Roll

| Problem                                    | Don't Build              | Use Instead                                         | Why                                                 |
| ------------------------------------------ | ------------------------ | --------------------------------------------------- | --------------------------------------------------- |
| Circular dep: PlayerService ↔ Coordinator | Custom lazy-init wrapper | Dynamic `await import()` (already in use)           | Already established pattern; CLAUDE.md documents it |
| Collaborator mocking in tests              | Custom DI container      | TypeScript constructor injection + `jest.mock()`    | Matches existing test patterns in project           |
| Circular dep detection                     | Manual import audit      | `npx dpdm --circular src/services/PlayerService.ts` | CONTEXT.md success criteria specifies this command  |

---

## Common Pitfalls

### Pitfall 1: Circular Import Through Collaborator

**What goes wrong:** `TrackLoadingCollaborator.ts` imports from `PlayerService.ts` (for the facade interface), and `PlayerService.ts` imports `TrackLoadingCollaborator.ts`. This is a circular import.
**Why it happens:** The interface and the facade are in the same file.
**How to avoid:** Put `IPlayerServiceFacade` in a separate `player/types.ts` file. Both `PlayerService.ts` and collaborators import from `player/types.ts`.
**Warning signs:** TypeScript sees `undefined` on the exported singleton at import time.

### Pitfall 2: Collaborator Retaining Facade State Via Closure

**What goes wrong:** Collaborator captures `this.facade.someState` in a closure inside a callback (e.g., `task.done(() => { this.facade.activeDownloads... })`).
**Why it happens:** DownloadService's `downloadAudioFile` uses closures extensively. When extracting, it's easy to accidentally retain Map access.
**How to avoid:** Any data a collaborator closure needs must be passed as a local variable capture at call time, not accessed via facade reference.
**Warning signs:** Collaborator tests pass in isolation but break when run with the facade.

### Pitfall 3: Breaking the Coordinator Dispatch Contract

**What goes wrong:** Moving `dispatchPlayerEvent` calls into a collaborator without ensuring the facade interface exposes it. Collaborator imports `dispatchPlayerEvent` directly.
**Why it happens:** The collaborator's method body uses `dispatchPlayerEvent` — easiest fix is a direct import.
**How to avoid:** All event dispatching goes through `IPlayerServiceFacade.dispatchPlayerEvent`. This ensures tests can assert coordinator interactions without importing the real event bus.
**Warning signs:** Collaborator tests need to mock `@/services/coordinator/eventBus` directly.

### Pitfall 4: Test Coverage Drop Below 90%

**What goes wrong:** Extracting `executeLoadTrack` to a collaborator removes it from `PlayerService.ts` coverage, but the collaborator's own test file is not added.
**Why it happens:** Plan tasks don't explicitly require new collaborator test files.
**How to avoid:** Each collaborator extraction task must include a corresponding test file creation task. Coverage must be verified with `npx jest --coverage --collectCoverageFrom="src/services/PlayerService.ts" --collectCoverageFrom="src/services/player/*.ts"`.
**Warning signs:** `jest --coverage` shows a collaborator file with 0% coverage.

### Pitfall 5: DownloadService `activeDownloads` Leaking Into Status Collaborator

**What goes wrong:** `isDownloadActive` currently checks `this.activeDownloads.has(libraryItemId)`. When extracted to `DownloadStatusCollaborator`, it needs access to the Map.
**Why it happens:** `isDownloadActive` is listed as a status query but reads runtime state (the Map).
**How to avoid:** `isDownloadActive` and `getDownloadStatus` stay in the facade (they read `activeDownloads` directly). Only `isLibraryItemDownloaded`, `getDownloadProgress`, and `getDownloadedSize` are extracted — these query the DB, not the Map.
**Warning signs:** `DownloadStatusCollaborator` constructor receives `activeDownloads` as a parameter.

---

## Code Examples

### Constructor Injection Pattern (PlayerService)

```typescript
// src/services/player/types.ts
// Source: CONTEXT.md — "Explicit TypeScript interfaces per collaborator"

import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import type { PlayerTrack } from "@/types/player";

/**
 * Public facade API surface exposed to PlayerService collaborators.
 * Narrowed to what collaborators actually call — not the full PlayerService class.
 */
export interface IPlayerServiceFacade {
  // Event dispatch (coordinator contract)
  dispatchEvent(event: Parameters<typeof dispatchPlayerEvent>[0]): void;
  // API credential access (for streaming URL construction)
  getApiInfo(): { baseUrl: string; accessToken: string } | null;
  // Timestamp for reconnect detection
  getInitializationTimestamp(): number;
}

/**
 * Collaborator interfaces — each implemented by a concrete class,
 * mocked in facade tests via jest.mock or constructor injection.
 */
export interface ITrackLoadingCollaborator {
  executeLoadTrack(libraryItemId: string, episodeId?: string): Promise<void>;
  buildTrackList(track: PlayerTrack): Promise<Track[]>;
  reloadTrackPlayerQueue(track: PlayerTrack): Promise<boolean>;
}

export interface IPlaybackControlCollaborator {
  executePlay(): Promise<void>;
  executePause(): Promise<void>;
  executeStop(): Promise<void>;
  executeSeek(position: number): Promise<void>;
  executeSetRate(rate: number): Promise<void>;
  executeSetVolume(volume: number): Promise<void>;
}

export interface IProgressRestoreCollaborator {
  restorePlayerServiceFromSession(): Promise<void>;
  syncPositionFromDatabase(): Promise<void>;
  rebuildCurrentTrackIfNeeded(): Promise<boolean>;
}

export interface IBackgroundReconnectCollaborator {
  reconnectBackgroundService(): Promise<void>;
  refreshFilePathsAfterContainerChange(): Promise<void>;
}
```

### Facade Constructor (PlayerService)

```typescript
// src/services/PlayerService.ts

// All existing imports remain — this is the public contract entry point

export class PlayerService {
  private static instance: PlayerService | null = null;
  // ... existing private fields ...

  // Collaborator references (typed to interfaces — swappable in tests)
  private trackLoading!: ITrackLoadingCollaborator;
  private playbackControl!: IPlaybackControlCollaborator;
  private progressRestore!: IProgressRestoreCollaborator;
  private backgroundReconnect!: IBackgroundReconnectCollaborator;

  private constructor() {
    // Collaborators created here — facade is `this`
    this.trackLoading = new TrackLoadingCollaborator(this);
    this.playbackControl = new PlaybackControlCollaborator(this);
    this.progressRestore = new ProgressRestoreCollaborator(this);
    this.backgroundReconnect = new BackgroundReconnectCollaborator(this);
  }

  // --- Public API (unchanged from callers' perspective) ---

  async executeLoadTrack(libraryItemId: string, episodeId?: string): Promise<void> {
    return this.trackLoading.executeLoadTrack(libraryItemId, episodeId);
  }

  async executePlay(): Promise<void> {
    return this.playbackControl.executePlay();
  }

  // ... rest of public API unchanged
}
```

### Collaborator Testability (Before vs After)

```typescript
// BEFORE: Testing one concern in executeLoadTrack requires 13 mocks
jest.mock("@/db/helpers/libraryItems", ...);
jest.mock("@/db/helpers/mediaMetadata", ...);
jest.mock("@/db/helpers/combinedQueries", ...);
jest.mock("@/db/helpers/chapters", ...);
jest.mock("@/db/helpers/localListeningSessions", ...);
jest.mock("@/db/helpers/mediaProgress", ...);
jest.mock("@/db/helpers/users", ...);
jest.mock("@/lib/secureStore", ...);
jest.mock("@/lib/fileSystem", ...);
jest.mock("@/lib/trackPlayerConfig", ...);
jest.mock("@/stores/appStore", ...);
jest.mock("@/services/ProgressService", ...);
jest.mock("@/services/DownloadService", ...);
// ... 4 more

// AFTER: Testing TrackLoadingCollaborator directly needs only:
jest.mock("@/db/helpers/libraryItems", ...);
jest.mock("@/db/helpers/mediaMetadata", ...);
jest.mock("@/db/helpers/combinedQueries", ...);
jest.mock("@/db/helpers/chapters", ...);
jest.mock("@/lib/fileSystem", ...);
jest.mock("react-native-track-player", ...);
// facade interface is injected — no global mock needed for coordinator or store
const mockFacade: IPlayerServiceFacade = {
  dispatchEvent: jest.fn(),
  getApiInfo: jest.fn().mockReturnValue({ baseUrl: 'http://test', accessToken: 'tok' }),
  getInitializationTimestamp: jest.fn().mockReturnValue(Date.now()),
};
const collaborator = new TrackLoadingCollaborator(mockFacade);
```

### DownloadService Status Collaborator

```typescript
// src/services/download/DownloadStatusCollaborator.ts

// NOTE: isDownloadActive and getDownloadStatus stay in the facade
// (they read activeDownloads Map). These three are the extractable ones:

export class DownloadStatusCollaborator {
  // No state. No facade reference needed — pure DB + file system.

  async isLibraryItemDownloaded(libraryItemId: string): Promise<boolean> {
    // DB query + verifyFileExists — testable with 2 mocks
  }

  async getDownloadProgress(
    libraryItemId: string
  ): Promise<{ downloaded: number; total: number; progress: number }> {
    // DB query only — testable with 1 mock
  }

  async getDownloadedSize(libraryItemId: string): Promise<number> {
    // DB query only — testable with 1 mock
  }
}
```

---

## State of the Art

| Old Approach                     | Current Approach                                      | When Changed | Impact                                                          |
| -------------------------------- | ----------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| God-class service                | Facade + focused collaborators                        | Phase 12     | Each collaborator testable with 2-4 mocks vs 13+                |
| Direct state mutation in methods | Collaborators return values; facade applies mutations | Phase 12     | Collaborators become functionally pure                          |
| Tests mock entire service        | Tests inject mock collaborators into facade           | Phase 12     | Facade tests verify delegation; collaborator tests verify logic |

**Current situation:** `PlayerService.ts` has 35 tests, 36% statement coverage. The uncovered 64% is concentrated in `rebuildCurrentTrackIfNeeded`, `reloadTrackPlayerQueue`, `restorePlayerServiceFromSession`, `syncPositionFromDatabase`, `reconnectBackgroundService`, and `refreshFilePathsAfterContainerChange` — exactly the methods that require excessive mocking today.

---

## Open Questions

1. **`isDownloadActive` and `getDownloadStatus` classification**
   - What we know: Both read `activeDownloads` Map directly; they are listed as "Status Queries" in the CONTEXT.md but tightly depend on in-memory Map state.
   - What's unclear: Should they stay in the facade (since they read live state) or move to collaborator with the Map passed as a parameter?
   - Recommendation: Keep in the facade. The Map is internal lifecycle state; passing it as a parameter to a collaborator leaks internal structure. The two truly DB-backed status queries (`isLibraryItemDownloaded`, `getDownloadProgress`, `getDownloadedSize`) are the correct extraction targets.

2. **`rebuildCurrentTrackIfNeeded` placement**
   - What we know: Called exclusively from `executePlay` in `PlaybackControlCollaborator`; but it calls `restorePlayerServiceFromSession` which belongs to `ProgressRestoreCollaborator`.
   - Recommendation: Put `rebuildCurrentTrackIfNeeded` in `ProgressRestoreCollaborator` since it orchestrates session restore. `PlaybackControlCollaborator` calls it via a call to `progressRestore.rebuildCurrentTrackIfNeeded()` through the facade.

3. **`cachedApiInfo` field ownership**
   - What we know: Currently a private field on `PlayerService` (`cachedApiInfo`), set lazily in `buildTrackList`.
   - Recommendation: Keep in the facade. `getApiInfo()` on the facade interface exposes it; `TrackLoadingCollaborator` calls `facade.getApiInfo()` rather than managing its own cache.

---

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------- | ------------ |
| Framework          | Jest (via `npm test`)                                                                                                                                                                                                                   |
| Config file        | `jest.config.js` (project root)                                                                                                                                                                                                         |
| Quick run command  | `npm test -- --testPathPattern="services/(PlayerService                                                                                                                                                                                 | DownloadService | player/ | download/)"` |
| Full suite command | `npm test`                                                                                                                                                                                                                              |
| Coverage command   | `npx jest --coverage --collectCoverageFrom="src/services/PlayerService.ts" --collectCoverageFrom="src/services/player/*.ts" --collectCoverageFrom="src/services/DownloadService.ts" --collectCoverageFrom="src/services/download/*.ts"` |

### Phase Requirements → Test Map

| Req ID    | Behavior                                                          | Test Type | Automated Command                                                 | File Exists?                                      |
| --------- | ----------------------------------------------------------------- | --------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| DECOMP-01 | PlayerService public interface unchanged                          | unit      | `npm test -- --testPathPattern="PlayerService"`                   | ✅ `src/services/__tests__/PlayerService.test.ts` |
| DECOMP-01 | TrackLoadingCollaborator executes load in isolation               | unit      | `npm test -- --testPathPattern="TrackLoadingCollaborator"`        | ❌ Wave 0                                         |
| DECOMP-01 | PlaybackControlCollaborator executes play/pause/stop in isolation | unit      | `npm test -- --testPathPattern="PlaybackControlCollaborator"`     | ❌ Wave 0                                         |
| DECOMP-01 | ProgressRestoreCollaborator restores session in isolation         | unit      | `npm test -- --testPathPattern="ProgressRestoreCollaborator"`     | ❌ Wave 0                                         |
| DECOMP-01 | BackgroundReconnectCollaborator reconnects in isolation           | unit      | `npm test -- --testPathPattern="BackgroundReconnectCollaborator"` | ❌ Wave 0                                         |
| DECOMP-01 | No circular imports in PlayerService graph                        | static    | `npx dpdm --circular src/services/PlayerService.ts`               | N/A                                               |
| DECOMP-02 | DownloadService public interface unchanged                        | unit      | `npm test -- --testPathPattern="DownloadService"`                 | ❌ Wave 0 (no existing test file)                 |
| DECOMP-02 | DownloadStatusCollaborator queries in isolation                   | unit      | `npm test -- --testPathPattern="DownloadStatusCollaborator"`      | ❌ Wave 0                                         |
| DECOMP-02 | DownloadRepairCollaborator repairs in isolation                   | unit      | `npm test -- --testPathPattern="DownloadRepairCollaborator"`      | ❌ Wave 0                                         |
| DECOMP-02 | No circular imports in DownloadService graph                      | static    | `npx dpdm --circular src/services/DownloadService.ts`             | N/A                                               |

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern="(PlayerService|DownloadService|player/|download/)"`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + 90% coverage on modified files before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/services/__tests__/TrackLoadingCollaborator.test.ts` — covers DECOMP-01 (track loading in isolation)
- [ ] `src/services/__tests__/PlaybackControlCollaborator.test.ts` — covers DECOMP-01 (play/pause/stop in isolation)
- [ ] `src/services/__tests__/ProgressRestoreCollaborator.test.ts` — covers DECOMP-01 (session restore in isolation)
- [ ] `src/services/__tests__/BackgroundReconnectCollaborator.test.ts` — covers DECOMP-01 (reconnect in isolation)
- [ ] `src/services/__tests__/DownloadService.test.ts` — covers DECOMP-02 (facade public interface; no existing file)
- [ ] `src/services/__tests__/DownloadStatusCollaborator.test.ts` — covers DECOMP-02 (status queries in isolation)
- [ ] `src/services/__tests__/DownloadRepairCollaborator.test.ts` — covers DECOMP-02 (repair in isolation)
- [ ] `src/services/player/types.ts` — shared interfaces; created in Plan 12-01 Wave 0
- [ ] `src/services/download/types.ts` — shared interfaces; created in Plan 12-02 Wave 0

_(Existing `PlayerService.test.ts` covers the public interface — must be updated to mock collaborators instead of individual DB/TrackPlayer calls.)_

---

## Sources

### Primary (HIGH confidence)

- Direct source read: `src/services/PlayerService.ts` — full 1,102-line audit
- Direct source read: `src/services/DownloadService.ts` — full 1,170-line audit
- Direct source read: `src/services/PlayerBackgroundService.ts` — full 983-line audit
- Direct source read: `src/services/ProgressService.ts` — partial read (first 400 lines; sufficient for audit decision which is deferred per REQUIREMENTS.md)
- Direct source read: `src/services/ApiClientService.ts` — full 271-line audit
- Direct source read: `src/services/BundleService.ts` — full 220-line audit
- Direct source read: `src/services/libraryItemBatchService.ts` — full 99-line audit
- Direct source read: `src/services/__tests__/PlayerService.test.ts` — 35 tests, 13 mock sites, 36% statement coverage confirmed by `npx jest --coverage`
- `CLAUDE.md` — No circular imports rule, dynamic import pattern documented
- `.planning/phases/12-service-decomposition/12-CONTEXT.md` — locked decisions, collaborator pattern spec
- `.planning/REQUIREMENTS.md` — DECOMP-03 explicitly deferred; 90% coverage target

### Secondary (MEDIUM confidence)

- Jest test run output: 574 passing tests, all green before Phase 12 begins
- Coverage run output: PlayerService.ts at 36% statement, 25% branch before extraction

---

## Metadata

**Confidence breakdown:**

- Audit results (which services split): HIGH — based on direct source reads and coverage data
- Collaborator groupings: HIGH — based on method dependency analysis in source
- Interface design: MEDIUM — interfaces are designed from first principles; exact method signatures may need minor adjustment during implementation
- Coverage targets: HIGH — 90% is from REQUIREMENTS.md DECOMP-01/02 success criteria

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable codebase; no external library churn)
