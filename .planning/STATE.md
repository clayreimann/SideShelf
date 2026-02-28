# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.
**Current focus:** Milestone v1.1 — Phase 9: Navigation & UI Polish (in progress)

## Current Position

Phase: 9 of 9 (v1.1: Navigation & UI Polish — plans 01, 02, 03 done)
Next: Phase 9 complete — all plans done
Status: Phase 9 in progress; plans 01, 02, 03 complete
Last activity: 2026-02-28 — Phase 9 Plan 02 complete (skeleton home screen, tab drag handle)

Progress: [█████████░] ~80% (v1.0 complete; Phases 6-7 complete)

## Performance Metrics

**Velocity (v1.0):**

- Total plans completed: 16 (Phases 2–5 including 03.1)
- Average duration: not tracked
- Total execution time: ~1 month

**By Phase (v1.0):**

| Phase | Plans | Status   |
| ----- | ----- | -------- |
| 2     | 2/2   | Complete |
| 3     | 2/2   | Complete |
| 03.1  | 2/2   | Complete |
| 4     | 3/3   | Complete |
| 5     | 6/6   | Complete |

_v1.1 metrics will be tracked per phase_

| Phase 07 P01 | 3 min | 3 tasks | 3 files |
| Phase 07 P02 | 2 min | 2 tasks | 3 files |
| Phase 07 P03 | 4 min | 2 tasks | 2 files |
| Phase 08-skip-player-polish P01 | 2 | 1 tasks | 1 files |
| Phase 08-skip-player-polish P02 | 2 min | 2 tasks | 2 files |
| Phase 08-skip-player-polish P03 | device session | 2 tasks | 3 files |
| Phase 09-navigation-ui-polish P03 | 2 | 2 tasks | 2 files |
| Phase 09-navigation-ui-polish P02 | 4 | 2 tasks | 4 files |
| Phase 09-navigation-ui-polish P01 | 5 min | 3 tasks | 4 files |

## Accumulated Context

### Decisions (v1.0 — carried forward)

Decisions are logged in PROJECT.md Key Decisions table.

- [Phase 1]: Keep custom FSM over XState — production-validated, XState adds 16.7 kB with no functional gain
- [Phase 1]: observerMode flag preserved as instant rollback (v1.0 done; flag survives as safety net)
- [Phase 05, Plan 06]: startSessionLocks mutex removed — coordinator serial queue + BGS existingSession guard provide equivalent protection
- [Phase 3.1]: shouldOpenOnLongPress on MenuView — short press = skip action; skip action itself untested — SKIP-01 in v1.1

### Decisions (v1.1)

- [Phase 6, Plan 01]: Use require() (no extension) for withExcludeFromBackup in app.config.js — CommonJS, Node resolves .js before .ts
- [Phase 6, Plan 01]: Pass withExcludeFromBackup as bare function reference (not array) — plugin takes no options
- [Phase 6, Plan 01]: Best-effort iCloud exclusion — warn on failure, never throw; download/repair correctness is independent of backup exclusion
- [Phase 6, Plan 02]: Normalize file:// URLs before passing to [NSURL fileURLWithPath:] — strip scheme and decodeURIComponent in TypeScript wrapper, not Obj-C
- [Phase 7, Plan 01]: isDownloadActive covers both active and paused downloads (paused items stay in activeDownloads Map) — single guard sufficient for reconciliation scan
- [Phase 7, Plan 01]: Dynamic import of appStore inside runDownloadReconciliationScan to avoid circular dependency with DownloadService
- [Phase 7, Plan 02]: isItemPartiallyDownloaded uses useCallback + useAppStore.getState() snapshot read — matches existing isItemDownloaded pattern in useDownloads
- [Phase 7, Plan 02]: Partial badge placed top-left (amber) to avoid overlap with top-right offline icon; partial menu action replaces normal download action for partially-downloaded items
- [Phase 7, Plan 03]: Include both audio file and library file download paths in orphan scanner known-paths set — covers all download types
- [Phase 7, Plan 03]: URI normalization with decodeURIComponent fallback for robust orphan matching across percent-encoded filenames
- [Phase 8, Plan 01]: useSettings() from Zustand replaces AsyncStorage direct reads in FullScreenPlayer — settingsSlice.initializeSettings runs at app startup so values are always ready before FullScreenPlayer mounts
- [Phase 8, Plan 01]: handleJumpForward/handleJumpBackward both seek AND persist — long-press interval selection immediately becomes the new default
- [Phase 8, Plan 02]: SEEK_COMPLETE dispatched in executeSeek (not seekTo public API) — keeps event dispatch at the execution layer where TrackPlayer.seekTo actually runs
- [Phase 8, Plan 02]: syncStateToStore SEEK_COMPLETE branch is unconditional (no debounce, no guard) — every skip produces exactly one lock screen refresh regardless of chapter boundary
- [Phase 8, Plan 03]: SkipButton architecture changed to Pressable-outside-MenuView with programmatic ref.show() — shouldOpenOnLongPress alone was insufficient on iOS 18 to prevent UIContextMenuInteraction from swallowing short taps
- [Phase 8, Plan 03]: suppressNextPress ref on SkipButton prevents onPress firing on long-press release
- [Phase 8, Plan 03]: Long-press interval selection changed to one-time apply (does not persist) — Settings controls the default; long press is a per-skip override
- [Phase 8, Plan 03]: Cover art fix in PlayerService is partial — local imageUrl paths may be stale after iOS app updates; getCoverUri() always current; full fix deferred to Phase 9
- [Phase 9, Plan 03]: Dynamic imports inside repairMissingCoverArt() body to break circular dependency: mediaMetadata.ts imports covers.ts statically
- [Phase 9, Plan 03]: Lock screen NOT updated after cover repair scan — executeLoadTrack calls getCoverUri() at track load time; cover correct on next playback; no coupling to player state needed
- [Phase 9, Plan 03]: Cover repair scan placed alongside applyICloudExclusionToExistingDownloads in initializeApp() — both are fire-and-forget startup scans with identical non-blocking patterns
- [Phase 9, Plan 01]: Re-export screen components for more/series.tsx and more/authors.tsx — Expo Router treats each file's default export as the screen; absolute push paths (/series/ID, /authors/ID) resolve correctly cross-stack
- [Phase 9, Plan 01]: Conditional push paths (tab.name === "series" ? push("/more/series") : push("/more/authors")) instead of template literal — typed routes union requires literal strings; .expo/types/router.d.ts regenerates on next dev server start
- [Phase 9, Plan 01]: textSecondary color defined inline in component (#8E8E93 dark / #6E6E73 light) — matches iOS Settings secondary icon tint; theme extension deferred
- [Phase 9, Plan 02]: floatingPlayerPadding is already a style object {paddingBottom: number} — pass directly as contentContainerStyle, not nested inside another object
- [Phase 9, Plan 02]: SkeletonSection uses Animated from react-native core (not reanimated) — matches CollapsibleSection.tsx pattern, 800ms opacity 0.3→1→0.3 loop with useNativeDriver: true

### v1.1 Research Findings (high-confidence)

- iCloud exclusion: one-line config fix (`withExcludeFromBackup` absent from `app.config.js`); Obj-C module exists and is correct
- Download reconciliation: `isLibraryItemDownloaded` has a `// TODO` for stale-record clearing — implement it; guard with `isDownloadActive` check
- Now playing metadata: `updateNowPlayingMetadata` needed on same-chapter seeks; coordinator bridge is the only correct call site
- Expo Router tab navigation: `router.push` vs `router.navigate` behavior needs hands-on verification before coding (Expo 54 / Router v3)

### Pending Todos

None.

### Blockers/Concerns

- [Phase 9]: Cover art on first install of new version — RESOLVED in Plan 03 via repairMissingCoverArt() startup scan
- [Phase 9]: Android `updateMetadataForTrack` artwork bug (#2287) — not tested (no Android device available); does not block Phase 8 completion
- [Phase 9]: Expo Router tab navigation API needs hands-on verification on Expo 54 build before writing More screen fix

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed Phase 9 Plan 01 (09-01-PLAN.md: More screen nav fix; series/authors routes; icon+chevron UI)
Resume file: None
