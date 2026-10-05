# SideShelf Backlog

This is the lightweight backlog for unresolved work with enough context to act on. Product ordering and explicit deferrals live in [the roadmap](ROADMAP.md); durable architectural constraints live in [the decision register](decisions/README.md).

## Architecture Programs

### Support multiple servers and trusted aliases

**Problem:** One mutable base URL currently acts as connection route, server identity, credential scope, and data namespace. That cannot safely support aliases for one server or a unified library across several servers because remote IDs may collide and late responses may cross identity boundaries.

**Approved direction:** Use a server-scoped shared database with stable local server identity, explicit raw remote IDs, per-server credentials and client generations, trusted ordered aliases, independent bounded synchronization, and source-preserving unified queries.

**Next action:** Begin with the identity inventory and migration-foundation specification. Do not start with UI-only server switching or an array of URLs.

See [the complete multi-server and alias design](plans/multi-server-sync-and-aliases.md).

## Session Boundaries

### Clear remaining session state on logout and server switch

**Context:** Logging out and into a different server showed the previous server's libraries with a stale, unusable selection. That was fixed by wiping `libraries`, `library_files`, and `languages`, clearing `abs.selectedLibraryId`, pruning libraries the server no longer reports, and wiping before resetting slices in `clearUserData()`. A code review of the same paths found the leftovers below. Line references are from that review; re-verify before acting.

**Remaining problems:**

- **Playback continues after logout.** Neither `logout()` nor `clearUserData()` (`src/providers/AuthProvider.tsx`) stops the player. The previous account's track keeps playing with its already-issued credentials, and lock-screen controls still work.
- **Persisted player state survives logout.** `abs.currentTrack`, `abs.position`, `abs.positionUpdatedAt`, `abs.isPlaying`, `abs.currentPlaySessionId`, `abs.sleepTimer`, and `abs.jumpHistorySession` (`src/lib/asyncStore.ts`) are only removed by Reset App. `restorePersistedState()` (`playerSlice.ts`) runs on cold start (`src/index.ts`) and on long resume (`src/app/_layout.tsx`) without checking identity, so the next account sees the previous user's book in the mini-player. Pressing play starts a session for the old item ID on the new server, or plays the old account's downloaded files.
- **Downloads are not scoped to the session.**
  - `local_audio_file_downloads`, `local_library_file_downloads`, and the files under `downloads/<libraryItemId>` survive logout.
  - The storage screen's inner joins hide them, and `orphanScanner` treats rows that still exist as owned, so the space cannot be reclaimed from the UI.
  - Active downloads are not cancelled.
  - `downloads.initialized` stays true, so stale "downloaded" badges remain in memory.
  - Product decision needed: delete downloads on server switch, or retain them for the same server. Audio and library file IDs are deterministic, so downloads reattach after re-login to the same server.
- **Cover cache is not cleared.** `local_cover_cache` rows and `Paths.cache/covers/<libraryItemId>` files are kept. The cache is keyed only by item ID, which assumes IDs are unique across servers.
- **Slices are not reset.** `resetDownloads`, `resetStatistics`, and `resetNetwork` exist but `clearUserData()` does not call them. Statistics counts go stale, and network reachability keeps polling the old base URL until login sets the new one.
- **Pruned libraries leave orphan items.** `_refetchLibraries` now deletes libraries the server no longer reports, but their `library_items` (and descendants) remain until the next logout, because foreign-key cascades are not enforced (see [Audit SQLite foreign-key enablement](#audit-sqlite-foreign-key-enablement)).
- **Reset App gaps.** `src/app/(tabs)/more/actions.tsx` deletes the DB but leaves downloaded files on disk, calls `clearAllLocalCovers()` twice, and does not cancel downloads or reset the player and download slices.

**Suggested direction:** Make one awaited session-teardown path in `AuthProvider` serve logout, server switch, and a different-user login. It should stop the player and clear its persisted keys, cancel downloads, apply the chosen download policy, clear covers, wipe the DB, and only then reset every user-scoped slice. Gate `restorePersistedState()` on a matching identity.

**Acceptance:** A test-backed teardown in which logging out and into a different server shows no previous-server libraries, items, covers, player state, download badges, or statistics, and stops playback. The download policy is documented, and a Maestro flow covers logout → login to a second server.

## Localization

### Add Spanish progress-toast translations

**Problem:** `player.progressToast.label` and `player.progressToast.undo` exist in `src/i18n/locales/en.ts` but not `es.ts`. Locale key parity therefore fails type checking and Spanish users fall back to English.

**Affected files:** `src/i18n/locales/en.ts`, `src/i18n/locales/es.ts`, `src/i18n/index.ts`.

**Acceptance:** Both dictionaries expose the same progress-toast keys, the Spanish copy is reviewed, and the existing translation-dictionary type check passes.

### Internationalize FullScreenPlayer display strings

**Problem:** The visible Speed, Bookmark, Sleep Timer, and bookmark-title prompt text still contains hardcoded English. Accessibility labels that share this text must stay aligned with the visible copy.

**Affected files:** `src/app/FullScreenPlayer/index.tsx`, both locale dictionaries.

**Acceptance:** No user-visible English literal remains for these controls, both locale dictionaries have identical keys, and visible/a11y labels use the same translation key.

### Internationalize More and diagnostics screens

**Problem:** More-tab utilities and diagnostics contain hardcoded English buttons, headings, placeholders, menu actions, and accessibility labels.

**Affected areas:** logs, tab-bar settings, storage, bundle loader, trace dump detail, library statistics, coordinator/trace diagnostics, and bookmark rename/delete UI.

**Acceptance:** A literal sweep replaces visible and accessibility copy together, English and Spanish key sets remain identical, and scoped screen tests/type checks pass.

See [the localization guide](LOCALIZATION.md) for dictionary conventions.

## Playback Investigation

### Reproduce simulator hot-reload queue reconstruction

**Problem:** A prior simulator session showed a native queue mismatch, transient position zero, duplicate local-session uploads, and late queue-rebuild events after hot reload. The symptom was never confirmed on a cold launch or physical device.

**Affected areas:** `PlayerService`, `PlayerStateCoordinator`, `ProgressService`, `PlayerBackgroundService`, and trace dumps.

**Acceptance:** Capture one trace from a clean install and one from a hot reload; determine whether the behavior is simulator-only. File a code change only if evidence identifies a production-reachable invariant violation. Preserve the coordinator-owned queue reconstruction and restored-position guard documented in [the decision register](decisions/README.md#queue-reconstruction-stays-coordinator-owned).

### Audit SQLite foreign-key enablement

**Problem:** Production and test clients do not enable `PRAGMA foreign_keys`; declared cascades are therefore documentation rather than runtime enforcement. Existing data may contain latent violations, so enabling the pragma without an audit is unsafe.

**Affected areas:** `src/db/client.ts`, `src/__tests__/utils/testDb.ts`, every declared foreign key, migrations, `wipeUserData()`, and `local_progress_snapshots`.

**Acceptance:** Inventory violations on upgraded databases, define any cleanup migration, prove test/production pragma parity, and only then decide whether to enable enforcement. Until that work lands, explicit child-before-parent deletion remains required.

See [durable progress synchronization](plans/stale-token-progress-sync.md#foreign-keys-and-logout).

### Reassess further ProgressService decomposition

**Problem:** ProgressService still spans session lifecycle, local calculation, restoration coordination, and worker notification. Further splitting may improve isolation, but the progress-sync worker already removed server-delivery ownership.

**Acceptance:** Apply the testability test from [the decision register](decisions/README.md#decompose-services-for-isolation-not-line-count). Split only responsibilities that cannot be tested without unrelated mocks, keep mutable state in the facade, maintain at least the existing coverage, and verify service import cycles before and after.

## Device Validation

### Verify Android now-playing artwork updates

**Problem:** React Native Track Player issue #2287 may prevent artwork refresh through `updateMetadataForTrack` on Android. The behavior was not reproduced because prior work lacked an Android device.

**Acceptance:** Exercise seek/chapter changes, restored playback, and repaired cover art on a supported physical Android device. If it reproduces, record the supported-version impact and upstream issue rather than adding an unverified TypeScript workaround.

## Upstream Contribution

### Make the AirPlay picker icon resizable

**Problem:** `@douglowder/expo-av-route-picker-view` grows its component padding without scaling the native route-picker icon.

**Affected area:** The upstream iOS native module used by `src/components/ui/AirPlayButton.tsx`.

**Acceptance:** Confirm current upstream behavior, add an explicit icon-size or bounds-respecting implementation with native tests/example coverage, verify SideShelf on a physical AirPlay-capable device, and submit the change upstream. Do not fork the package in SideShelf solely for this cosmetic issue.
