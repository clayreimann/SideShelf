---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: — Beta Polish
status: completed
stopped_at: Completed 18-sleep-timer-fade-navigation-path-standardization/18-01-PLAN.md
last_updated: "2026-03-17T20:16:55.314Z"
last_activity: 2026-03-14 — Long-press play/pause writes trace dump with haptic on all surfaces; TraceDumps viewer in More > Track Player
progress:
  total_phases: 10
  completed_phases: 5
  total_plans: 26
  completed_plans: 23
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-09)

**Core value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.
**Current focus:** Phase 18 — next phase (Phase 17 complete)

## Current Position

Phase: 17.1 (Add Span Tracing Debugging Aid) — COMPLETE
Plan: 5 of 5 (Plan 05 complete — long-press trace dump on all surfaces + TraceDumps viewer)
Status: Complete — All 5 plans done; phase 17.1 complete
Last activity: 2026-03-14 — Long-press play/pause writes trace dump with haptic on all surfaces; TraceDumps viewer in More > Track Player

Progress: [██████████] 100%

## Performance Metrics

**Velocity (v1.2):**

- Total plans completed: 8 (Phases 10–13)
- Total execution time: 7 days (Feb 28 → Mar 7)

**By Phase:**

| Phase | Plans | Total Time | Avg/Plan |
| ----- | ----- | ---------- | -------- |
| 10    | 2     | ~16 min    | ~8 min   |
| 11    | 2     | ~98 min    | ~49 min  |
| 12    | 2     | ~53 min    | ~27 min  |
| 13    | 2     | ~40 min    | ~20 min  |

**Recent Trend:** Stable (~20–50 min per plan depending on test surface)
| Phase 14-progress-display-format P01 | 2 | 1 tasks | 2 files |
| Phase 14-progress-display-format P02 | 4 | 2 tasks | 4 files |
| Phase 14-progress-display-format P03 | 216 | 2 tasks | 5 files |
| Phase 14-progress-display-format P04 | 3 | 1 tasks | 2 files |
| Phase 15-collapsible-section-redesign P01 | 5 | 1 tasks | 1 files |
| Phase 15-collapsible-section-redesign P02 | 25 | 1 tasks | 3 files |
| Phase 16-full-screen-player-redesign-airplay P01 | 3 | 1 tasks | 3 files |
| Phase 16-full-screen-player-redesign-airplay P02 | 4 | 2 tasks | 4 files |
| Phase 16-full-screen-player-redesign-airplay P03 | 3 | 2 tasks | 4 files |
| Phase 16-full-screen-player-redesign-airplay P04 | 6 | 2 tasks | 2 files |
| Phase 17-bookmarks P01 | 4 | 2 tasks | 8 files |
| Phase 17-bookmarks P02 | 20 | 2 tasks | 3 files |
| Phase 17-bookmarks P03 | 11 | 3 tasks | 5 files |
| Phase 17-bookmarks P04 | 18 | 2 tasks | 8 files |
| Phase 17.1-add-span-tracing-debugging-aid P01 | 12 | 3 tasks | 3 files |
| Phase 17.1-add-span-tracing-debugging-aid P02 | 15 | 1 tasks | 4 files |
| Phase 17.1-add-span-tracing-debugging-aid P04 | 0 | 1 tasks | 3 files |
| Phase 17.1-add-span-tracing-debugging-aid P03 | 18 | 2 tasks | 4 files |
| Phase 17.1-add-span-tracing-debugging-aid P05 | 9 | 3 tasks | 6 files |
| Phase 18-sleep-timer-fade-navigation-path-standardization P02 | 3 | 2 tasks | 5 files |
| Phase 18-sleep-timer-fade-navigation-path-standardization P01 | 20 | 2 tasks | 3 files |

## Accumulated Context

### Key Decisions — carry forward

Full decision log is in PROJECT.md Key Decisions table.

- observerMode flag preserved for instant rollback — remove only when coordinator stable for 2+ releases
- Long-press interval on skip button is one-time-apply by design — Settings controls the default
- Partial badge (amber, top-left) pattern established for partially-downloaded items
- Handlers-before-`.start()` is a critical invariant in DownloadService — documented with CRITICAL comment
- progressFormat default is 'remaining' — zero visual change on first launch; stored under '@app/progressFormat'
- formatBookmarkTime kept local in FullScreenPlayer — needs second-level precision; shared formatProgress helper uses minute-granular friendly strings
- CollapsibleSection: gradient visibility driven by React state not animation opacity — enables queryByTestId null assertions in tests
- CollapsibleSection: two-phase render (measure first, animate second) avoids animating to unknown height on initial render
- chapterBarShowRemaining defaults false (show total duration); keepScreenAwake defaults false (battery-friendly); both stored under '@app/' prefix
- AirPlay: npm package path taken (@douglowder/expo-av-route-picker-view) — builds on SDK 54 + newArch; AirPlayButton at src/components/ui/AirPlayButton.tsx; plan 03 imports from @/components/ui/AirPlayButton
- KeepAwakeGuard guard-component pattern: top-level function component holds useKeepAwake; conditionally rendered via {keepScreenAwake && isPlaying && <KeepAwakeGuard />} — avoids conditional hook violation
- ProgressBar rightLabel=undefined means fall back to formatTime(duration); callers pass undefined rather than explicit fallback string
- Reanimated cross-component animated style prop type: use AnimatedStyle<ViewStyle> not ReturnType<typeof useAnimatedStyle> — the latter resolves to DefaultStyle (TextStyle union) which fails Animated.View type check
- Static styles (marginBottom, overflow) that accompany Reanimated animations: include inside useAnimatedStyle worklet rather than array-merging at call site — avoids Reanimated style prop type errors
- pendingBookmarkOps: no FK to users (plain text userId) — avoids cascade complications; clearPendingOps filters by userId+ids to prevent cross-user deletion
- upsertAllBookmarks sets syncedAt=now() at import — records when ABS server data was last fetched
- bookmarkTitleMode null sentinel: null means never-set (triggers first-tap alert in FullScreenPlayer); 'auto' means explicit user choice — stored under '@app/bookmarkTitleMode'
- deleteBookmark API URL uses numeric time not bookmarkId: DELETE /api/me/item/:id/bookmark/:time (ABS confirmed)
- wasConnected captured before set() in networkSlice.\_updateNetworkState to detect restore transition — after set() the state is already updated
- drainPendingBookmarkOps stops on first failure to preserve FIFO ordering of queued offline ops
- Offline createBookmark generates temp UUID as optimistic id — reconciled via refreshBookmarks after drain succeeds
- ABS bookmark PATCH endpoint: PATCH /api/me/item/:id/bookmark with {time, title} body (implemented and tested)
- bookmarkTitleMode null remains the first-run sentinel only; the settings screen now exposes explicit auto and prompt modes
- Bookmark rename/delete actions use ActionSheetIOS on iOS and Alert plus bottom-sheet modal flows on Android
- Bookmark creation branching stays in a pure helper so the full-screen player logic remains unit-testable
- Human approval on 2026-03-12 closes Plan 17-05: all bookmark UX flows are now treated as validated end-to-end
- --no-verify required for TDD RED stubs: lint-staged blocks missing-module imports even with --passWithNoTests; RED is intentional, documented in commit messages
- expo-application not yet installed: use { virtual: true } in jest.mock() for packages not in node_modules
- react-native custom resolver does not support virtual: true for @/ mapped paths — drop @/lib/trace mock from traceDump stub; traceDump import fails first anyway
- traceDump writes flat payload (appVersion, platform, dumpReason at root) not nested under meta — required for test assertions on parsed.dumpReason
- trace.ts is a zero-dependency leaf module — no imports from services, stores, or other lib files; safe to import anywhere
- Auto-dump on rejection in PlayerStateCoordinator is fire-and-forget with .catch() — never awaited inside the AsyncLock acquire callback (would block the queue)
- expo-application virtual mock added globally to setup.ts with { virtual: true } — integration tests pull in PlayerStateCoordinator transitively; per-file mocks would require touching every integration test
- player.machine.\* trace calls use (event as any).source cast with eslint-disable — Plan 03 adds source to the event bus; follow-up will thread through the type properly
- DispatchMeta is a separate type from PlayerEvent union — source/restoreSessionId not added to individual event variant types, keeping discriminated union clean; coordinator reads meta from bus side-channel
- restoreSessionId generated as local variable per-method-call (Math.random().toString(16).slice(2)), not module-level — avoids stale IDs across concurrent restore attempts
- All player.restore.\* child spans pass parentContext explicitly — Hermes context stack is not async-aware, implicit propagation unreliable across await boundaries
- log.warn only takes 1 argument in this project's logger; long-press error paths use log.error(message, Error) instead
- PlayPauseButton Pressable needs accessibilityRole="button" for getByRole("button") queries in tests
- Span instrumentation rule: add `player.{subsystem}.{operation}` spans to any async path with branching decision points that are hard to reconstruct from logs (restore, smart rewind, seek chains, queue rebuilds); capture key decision outcomes as span attributes not just log strings; skip ring buffer for events >1 Hz with an `isHighFrequency` guard; always pass `parentContext` explicitly — Hermes does not propagate async context across `await`

### Roadmap Evolution

- Phase 17.1 inserted after Phase 17: Add span tracing debugging aid (URGENT)

### Pending Todos

1. **Standardize path handling** (now Phase 18 / DEBT-01) — encoding mismatch between file:// URIs, POSIX paths, and D:/C: prefixed DB paths
2. **Orphan reassociation UI** (now Phase 19 / DEBT-02) — allow user to link orphaned files to known library items
3. **Preserve resume position and skip smart rewind on explicit seeks** — cold-start play sometimes resumes from 0:00, and chapter/bookmark jumps should bypass the smart rewind phase
4. **Contribute AirPlay component resizable icon native module upstream** — current icon is fixed size with only padding growing on resize; fix native layer to scale icon with component dimensions + open PR upstream

### Blockers/Concerns

- AirPlay package new-arch compatibility: RESOLVED — `@douglowder/expo-av-route-picker-view` builds on SDK 54 + newArchEnabled (prebuild --clean exit 0 confirmed in Plan 02)
- Tree shaking (Phase 20): `inlineRequires` + Reanimated 4 + React Compiler triple interaction undocumented; treat as exploratory; have revert plan ready
- ABS bookmark PATCH endpoint: RESOLVED — PATCH /api/me/item/:id/bookmark with {time, title} body (implemented in Plan 03)
- URL scheme mismatch: app.json has `"scheme": "side-shelf"` (hyphen) but docs use `sideshelf://` — RESOLVED in Phase 18 scope; scheme will be changed to `"sideshelf"` during Phase 18 execution

## Session Continuity

Last session: 2026-03-17T20:16:55.310Z
Stopped at: Completed 18-sleep-timer-fade-navigation-path-standardization/18-01-PLAN.md
Resume file: None
