# Pitfalls Research

**Domain:** React Native Expo audiobook app — v1.2 Tech Cleanup milestone
**Researched:** 2026-02-28
**Confidence:** HIGH — grounded in direct codebase analysis, official changelogs, and verified library issue reports

---

## Critical Pitfalls

### Pitfall 1: Expo 55 Mandates New Architecture — react-native-track-player Events Broken in Bridgeless Mode

**What goes wrong:**
Expo SDK 55 drops the Legacy Architecture entirely. React Native 0.83 (bundled in SDK 55) always enables the New Architecture; there is no opt-out. The current codebase uses `react-native-track-player` 4.1.2. In early 4.x builds, events emitted from the headless audio service on Android do not fire when running under the New Architecture bridgeless mode. The coordinator depends critically on `NATIVE_STATE_CHANGED`, `NATIVE_TRACK_CHANGED`, `NATIVE_PROGRESS_UPDATED`, `NATIVE_PLAYBACK_ERROR`, and `NATIVE_QUEUE_ENDED` events. If any of these fail to reach the coordinator, the state machine stalls silently — no user-visible error, just a frozen player state.

**Why it happens:**
The underlying issue is `RCTDeviceEventEmitter` (used by Android's headless service) not propagating events through the bridgeless interop layer. This was a known React Native issue (facebook/react-native#44255, #46050). RNTP fixed this in a subsequent release, but version 4.1.2 (currently installed) predates a confirmed-clean bridgeless fix. The exact minimum version with confirmed bridgeless stability is not pinnable from documentation alone — it requires a test on the actual device post-upgrade.

**How to avoid:**
Before upgrading Expo SDK, upgrade `react-native-track-player` to the latest 4.x release and run the full coordinator event sequence on an Android device: launch → play → skip → seek → pause → resume → queue end. Check the coordinator's `totalEventsProcessed` metric (visible in the diagnostics UI) against the number of expected events. If events are missing, the state machine will reject transitions and `rejectedTransitionCount` will spike with no corresponding action.

**Warning signs:**

- Player plays audio natively (OS controls work) but the coordinator shows stale state in the diagnostics UI
- `rejectedTransitionCount` rises but `stateTransitionCount` stays flat
- `NATIVE_STATE_CHANGED` events absent from the coordinator's transition history during playback
- Android notification controls work but the in-app UI does not update position

**Phase to address:** Expo upgrade phase. Block the Expo bump until RNTP compatibility is verified on Android. iOS is lower risk (bridgeless issues are predominantly Android-side).

---

### Pitfall 2: Expo 55 Changes NativeTabs API — Tab Layout Will Not Compile After Upgrade

**What goes wrong:**
SDK 55 restructures the `NativeTabs` unstable API. In particular, `Icon`, `Label`, and `Badge` sub-components moved to be accessed via `NativeTabs.Trigger.*` — any direct imports of these components from `expo-router/unstable-native-tabs` will fail to resolve post-upgrade. This codebase uses `NativeTabs` in `src/app/(tabs)/_layout.tsx` for the custom tab order / hidden tabs feature. A compile-time import change in a layout file will make the entire tab navigator fail to render, which means the app opens to a blank screen or crashes at startup.

**Why it happens:**
`NativeTabs` is still marked `unstable` in the API surface, meaning it is explicitly not covered by Expo's stability guarantees between SDK versions. The v1.1 milestone made significant investment in the custom tab reorder feature (`tabOrder`, `hiddenTabs` in settingsSlice) that depends directly on this API. SDK 55 also changes `resetOnFocus` (previously `reset`) on headless tabs.

**How to avoid:**
Before running `npx expo install --fix` (which updates package versions), read the SDK 55 changelog's `expo-router` section in full and grep `src/app/(tabs)/_layout.tsx` for all `NativeTabs` API usages. Map each usage against the new API surface. Do this as a pure reading exercise before touching any files — it costs 30 minutes and avoids a silent tab-break that is hard to diagnose in a partially-upgraded state.

**Warning signs:**

- After `npx expo install --fix`, TypeScript errors in `_layout.tsx` referencing `NativeTabs` sub-components
- App opens to blank tab content area with no crash log (layout render fails silently in some Expo versions)
- Custom tab ordering stops working (tabs appear but in hardcoded order)

**Phase to address:** Expo upgrade phase, immediately after running `npx expo install --fix` and before `expo prebuild --clean`.

---

### Pitfall 3: Expo 55 Requires Xcode 26 — Build Fails on Older Xcode Without Clear Error

**What goes wrong:**
SDK 55 (React Native 0.83, Swift Concurrency / MainActor isolation enforcement) requires Xcode 26. Building with an older Xcode produces Swift compiler errors originating in `expo-modules-core`, specifically errors related to `MainActor` isolation — not in application code, but deep in Expo's own iOS layer. The errors look like library bugs, not toolchain issues, causing wasted time investigating RNTP or custom native modules.

**Why it happens:**
Swift 6 strict concurrency checking is enforced by Xcode 26. `expo-modules-core` 55.x uses Swift features that require the newer compiler. The `npm run ios` script already runs `expo prebuild --clean` but prebuild does not check Xcode version — the failure surface is at compile time inside Xcode, after 5-10 minutes of build time.

**How to avoid:**
Run `xcode-select --version` and check the Xcode version before starting the upgrade. If not on Xcode 26, install it first. Do this as the first step of the upgrade phase, before changing any package.json versions.

**Warning signs:**

- Xcode build fails with Swift compiler errors in `expo-modules-core` or other Expo packages
- Errors reference `MainActor` isolation or `async` annotation issues, not in app code
- `expo-modules-core` is not listed in any custom native code and was not recently changed

**Phase to address:** Expo upgrade phase, as a pre-flight check before any code changes.

---

### Pitfall 4: RN Downloader Mainline Renames `checkForExistingDownloads` to `getExistingDownloadTasks` — Silent Runtime Failure

**What goes wrong:**
The codebase is pinned to a custom fork (`github:clayreimann/react-native-background-downloader#spike-event-queue`) of the `@kesha-antonov/react-native-background-downloader` library. The mainline `@kesha-antonov` package uses `getExistingDownloadTasks()` instead of `checkForExistingDownloads()` (the legacy EkoLabs API surface). The `DownloadService.initialize()` method calls `RNBackgroundDownloader.checkForExistingDownloads()` at startup. If the mainline package does not expose this name, the call at `DownloadService.ts:78` returns `undefined` instead of an empty array, and `existingTasks.length` throws `TypeError: Cannot read property 'length' of undefined`. This crashes the download service initialization silently (the error is caught at line 89 and logged but the service marks itself as failed to initialize).

**Why it happens:**
The original EkoLabs fork used `checkForExistingDownloads`. The kesha-antonov fork/rename updated the API surface but the function name changed. The custom fork (`spike-event-queue` branch) may re-expose the old name as an alias or may use the new name — this needs direct inspection of the branch's index.ts before attempting the migration.

**How to avoid:**
Before switching the package.json reference, clone or inspect the `@kesha-antonov/react-native-background-downloader` mainline source and diff its exported API against the current fork's exports. Specifically: compare `checkForExistingDownloads` vs `getExistingDownloadTasks`, compare task lifecycle events (`done`, `error`, `progress`, `begin`) against what `DownloadService.ts:274-330` registers, and compare `setConfig` options (specifically `progressInterval` and `isLogsEnabled` at lines 72-75). Any API surface difference must be adapter-wrapped in `DownloadService.ts` before the fork switch.

**Warning signs:**

- After switching to mainline, `DownloadService` logs `Error during initialization` on startup
- Downloads appear to start but never complete (progress callbacks not registered)
- `isInitialized` stays `false` → subsequent `startDownload` calls call `initialize()` again on every download attempt
- `checkForExistingDownloads is not a function` error in logs

**Phase to address:** RN Downloader migration phase. Treat as API migration, not a simple dependency swap.

---

### Pitfall 5: RN Downloader Migration Breaks iOS Path Repair Logic If Task IDs Change

**What goes wrong:**
The `DownloadService` uses task IDs derived from `libraryItemId` and audio file `ino` to match restored background tasks to in-progress downloads at startup. If the mainline downloader generates task IDs differently (e.g., using a different concatenation format, adding a prefix, or using a UUID), `restoreExistingDownloads()` at line 79 will find existing tasks but fail to match them to any known audio file. The orphaned tasks will re-download files that already exist on disk, doubling bandwidth usage. More critically: if the task completes and `markAudioFileAsDownloaded` is called for a file that already has a correct `localAudioFileDownloads` record, Drizzle's `onConflictDoUpdate` handles the duplicate gracefully — but the progress callbacks will not fire for any UI that was waiting (the original subscription was on the old task ID).

**Why it happens:**
The `spike-event-queue` fork was custom-built for this codebase's event queue pattern. Its task ID format may be a deliberate divergence from the mainline. The mainline's `getExistingDownloadTasks()` returns task objects whose `id` field format is library-defined. If the format differs, the `restoreExistingDownloads` logic (which looks up tasks by ID in `activeDownloads`) will miss all in-flight downloads.

**How to avoid:**
Test the mainline's task ID format by starting a download, force-quitting the app, relaunching, and logging the `id` field from each task returned by `getExistingDownloadTasks()`. Compare this against the IDs stored in `activeDownloads`. If they differ, add a lookup-by-audio-file-path fallback in `restoreExistingDownloads` that matches tasks by comparing the download URL pattern against the expected download URL for each pending audio file.

**Warning signs:**

- After migrating to mainline: restart during active download → files re-download from zero rather than resuming
- `restoreExistingDownloads` logs found X tasks but then immediately logs "no matching download info found" for each one
- `activeDownloads` Map is empty after restart despite files being partially present on disk

**Phase to address:** RN Downloader migration phase. Test specifically with the app-restart-during-download scenario before considering the migration complete.

---

### Pitfall 6: Moving Local State to Zustand Causes Coordinator Event Storms If State Drives Side Effects

**What goes wrong:**
If a component's local `useState` drives a side effect (e.g., `useEffect(() => { doSomething(localVal); }, [localVal])`), moving that state to Zustand without re-examining the effect dependency chain creates a new failure mode: every Zustand subscriber that touches the same slice will now re-trigger the effect. In the player context, the `playerSlice` has high write frequency (position updates at 1Hz from `NATIVE_PROGRESS_UPDATED`). If any component moves local state that depends on player position into Zustand without a precise selector, that component's `useEffect` fires every second — potentially dispatching coordinator events or re-initializing services on each tick.

**Why it happens:**
Local `useState` is component-scoped. Zustand state is process-scoped. A component that reads `useAppStore(state => state.player.position)` will re-render on every position update (once per second during playback). Any `useEffect` that lists this selector's output as a dependency fires once per second. In the current architecture, `playerSlice` position is updated at 1Hz specifically to avoid Zustand re-render storms — the `NATIVE_PROGRESS_UPDATED` event uses a separate "position-only" sync path (`syncPositionToStore`). Any new Zustand state that incorrectly listens to `state.player.position` directly in a `useEffect` dependency array breaks this two-tier sync guarantee.

**How to avoid:**
Audit every `useEffect` in the component being refactored: replace any `state.player.position` dependency with a stable value (e.g., `state.player.currentChapter?.id`) or remove the dependency if the effect does not actually need to track position. Use `useAppStore.getState().player.position` inside the effect body (snapshot access) rather than subscribing to it. If the effect truly needs to react to position, use `subscribeWithSelector` outside React (in a service) rather than in a component effect.

**Warning signs:**

- After moving state to Zustand: performance profiler shows the affected component re-rendering at 1Hz during playback
- Coordinator `totalEventsProcessed` spikes during playback (events being dispatched from component effects)
- Excessive network requests or DB writes correlating with playback (1Hz side effect firing)

**Phase to address:** State audit phase. For any component state being centralized, write a test that verifies the component does not re-render during normal position-update ticks before committing the change.

---

### Pitfall 7: Zustand Slice Actions Captured in Closures Become Stale If Not Accessed via `get()`

**What goes wrong:**
When adding new Zustand slice actions that internally call other slice methods (e.g., a new action in `downloadSlice` that calls `get().startDownload()` or references state from `playerSlice`), the action must use `get()` to access current state — not a closure over the initial `state` parameter. If a new action is written as:

```typescript
const myAction = (id: string) => {
  if (state.downloads.initialized) {
    // BUG: `state` is stale
    downloadService.startDownload(id);
  }
};
```

...the `state` reference is from slice creation time (always the initial state). The action will always see `initialized: false` even after initialization completes.

**Why it happens:**
The slice creator pattern `(set, get) => ({...})` requires `get()` to read current state inside actions. This is well-documented in the Zustand README but easy to miss when copying action patterns from a code base where the distinction matters less (e.g., actions that only call `set()` without reading state first). The v1.2 audit will produce new actions in existing slices — each one is a chance to introduce a stale closure if `get()` is forgotten.

**How to avoid:**
Every new action body that reads state before calling `set()` must use `const state = get()` at the start of the action, not a closure variable. In the existing codebase, this pattern is already consistently applied (e.g., `downloadSlice.ts:97-98`). New actions added during the audit should copy this exact pattern. Add ESLint or a code-review checklist item: "Does this action read state? If yes, does it use `get()` not a closure?"

**Warning signs:**

- New action always behaves as if slice is uninitialized regardless of app state
- Action fires successfully in unit tests (where initial state is the test's setup state) but fails silently in production
- Condition checks on slice state inside new actions always evaluate to their initial values

**Phase to address:** State audit and centralization phase.

---

## Moderate Pitfalls

### Pitfall 8: SQLite `ALTER TABLE ADD COLUMN NOT NULL` Fails on Existing Rows Without a Default

**What goes wrong:**
Drizzle generates a migration like `ALTER TABLE audio_files ADD COLUMN new_col text NOT NULL` when a new required column is added to a schema without a `.default()`. In PostgreSQL, this is handled with a table rewrite. In SQLite (used by `expo-sqlite`), adding a `NOT NULL` column without a `DEFAULT` clause raises `table audio_files has N rows of data but only M values provided` and the migration fails. When Drizzle's migration runner on `expo-sqlite` encounters this error mid-migration, the migration is not marked as applied, but any DDL statements that ran before the failure have already executed (SQLite DDL is not transactional in older SQLite versions). The database can end up in a half-migrated state.

**Why it happens:**
The codebase already has 12 migration files — the pattern of adding optional columns (`ALTER TABLE ... ADD ... integer`) is established. Adding a genuinely non-null column without a SQLite-compatible default is a first-time edge case that has not been encountered yet. The schema audit phase may identify columns that "should be" NOT NULL but currently have NULL values in production databases.

**How to avoid:**
For any new column added to an existing table, always add a SQLite-compatible `.default()` in the Drizzle schema definition — even if the application logic would never store NULL. Use the `DEFAULT` to make the migration safe, then enforce the constraint in application code or helpers. Run `drizzle-kit generate` on a copy of the database with existing rows before shipping any migration, not just on an empty test database. The migration file should be inspected for `NOT NULL` without `DEFAULT` before merging.

**Warning signs:**

- Migration runner throws `table has N rows of data but only M values provided` on app startup
- App starts but some features are missing (migrated to the partially-applied state)
- `migrations.js` does not show the new migration as applied, but attempting to re-run it fails because some statements already executed

**Phase to address:** DB audit phase. Review every schema file for columns that would generate a `NOT NULL` without `DEFAULT` migration, and add a safe default before generating.

---

### Pitfall 9: DB Index Migration Locks the Table for Multi-Second Reads on Large Libraries

**What goes wrong:**
`CREATE INDEX` on a table with hundreds of thousands of rows blocks all other read/write operations on that table for the duration of the index build. The `local_listening_sessions` and `local_progress_snapshots` tables in a power user's database could contain tens of thousands of rows (hourly progress snapshots for a large library). The index creation runs during `migrate()` at app startup — before the user sees the home screen. On a mid-range Android device with older storage, a multi-column index on `local_progress_snapshots(sessionId, timestamp)` could take 2-4 seconds, during which any concurrent DB query (e.g., `initializeDownloads` running in parallel) will be blocked.

**Why it happens:**
`expo-sqlite` runs on a single-file SQLite database. SQLite's `CREATE INDEX` requires a full table scan and acquires a write lock. There is no `CREATE INDEX CONCURRENTLY` in SQLite (that is a PostgreSQL feature). Drizzle's `migrate()` runs all pending migrations synchronously in sequence.

**How to avoid:**
Add indexes only where query analysis confirms they are needed (check `EXPLAIN QUERY PLAN` output first). Prefer `CREATE INDEX IF NOT EXISTS` in the migration SQL to make it safe to re-run. For very large tables, consider whether the index should be created in a deferred background task rather than synchronously in `migrate()`. Measure migration time on a database seeded with realistic row counts before shipping.

**Warning signs:**

- App startup takes 2-4 seconds longer after deploying the migration
- `initializeDownloads` or `initializeLibrarySlice` timeout or return stale data on first run after upgrade

**Phase to address:** DB audit phase.

---

### Pitfall 10: PlayerService Decomposition Creates a New Import Cycle if Helpers Import from the Service

**What goes wrong:**
The current dependency graph for `PlayerService.ts` imports from `DownloadService`, `ProgressService`, `coordinator/PlayerStateCoordinator`, and `coordinator/eventBus`. If `PlayerService` is split into domain-specific files (e.g., `playerPlaybackHelpers.ts`, `playerTrackHelpers.ts`), any helper that needs to call back into the coordinator or dispatch events will import `dispatchPlayerEvent` from `eventBus.ts`. This is safe — the eventBus is a leaf node with no upstream imports. However, if a helper is written to import `PlayerService.getInstance()` to call another method (the "split but not refactored" pattern), a cycle is introduced: `PlayerService` → `playerTrackHelpers` → `PlayerService`.

**Why it happens:**
Large service files are split by copy-pasting methods into helper files. Methods that call `this.someOtherMethod()` are rewritten to call `PlayerService.getInstance().someOtherMethod()` to avoid passing `this` as a parameter. This is the fastest path to a split that compiles, and it introduces a hidden singleton cycle that Metro bundler resolves non-deterministically (one import may be `undefined` at module evaluation time).

**How to avoid:**
When splitting `PlayerService`, use pure function helpers that take explicit arguments — they should not import the service class. If a helper needs coordinator access, it should accept the coordinator or `dispatchPlayerEvent` as a parameter, not import them directly (they are already available at the `PlayerService` call site). Use `eslint-plugin-import/no-cycle` to fail the build on any new import cycle introduced during the split.

**Warning signs:**

- After splitting, a method in the new helper file throws `TypeError: PlayerService.getInstance is not a function` or similar at startup
- Jest imports of the helper file trigger "circular dependency" warnings in the test runner
- `dispatchPlayerEvent` is `undefined` in a helper file that imports it at module top level (the cycle resolved in the wrong order)

**Phase to address:** PlayerService decomposition phase. Run `npx dpdm --circular src/services/PlayerService.ts` before and after each file split to verify no cycles are introduced.

---

### Pitfall 11: `useCallback` Anti-Pattern in Zustand Selectors Creates Unnecessary Re-renders on Centralized State

**What goes wrong:**
When component local state is moved to Zustand, the refactoring often introduces object-returning selectors:

```typescript
const { activeDownloads, isLoading } = useAppStore((state) => ({
  activeDownloads: state.downloads.activeDownloads,
  isLoading: state.downloads.isLoading,
}));
```

Zustand uses strict equality (`===`) to compare the selector's return value. An object literal returned from a selector is always a new reference — so every store update (including unrelated slices like position ticks from `playerSlice`) re-renders the component. The existing codebase correctly uses individual selectors in the `use*` hooks in `appStore.ts`, but new components added during the audit may not follow this pattern.

**How to avoid:**
Use individual selectors, one per state field:

```typescript
const activeDownloads = useAppStore((state) => state.downloads.activeDownloads);
const isLoading = useAppStore((state) => state.downloads.isLoading);
```

Or use `useShallow` if multiple fields from the same slice are needed in an object. The existing slice hooks (`useDownloads()`, `useSettings()`, `usePlayer()`) already wrap state in `React.useMemo` with individual selectors — new code should use these hooks rather than writing new object-returning selectors inline.

**Warning signs:**

- Component profiler shows re-renders at 1Hz during playback (position ticks triggering everything)
- React DevTools "Why did this render?" shows `store` as the cause on every tick

**Phase to address:** State audit phase. Code review checklist: "Does this component use an object-returning selector? If yes, convert to individual selectors or use the existing slice hook."

---

### Pitfall 12: Expo Upgrade Invalidates All Prebuild Artifacts — Custom Plugin Must Re-Run Correctly

**What goes wrong:**
The `withExcludeFromBackup` plugin (added in v1.1) copies `ICloudBackupExclusion.m` and `ICloudBackupExclusion.h` into `ios/SideShelf/Modules/` and registers them in the Xcode project during `expo prebuild`. After upgrading Expo SDK, `expo prebuild --clean` wipes the `ios/` directory entirely and regenerates it. The plugin must re-run cleanly for the native module to be available. If the plugin has any path assumptions or version-specific Xcode project structure assumptions, it may silently fail to register the files in the new Xcode project format — `NativeModules.ICloudBackupExclusion` resolves to `null` again, and iCloud exclusion silently stops working.

**Why it happens:**
Expo config plugins use `@expo/config-plugins` APIs that may change between SDK versions. The Xcode project format also evolves. A plugin that worked with SDK 54's Xcode project structure may produce incorrect Xcode project modifications for SDK 55's structure.

**How to avoid:**
After the Expo upgrade and `expo prebuild --clean`, verify that `ios/SideShelf/Modules/ICloudBackupExclusion.m` exists in the new `ios/` directory. Run the app and check that `NativeModules.ICloudBackupExclusion` is not null (add a log line to `iCloudBackupExclusion.ts` at startup if needed). Do not assume the prebuild succeeded because it produced no errors — the plugin could write files but fail to register them in the Xcode project.

**Warning signs:**

- After Expo upgrade and prebuild, iCloud exclusion logs show "ICloudBackupExclusion module not available" (from the null-check guard in `iCloudBackupExclusion.ts`)
- `ios/SideShelf/Modules/` directory is absent after prebuild
- The Xcode project (`ios/SideShelf.xcodeproj/project.pbxproj`) does not contain `ICloudBackupExclusion` references

**Phase to address:** Expo upgrade phase. This is a post-prebuild verification step that must be checked before marking the Expo upgrade complete.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut                                                         | Immediate Benefit                               | Long-term Cost                                                                             | When Acceptable                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Object-returning Zustand selector                                | Less boilerplate                                | Re-renders on every store tick, breaks `playerSlice` two-tier sync                         | Never — use individual selectors or `useShallow`                              |
| Calling `PlayerService.getInstance()` inside a split helper file | Avoids refactoring `this` references            | Hidden singleton import cycle; Metro resolution is non-deterministic                       | Never during decomposition — pass dependencies explicitly                     |
| `ALTER TABLE ADD COLUMN NOT NULL` without `DEFAULT`              | Mirrors intended constraint                     | Migration fails on existing rows; database left in half-migrated state                     | Never — always add a SQLite-safe default                                      |
| Skipping `expo-doctor` after SDK bump                            | Faster iteration                                | Missing dependency mismatches surface as runtime errors, not build errors                  | Never — run `expo-doctor` immediately after `npx expo install --fix`          |
| Testing only on iOS simulator after Expo upgrade                 | RNTP + coordinator events easy to verify on iOS | Android bridgeless event routing is a different code path — silent failure on Android only | Never — verify coordinator event sequence on physical Android before shipping |

---

## Integration Gotchas

Common mistakes when connecting to external services or libraries.

| Integration                                                  | Common Mistake                                    | Correct Approach                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kesha-antonov/react-native-background-downloader` mainline | Treat as drop-in swap of the fork                 | Diff the exported API surface; adapter-wrap changed method names in `DownloadService.ts` before switching the package reference               |
| `react-native-track-player` 4.x post-New Architecture        | Assume 4.1.2 behavior is stable on SDK 55         | Upgrade RNTP first, separately from Expo SDK bump; verify all coordinator event types fire on Android before combining upgrades               |
| Drizzle `migrate()` on live user database                    | Test only on empty database during development    | Seed a test database with realistic row counts; run `EXPLAIN QUERY PLAN` on common queries before adding indexes                              |
| Expo config plugin `withExcludeFromBackup`                   | Assume prebuild success = plugin success          | Post-prebuild, verify `ios/SideShelf/Modules/ICloudBackupExclusion.m` exists and `NativeModules.ICloudBackupExclusion` is not null at runtime |
| Zustand slice actions calling other slices                   | Use closure variables for cross-slice state reads | Always call `get()` inside the action body to access current state; cross-slice reads via `get()` are documented behavior                     |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap                                                               | Symptoms                                                                      | Prevention                                                                               | When It Breaks                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| `CREATE INDEX` in startup migration                                | 2-4s hang on first app open after upgrade for power users                     | Measure on a seeded database; consider deferred creation for large tables                | Libraries > ~5,000 rows in indexed table |
| Object selector in Zustand on position-heavy slice                 | Component re-renders 1Hz during playback regardless of what it actually needs | Individual selectors; use existing `use*()` hooks                                        | Any playback session                     |
| Full table scan in `initializeDownloads` without index             | Startup slows linearly with downloaded item count                             | Add indexes on join columns: `audioFiles.mediaId`, `localAudioFileDownloads.audioFileId` | Libraries > ~500 downloaded items        |
| `verifyFileExists` in startup reconciliation scan with no batching | JS thread blocked for several seconds with large downloaded libraries         | Batch 20 items per tick with `await new Promise(r => setTimeout(r, 0))` between batches  | Libraries > ~100 downloaded books        |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Expo upgrade:** `expo-doctor` passes with no warnings — do not skip, dependency mismatches are silent until runtime
- [ ] **Expo upgrade:** Physical Android device confirms coordinator receives all event types during a full play → seek → pause → resume → queue-end session
- [ ] **Expo upgrade:** `NativeModules.ICloudBackupExclusion` is not null on device after `expo prebuild --clean`
- [ ] **Expo upgrade:** `NativeTabs` custom tab order and hidden tabs still work after SDK bump (v1.1 feature)
- [ ] **RN Downloader migration:** App-restart-during-active-download test: kill app mid-download → relaunch → download resumes from where it stopped (not from zero)
- [ ] **RN Downloader migration:** `checkForExistingDownloads` (or its mainline equivalent) returns the expected task type and the `done`/`error`/`progress` callbacks register correctly
- [ ] **State audit:** No component that subscribes to `state.player.position` has a `useEffect` with position in its dependency array (would fire 1Hz during playback)
- [ ] **State audit:** Every new slice action that reads state before calling `set()` uses `get()` not a closure variable
- [ ] **DB audit:** Every `ALTER TABLE ADD COLUMN` migration generated has a `DEFAULT` clause (no NOT NULL without DEFAULT)
- [ ] **PlayerService decomposition:** `npx dpdm --circular src/services/PlayerService.ts` reports no new circular dependencies vs pre-decomposition baseline

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall                                       | Recovery Cost | Recovery Steps                                                                                                                                                                                    |
| --------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinator silent event loss after SDK bump  | HIGH          | Revert to Expo 54 by restoring `package.json` and `ios/` from git; upgrade RNTP independently; retest; retry Expo bump                                                                            |
| NativeTabs API break after SDK bump           | MEDIUM        | Restore `_layout.tsx` from git; read SDK 55 changelog `expo-router` section; patch API usage; rebuild                                                                                             |
| Half-migrated SQLite database on user device  | HIGH          | Requires manual migration recovery helper (drop/recreate affected table using `getSQLiteDb().execSync`); cannot be patched remotely via OTA update; user must reinstall or receive a hotfix build |
| Import cycle from PlayerService decomposition | LOW           | `git revert` the split commit; re-split using explicit argument passing rather than singleton access                                                                                              |
| Re-render storm from object selector          | LOW           | Convert to individual selectors; existing `use*()` hooks already have the correct pattern — inline selectors should be replaced with hook calls                                                   |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall                                                        | Prevention Phase                                | Verification                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| RNTP events broken in bridgeless mode (Pitfall 1)              | Expo upgrade phase                              | Play → seek → pause → queue-end on physical Android; check `totalEventsProcessed` in diagnostics     |
| NativeTabs API break (Pitfall 2)                               | Expo upgrade phase (pre-flight)                 | TypeScript compiles cleanly; custom tab order works in UI                                            |
| Xcode version requirement (Pitfall 3)                          | Expo upgrade phase (pre-flight checklist)       | `xcode-select --version` before any code changes                                                     |
| Downloader API surface mismatch (Pitfall 4)                    | RN Downloader migration phase                   | `DownloadService.initialize()` completes without error; existing tasks detected on restart           |
| Task ID format change breaking restart recovery (Pitfall 5)    | RN Downloader migration phase                   | Kill-and-restart mid-download test                                                                   |
| Coordinator event storms from Zustand side effects (Pitfall 6) | State audit phase                               | React profiler shows component does not re-render at 1Hz during playback                             |
| Stale closure in new slice actions (Pitfall 7)                 | State audit phase                               | Unit test: action called after initialization reads current state, not initial state                 |
| NOT NULL column migration fails on existing rows (Pitfall 8)   | DB audit phase                                  | Run migration on seeded test database before shipping                                                |
| Index creation blocking startup (Pitfall 9)                    | DB audit phase                                  | Time startup with realistic row counts (5,000+ in indexed tables)                                    |
| Import cycle from service decomposition (Pitfall 10)           | PlayerService decomposition phase               | `dpdm --circular` baseline + post-split comparison                                                   |
| Object-returning selector re-renders (Pitfall 11)              | State audit phase                               | React DevTools profiler during playback: target component render frequency                           |
| iCloud exclusion plugin regression after prebuild (Pitfall 12) | Expo upgrade phase (post-prebuild verification) | Check `ios/SideShelf/Modules/` contents; runtime null check on `NativeModules.ICloudBackupExclusion` |

---

## Sources

### Direct Codebase Analysis (HIGH confidence)

- `src/services/DownloadService.ts` — `checkForExistingDownloads` call at line 78; `restoreExistingDownloads` logic; `setConfig` options at lines 72-75; `done` callback at lines 275-330; task ID usage
- `src/services/coordinator/PlayerStateCoordinator.ts` — event type dependencies (`NATIVE_STATE_CHANGED`, `NATIVE_TRACK_CHANGED`, `NATIVE_PROGRESS_UPDATED`); two-tier sync: `syncPositionToStore` vs `syncStateToStore`; `totalEventsProcessed` metric
- `src/services/coordinator/eventBus.ts` — leaf node with no upstream service imports; `dispatchPlayerEvent` is the safe decoupling point for split service helpers
- `src/stores/appStore.ts` — existing `use*()` hooks use individual selectors + `React.useMemo` (the correct pattern); `useDownloads.isItemPartiallyDownloaded` uses `useAppStore.getState()` snapshot access (correct pattern)
- `src/stores/slices/downloadSlice.ts` — correct `get()` usage in all existing actions (lines 97-98, 205-207); `initializeDownloads` query pattern (multi-join without indexes)
- `src/db/schema/audioFiles.ts`, `localData.ts` — no existing indexes on join columns (`mediaId`, `audioFileId`)
- `src/db/migrations/` — 12 existing migration files; all use `ADD COLUMN ... DEFAULT` for non-null additions; this pattern is established
- `src/db/helpers/migrationHelpers.ts` — precedent for data-preservation helper before destructive migration; pattern should be reused if any schema changes require data transformation
- `package.json` — `"@kesha-antonov/react-native-background-downloader": "github:clayreimann/react-native-background-downloader#spike-event-queue"` — confirms custom fork, non-standard branch name

### Official Documentation (HIGH confidence)

- Expo SDK 55 changelog: New Architecture required (Old Architecture removed); NativeTabs `Icon/Label/Badge` moved to `NativeTabs.Trigger.*`; `resetOnFocus` replaces `reset` on headless tabs; Xcode 26 required — [expo.dev/changelog/sdk-55](https://expo.dev/changelog/sdk-55)
- Expo "How to upgrade to SDK 55" — `npx expo install --fix` + `expo-doctor` workflow; delete `android/` and `ios/` before prebuild — [expo.dev/blog/upgrading-to-sdk-55](https://expo.dev/blog/upgrading-to-sdk-55)
- Zustand documentation — selectors with object returns trigger re-renders on every store update; `useShallow` or individual selectors required for stability — [github.com/pmndrs/zustand](https://github.com/pmndrs/zustand)

### Library Issues and Community (MEDIUM confidence)

- react-native-track-player issue #2443: New Architecture support tracking — [github.com/doublesymmetry/react-native-track-player/issues/2443](https://github.com/doublesymmetry/react-native-track-player/issues/2443)
- react-native-track-player issue #2389: Crash with RN 0.76 (New Architecture) — confirmed as a real compatibility risk for older 4.x versions — [github.com/doublesymmetry/react-native-track-player/issues/2389](https://github.com/doublesymmetry/react-native-track-player/issues/2389)
- facebook/react-native #44255, #46050: `RCTDeviceEventEmitter` events not propagating from headless tasks in bridgeless mode — root cause of RNTP event loss on Android New Architecture — [github.com/facebook/react-native/issues/44255](https://github.com/facebook/react-native/issues/44255)
- expo/expo issue #42525: Swift MainActor isolation build failures with Xcode 15+ and expo-modules-core 55.x — [github.com/expo/expo/issues/42525](https://github.com/expo/expo/issues/42525)
- expo/expo issue #39587: NativeTabs animation property on Tabs broke navigation in SDK 54 — precedent for NativeTabs API instability across SDK bumps — [github.com/expo/expo/issues/39587](https://github.com/expo/expo/issues/39587)
- kesha-antonov/react-native-background-downloader releases: v4.4.1 fix for `getExistingDownloadTasks()` not returning paused tasks after restart — confirms API surface change from `checkForExistingDownloads` — [github.com/kesha-antonov/react-native-background-downloader/releases](https://github.com/kesha-antonov/react-native-background-downloader/releases)
- 2025 Expo Spring Hackathon investigation: Metro `inlineRequires` timing differences between Expo and RN CLI can make circular dependency resolution non-deterministic — directly relevant to service decomposition safety

---

_Pitfalls research for: v1.2 Tech Cleanup milestone_
_Researched: 2026-02-28_
