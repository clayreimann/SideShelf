# Requirements: Audiobookshelf React Native

**Defined:** 2026-02-20
**Core Value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.

## v1.0 Requirements — COMPLETE

All v1.0 requirements (EXEC-01 through CLEAN-06) were satisfied in Phases 2–5. See `.planning/MILESTONES.md` for the full list.

## v1.1 Requirements

Bug fixes and polish pass following the coordinator migration. 16 requirements across 6 categories.

### Skip Button (SKIP)

- [ ] **SKIP-01**: User can short-tap skip button to execute a skip (forward or backward)
- [x] **SKIP-02**: Lock screen shows updated elapsed time after any skip (same-chapter or chapter-crossing)

### iCloud Exclusion (ICLD)

- [x] **ICLD-01**: iCloud exclusion plugin is registered in `app.config.js` and compiled into the app build
- [x] **ICLD-02**: Downloaded files are excluded from iCloud backup at download completion
- [x] **ICLD-03**: iCloud exclusion is re-applied to files during download path repair (app update migrations)

### Download Tracking (DL)

- [x] **DL-01**: Stale "downloaded" DB records where files no longer exist on disk are cleared on startup
- [x] **DL-02**: Storage tab accurately reflects all currently downloaded items
- [x] **DL-03**: Download reconciliation scan excludes active in-progress downloads (no partial-file false positives)

### Player (PLR)

- [x] **PLR-01**: Skip forward interval selection persists across app sessions
- [x] **PLR-02**: Skip backward interval selection persists across app sessions

### Navigation (NAV)

- [ ] **NAV-01**: More screen navigates to Series tab (switches tab, not pushes onto More stack)
- [ ] **NAV-02**: More screen navigates to Authors tab (switches tab, not pushes onto More stack)

### UI Polish (UX)

- [ ] **UX-01**: Home screen shows shimmer skeleton cards during cold start (not just spinner)
- [ ] **UX-02**: More screen items have icons
- [ ] **UX-03**: More screen items have visual nav affordance (chevrons, active tap states)
- [ ] **UX-04**: Tab reorder UX is improved

## v2 Requirements

Deferred — not in current milestone scope.

### Performance

- **PERF-01**: `NATIVE_PROGRESS_UPDATED` events bypass async-lock for lower-latency position updates (requires explicit safety analysis)

### Enhanced Diagnostics

- **DIAG-01**: Coordinator diagnostics exportable to crash reporting service (not just local JSON)
- **DIAG-02**: Position drift metric tracked and reported per session

### Polish & Features

- **FEAT-01**: Configurable smart-rewind intervals — both logic refactor and settings UI (deferred from v1.1)
- **FEAT-02**: RN Downloader upgrade to mainline (maintenance, not blocking)
- **FEAT-03**: iOS native intents (app appears in system now-playing suggestions)
- **FEAT-04**: Siri shortcuts for play/resume/stop
- **FEAT-05**: Better feedback UX (Cloudflare worker with GH token to create issues)

## Out of Scope

| Feature                                   | Reason                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Full playerSlice removal                  | Zustand/React integration is valuable; stays as read-only proxy    |
| Changing state machine topology           | Phase 1 validated the transition matrix — it stays                 |
| New player features                       | This is a bug-fix and polish milestone                             |
| Performance optimization beyond migration | Don't optimize what isn't measured as slow                         |
| Configurable smart-rewind/jump            | Logic changes + settings UI — too large for v1.1, deferred to v1.2 |
| RN Downloader upgrade                     | Nice-to-have maintenance, not blocking — deferred to v1.2          |
| iOS intents / Siri shortcuts              | Platform integration features — deferred to a features milestone   |
| Cloudflare feedback worker                | New service infrastructure — deferred to a features milestone      |

## Traceability

| Requirement | Phase | Status   |
| ----------- | ----- | -------- |
| SKIP-01     | 8     | Pending  |
| SKIP-02     | 8     | Complete |
| ICLD-01     | 6     | Complete |
| ICLD-02     | 6     | Complete |
| ICLD-03     | 6     | Complete |
| DL-01       | 7     | Complete |
| DL-02       | 7     | Complete |
| DL-03       | 7     | Complete |
| PLR-01      | 8     | Complete |
| PLR-02      | 8     | Complete |
| NAV-01      | 9     | Pending  |
| NAV-02      | 9     | Pending  |
| UX-01       | 9     | Pending  |
| UX-02       | 9     | Pending  |
| UX-03       | 9     | Pending  |
| UX-04       | 9     | Pending  |

**Coverage:**

- v1.1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---

_Requirements defined: 2026-02-20_
_Last updated: 2026-02-20 after v1.1 roadmap creation_
