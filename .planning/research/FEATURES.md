# Feature Research: v1.3 Beta Polish

**Domain:** React Native Expo audiobook player — UX polish and new user-facing features
**Researched:** 2026-03-09
**Confidence:** HIGH (codebase audit) / MEDIUM (UX patterns from app research)
**Milestone:** v1.3 Beta Polish

---

## Feature Landscape

This milestone adds five new user-facing feature areas plus supporting infrastructure. Each section below covers: what the feature is, UX expectations from comparable apps, table stakes vs differentiators vs anti-features, complexity, and dependencies on existing infrastructure.

---

## 1. AirPlay Route Picker (PLAYER-04, PLAYER-05, PLAYER-06)

### What Users Expect

In any iOS audio app that supports audio output routing, users expect a native AirPlay button they can tap to open the system route picker (selects AirPods, HomePod, Apple TV, Bluetooth speakers). The button is the system-standard triangular wireless icon with a ring at the base.

Comparable apps:

- **Apple Podcasts / Apple Music:** AirPlay button in the top-right of the full-screen player header. On the mini player it appears in the controls row or is omitted in favor of just showing a route indicator.
- **Spotify / Castro:** AirPlay button in the player header on the right side, same row as dismiss/settings controls.
- **Pocket Casts:** AirPlay button in the full-screen player controls area.

The standard iOS placement convention, based on observing Apple Music's player, is:

- Full-screen player header: right side, same horizontal row as the left-side dismiss control
- Mini player: optional, but when present it appears as a small icon in the controls row
- Item detail player controls: embedded in the controls bar alongside play/speed

### Table Stakes

| Feature                                       | Why Expected                                                                      | Complexity | Notes                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| AirPlay button in full-screen player header   | iOS users expect AirPlay routing from any audio player                            | LOW        | `AVRoutePickerView` via native module; one wrapper component |
| AirPlay button tap opens system sheet         | System-standard behavior; users don't want a custom picker                        | LOW        | The native `AVRoutePickerView` handles this automatically    |
| AirPlay button on floating player             | Users switching routes from the mini player is common                             | LOW        | Fits in the existing controls row alongside play button      |
| AirPlay button on item detail player controls | Parity with full-screen player; users expect it wherever playback controls appear | LOW        | Same component reused                                        |

### Differentiators

| Feature                                                                       | Value Proposition                                                     | Complexity | Notes                                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| AirPlay button tinted to match active route state (connected vs disconnected) | Visual feedback of AirPlay connection state without opening the sheet | MEDIUM     | AVRoutePickerView supports tint color; route detection requires AVAudioSession query |

### Anti-Features

| Feature                                            | Why Requested         | Why Problematic                                                             | Alternative                                              |
| -------------------------------------------------- | --------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| Custom AirPlay device list UI                      | "More branded" picker | Cannot enumerate AirPlay devices from RN; would require private APIs        | Use system `AVRoutePickerView` exclusively               |
| AirPlay button on lock screen / Now Playing widget | Completeness          | Lock screen controls are managed by RNTP and MPNowPlayingInfo; not in scope | System media controls already show route picker natively |

### Complexity Notes

The iOS `AVRoutePickerView` is a UIKit view that must be wrapped in a native module. Three npm packages exist: `react-native-avroutepickerview` (maintained fork from SuperphonicHub), `react-native-airplay-ios` (gazedash fork with availability/connection listeners), and `react-native-airplay` (older, tien). All are thin wrappers. The implementation is: add package, wrap in a `<View>` with appropriate hit box size, place in header.

No RNTP API surface needed — RNTP already configures the AVAudioSession as `longFormAudio` which enables AirPlay routing automatically. The button just gives the user access to the system picker UI.

**Dependency:** None on coordinator or player services. Purely UI placement.

---

## 2. Bookmark Management (BOOKMARK-01 through BOOKMARK-06)

### What Users Expect

Bookmarks are a table-stakes feature in dedicated audiobook players. Comparable apps:

- **Audible:** Add bookmark from the player (single tap, no title required), view all bookmarks per book in a list, tap to jump, long-press to rename/delete.
- **BookPlayer (open source):** Add bookmark from the player controls row. Bookmarks listed on the item screen sorted by time. Tap jumps. Swipe-to-delete.
- **Pocket Casts (podcasts):** Add from the mini player or full-screen player. Bookmarks are a paid feature. Rename via long-press → "Change title" screen (full-screen text input). Cannot change position after creation — delete and re-add instead. Synced across devices when signed in.
- **Apple Podcasts:** Bookmarks ("saved moments") surfaced in a dedicated list per episode. Add via the player. Title defaults to chapter/section name.
- **Overcast:** Does not have native bookmarks as of 2024 (uses playlists/clips instead).

The ABS server API already has bookmark support: `POST /api/me/item/:libraryItemId/bookmark` (create), `DELETE /api/me/item/:libraryItemId/bookmark/:bookmarkId` (delete). The API also provides `PATCH /api/me/item/:libraryItemId/bookmark/:bookmarkId` for rename (confirmed from ABS source; the endpoint accepts `{ title: string }`). Bookmarks are returned as part of the `/api/me` response (`bookmarks[]` on the user object), so fetch is implicit on app init.

The existing codebase already has:

- `createBookmark` and `deleteBookmark` endpoints in `endpoints.ts`
- `ApiAudioBookmark` type: `{ id, libraryItemId, title, time, createdAt }`
- `userProfileSlice` with a `bookmarks: ApiAudioBookmark[]` state property
- `BookmarksSection` component in `LibraryItemDetail` (view + delete, no rename)
- `BookmarkButton` component in the player that calls `createBookmark`

What is missing: rename endpoint call in `endpoints.ts`, rename action in `userProfileSlice`, rename UI (the "Change title" modal), SQLite table for local caching (BOOKMARK-06), and a new `src/db/schema/bookmarks.ts` + `src/db/helpers/bookmarks.ts`.

### Table Stakes

| Feature                                     | Why Expected                                                | Complexity | Notes                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Add bookmark from full-screen player        | Users expect one-tap bookmarking from the active player     | LOW        | Already partially implemented — button exists, `createBookmark` endpoint exists; integrate into UIMenu or keep in controls row |
| View bookmark list on item detail screen    | Users expect to see all their bookmarks per item            | LOW        | `BookmarksSection` already exists but shows data from `userProfileSlice` filtered by item                                      |
| Tap bookmark to jump to that position       | Core utility of bookmarks                                   | LOW        | Already implemented in `BookmarksSection.handleJumpToBookmark`                                                                 |
| Delete bookmark                             | Users must be able to remove unwanted bookmarks             | LOW        | Already implemented in `BookmarksSection.handleDeleteBookmark`                                                                 |
| Bookmarks survive app restart (local cache) | Users expect bookmarks to persist offline                   | MEDIUM     | Requires new SQLite schema + helper + initial load from API on login; BOOKMARK-06                                              |
| Bookmarks sync with ABS server              | Users switch between clients; server is the source of truth | LOW        | API already exists; `userProfileSlice` bookmarks are fetched from `/api/me` on init                                            |

### Differentiators

| Feature                                | Value Proposition                                           | Complexity | Notes                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Rename bookmark with custom title      | Meaningful bookmark titles instead of "Bookmark at 1:23:45" | MEDIUM     | Requires PATCH endpoint call, alert/sheet UI for text input, optimistic update in slice                                   |
| Sort bookmarks by time (ascending)     | Allows users to review the book's bookmark timeline         | LOW        | Already implemented in `BookmarksSection` sort; verify stays correct after add                                            |
| Bookmark with custom title on creation | Users can describe why they bookmarked immediately          | MEDIUM     | Current `createBookmark` defaults to "Bookmark at HH:MM:SS"; prompt before saving adds friction but allows intent capture |

### Anti-Features

| Feature                                  | Why Requested                         | Why Problematic                                                                                  | Alternative                                                                              |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Inline title editing on the bookmark row | "More efficient than opening a sheet" | Edit-in-place in a list row is fragile on iOS (keyboard + scroll conflicts); not standard iOS UX | Use an Alert with a text field or a dedicated "Edit title" screen (Pocket Casts pattern) |
| Bookmark position editing                | "I bookmarked the wrong moment"       | ABS API bookmark has no position update endpoint; would require delete + create                  | Document in UI: "To change a bookmark's position, delete and add a new one"              |
| Cross-item bookmark timeline             | "See all bookmarks across all books"  | ABS server stores bookmarks per item; cross-item aggregation would require client-side join      | Not in v1.3 scope                                                                        |

### Complexity Notes

The rename flow: long-press or trailing swipe on a bookmark row reveals a "Rename" action → `Alert.prompt` (iOS-only) or a modal with a single `TextInput` → calls `PATCH /api/me/item/:id/bookmark/:bookmarkId` → optimistic update in `userProfileSlice`.

The SQLite cache (BOOKMARK-06) requires:

1. New schema: `src/db/schema/bookmarks.ts` — columns: `id TEXT PK`, `libraryItemId TEXT`, `userId TEXT`, `title TEXT`, `time REAL`, `createdAt INTEGER`
2. New helper: `src/db/helpers/bookmarks.ts` — `upsertBookmarks()`, `getBookmarksForItem()`, `deleteBookmarkById()`
3. Load on login: fetch from `userProfileSlice.bookmarks` → upsert all into SQLite
4. On create: upsert to SQLite after server confirms
5. On delete/rename: update SQLite after server confirms

**Dependencies:** Requires existing `userProfileSlice` + API endpoints. New DB schema requires a migration. `wipeUserData` helper must be updated to delete from `bookmarks` table (follow FK order pattern).

---

## 3. Collapsible Sections with Peek-and-Fade (SECTION-01, SECTION-02, SECTION-03)

### What Users Expect

In content-heavy mobile apps, collapsible sections that show a preview of content are a well-established pattern (Apple's App Store, Audible's book descriptions, Libby, etc.). Users expect:

- A hint that more content exists below the visible cut-off (the "peek")
- A visual indication of the cut-off (gradient fade to transparent)
- Smooth animation when expanding/collapsing
- The expand/collapse trigger to be obvious (a chevron, a "Read more" button, or tapping the header)

The current `CollapsibleSection` implementation is problematic:

- Uses `Animated` from React Native (JS thread) — the requirement is Reanimated `withTiming` on the UI thread (SECTION-02)
- Collapses to height 0 — does not show the peek (SECTION-01)
- Uses `{isExpanded && children}` conditional — unmounts/remounts children on toggle
- `heightInterpolate` outputs `0→1` (opacity) but does not actually animate height

The new implementation must:

1. Render children always (no mount/unmount on toggle) to allow height measurement
2. In collapsed state, clip at ~100px and apply a LinearGradient or mask fade at the bottom
3. Animate height with Reanimated `useAnimatedStyle` + `withTiming` on the UI thread
4. In expanded state, remove the gradient and show full content

### Table Stakes

| Feature                                               | Why Expected                                          | Complexity | Notes                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| Peek at ~100px height in collapsed state              | Users see there is more content                       | MEDIUM     | Requires `overflow: hidden` + fixed collapsed height; children must always be rendered                         |
| Bottom fade-to-transparent overlay in collapsed state | Visually communicates truncation without hard cut-off | MEDIUM     | `LinearGradient` or `MaskedView` overlay positioned absolutely at bottom of collapsed view                     |
| Smooth height animation on expand/collapse            | Sluggish or janky animation feels broken              | MEDIUM     | Reanimated `useSharedValue` + `withTiming` + `useAnimatedStyle`; cannot use `useNativeDriver: true` for height |
| No content flash or remount on toggle                 | Remounting resets scroll position in nested lists     | MEDIUM     | Keep children always mounted; control visibility via height clipping only                                      |
| "Show more" / "Show less" affordance                  | Users need a clear trigger to expand                  | LOW        | Tap anywhere on the header row (existing pattern); add a chevron that rotates                                  |

### Differentiators

| Feature                                     | Value Proposition                                             | Complexity | Notes                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| Dynamic height measurement before animating | Animation goes to exact content height, not a hardcoded value | HIGH       | `onLayout` callback to measure content height, store in ref, animate to that value      |
| Fade gradient matches the background color  | Gradient looks native, not like a white bar over dark content | LOW        | Pass background color as prop; LinearGradient `colors={[transparent, backgroundColor]}` |

### Anti-Features

| Feature                                                                  | Why Requested     | Why Problematic                                                                                                             | Alternative                                                                    |
| ------------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Animate height with `useNativeDriver: true`                              | "For performance" | Height cannot be animated on the native driver; only transform and opacity                                                  | Reanimated layout animations handle this correctly on the UI thread            |
| Measure height with `setTimeout` hacks                                   | "Quick fix"       | Non-deterministic; fails on slow devices                                                                                    | Use `onLayout` callback on the always-mounted children container               |
| Use `react-native-reanimated` `LayoutAnimation` instead of manual height | Simpler API       | `LayoutAnimation` from React Native core conflicts with Reanimated; use Reanimated layout animations or manual `withTiming` | Manual `withTiming` with measured height is the explicit and controllable path |

### Complexity Notes

The `expo-linear-gradient` package is available via Expo SDK and does not require a separate native install. The Reanimated package is already a dependency (PERF-11 uses it).

**Pattern:**

```
CollapsibleSection
  ├── Header (Pressable — toggles expanded state)
  ├── Animated.View (height: sharedValue animates between collapsedHeight and measuredHeight)
  │   ├── children container (always mounted; onLayout captures measuredHeight)
  │   └── GradientOverlay (absolutely positioned at bottom; opacity: 0 when expanded)
```

**Dependency:** Reanimated already installed. `expo-linear-gradient` needs adding if not present. No coordinator dependency.

---

## 4. Unified Progress Display Format (PROGRESS-01 through PROGRESS-04)

### What Users Expect

Progress display is a personal preference — different users want different information at a glance. Research confirms:

- **"Time remaining" is the de facto default** for audiobooks (how much is left, not how much is done). This matches Apple Books, Libby, Audible.
- **"Elapsed / Total duration"** is the secondary format preferred by users who think in chapters or sessions.
- **Percentage** is useful for tracking overall progress but less useful for immediate orientation during playback.

The current FullScreenPlayer already shows `${formatTimeWithUnits(duration - currentPosition, false)} remaining` as a hardcoded string. The requirement is to make this format user-selectable and consistent across all three surfaces: FullScreenPlayer, FloatingPlayer, and item detail player controls.

Three format options to support (PROGRESS-01):

1. **Time remaining** — "2h 34m remaining" (default)
2. **Elapsed / Total** — "1h 20m / 3h 54m"
3. **Percent complete** — "34%"

### Table Stakes

| Feature                                                | Why Expected                                                       | Complexity | Notes                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------- |
| "Time remaining" as the default format                 | Standard audiobook convention; matches Apple Books, Libby, Audible | LOW        | Already implemented in FullScreenPlayer; just needs to become the default setting value                  |
| User-selectable format in Settings                     | Power users want to configure this once and have it stick          | LOW        | Add `progressDisplayFormat` key to `settingsSlice` and `appSettings.ts`; persist via AsyncStorage        |
| Format shown consistently on all 3 player surfaces     | Inconsistent display confuses users                                | LOW        | Read same `settings.progressDisplayFormat` in FullScreenPlayer, FloatingPlayer, and item detail controls |
| Format change takes effect immediately without restart | Expected from a settings toggle                                    | LOW        | Zustand slice — change propagates reactively to all subscribers                                          |

### Differentiators

| Feature                                                                  | Value Proposition                                                      | Complexity | Notes                                                                                                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Format selector in the player settings UIMenu (not just Settings screen) | Users can change the format without leaving the player                 | LOW        | UIMenu action in the settings menu that cycles or opens a sub-menu; PLAYER-03 UIMenu handles this                                              |
| Chapter-level vs book-level progress toggle                              | Chapter progress is more granular; book progress is the bigger picture | MEDIUM     | Current FullScreenPlayer shows chapter-scoped progress on the seekbar and book-level remaining; separating these is a distinct design decision |

### Anti-Features

| Feature                               | Why Requested                            | Why Problematic                                               | Alternative                                                    |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Show all three formats simultaneously | "More information"                       | Cluttered; no clear primary metric                            | Pick one and allow user to cycle by tapping the progress label |
| Per-item format preference            | "Different books need different formats" | Adds per-item state, complicates the data model significantly | Global setting is sufficient for v1.3                          |

### Complexity Notes

The settings change affects three call sites:

1. `FullScreenPlayer/index.tsx` — currently hardcodes `formatTimeWithUnits(duration - currentPosition, false) + " remaining"` in `ProgressBar`'s `customPercentageText` prop
2. `FloatingPlayer.tsx` — currently shows no progress text (would need a text element added)
3. Item detail player controls (`ConsolidatedPlayerControls.tsx` or `ProgressSection.tsx`) — currently shows `ProgressBar` without a custom format string

A shared `formatProgressDisplay(position, duration, format)` utility function in `src/lib/helpers/` avoids duplicating the format logic across all three surfaces.

**Dependency:** Requires `settingsSlice` extension (new key) and `appSettings.ts` getter/setter. No coordinator dependency.

---

## 5. Sleep Timer Volume Fade (SLEEP-01)

### What Users Expect

Castro, Apple Podcasts, and many other audio apps fade volume to zero over the last N seconds before the sleep timer stops playback, rather than cutting off abruptly. This is the "polite stop" that lets users fall asleep without being jarred awake by sudden silence.

Castro's implementation: volume fades when the timer has less than ~30 seconds remaining.
Apple Podcasts: similar fade behavior, typically 10-15 seconds.
The ABS feature request (#320 on the audiobookshelf-app repo) specifically requested this UX and it was confirmed as a desired behavior.

The fade window for SideShelf is specified as 30 seconds (SLEEP-01).

### How RNTP Volume Fade Works

RNTP does not have a built-in fade API. The implementation requires:

1. A repeating timer (running during playback when sleep timer is active) that checks time remaining
2. When remaining time drops below 30 seconds, begin linearly scaling volume down: `volume = (remainingSeconds / 30) * originalVolume`
3. Call `TrackPlayer.setVolume(scaledVolume)` at ~1-second intervals
4. When sleep timer fires and playback stops, reset volume to originalVolume for the next session

The existing sleep timer infrastructure:

- `playerSlice` has `sleepTimer: { type, endTime, chapterTarget }` state
- `getSleepTimerRemaining()` action computes seconds remaining
- The actual pause-on-expire logic runs in `PlayerBackgroundService` (it checks timer on `PlaybackProgressUpdated` events)
- `SleepTimerControl` component displays remaining time and lets users set/cancel

The volume fade must run in the background service (same place as timer expiry) to avoid being killed when the app is backgrounded. `PlayerBackgroundService` already fires on every `PlaybackProgressUpdated` event from RNTP — this is the right place to check remaining time and ramp volume.

### Table Stakes

| Feature                                                   | Why Expected                                                       | Complexity | Notes                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------- |
| Volume fades from current level to 0 over last 30 seconds | Standard "polite stop" behavior; users expect this from audio apps | MEDIUM     | Timer logic in PlayerBackgroundService; `TrackPlayer.setVolume()` interpolation |
| Volume restores to pre-fade level after sleep timer fires | Next playback session should not start silently                    | LOW        | Store `originalVolume` before fade begins; restore after `TrackPlayer.pause()`  |
| Fade only activates when sleep timer is active            | Volume must not fade on normal playback                            | LOW        | Check `sleepTimer.type !== null` before engaging fade logic                     |

### Differentiators

| Feature                                                      | Value Proposition                                                   | Complexity | Notes                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| User-configurable fade duration                              | Some users want a shorter or longer fade window                     | MEDIUM     | Would require a new settings key; 30 seconds is a sensible default for v1.3 |
| Visual indicator in SleepTimerControl showing fade is active | Feedback that fade has started (volume bar animation or text label) | LOW        | Text label "Fading out…" in the sleep timer display when remaining < 30s    |

### Anti-Features

| Feature                                         | Why Requested             | Why Problematic                                                                                                               | Alternative                                                                                                                                    |
| ----------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Fade implemented with a JS-side setInterval     | "Simpler"                 | JS setInterval is not reliable during background playback; the app may suspend before fade completes                          | Hook into the existing `PlaybackProgressUpdated` event handler in PlayerBackgroundService                                                      |
| Cross-fade to silence using two RNTP instances  | "Smooth audio cross-fade" | RNTP does not support multiple simultaneous instances with independent volume; cross-fade requires AVAudioEngine level access | Simple linear volume ramp via `TrackPlayer.setVolume()` at 1Hz intervals is sufficient                                                         |
| Fade on chapter-end timer (not just time-based) | "Consistency"             | Chapter-end timer does not have a predictable time horizon to start the fade from                                             | Only implement fade for time-based timers in v1.3; chapter-end fade requires tracking chapter position delta which adds significant complexity |

### Complexity Notes

The PlayerBackgroundService currently checks on every `PlaybackProgressUpdated` whether the sleep timer has expired. It must be extended to:

1. Track whether fade has started (to avoid calling `setVolume` redundantly on every event)
2. Compute the target volume based on remaining time
3. Call `TrackPlayer.setVolume()` with the computed value
4. Store the original volume to restore on cancel or playback stop

The fade for chapter-end timers is listed as an anti-feature for v1.3 because the chapter endpoint is determined by the coordinator tracking `chapterEnd` — integrating that into the background service requires passing additional state. Defer to v2.

**Dependencies:** Requires access to `playerSlice.sleepTimer` state and `TrackPlayer.setVolume()`. The PlayerBackgroundService already imports both. Coordinator does not need to be changed — volume is not a coordinator-owned state.

---

## Feature Dependencies

```
AirPlay button (PLAYER-04/05/06)
    └── independent: UI-only, native module wrapper, no coordinator changes

Bookmarks (BOOKMARK-01–06)
    ├── BOOKMARK-01 (add) — userProfileSlice.createBookmark() + endpoint already exist
    ├── BOOKMARK-03 (rename) — needs new PATCH endpoint in endpoints.ts
    ├── BOOKMARK-04 (delete) — already exists
    ├── BOOKMARK-05 (server sync) — fetch via /api/me on init; create/delete already work
    └── BOOKMARK-06 (SQLite cache) — new schema + helper + wipeUserData update

Collapsible Sections (SECTION-01–03)
    ├── requires expo-linear-gradient (or react-native-linear-gradient)
    └── requires react-native-reanimated (already installed per PERF-11)

Progress Format (PROGRESS-01–04)
    ├── PROGRESS-01 (settings) — extends settingsSlice + appSettings.ts
    ├── PROGRESS-02 (full screen player) — reads settings.progressDisplayFormat
    ├── PROGRESS-03 (floating player) — reads settings.progressDisplayFormat
    └── PROGRESS-04 (item detail) — reads settings.progressDisplayFormat

Sleep Timer Fade (SLEEP-01)
    └── requires PlayerBackgroundService modification — no new infrastructure needed

Player UI Redesign (PLAYER-01–03)
    ├── PLAYER-01 (remove nav bar) — Stack.Screen options change
    ├── PLAYER-02 (chevron dismiss) — replaces Done button pattern
    └── PLAYER-03 (UIMenu settings) — requires @react-native-menu/menu (already installed for SleepTimerControl)
```

### Dependency Notes

- **Bookmarks BOOKMARK-06 requires a Drizzle migration**: new `bookmarks` table. Must run `npm run drizzle:generate` after schema change. `wipeUserData.ts` must delete from `bookmarks` in correct FK order (after `users` rows are referenced).
- **Progress format PROGRESS-01 blocks PROGRESS-02/03/04**: all three surfaces read the setting; implement the setting first.
- **CollapsibleSection Reanimated migration requires understanding `onLayout` callback timing**: measure content height asynchronously before animating. The `heightTo` value starts as `undefined` and must guard against animating to 0.
- **Sleep timer fade in PlayerBackgroundService must restore volume on cancel**: if the user cancels the sleep timer while fade is active, volume must be restored. The `cancelSleepTimer` action in `playerSlice` should trigger volume restoration — either via a coordinator event or a direct `TrackPlayer.setVolume()` call from the service.

---

## MVP Definition

### Launch With (v1.3)

All five feature areas are required for beta. None are optional — they were committed in the milestone.

- [x] AirPlay button on all three player surfaces (PLAYER-04, 05, 06) — table stakes for iOS audio app; absence is conspicuous
- [x] Bookmark add/view/rename/delete with server sync (BOOKMARK-01–05) — requested feature; server infrastructure already ready
- [x] CollapsibleSection peek-and-fade with Reanimated (SECTION-01–03) — the current implementation is visually broken (no height animation, no peek)
- [x] Progress display format selector (PROGRESS-01–04) — user-requested; low effort; high perceived value
- [x] Sleep timer volume fade (SLEEP-01) — expected by audiobook listeners; the abrupt stop is jarring

### Add After Validation (v1.x)

- [ ] Bookmark local SQLite cache (BOOKMARK-06) — useful for offline; can ship initial version reading from `userProfileSlice` memory only and add persistence in a follow-up
- [ ] Sleep timer fade for chapter-end mode — complex state tracking; 30s time-based fade covers 95% of use cases
- [ ] User-configurable fade duration — 30 seconds is the right default; add setting only if user feedback requests it

### Future Consideration (v2+)

- Cross-item bookmark timeline — requires client-side aggregation across all items
- Custom AirPlay device list — impossible without private APIs
- Per-item progress format preference — over-engineering for v1.3

---

## Feature Prioritization Matrix

| Feature                                | User Value | Implementation Cost | Priority |
| -------------------------------------- | ---------- | ------------------- | -------- |
| AirPlay button (all surfaces)          | HIGH       | LOW                 | P1       |
| Bookmark add/view/delete               | HIGH       | LOW                 | P1       |
| CollapsibleSection peek+fade           | MEDIUM     | MEDIUM              | P1       |
| Progress format setting                | MEDIUM     | LOW                 | P1       |
| Sleep timer volume fade                | HIGH       | MEDIUM              | P1       |
| Bookmark rename                        | MEDIUM     | LOW                 | P1       |
| Bookmark SQLite cache                  | LOW        | MEDIUM              | P2       |
| Collapsible dynamic height measurement | LOW        | HIGH                | P2       |
| Sleep timer chapter-end fade           | LOW        | HIGH                | P3       |

**Priority key:** P1 = v1.3 required, P2 = v1.3 if time allows, P3 = v2+

---

## Competitor Feature Analysis

| Feature                        | Apple Podcasts / Books                 | Pocket Casts                          | Castro                | Our Approach                                                                                 |
| ------------------------------ | -------------------------------------- | ------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| AirPlay button placement       | Header right, full-screen player       | Player controls area                  | Header right          | Header right (full-screen), controls row (floating + detail)                                 |
| Bookmark add UX                | One-tap from player, no title required | One-tap from player, title optional   | Not a primary feature | One-tap via UIMenu settings button or dedicated bookmark button; title defaults to timestamp |
| Bookmark rename                | Long-press → edit sheet                | Long-press → "Change title" screen    | N/A                   | `Alert.prompt` or modal TextInput — lowest friction on iOS                                   |
| Bookmark position edit         | Not supported                          | Not supported (delete + re-add)       | N/A                   | Not supported in v1.3 (document this)                                                        |
| Collapsible sections with peek | Yes (App Store descriptions)           | Episode notes with "Read More"        | Yes                   | ~100px peek + LinearGradient fade + Reanimated height                                        |
| Progress format                | Time remaining (default); tap to cycle | Elapsed + time remaining side by side | Time remaining        | User-selectable in Settings; time remaining as default                                       |
| Sleep timer fade               | Yes (~10-15s, iOS Podcasts)            | Yes (Pocket Casts)                    | Yes (configurable)    | 30s linear volume ramp via `TrackPlayer.setVolume()`                                         |

---

## Sources

- Codebase audit: `/Users/clay/Code/github/SideShelf/src/` — endpoints.ts, userProfileSlice.ts, settingsSlice.ts, FullScreenPlayer/index.tsx, FloatingPlayer.tsx, SleepTimerControl.tsx, CollapsibleSection.tsx, BookmarksSection.tsx (HIGH confidence, direct read)
- `ApiAudioBookmark` type: `{ id, libraryItemId, title, time, createdAt }` confirmed from api.ts (HIGH confidence)
- ABS API bookmark endpoints (create POST, delete DELETE) confirmed from endpoints.ts (HIGH confidence)
- ABS API bookmark update PATCH: `PATCH /api/me/item/:libraryItemId/bookmark/:bookmarkId` — inferred from ABS API doc structure and matching create/delete pattern; LOW confidence, verify before implementing
- [react-native-avroutepickerview — SuperphonicHub](https://github.com/SuperphonicHub/react-native-avroutepickerview) (MEDIUM confidence, npm maintained)
- [RNTP Sleep Timers guide — rntp.dev](https://rntp.dev/docs/3.2/guides/sleeptimers) (HIGH confidence, official)
- [Pocket Casts Bookmarks support doc](https://support.pocketcasts.com/knowledge-base/bookmarks/) — rename via long-press → "Change title" screen; no position editing (MEDIUM confidence)
- [Pocket Casts iOS open source — Automattic/pocket-casts-ios](https://github.com/Automattic/pocket-casts-ios) (MEDIUM confidence)
- [Castro sleep timer support](https://castro.fm/support/sleep-timer-tips) — confirms volume fade at timer end (MEDIUM confidence)
- [ABS issue #320 — sleep timer fade request](https://github.com/advplyr/audiobookshelf-app/issues/320) (MEDIUM confidence)
- [RNTP Feature Request: fade in/out #1486](https://github.com/doublesymmetry/react-native-track-player/issues/1486) — no native fade API; must use `setVolume` loop (MEDIUM confidence)
- [Libby progress display help](https://help.libbyapp.com/en-us/6047.htm) — time remaining on right, elapsed on left (MEDIUM confidence)
- [StoryGraph audiobook time remaining discussion](https://roadmap.thestorygraph.com/requests-ideas/posts/audiobook-progress-by-time-remaining-) — confirms "time remaining is the de facto standard" (LOW confidence, community)
- [WWDC23 — Tune up your AirPlay audio experience](https://developer.apple.com/videos/play/wwdc2023/10238/) — AVAudioSession spokenAudio mode, LongFormAudio routing policy (HIGH confidence, official Apple)
- [Apple HIG — AirPlay](https://developer.apple.com/design/human-interface-guidelines/airplay) — button placement guidelines (HIGH confidence, official Apple)

---

_Feature research for: SideShelf v1.3 Beta Polish_
_Researched: 2026-03-09_
