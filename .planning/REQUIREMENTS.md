# Requirements: Audiobookshelf React Native

**Defined:** 2026-03-09
**Core Value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.

## v1.3 Requirements

Requirements for the Beta Polish milestone. Each maps to roadmap phases.

### Full Screen Player (PLAYER)

- [x] **PLAYER-01**: Full screen player navigation bar is removed (no navigation controller chrome)
- [x] **PLAYER-02**: Full screen player has a chevron-down button on the left that dismisses the player
- [x] **PLAYER-03**: Full screen player Done button is replaced with a UIMenu settings button containing playback actions (add bookmark, sleep timer, progress format)
- [x] **PLAYER-04**: Full screen player has an AirPlay route picker button in the header
- [x] **PLAYER-05**: Floating player has an AirPlay route picker button
- [x] **PLAYER-06**: Item details screen player controls have an AirPlay route picker button

### Progress Display (PROGRESS)

- [x] **PROGRESS-01**: User can select a progress display format in Settings (time remaining, % complete, elapsed / total duration)
- [x] **PROGRESS-02**: Full screen player middle area displays the selected progress format
- [x] **PROGRESS-03**: Floating player displays the selected progress format
- [x] **PROGRESS-04**: Item details player controls display the selected progress format

### Collapsible Sections (SECTION)

- [x] **SECTION-01**: Collapsed sections show approximately the first 100px of content with a bottom fade-to-transparent overlay
- [x] **SECTION-02**: Expanding/collapsing sections animate height on the UI thread (Reanimated withTiming)
- [x] **SECTION-03**: Expanded sections show full content with no bottom fade

### Bookmarks (BOOKMARK)

- [x] **BOOKMARK-01**: User can add a bookmark at the current playback position (with optional title)
- [x] **BOOKMARK-02**: User can view all bookmarks for an item on the item detail screen
- [x] **BOOKMARK-03**: User can rename a bookmark
- [x] **BOOKMARK-04**: User can delete a bookmark
- [x] **BOOKMARK-05**: Bookmarks are synced with the ABS server via API (create, read, delete)
- [x] **BOOKMARK-06**: Bookmarks are cached in a local SQLite table for offline viewing

### Navigation (NAVIGATION)

- [x] **NAVIGATION-01**: Series list viewed from the More tab navigates to series detail on tap
- [x] **NAVIGATION-02**: Authors list viewed from the More tab navigates to author detail on tap
- [x] **NAVIGATION-03**: App registers a `sideshelf://` URL scheme and deep links navigate to all main screens

### Sleep Timer (SLEEP)

- [x] **SLEEP-01**: Playback volume fades out over the last 30 seconds before the sleep timer stops playback

### Performance (PERF)

- [x] **PERF-01**: LibraryItemList uses FlashList with `estimatedItemSize` and `getItemType` for grid/list modes
- [x] **PERF-02**: ChapterList `renderItem` is memoized with `useCallback` and has `getItemLayout` for fixed-height rows
- [ ] **PERF-03**: Expo tree shaking enabled via `.env` flags and `metro.config.js` transformer config
- [x] **PERF-04**: Root layout uses direct icon imports; AuthProvider and statisticsSlice use direct `@/db/helpers` imports
- [x] **PERF-05**: TTI baseline established with `react-native-performance` — `performance.mark('screenInteractive')` added to home screen
- [x] **PERF-06**: AuthProvider secure storage reads run concurrently via `Promise.all`
- [x] **PERF-07**: Coordinator instantiation deferred from module scope into `initializeApp()`
- [x] **PERF-08**: `CoverImage` component uses `expo-image` for memory + disk caching
- [x] **PERF-09**: ChapterList `useEffect` setTimeout calls return cleanup functions
- [x] **PERF-10**: `NetInfo.addEventListener` unsubscribe is captured and called in `resetNetwork()`; `initializeNetwork()` clears existing intervals before creating new ones
- [x] **PERF-11**: FullScreenPlayer panel open/close animations use Reanimated `useAnimatedStyle`

### Technical Debt (DEBT)

- [x] **DEBT-01**: File paths are stored and compared in a consistent normalized format (POSIX, no `file://` prefix) across DB, downloads, and filesystem operations
- [x] **DEBT-02**: User can associate an orphaned downloaded file with a known library item from the orphan management screen
- [ ] **DEBT-03**: ProgressService is decomposed into a facade and collaborators with 90%+ test coverage maintained

### UI Testing (TESTING)

- [ ] **TESTING-01**: Login screen inputs have `testID` attributes enabling automated authentication in Maestro
- [ ] **TESTING-02**: Maestro `_login.yaml` subflow authenticates from environment variable credentials and is idempotent (safe to call when already logged in)
- [ ] **TESTING-03**: Key interactive elements have `testID` attributes (play-resume-button, player-done-button, seek-slider, speed-control, download-button, library-search-input)
- [ ] **TESTING-04**: Maestro flows decomposed into reusable subflows (`_login`, `_start-playback`) and standalone screen flows
- [ ] **TESTING-05**: Maestro regression suite covers library navigation, playback, and download flows as independently executable test files

## v2 Requirements

Deferred to future release.

### Platform

- **PLATFORM-01**: Siri shortcuts / iOS native intents
- **PLATFORM-02**: Cloudflare feedback worker
- **PLATFORM-03**: Expo SDK 55 upgrade (blocked on RNTP Android bridgeless compatibility, issue #2443)

### Diagnostics

- **DIAG-01**: Coordinator diagnostics forwarded to crash reporting service
- **DIAG-02**: Coordinator performance metrics in crash reports

## Out of Scope

| Feature                                             | Reason                                                          |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Full playerSlice removal                            | Zustand/React integration is valuable; stays as read-only proxy |
| State machine topology changes                      | Transition matrix validated by 122+ tests; no changes           |
| PERF-01 (NATIVE_PROGRESS_UPDATED async-lock bypass) | Requires explicit safety analysis; deferred beyond v1.3         |
| react-native-render-html JS-thread HTML parsing     | Only investigate if detail screen performance becomes a concern |
| Android updateMetadataForTrack artwork bug (#2287)  | Not verified (no Android device); carry forward as open concern |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement   | Phase    | Status   |
| ------------- | -------- | -------- |
| PLAYER-01     | Phase 16 | Complete |
| PLAYER-02     | Phase 16 | Complete |
| PLAYER-03     | Phase 16 | Complete |
| PLAYER-04     | Phase 16 | Complete |
| PLAYER-05     | Phase 16 | Complete |
| PLAYER-06     | Phase 16 | Complete |
| PROGRESS-01   | Phase 14 | Complete |
| PROGRESS-02   | Phase 14 | Complete |
| PROGRESS-03   | Phase 14 | Complete |
| PROGRESS-04   | Phase 14 | Complete |
| SECTION-01    | Phase 15 | Complete |
| SECTION-02    | Phase 15 | Complete |
| SECTION-03    | Phase 15 | Complete |
| BOOKMARK-01   | Phase 17 | Complete |
| BOOKMARK-02   | Phase 17 | Complete |
| BOOKMARK-03   | Phase 17 | Complete |
| BOOKMARK-04   | Phase 17 | Complete |
| BOOKMARK-05   | Phase 17 | Complete |
| BOOKMARK-06   | Phase 17 | Complete |
| NAVIGATION-01 | Phase 18 | Complete |
| NAVIGATION-02 | Phase 18 | Complete |
| NAVIGATION-03 | Phase 18 | Complete |
| SLEEP-01      | Phase 18 | Complete |
| PERF-01       | Phase 19 | Complete |
| PERF-02       | Phase 19 | Complete |
| PERF-03       | Phase 20 | Pending  |
| PERF-04       | Phase 19 | Complete |
| PERF-05       | Phase 19 | Complete |
| PERF-06       | Phase 19 | Complete |
| PERF-07       | Phase 19 | Complete |
| PERF-08       | Phase 19 | Complete |
| PERF-09       | Phase 19 | Complete |
| PERF-10       | Phase 19 | Complete |
| PERF-11       | Phase 16 | Complete |
| DEBT-01       | Phase 18 | Complete |
| DEBT-02       | Phase 19 | Complete |
| DEBT-03       | Phase 22 | Pending  |
| TESTING-01    | Phase 21 | Pending  |
| TESTING-02    | Phase 21 | Pending  |
| TESTING-03    | Phase 21 | Pending  |
| TESTING-04    | Phase 21 | Pending  |
| TESTING-05    | Phase 21 | Pending  |

**Coverage:**

- v1.3 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0 ✓

---

_Requirements defined: 2026-03-09_
_Last updated: 2026-03-09 after roadmap creation — all requirements mapped to phases 14–22_
