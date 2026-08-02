# Audiobookshelf React Native - TODO

## 📋 v1 Launch Review Findings (2026-07-29)

Full-app review ahead of v1 public launch. Verification at time of review: 93 test suites /
1,398 tests passing, `tsc --noEmit` clean, ESLint clean. Blockers and high-priority items are
summarized in the review discussion; items below are the non-blocking todos it produced.

### New todos from review

- [x] ~~Prepare ATS justification for App Review~~ — drafted in
      `docs/launch/app-review-notes.md`, condensed from the decision block in `app.config.js`.
      Still needs the demo server URL and reviewer credentials filled in before submission.
- [ ] **Add ESLint `no-console` rule** — 251 `console.*` calls remain outside tests (top
      offenders: `src/lib/appSettings.ts` 28, `src/stores/slices/authorsSlice.ts` 22,
      `src/db/helpers/migrationHelpers.ts` 18). The tagged logger exists but nothing enforces it.
      Add `no-console: error` with an exemption for the logger transport
      (`src/lib/logger/`), then convert the remaining files the rule flags.
- [ ] **Implement the Audiobookshelf API compatibility gate** — design + 11-task plan exist
      (`docs/superpowers/plans/2026-07-27-audiobookshelf-api-compatibility.md`) but nothing is
      implemented. Before launch, at minimum document the supported server version range and
      manually verify against the oldest supported version (refresh-token fallback implies
      pre-v2.26 support is intended).
- [x] ~~Decide Android v1 scope explicitly~~ — **Decided 2026-07-31: v1.0 is iOS-only.**
      Android (versioning scheme, EAS submit config, Play listing) moves to a later release.
- [x] ~~Fix package.json `homepage`~~ — fixed along with README placeholder URLs.
- [ ] **Stop storing username in AsyncStorage fallback** — `src/lib/secureStore.ts`
      `persistUsername()` writes the username to both SecureStore and AsyncStorage; the
      plaintext fallback is unnecessary once migration-era installs are gone.
- [ ] **Fix Jest open-handle leak** — suite passes but Jest force-exits
      ("Force exiting Jest"); run with `--detectOpenHandles` and close the leaked async op.
- [ ] **Clean up local build artifacts** — ~1.0 GB of `build-*.ipa` files plus
      `test-report.html` at repo root (gitignored, local-only; delete or archive).
- [ ] **Resolve tracked `no-nested-touchables` warning** — known case in TraceDumps noted in
      `eslint.config.js`.

### Handled outside this repo (2026-07-31)

- Privacy policy and Terms of Service live in the **sideshelf.app website repo** — this repo
  only needs the in-app links (see "About" item below).
- The App Review **demo server and reviewer account** are also managed outside this repo.

## 🚨 **CRITICAL PRE-LAUNCH ITEMS** (Priority 0)

### Legal & Compliance

- [ ] **Privacy Policy** — _authored and hosted in the sideshelf.app website repo_
  - [ ] Paste the hosted privacy policy URL into App Store Connect metadata
- [ ] **Terms of Service / EULA** — _authored and hosted in the sideshelf.app website repo_
- [ ] **Add "About" section with legal links** (in-app work, this repo)
  - [ ] Add privacy policy link (→ sideshelf.app) to Settings/More screen
  - [ ] Add terms of service link (→ sideshelf.app)
  - [ ] Add support/contact information
  - [x] Add app version display (More screen shows version + build via DeviceInfo)

### Internationalization (i18n)

- [x] **Implement i18n system** (like the existing audiobookshelf-app)
  - [x] Add i18n library (e.g., react-i18next or similar)
  - [x] Create string resource files structure
  - [x] Extract ALL hardcoded strings from UI components
  - [x] Create en-us.json as base language
  - [x] Update login screen strings
  - [x] Update library detail screen strings
  - [x] Update player UI strings
  - [x] Update settings strings
  - [x] Update error messages
  - [x] Update all button labels, placeholders, and messages
  - [ ] **Hardcoded English strings remain in the player** — found 2026-08-01, so the
        "extract ALL hardcoded strings" item above is not actually complete: - `src/app/FullScreenPlayer/index.tsx:799` — `"Sleep Timer"` section header - `src/app/FullScreenPlayer/index.tsx:461` — `currentChapter?.chapter.title || "Loading..."`
        (there is already a `common.loading` key in `en.ts`; this literal bypasses it)
        Worth a full sweep for sibling cases rather than fixing just these two.

### App Store Requirements

- [x] ~~Decide iPad scope~~ — **Decided 2026-07-31: `supportsTablet: false` for v1.0.**
      Sheds the mandatory 13" iPad screenshot set and iPad App Review scrutiny. iPhone-only
      apps still install on iPad in compatibility mode, so no users are cut off. Reasoning
      is recorded in the comment block above `ios:` in `app.config.js`.
- [ ] **Prepare App Store Screenshots** (iOS-only for v1.0; sizes per 2026 requirements)
  - [x] ~~iPhone 6.9" display — 1320 × 2868 px~~ — **Produced 2026-08-01.** Six framed,
        captioned JPEGs in `.screenshots/store/`, all verified 1320 × 2868 with no alpha
        channel. Regenerate any time with `npm run screenshots`.
  - [x] ~~**Improve frame 6 (series)**~~ — done 2026-08-01. Demo library grew from 24 to
        34 books across 8 series (added Barsoom, Tarzan, Little Women, The Jungle Book),
        so the frame is full and every book count is correct. Note for future edits: only
        _distinct_ series add rows; adding books to an existing series just changes its
        "N books" count.
  - [ ] Upload to App Store Connect (manual; filenames are ordered `01-`…`06-`)
- [x] ~~**Stand up the demo server** (`demo-server/`)~~ — **Done 2026-07-31.** ABS 2.35.1 in
      Docker seeded with 24 public-domain LibriVox titles, verified end-to-end: demo user
      logs in, 24 items, Continue Listening (4) and Listen Again (1) shelves populated.
      Re-seeding is idempotent. See `demo-server/README.md` for the verification record.
  - [ ] Verify against **ABS 2.28.0** (`ABS_VERSION=2.28.0` against a clean `data/`) —
        only 2.35.1 has been exercised, but the App Store listing claims "2.28 or newer"
  - [ ] Host it publicly for App Review (separate infra step; it binds to 127.0.0.1 by default)
- [ ] **Write App Store Description** — drafted in `docs/launch/app-store-listing.md`
  - [x] Subtitle (**30 chars max** — an earlier revision of this file said 80, which is wrong)
  - [x] Full description highlighting features
  - [x] Keywords for discoverability (100 chars, comma-separated, no spaces)
  - [x] What's New section for v1.0.0
  - [x] ~~Decide the podcast claim~~ — **Decided 2026-07-31: podcasts ship in v1.1.**
        v1.0 is audiobooks only, so podcasts are omitted from all 1.0 marketing (App Store
        copy, README). There is no podcast UI in `src/components/` or `src/app/`; only the
        API and DB layers parse podcast media types. App Review tests description claims,
        so do not reintroduce a podcast claim before the UI ships.
- [ ] **Prepare Promotional Assets**
  - [ ] App icon (already have: icon.png)
  - [ ] Promo video (optional but recommended)
- [ ] **Update App Store URLs in README**
  - [ ] Add correct iOS App Store URL
  - [ ] Add correct Google Play Store URL (post-1.0, when Android ships)
  - [ ] Update repository URL if needed

### Production Configuration

- [ ] **Remove/Minimize Console Logging** (251 `console.*` calls outside tests as of 2026-07-31)
  - [ ] Create production logging utility that conditionally logs
  - [ ] Replace console.log with proper logger in services
  - [ ] Replace console.error with proper error tracking
  - [ ] Keep critical error logs, remove debug logs
  - [ ] Or: Use babel-plugin-transform-remove-console for production builds
- [ ] **Add Error Tracking/Crash Reporting**
  - [ ] Integrate Sentry or similar crash reporting
  - [x] Add error boundaries to catch React errors → [#30](https://github.com/clayreimann/SideShelf/issues/30)
        (done: `src/components/errors/` + per-tab layouts)
  - [ ] Configure proper source maps for stack traces
  - [ ] Test crash reporting in production mode
- [ ] **Add Analytics (Optional but Recommended)**
  - [ ] Consider privacy-friendly analytics
  - [ ] Track key user flows (login, downloads, playback)
  - [ ] Track errors and failures
  - [ ] Ensure GDPR compliance
- [ ] **Verify Environment Variables**
  - [ ] Ensure no development URLs are hardcoded
  - [ ] Verify all sensitive config is properly secured
  - [ ] Check for any API keys that shouldn't be in code
- [ ] **Update app.json metadata**
  - [ ] Verify correct bundle identifiers
  - [ ] Update description
  - [ ] Verify permissions are correctly listed
  - [ ] Add App Store metadata (iOS)

### Testing & Quality Assurance

- [ ] **Comprehensive Testing**
  - [ ] Test on physical iOS device (not just simulator)
  - [ ] Test on different screen sizes
  - [ ] Test with slow network conditions
  - [ ] Test offline mode thoroughly
  - [ ] Test download and playback interruptions
  - [ ] Test app backgrounding/foregrounding
  - [ ] Test with low storage space
  - [ ] Test with different server versions
  - [ ] Test login/logout flows
  - [ ] Test token expiration and refresh
- [ ] **Beta Testing**
  - [ ] Set up TestFlight for iOS beta
  - [ ] Recruit beta testers
  - [ ] Collect and address feedback
  - [ ] Fix critical bugs found in beta
- [ ] **Expand Test Coverage**
  - [ ] Add more unit tests (93 suites / ~1,400 tests as of 2026-07-31; raise coverage of
        `src/app/` and `src/components/` which are excluded from unit coverage)
  - [ ] Add integration tests for critical flows
  - [ ] Add E2E tests for main user journeys
  - [ ] **Run `npm run maestro:test` in CI — the suite was silently broken.** Fixed
        2026-08-01 while building the screenshot pipeline: every flow used
        `runFlow: .maestro/x.yaml`, but Maestro resolves those paths relative to the flow
        file's own directory, so they became `.maestro/.maestro/x.yaml`; and `_login.yaml`
        used `clearText`, which is not a valid command in Maestro 2.x and fails syntax
        validation outright. Both are fixed, but nothing would have told us they were
        broken — the flows were never being executed. `maestro check-syntax` on every
        `.maestro/*.yaml` is a cheap CI gate that would have caught the second one.
  - [ ] Test error handling thoroughly

### Documentation & Support

- [ ] **Update README.md**
  - [ ] Add screenshots/demo
  - [ ] Clarify installation instructions
  - [ ] Add troubleshooting section
  - [ ] Add FAQ section
  - [ ] Update feature list to match reality
  - [ ] Add badge for app store availability
- [ ] **Create User Documentation**
  - [ ] Getting started guide
  - [ ] How to connect to server
  - [ ] How to download content
  - [ ] How to use player features
  - [ ] Common troubleshooting steps
- [ ] **Set up Support Channels**
  - [ ] Create GitHub Discussions or similar
  - [ ] Add support email or contact method
  - [ ] Link to Audiobookshelf Discord
  - [ ] Create issue templates

### Code Quality & Security

- [ ] **Security Audit**
  - [ ] Review token storage (currently using SecureStore - good!)
  - [ ] Ensure sensitive data isn't logged
  - [ ] Review all network calls for security
  - [ ] Verify SSL/TLS is enforced where possible
  - [ ] Check for any hardcoded credentials
- [ ] **Performance Optimization**
  - [ ] Profile app performance
  - [ ] Optimize image loading and caching
  - [ ] Optimize database queries
  - [ ] Check for memory leaks
  - [ ] Optimize bundle size
- [ ] **Code Cleanup**
  - [ ] Remove commented code
  - [ ] Remove unused imports
  - [ ] Remove unused files/components
  - [ ] Ensure consistent code style
  - [ ] Run linter and fix all warnings
  - [ ] Add JSDoc to public APIs

### Build & Release Preparation

- [ ] **Configure Production Builds**
  - [ ] Test production iOS build
  - [ ] Verify app signing is configured
  - [ ] Set up automated versioning
  - [ ] Implement the approved Worker + R2 OTA phases
    - `docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md`
- [ ] **App Store Submission Prep**
  - [ ] Review Apple App Store guidelines
  - [ ] Prepare answers for review questions
  - [ ] Create demo account for reviewers — _handled outside this repo; paste credentials
        into App Review notes at submission_
  - [ ] Prepare demo server for reviewers — _handled outside this repo_
- [ ] **Version Management**
  - [ ] Create release branching strategy
  - [ ] Tag v1.0.0 release
  - [ ] Create CHANGELOG.md
  - [ ] Document release process

---

## 🚀 High Priority Features

### Build issues

- [x] Separate branch of downloader library on my fork to enable consistent building
- [x] Embed fonts in app build
- [x] Provide prompt to reauthorize when refresh token is expired
- [x] Manage creds in expo CLI
- [x] Downloaded files should only store paths relative to app bundle and we should resolve absolute file paths at runtime
- [x] Conditionally use native tabs for ios 26+
- [x] Sessions for downloaded media are not being correctly created, streaming progress works fine, but progress from local items appears to create the session but subsequent syncs fail
- [x] Fetch currently playing/most recent item status from TrackPlayer
- [x] PlayerService should be the single entrypoint to play/pause tracks.
  - [x] PlayerService updates store state for accurate tracking
  - [x] PlayerService stores/remembers the last played item so that the floating player can be
        populated on start (for downloaded media)
  - [x] ProgressService should not close the current session if the new session is for the same
        item (unless timeout expired)
  - [x] ProgressService should check on startup for dangling sessions (crash or memory pressure quit) and close them
- [x] PlayerService.PlayerTrack should take the resume position
- [x] PlayerService should update the track metadata with new chapter information
- [ ] Add background task service library to end sessions after 10 minutes of inactivity → [#8](https://github.com/clayreimann/SideShelf/issues/8)

### Misc/Bugs

- [x] Refactor the new cover home screen to use a section list
- [ ] Download All button in series → [#9](https://github.com/clayreimann/SideShelf/issues/9)
- [ ] Download next item in series when X time left → [#10](https://github.com/clayreimann/SideShelf/issues/10)
- [x] When the mini-player is shown add padding to the bottom of views so that you can scroll all the way to the bottom
- [ ] **🚨 LAUNCH BLOCKER — New login initialization is broken** → [#11](https://github.com/clayreimann/SideShelf/issues/11)
      **⚠️ #11 is marked CLOSED on GitHub but the bug is not fixed — reopen it.**
      **Reproduced live 2026-08-01** against the seeded demo server, on a clean install:
      after a first-ever login the Home screen sits on skeleton placeholders **indefinitely**
      — still grey tiles after a 60-second wait, so this is not slow loading. Quitting and
      reopening the app fixes it, because the persisted session initializes correctly.
      This is every new user's _first_ experience of the app, and App Review will hit it on
      their first launch. `.maestro/capture-screenshots.yaml` currently works around it with
      a `stopApp` + `launchApp` after login — remove that workaround once this is fixed.
  - [ ] home screen isn't refreshed after log in
  - [ ] no library is selected by default
  - [ ] authors don't populate
  - [ ] series don't populate
- [ ] Authors refresh UX is broken → [#12](https://github.com/clayreimann/SideShelf/issues/12)
- [ ] Series refresh UX is broken → [#12](https://github.com/clayreimann/SideShelf/issues/12)
- [ ] Long author/narrator strings just go off screen → [#13](https://github.com/clayreimann/SideShelf/issues/13)
- [ ] Animate the description expand/collapse → [#14](https://github.com/clayreimann/SideShelf/issues/14)
  - [ ] Remove section header and just expand/collapse when tapping on text, show a snippet and fade the bottom out
- [ ] In extracted buttons, use SFSymbols on ios and fallback to icons on android → [#15](https://github.com/clayreimann/SideShelf/issues/15)
  - [ ] Only wait for icon fonts loading on android
- [ ] Mark cover as not available if file is missing → [#16](https://github.com/clayreimann/SideShelf/issues/16)
- [x] Add chapter jump feature
- [ ] Add listening stats page
- [ ] Add library search → [#17](https://github.com/clayreimann/SideShelf/issues/17)

### Playback Tracking & Sync

- [ ] **Playback Tracking Store Implementation**
  - [x] Create centralized progress tracking store
  - [x] Implement local progress persistence with resume functionality
  - [x] Add periodic server sync during playback
  - [ ] Handle offline/online sync conflicts → [#18](https://github.com/clayreimann/SideShelf/issues/18)
  - [ ] Display listening sessions on item details screen (split sessions if paused >15min) → [#19](https://github.com/clayreimann/SideShelf/issues/19)

  #### Playback Tracking Store Implementation
  - [x] Database Schema Updates:
    - [x] Enhance existing localListeningSessions table
    - [x] Add playbackProgress table for real-time tracking
    - [x] Create performance indexes
  - [x] Service Architecture:
    - [x] Create PlaybackTrackingService singleton
    - [x] Implement progress persistence and retrieval
    - [x] Add periodic sync with server
    - [x] Handle offline/online state transitions
    - [ ] Handle conflicts between local and server progress → [#18](https://github.com/clayreimann/SideShelf/issues/18)
          **Integration Points:**
    - [x] Hook into existing PlayerService for progress updates
    - [x] Connect with SessionTrackingService for session management
    - [x] Integrate with existing progress sync mechanisms

### Real-time Updates

- [ ] **WebSocket Integration** → [#20](https://github.com/clayreimann/SideShelf/issues/20)
  - [ ] Implement WebSocket connection with authentication
    - [ ] Add connection state management and reconnection logic
    - [ ] Handle network state changes
  - [ ] Handle `user_item_progress_updated` events
    - [ ] Sync with local progress store
  - [ ] Support all official ABS event types (lower priority)

### Podcast Support

- [ ] **Full Podcast Implementation** → [#21](https://github.com/clayreimann/SideShelf/issues/21)
  - [ ] Podcast-specific UI components and layouts
  - [ ] Episode management and subscription features
  - [ ] Podcast-specific playback controls (skip silence, variable speed)
  - [ ] RSS feed integration and auto-updates
  - [ ] Podcast-specific progress tracking
- [ ] Don't add library as a sort/display filter. Have separate library and podcast tabs so users don't need
      to switch back and forth between libraries

## 🎵 Player Features

### Core Player

- [x] Small floating player
- [x] Full screen player
- [x] Stream content from server
- [ ] Embed Player UI in item details screen (and dismiss the floating player on this screen) → [#22](https://github.com/clayreimann/SideShelf/issues/22)
- [x] Extract common player UI components for reuse
- [x] Setup background hooks to sync media progress to server

### Player Enhancements

- [ ] Auto-download setting when streaming playback starts → [#21](https://github.com/clayreimann/SideShelf/issues/21)
- [ ] Record playing events (start, pause, sync progress, sync failed) → [#23](https://github.com/clayreimann/SideShelf/issues/23)
  - [ ] Show player events on item details screen
- [x] Show duration of book on item details
- [ ] Advanced playback controls (sleep timer, bookmarking)
  - [x] Sleep timer
  - [ ] Bookmarking → [#24](https://github.com/clayreimann/SideShelf/issues/24)

## 📚 Library Management

### Library Tab

- [x] Select first library in user's available libraries
- [x] Persist most recently selected library
- [x] Fetch books from selected library with caching
- [x] Use /items/batch endpoint for bulk fetching
- [x] Item details view with download functionality
- [x] Show progress of book

### Library Improvements

- [x] Fetch and cache covers
- [x] Sorting options (title, author, date added, progress)
- [ ] Collapse series options → [#25](https://github.com/clayreimann/SideShelf/issues/25)
- [x] Rows vs grid view toggle
- [x] Advanced filtering and search

### Content Organization

- [x] **Series Tab**
  - [x] Fetch series and render books
  - [ ] Show which items in a series have been played → [#26](https://github.com/clayreimann/SideShelf/issues/26)
- [x] **Authors Tab**
  - [x] Fetch author metadata from server
  - [x] Link books to authors accurately
- [ ] **Narrators Tab** → [#27](https://github.com/clayreimann/SideShelf/issues/27)
  - [ ] Fetch narrator metadata and render narrators

## 📥 Download System

### Download Management

- [x] Book download with progress tracking
- [x] Debounce/smooth download rate and ETA calculations
- [x] Review and simplify/refactor download.ts
- [x] Review and simplify/refactor libraryItemDetail.tsx
- [ ] Fix background downloader library (new architecture) → [#35](https://github.com/clayreimann/SideShelf/issues/35)
  - [ ] Expo plugin to modify app delegate for URL completion
- [x] Fix download cancellation not clearing progress UI

### Download Enhancements

- [ ] **Decide whether `/more/storage` should ship un-gated for 1.0** — raised 2026-08-01.
      The storage/downloads management screen sits behind the `diagnosticsEnabled` setting
      (`src/app/(tabs)/more/index.tsx`, gate around the `if (diagnosticsEnabled)` block),
      which defaults to `false` in `settingsSlice.ts`. So a default install ships with **no
      user-facing way to see or manage downloaded files** — for an app whose headline
      feature is offline listening. The App Store description promises "take your library
      offline"; storage management is the natural follow-through.
- [ ] Show overall download progress in nav bar (circular progress bar) → [#28](https://github.com/clayreimann/SideShelf/issues/28)
- [ ] Batch download management → [#29](https://github.com/clayreimann/SideShelf/issues/29)
- [ ] Download queue prioritization → [#29](https://github.com/clayreimann/SideShelf/issues/29)
- [ ] Storage management and cleanup → [#29](https://github.com/clayreimann/SideShelf/issues/29)
- [ ] Download scheduling and automation → [#29](https://github.com/clayreimann/SideShelf/issues/29)

## 🛠️ Technical Improvements

### Database & Architecture

- [x] All marshalling code runs through helper functions
- [x] Helper code imported from @/db/helpers
- [x] Separate helper files for different types
- [x] Move local state to companion objects for better conflict handling
- [x] Implement proper data migration strategies

### Authentication & Security

- [x] Tokens not stored in database
- [x] Store last login date
- [x] Token refresh functionality
- [ ] Enhanced security for token storage
- [ ] Biometric authentication support → [#36](https://github.com/clayreimann/SideShelf/issues/36)

### Performance & UX

- [ ] Implement proper error boundaries → [#30](https://github.com/clayreimann/SideShelf/issues/30)
- [ ] Add loading states and skeleton screens → [#31](https://github.com/clayreimann/SideShelf/issues/31)
- [x] Optimize image loading and caching
- [x] Implement proper offline support
- [ ] **Downloaded shelf doesn't refresh when a download completes mid-session**
      Found 2026-08-01 while building the screenshot pipeline. Downloading a title and
      returning to Home leaves the "Downloaded" shelf absent, even though the files are
      genuinely on disk (verified: `Documents/downloads/<id>/*.mp3`). Switching tabs does
      not help — only a fresh app launch picks them up. Users who download a book and go
      looking for it on Home will conclude the download failed.
      `.maestro/capture-screenshots.yaml` works around it with `stopApp` + `launchApp`;
      remove that once fixed. Possibly related to [#11](https://github.com/clayreimann/SideShelf/issues/11).
- [x] ~~**Series book counts are wrong in the app**~~ — **FIXED 2026-08-01.** Verified in
      the final screenshots: all 8 series now match the server. Root cause was not the
      display code but an interrupted background sync that left 14 of 34 books with only
      minified data and no `media_series` rows, made permanent by two bugs:
      `processFullLibraryItems` aborted the whole remaining batch when any single item
      threw, and `LibraryItemBatchService` (the intended backfill) was never wired up
      anywhere — dead code. A third, independent bug was found and fixed in the same pass:
      `getLibraryItemsNeedingRefresh` selected `libraryItems.id`, `mediaMetadata.id` and
      `audioFiles.id` in one query, and the driver collapses those same-named columns into
      one key, corrupting results; its LEFT JOINs also fanned multi-file books across rows
      and crowded incomplete items out of the `.limit()` window. Fixes: per-item failure
      isolation, `NOT EXISTS` rewrite, and a new `_backfillIncompleteItems` action wired
      into `_checkForNewItems` so an interrupted sync self-heals. Regression tests added
      (suite 1419 → 1431).
- [ ] **Some series rows render without a cover thumbnail** — found 2026-08-01, root cause
      traced 2026-08-01. Anne of Green Gables and Tom Sawyer show no image in the Series
      list while Oz, Sherlock, Barsoom, Little Women and Tarzan do. **Not cosmetic** — the
      same mechanism blanks covers app-wide, not just in the Series list.
      Every cover-rendering query in the app reads `localCoverCache.localCoverUrl` and
      nothing else (`series.ts:40`, `libraryItems.ts:286,380`, `homeScreen.ts:36,107,148`,
      `combinedQueries.ts:282,377`) — there is **no fallback to the server cover URL**. So a
      missing `local_cover_cache` row renders blank permanently, not just until the cache
      fills. `series.ts:156` takes `books[0].coverUrl`, so one uncached first-in-sequence
      book blanks the whole series row.
      Two confirmed defects in the cover-cache path: 1. `repairMissingCoverArt` (`src/lib/covers.ts:150`) — the fire-and-forget startup
      repair — filters on `!isCoverCached(libraryItemId)`, which tests only whether the
      **file** exists on disk. An item whose file downloaded but whose
      `local_cover_cache` row was never written is therefore _skipped by the repair
      scan forever_. The scan repairs the filesystem but never the DB row the queries
      actually join against. Filter on "file missing **or** DB row missing". 2. `cacheCoversForLibrary` (`src/lib/covers.ts:83`) has **no callers** — dead code,
      and wrong twice: it passes `libraryItems.id` into
      `setLocalCoverCached(mediaId, …)` (every row it writes is keyed by the wrong id
      and can never join), and it persists a cache row unconditionally even when
      `cacheCoverIfMissing` returned `{uri: ""}`, recording a path to a file that does
      not exist. The live path is `cacheCoversForLibraryItems`
      (`src/db/helpers/mediaMetadata.ts:340`), which uses the correct `mediaId`.
      Delete the dead function rather than fixing it.
- [ ] **Frame 6's mini-player covers the last visible series row** — raised 2026-08-01.
      Cosmetic, and **not** an app bug: `src/app/(tabs)/series/index.tsx:17` correctly
      applies `useFloatingPlayerPadding()` to the list's `contentContainerStyle`, so the
      content is fully scrollable — the floating player simply overlays whatever row sits
      under it at scroll-top, which is by design. It is purely a screenshot-composition
      choice. If a cleaner frame is wanted, either scroll the Series list slightly before
      `takeScreenshot` in `.maestro/capture-screenshots.yaml`, or capture that frame with
      no playback active so no mini-player is present.
- [x] ~~**`GET /api/libraries/:id/series?limit=0` returns zero results**~~ — **audited
      2026-08-01: not an app bug, no action needed.** The ABS quirk is real (`total` is
      still correct; the items endpoint treats `limit=0` as "all" while the series endpoint
      treats it as "none"), but SideShelf never calls a `/series` endpoint at all — the only
      library endpoints in `src/lib/api/endpoints.ts` are `/api/libraries`,
      `/api/libraries/:id`, `?include=filterdata`, and `/items` (always with an explicit
      non-zero `limit`). Series are derived locally from `media_series` rows
      (`src/db/helpers/series.ts` `getAllSeries`). The quirk only affects
      `demo-server/`'s seeder, where it is already worked around.
- [ ] Show indicator when offline → [#32](https://github.com/clayreimann/SideShelf/issues/32)
- [ ] Add accessibility features → [#33](https://github.com/clayreimann/SideShelf/issues/33)
  - [ ] Ensure screen reader navigation works
  - [x] Test VoiceOver (iOS) and TalkBack (Android)
  - [ ] Add proper accessibility labels

## 🔧 Infrastructure

### Background Services

- [x] Background sync service
- [ ] Notification management → [#37](https://github.com/clayreimann/SideShelf/issues/37)
- [ ] Background download management → [#29](https://github.com/clayreimann/SideShelf/issues/29)
- [ ] Periodic cleanup tasks → [#38](https://github.com/clayreimann/SideShelf/issues/38)

## 📱 Platform Specific

### iOS

- [ ] **iPad layouts (1.1)** — prerequisite for re-enabling `supportsTablet` in
      `app.config.js`. Deferred from 1.0 because no tablet layouts exist: the library grid
      hardcodes 3 columns regardless of width (`src/components/library/LibraryItemList.tsx`)
      and `FullScreenPlayer` is the only screen reading `useWindowDimensions`. Needs
      width-derived column counts, a reviewed player layout, and reviewed detail screens.
      Re-enabling also re-adds the mandatory 13" iPad screenshot set (2064 × 2752).
- [ ] CarPlay integration → [#39](https://github.com/clayreimann/SideShelf/issues/39)
- [ ] Home screen widgets → [#41](https://github.com/clayreimann/SideShelf/issues/41)
- [ ] Siri shortcuts → [#42](https://github.com/clayreimann/SideShelf/issues/42)
- [ ] Background app refresh optimization
- [ ] iOS-specific UI adaptations

### Android

- [ ] Android Auto integration → [#40](https://github.com/clayreimann/SideShelf/issues/40)
- [ ] Background service optimization
- [ ] Material Design compliance

## 🧪 Testing & Quality

### Testing

- [ ] Unit tests for core services
- [ ] Integration tests for API calls
- [ ] E2E tests for critical user flows
- [ ] Performance testing

### Code Quality

- [ ] Comprehensive error handling
- [x] Logging and monitoring
- [ ] Code documentation
- [ ] Performance profiling

## 🔄 Future Considerations

### Advanced Features

- [ ] Server aliases (e.g. local and remote DNS)
  - [ ] Config enhancements to fallback between server aliases (network state heuristic for given DNS?)
- [ ] Multi-server support
  - [ ] DB enhancements to associate libraries with servers
  - [ ] Config enhancements to query the correct server for a library
- [ ] Custom themes and personalization
- [ ] Social features (sharing, recommendations)

---

### WebSocket Integration Plan

1. **Connection Management**
   - Implement `WebSocketService` with authentication
   - Add connection state management and reconnection logic
   - Handle network state changes

2. **Event Handling**
   - Parse and handle `user_item_progress_updated` events
   - Support all official ABS event types
   - Update local progress store based on events
   - Implement event queuing for offline scenarios

3. **Integration**
   - Connect with `PlaybackTrackingService`
   - Update UI components in real-time
   - Handle conflicts between local and server progress

### Podcast Support Plan

1. **UI Components**
   - Create podcast-specific layouts and components
   - Implement episode list and detail views
   - Add subscription management interface

2. **Playback Features**
   - Podcast-specific playback controls
   - Skip silence and intro/outro detection
   - Variable playback speed with presets
   - Sleep timer and bookmarking

3. **Content Management**
   - RSS feed parsing and updates
   - Episode download and management
   - Subscription and notification system
   - Auto-download settings

---

_Last updated: November 10, 2025_
_Critical pre-launch items: ~40 items_
_Total items: ~150+ items across all priorities_
_GitHub issues created: 35 code-related issues (#8-#42)_
