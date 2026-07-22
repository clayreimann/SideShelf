# SideShelf Backlog

This is the lightweight backlog for unresolved work with enough context to act on. Product ordering and explicit deferrals live in [the roadmap](ROADMAP.md); durable architectural constraints live in [the decision register](decisions/README.md).

## Architecture Programs

### Support multiple servers and trusted aliases

**Problem:** One mutable base URL currently acts as connection route, server identity, credential scope, and data namespace. That cannot safely support aliases for one server or a unified library across several servers because remote IDs may collide and late responses may cross identity boundaries.

**Approved direction:** Use a server-scoped shared database with stable local server identity, explicit raw remote IDs, per-server credentials and client generations, trusted ordered aliases, independent bounded synchronization, and source-preserving unified queries.

**Next action:** Begin with the identity inventory and migration-foundation specification. Do not start with UI-only server switching or an array of URLs.

See [the complete multi-server and alias design](plans/multi-server-sync-and-aliases.md).

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
