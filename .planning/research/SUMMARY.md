# Project Research Summary

**Project:** abs-react-native — v1.2 Tech Cleanup milestone
**Domain:** React Native Expo audiobook app — dependency upgrades, DB performance, state audit, service decomposition
**Researched:** 2026-02-28
**Confidence:** MEDIUM overall (HIGH for DB/state work; MEDIUM for Expo upgrade path; LOW for RN Downloader migration specifics)

## Executive Summary

v1.2 is a pure internal cleanup milestone with no user-facing features. It attacks four classes of technical debt simultaneously: Expo SDK upgrade, DB performance, state centralization, and service decomposition. The DB and state work is low-risk, well-understood, and can ship independently of the dependency upgrades. The Expo SDK upgrade and RN Downloader fork migration both carry real blockers that must be de-risked before a full phase is committed — neither is a simple dependency bump.

The single most important risk in this milestone is the interaction between Expo SDK 55's mandatory New Architecture and `react-native-track-player` 4.1.2. SDK 55 drops the legacy bridge entirely, and RNTP 4.1.2 has confirmed Android TurboModule incompatibilities (issues #2443, #2460) with known `RCTDeviceEventEmitter` propagation failures in bridgeless mode. The coordinator FSM depends on five specific RNTP events (`NATIVE_STATE_CHANGED`, `NATIVE_TRACK_CHANGED`, `NATIVE_PROGRESS_UPDATED`, `NATIVE_PLAYBACK_ERROR`, `NATIVE_QUEUE_ENDED`) — if any of these fail silently on Android under New Architecture, the player will appear to work while the state machine freezes. This failure mode is invisible without deliberate coordinator diagnostic checks. The recommended stance is: **verify on SDK 54 with New Architecture enabled before touching the SDK version**. Enable New Architecture in `app.json` on the current SDK 54 build, run a full play → seek → pause → resume → queue-end session on a physical Android device, and inspect `totalEventsProcessed` and `rejectedTransitionCount` in the diagnostics UI. Only if all coordinator events fire correctly should the team proceed to bump the SDK.

The RN Downloader fork migration is a separate, equally high-stakes unknown. The custom fork (`spike-event-queue` branch) may expose `checkForExistingDownloads()` under the EkoLabs API surface that mainline 4.x renamed to `getExistingDownloadTasks()`. A silent name mismatch will cause `DownloadService.initialize()` to fail at startup with a swallowed error, leaving the service permanently uninitialized. Beyond the API surface, the task ID format and metadata serialization behavior across app restarts must be validated — the download reconciliation logic depends on both. This migration requires a pre-phase spike against the actual mainline source before any phase work begins.

---

## Key Findings

### Recommended Stack

The upgrade target is **Expo SDK 55.0.4 / React Native 0.83.2**. All `expo-*` packages version-align with the SDK major — `npx expo install --fix` handles the mechanical part. Drizzle bumps are minor (0.44.5 → 0.45.1, 0.31.4 → 0.31.9) with no breaking changes. The `expo-file-system` API rename from SDK 55 is a non-issue for this project: the codebase already uses the new `Directory/File/Paths` API throughout. Xcode 26 is required for the iOS build; verify this before any SDK work begins.

**Core technologies and upgrade targets:**

- **Expo SDK 55.0.4** — mandatory; all expo-\* packages follow via `npx expo install --fix`
- **React Native 0.83.2** — bundled with SDK 55; New Architecture is non-optional
- **expo-router ~55.0.3** — v7 internally; NativeTabs API changed from `unstable` imports; requires audit of `(tabs)/_layout.tsx`
- **drizzle-orm 0.45.1 / drizzle-kit 0.31.9** — minor bump, safe, no breaking changes
- **expo-sqlite ^55.0.0** — SDK alignment only; same underlying SQLite engine
- **react-native-track-player 4.1.2** — HOLD at current version; verify New Architecture compatibility on Android before any upgrade decision
- **@kesha-antonov/react-native-background-downloader 4.5.3 (mainline)** — TARGET pending spike; custom fork must be diffed first

**Do not upgrade:**

- RNTP to 5.0.0-alpha0 — broken on iOS (issue #2503); 5.x is not release-ready
- drizzle-orm to 1.0 beta — not stable; API may change

### Expected Features (v1.2 Scope)

v1.2 has no new user-facing features. All work is internal cleanup organized into four tracks.

**Must deliver (table stakes for the milestone):**

- DB indexes on `library_items.library_id`, `media_metadata.library_item_id`, `audio_files.media_id`, `media_progress.(user_id, library_item_id)`, `local_listening_sessions.user_id`, `local_listening_sessions.is_synced` — confirmed missing from schema audit
- Replace N+1 upsert loop in `upsertLibraryItems()` — 500-item sync currently executes 1,000 sequential queries
- Replace select-then-insert pattern in `upsertLibraryItem()` with `onConflictDoUpdate` (already used in `authors.ts`, `libraries.ts`)
- Replace N+1 series progress fetch in `SeriesDetailScreen` with a single `inArray` query
- Move `progressMap` (series detail) and `books/author/isLoadingBooks` (author detail) to Zustand — confirmed candidates that re-fetch from DB on every mount
- WAL pragma + `synchronous=NORMAL` on SQLite open — 2-line change, no migration, 4x write throughput
- Split `PlayerService.ts` (1,105 lines), `ProgressService.ts` (1,178 lines), `DownloadService.ts` (1,170 lines) into focused submodules
- Expo SDK 55 upgrade (contingent on RNTP verification)
- RN Downloader fork → mainline migration (contingent on spike)

**Should deliver (differentiators within the cleanup scope):**

- WAL pragma + `synchronous=NORMAL` pragma on SQLite open (2-line change, no migration required)
- `audioFiles.media_id` index — called on every play action
- Batch `upsertGenres/Narrators/Tags` in `fullLibraryItems.ts`
- Move `libraryViewMode` preference to `settingsSlice` for navigation persistence

**Explicitly defer:**

- Splitting `librarySlice.ts` (1,011 lines) — tightly coupled through shared Zustand `set()` closure; split risk exceeds benefit in v1.2
- Converting service singletons to module-level singletons everywhere — high-risk pattern change across all three services simultaneously
- Switching ORM or DB layer — Drizzle is working; no user benefit
- drizzle-orm 1.0 beta — not stable

**State audit decision rule:** Centralize if the same data is fetched by `useEffect` in more than one screen OR if it must survive navigation. Keep local if ephemeral UI state (modals, inputs, scroll position) used by one component only. Confirmed candidates for centralization: `progressMap` in `series/[seriesId]/index.tsx`, `books/author/isLoadingBooks` in `authors/[authorId]/index.tsx`. Confirmed correct as local: slider drag state, sort menus, form inputs, debug screen state.

### Architecture Approach

The existing coordinator FSM architecture is stable and must not be disturbed. `PlayerStateCoordinator` processes events serially via `async-lock`; `playerSlice` is a read-only proxy of coordinator state. All playback state changes go through `dispatchPlayerEvent` — no component or service may write to `playerSlice` directly except via the coordinator bridge (`syncStateToStore` / `syncPositionToStore`). This invariant must be preserved through all service decomposition and state centralization work.

**Major components and their v1.2 change exposure:**

1. **DB schema + migrations** — MODIFIED: add index definitions to relevant tables; generate migrations
2. **`src/db/helpers/`** — MODIFIED: fix N+1 patterns, adopt `onConflictDoUpdate` in `libraryItems.ts`
3. **`src/db/client.ts`** — MODIFIED: add WAL pragma immediately after `openDatabaseSync`
4. **`settingsSlice`** — MODIFIED: add `libraryViewMode` field; add `libraryViewMode` to `appSettings` persistence
5. **`seriesSlice` / `authorsSlice`** — MODIFIED: add caching for per-series progress and per-author book lists
6. **`PlayerService.ts`** — SPLIT into facade + concern-specific collaborators; facade retains `getInstance()` and coordinator dispatch contracts
7. **`ProgressService.ts`** — SPLIT (highest risk); background service entrypoint must be identified before splitting; should be done in its own dedicated phase
8. **`DownloadService.ts`** — SPLIT (medium risk); Status Queries and Repair/Reconciliation groups can be extracted first; Lifecycle + Progress Tracking share `activeDownloads` Map and should stay together initially
9. **`package.json` / `app.json`** — MODIFIED: SDK 55 bump, remove `newArchEnabled` flag, swap downloader dep
10. **`PlayerStateCoordinator.ts` / `playerSlice.ts`** — NO CHANGE; isolated from all four task tracks

**Key decomposition constraint:** When splitting `PlayerService`, helpers must accept dependencies as arguments — never import `PlayerService.getInstance()` internally. The `executeLoadTrack` dispatch pattern (dispatches `PLAY` rather than calling `TrackPlayer.play()` directly) must not be split across modules; the `LOADING → PLAYING` transition depends on this sequence staying intact.

### Critical Pitfalls

1. **RNTP event loss in Android bridgeless mode** — `RCTDeviceEventEmitter` events from the headless audio service may not propagate through the New Architecture interop layer. The coordinator goes silent: audio plays natively but FSM state freezes. Prevention: enable New Architecture on SDK 54 first; run full coordinator event sequence on physical Android; verify `totalEventsProcessed` matches expected event count before proceeding to SDK 55.

2. **RN Downloader API name mismatch** — mainline renamed `checkForExistingDownloads()` to `getExistingDownloadTasks()`. If the mainline package does not expose the old name, `DownloadService.initialize()` throws a swallowed `TypeError` at startup and the service never initializes. All downloads silently fail. Prevention: diff the fork's exported API surface against mainline before touching `package.json`; adapter-wrap any renamed methods in `DownloadService.ts`.

3. **NativeTabs API break after SDK bump** — `expo-router/unstable-native-tabs` API changed in v7; `Icon`, `Label`, `Badge` moved to `NativeTabs.Trigger.*`. The v1.1 custom tab order feature depends on this API. A compile-time import error in `(tabs)/_layout.tsx` produces a blank screen at startup. Prevention: read the SDK 55 `expo-router` changelog section in full and audit all `NativeTabs` usages before running `npx expo install --fix`.

4. **Zustand selector re-render storms** — Object-returning selectors (`useAppStore(s => ({ a: s.x, b: s.y }))`) create new references on every store update. During playback, `playerSlice` updates at 1Hz; any component with an object selector re-renders every second. New actions added during the state audit must use `get()` inside the action body, not closure variables. Prevention: use individual selectors or the existing `use*()` slice hooks; run React DevTools profiler to verify no component re-renders at 1Hz during playback.

5. **Import cycle from service decomposition** — splitting a large service class by copy-pasting methods into helper files, then rewriting `this.method()` calls to `PlayerService.getInstance().method()`, introduces a singleton import cycle that Metro resolves non-deterministically. Prevention: helper functions must accept dependencies as arguments; run `npx dpdm --circular src/services/PlayerService.ts` as a baseline before splitting and verify no new cycles after each file split.

---

## RNTP Conflict Resolution

STACK.md and ARCHITECTURE.md present conflicting assessments of RNTP 4.1.2 under SDK 55:

- **STACK.md position:** RNTP 4.1.2 works under SDK 55 via the New Architecture interop layer; hold at 4.1.2
- **ARCHITECTURE.md position:** RNTP 4.1.2 does not have full TurboModule support; known Android TurboModule crash issues (#2443, #2460); check before attempting SDK 55
- **PITFALLS.md evidence:** `RCTDeviceEventEmitter` events from the headless audio service do not propagate through the bridgeless interop layer on Android; coordinator goes silent without any visible error

**Synthesis — Recommended stance: VERIFY BEFORE COMMITTING**

These positions are not actually contradictory. STACK.md's "works via interop" claim is an optimistic inference applicable to iOS; ARCHITECTURE.md and PITFALLS.md are reporting confirmed open issues specific to Android bridgeless mode. The correct resolution:

1. The iOS risk is LOW — bridgeless event propagation issues are predominantly Android-side. RNTP 4.1.2 likely works fine on iOS under SDK 55.
2. The Android risk is HIGH and confirmed by multiple issue reports. The coordinator's dependency on five Android headless service events makes silent failure catastrophic.
3. The recommendation is not "hold" (too conservative — we cannot know without testing) and not "upgrade to 5.x" (broken on iOS). It is: **gate the Expo upgrade on a pre-flight RNTP event verification test on physical Android under New Architecture**. Run this test on SDK 54 with `newArchEnabled: true` before any SDK version change. If the test passes, proceed with SDK 55. If it fails, the Expo upgrade track is blocked until RNTP ships a version with confirmed bridgeless Android stability (likely 4.2.0+; exact version to be determined from the RNTP issue tracker at that time).

This means Phase 5 has a hard pre-flight gate that may extend its timeline independently of the other phases. The other four phases should be designed and scheduled assuming they will complete before the RNTP gate opens.

---

## Implications for Roadmap

Based on combined research, the recommended phase structure for v1.2 is five phases ordered by risk (lowest first) with the two high-uncertainty tracks gated behind verification or spikes.

### Phase 1: DB Quick Wins

**Rationale:** Zero coordinator risk, zero UI risk, entirely in schema and helpers. Fast wins that immediately improve sync and playback start performance. Can ship before any other phase completes. All changes are non-destructive SQLite DDL.
**Delivers:** WAL pragma, missing indexes (6 confirmed FK gaps), N+1 fixes in `upsertLibraryItems` / `upsertLibraryItem` / `fullLibraryItems.ts`, N+1 fix in SeriesDetailScreen (new `getMediaProgressForMultipleItems` helper)
**Features addressed:** All DB/SQL audit table stakes and differentiators from FEATURES.md
**Pitfalls to avoid:** Pitfall 8 (NOT NULL without DEFAULT in migrations — always include a SQLite-safe default); Pitfall 9 (time migration on a seeded database with realistic row counts before shipping; index creation blocks the table)
**Research flag:** SKIP — established Drizzle patterns, SQLite semantics are well-documented, codebase audit confirmed exact gap locations

### Phase 2: State Audit

**Rationale:** Isolated to slice definitions and two screen components; no coordinator or service changes. Medium complexity, low risk if the decision criteria from FEATURES.md are followed. Should precede service decomposition so centralized data is available to the split services.
**Delivers:** `progressMap` moved to `seriesSlice`; author books/loading state moved to `authorsSlice`; `libraryViewMode` moved to `settingsSlice` with persistence
**Features addressed:** State audit table stakes and `libraryViewMode` differentiator from FEATURES.md
**Pitfalls to avoid:** Pitfall 6 (Zustand side effect storms — audit every `useEffect` in refactored components for position-in-dependency-array); Pitfall 7 (stale closures in new slice actions — use `get()` not closure); Pitfall 11 (object-returning selectors — use individual selectors or existing `use*()` slice hooks)
**Research flag:** SKIP — architecture boundary is clear from direct codebase analysis; Zustand patterns are well-documented

### Phase 3: Service Decomposition — PlayerService and DownloadService

**Rationale:** PlayerService (1,105 lines) and DownloadService (1,170 lines) are both medium-risk splits with clear concern boundaries. PlayerService splits well into a facade + collaborators. DownloadService Status Queries and Repair/Reconciliation groups have low coupling and can be extracted first; Lifecycle and Progress Tracking share the `activeDownloads` Map and should remain together. Both in the same phase because their coupling points are disjoint. ProgressService is excluded — highest-risk split, requires its own phase.
**Delivers:** PlayerService split into facade + track-loading, playback-control, progress-restore, path-repair, background-reconnect collaborators; DownloadService Status Queries and Repair extracted; Lifecycle + Progress Tracking remain in DownloadService core
**Features addressed:** PlayerService and DownloadService decomposition table stakes from FEATURES.md
**Pitfalls to avoid:** Pitfall 10 (import cycles — helpers accept arguments, never import the service class; run `dpdm --circular` before and after each file split); coordinator dispatch contracts must stay intact in `executeLoadTrack` pattern (`LOADING → PLAYING` transition depends on this sequence)
**Research flag:** CONSIDER — if RN Downloader migration (Phase 4) is scheduled to run concurrently or immediately after, coordinate the DownloadService split with the downloader API changes to avoid splitting and then immediately touching the same file for an API adapter

### Phase 4: RN Downloader Fork → Mainline Migration

**Rationale:** Confined entirely to `DownloadService.ts` — no coordinator, no Zustand, no other services. The unknown API surface change requires a pre-phase spike. Treat as an API migration, not a dependency swap.
**Delivers:** Custom fork removed; mainline `@kesha-antonov/react-native-background-downloader@4.5.3` installed; `DownloadService.ts` adapter-wrapped for any renamed methods; download recovery verified
**Features addressed:** RN Downloader upgrade from FEATURES.md
**Pitfalls to avoid:** Pitfall 4 (`checkForExistingDownloads` → `getExistingDownloadTasks` rename — adapter-wrap before swapping package reference); Pitfall 5 (task ID format change breaking restart recovery — test kill-and-restart mid-download before marking phase complete)
**Research flag:** REQUIRES pre-phase spike — (1) clone or inspect mainline 4.5.3 source, diff exported API surface against fork; (2) verify `task.metadata` survival across app restarts in mainline; (3) determine if event queue behavior from `spike-event-queue` branch was absorbed into mainline 4.x or must be reimplemented

### Phase 5: Expo SDK 55 Upgrade + ProgressService Decomposition

**Rationale:** Expo upgrade is last because it is the only change that can fail due to factors outside this codebase (RNTP Android bridgeless, Xcode toolchain). If the Expo upgrade reveals a hard blocker, the other four phases ship independently. ProgressService decomposition is the highest-risk service split and benefits from dedicated verification time; pairing it with the Expo upgrade phase keeps both high-risk items in one accountable phase with clear completion criteria. RNTP verification (enable New Architecture on SDK 54, test on physical Android) is a hard pre-flight gate before any package.json changes.
**Delivers:** Expo SDK 55.0.4 with full New Architecture; ProgressService split into Session Lifecycle, Server Sync, Periodic Sync, Progress Tracking, Position Resolution collaborators; iCloud exclusion plugin verified post-prebuild; NativeTabs API migrated to v7 surface; `app.json` `newArchEnabled` flag removed
**Features addressed:** Expo upgrade and ProgressService decomposition table stakes from FEATURES.md
**Pitfalls to avoid:** Pitfall 1 (RNTP Android event loss — verify on SDK 54 first, physical device, full coordinator event sequence); Pitfall 2 (NativeTabs API break — read SDK 55 expo-router changelog before `npx expo install --fix`); Pitfall 3 (Xcode 26 required — run `xcode-select --version` before any code changes); Pitfall 12 (iCloud exclusion plugin regression — verify `ios/SideShelf/Modules/ICloudBackupExclusion.m` exists and `NativeModules.ICloudBackupExclusion` is not null post-prebuild); ProgressService constraint: `resolveCanonicalPosition` isFinished guard must stay coupled to position resolution code path; `syncInterval` and timing constants must remain accessible to the background service
**Research flag:** REQUIRES pre-flight gate — enable New Architecture on SDK 54 and run coordinator event verification on physical Android before beginning this phase. If RNTP 4.1.2 fails the event test, the Expo upgrade sub-track is blocked until a RNTP version with confirmed bridgeless Android support ships. ProgressService decomposition can proceed independently of the SDK upgrade.

### Phase Ordering Rationale

- DB changes have no dependencies and deliver immediate value; they go first
- State audit precedes service decomposition so centralized data is available to the split services without a second refactoring pass
- RN Downloader migration is contained to one file; doing it before the Expo upgrade avoids the native layer changing twice in the same file in the same timeframe
- Expo upgrade goes last because it is the only change that can be blocked by external factors (RNTP upstream, Xcode toolchain); the other four phases must ship regardless
- ProgressService decomposition is paired with the Expo upgrade phase because both require dedicated verification and cannot be combined with other work without obscuring regression attribution

### Research Flags

**Requires pre-phase spike or gate (do not begin phase until complete):**

- **Phase 4 (RN Downloader migration):** Diff `spike-event-queue` fork exports against mainline 4.5.3; validate `task.metadata` persistence; determine whether event queue behavior needs reimplementation
- **Phase 5 (Expo upgrade):** Enable New Architecture on SDK 54; run full coordinator event sequence on physical Android device; verify RNTP 4.1.2 receives all five coordinator event types (`NATIVE_STATE_CHANGED`, `NATIVE_TRACK_CHANGED`, `NATIVE_PROGRESS_UPDATED`, `NATIVE_PLAYBACK_ERROR`, `NATIVE_QUEUE_ENDED`) before scheduling SDK bump

**Standard patterns (skip research-phase, proceed directly to planning):**

- **Phase 1 (DB Quick Wins):** SQLite index and N+1 patterns are well-documented; gap locations confirmed from codebase audit
- **Phase 2 (State Audit):** Coordinator/Zustand boundary is precisely defined; decision criteria are deterministic
- **Phase 3 (PlayerService + DownloadService split):** Decomposition boundaries identified; coordinator dispatch contracts documented in MEMORY.md

---

## Confidence Assessment

| Area                           | Confidence | Notes                                                                                                                                                 |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB indexes and N+1 fixes       | HIGH       | Direct schema and helper audit confirmed gap locations; SQLite and Drizzle semantics are well-documented official sources                             |
| State audit candidates         | HIGH       | Direct codebase analysis; coordinator boundary fully verified from source; confirmed candidates enumerated with specific file/line references         |
| Service decomposition approach | HIGH       | Method groups identified from direct code reading; concern boundaries are clear; coupling points documented                                           |
| Expo SDK 55 upgrade path       | MEDIUM     | SDK 55 changelog is official and verified; RNTP Android behavior under New Architecture is actively evolving and cannot be pinned without a live test |
| RNTP new-arch Android status   | LOW        | Multiple open issues as of Feb 2026; resolution state is not pinnable from documentation; requires live device verification                           |
| RN Downloader migration effort | LOW        | API surface traced from `DownloadService.ts`; mainline behavior unverified; fork diff not readable without repository access                          |
| Drizzle minor bump             | HIGH       | npm-verified; no breaking changes documented; peer dep satisfied                                                                                      |
| NativeTabs v7 changes          | MEDIUM     | SDK 55 changelog is official; specific breakage in this codebase's `_layout.tsx` is inferred from API change descriptions, not tested                 |

**Overall confidence:** MEDIUM — the low-risk DB and state work is well-understood and can proceed immediately; the Expo and downloader tracks require verification gates before full commitment.

### Gaps to Address

- **RNTP Android bridgeless compatibility:** Cannot be resolved by research alone; requires a live test on physical Android with New Architecture enabled on SDK 54. This is the single highest-stakes unknown in the milestone. Resolution path: enable New Architecture on current SDK 54 build, run the coordinator event verification sequence, read `totalEventsProcessed` from the diagnostics UI.
- **RN Downloader fork diff:** The `spike-event-queue` branch diff against mainline 4.5.3 cannot be read from this environment. The spike must be done with direct repository access. Until complete, Phase 4 effort is unknown and could range from a 2-hour API adapter to a multi-day behavior reimplementation.
- **RNTP minimum bridgeless-safe version:** If 4.1.2 fails the pre-flight test, the team needs to know which 4.x version has confirmed bridgeless Android stability. Monitor RNTP issue #2443 for a resolution comment; the answer is not available from current research.
- **ProgressService background entrypoint:** Before splitting `ProgressService.ts`, the background service entrypoint that wires up the sync interval must be identified to ensure it remains accessible post-split. This is a pre-Phase 5 reading task, not a research spike.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase audit — `src/db/schema/*.ts`, `src/db/helpers/*.ts`, `src/services/*.ts`, `src/stores/slices/*.ts`, `src/app/**/*.tsx`, `package.json`, `drizzle.config.ts` (50,175 lines TypeScript/TSX analyzed)
- Project MEMORY.md — coordinator architecture, executeLoadTrack dispatch pattern, known bug history, v1.1 decisions
- [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55) — New Architecture mandatory, expo-file-system rename, NativeTabs API changes, Xcode 26 requirement
- [SQLite Write-Ahead Logging](https://sqlite.org/wal.html) — WAL mode semantics
- [SQLite Query Planning](https://sqlite.org/queryplanner.html) — index selection guidance
- [SQLite CREATE INDEX](https://sqlite.org/lang_createindex.html) — safety guarantees on existing data
- [Drizzle ORM Indexes and Constraints](https://orm.drizzle.team/docs/indexes-constraints) — index definition syntax

### Secondary (MEDIUM confidence)

- [Expo Upgrading to SDK 55](https://expo.dev/blog/upgrading-to-sdk-55) — step-by-step upgrade guidance
- [react-native-track-player issue #2443](https://github.com/doublesymmetry/react-native-track-player/issues/2443) — New Architecture support tracking
- [react-native-track-player issue #2460](https://github.com/doublesymmetry/react-native-track-player/issues/2460) — TurboModule parsing error on Android
- [react-native-track-player issue #2503](https://github.com/doublesymmetry/react-native-track-player/issues/2503) — 5.0.0-alpha0 broken on iOS
- [react-native issue #44255](https://github.com/facebook/react-native/issues/44255) — `RCTDeviceEventEmitter` bridgeless propagation failure (root cause of RNTP Android event loss)
- [kesha-antonov/react-native-background-downloader releases](https://github.com/kesha-antonov/react-native-background-downloader/releases) — v4.4.1 confirms `getExistingDownloadTasks()` API surface change
- [Zustand documentation](https://github.com/pmndrs/zustand) — selector stability requirements, `get()` pattern in actions
- [npm: @kesha-antonov/react-native-background-downloader](https://www.npmjs.com/package/@kesha-antonov/react-native-background-downloader) — version 4.5.3 confirmed current stable
- [SQLite Optimizations for Ultra High-Performance — PowerSync](https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance) — WAL + synchronous=NORMAL practitioner validation

### Tertiary (LOW confidence)

- Expo X post confirming React Native 0.83.2 bundled with SDK 55 — not independently verified against reactnative.dev
- 2025 Expo Spring Hackathon investigation: Metro `inlineRequires` timing differences — relevant to service decomposition cycle safety; single community source

---

_Research completed: 2026-02-28_
_Ready for roadmap: yes_
