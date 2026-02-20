# Feature Landscape

**Domain:** Audiobook / podcast player (React Native, Expo, self-hosted server)
**Researched:** 2026-02-20
**Milestone:** v1.1 Bug Fixes & Polish

---

## Feature 1: Now Playing Metadata on Skip

### What Users Expect

When a user taps skip forward or backward, the lock screen / Control Center progress bar should immediately reflect the new position. The chapter title, chapter duration, and elapsed time within the chapter should all update. Users never see a stale position — the scrub bar "jumps" visually in sync with playback.

### Table Stakes

| Behavior                                      | Why Expected                                                     | Complexity | Notes                                      |
| --------------------------------------------- | ---------------------------------------------------------------- | ---------- | ------------------------------------------ |
| Elapsed time updates after seek/skip          | Users see the scrub bar snap to new position                     | Low        | Apple calls this out explicitly in WWDC22  |
| Playback rate preserved in now playing dict   | Rate must be re-published or scrub bar counts wrong elapsed time | Low        | Set to 0 on pause, restore on resume       |
| Single dictionary write (not individual keys) | Prevents race conditions                                         | Low        | Apple guideline: set whole dict atomically |
| Update fires AFTER seek completes             | Stale value if fired before TrackPlayer resolves                 | Low        | Await TrackPlayer.seekTo() then publish    |

### Differentiators

| Behavior                                 | Value Proposition                                     | Complexity | Notes                                             |
| ---------------------------------------- | ----------------------------------------------------- | ---------- | ------------------------------------------------- |
| Chapter-relative elapsed time            | Scrub bar shows chapter progress, not book progress   | Medium     | Already implemented in `updateNowPlayingMetadata` |
| Chapter title in now playing title field | Users see chapter name on lock screen                 | Low        | Already implemented                               |
| Chapter duration as now playing duration | Chapter scrub bar makes intuitive sense as a fraction | Low        | Already implemented                               |

### Anti-Features

| Anti-Feature                                            | Why Avoid                                               | What to Do Instead                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Updating now playing on every 1Hz progress tick         | Apple warns against rapid-succession updates; expensive | Debounce to chapter boundary changes only (current debounce) PLUS one explicit call on seek |
| Calling `updateNowPlayingMetadata` before seek resolves | Lock screen shows position from before the skip         | Call after `await TrackPlayer.seekTo()` resolves                                            |

### Current Gap

The existing `updateNowPlayingMetadata` is triggered ONLY on chapter boundary changes via the `lastSyncedChapterId` debounce in `PlayerStateCoordinator`. When the user taps skip and the seek stays within the same chapter, `updateNowPlayingMetadata` is NOT called. The lock screen shows a stale elapsed time until the next chapter crossing or until the 1Hz ticker triggers a structural sync on a chapter change.

**Expected behavior (table stakes):** The lock screen elapsed time must update after every seek/skip, regardless of whether the chapter changed.

**Correct timing:** Call after the seek resolves (after `await TrackPlayer.seekTo()` in `PlayerService.executeSeek()`).

**Fields to update on same-chapter skip:**

- `elapsedTime` — chapter-relative position after the skip
- `playbackRate` — preserve current rate (must be included or system counter runs wrong)
- `duration` — unchanged (same chapter), still must be re-published with the full dict

### Dependencies

- Exists: `updateNowPlayingMetadata` in `playerSlice.ts` (line 576)
- Exists: `executeSeek` in `PlayerService.ts` (line 592–595)
- Gap: `executeSeek` does not call `updateNowPlayingMetadata` after the seek resolves
- Gap: `updateNowPlayingMetadata` does not accept a position override; it reads `currentChapter.positionInChapter` from store, which may not yet reflect the new position when called synchronously

**Confidence:** HIGH — Apple WWDC22 explicitly states "whenever we seek to a new time we need to publish new Now Playing info". Verified against existing codebase; the gap is confirmed by reading `executeSeek` and finding no metadata update call.

**Sources:** Apple WWDC22 "Explore media metadata publishing and playback interactions", MPNowPlayingInfoPropertyElapsedPlaybackTime docs, react-native-track-player GitHub issue #310

---

## Feature 2: Download File Tracking Recovery

### What Users Expect

If an audiobook shows as "downloaded" but the files are missing, tapping play should not silently fail or crash. The stale "downloaded" badge should correct itself. On next app open, inconsistent state between the DB and disk should resolve without user intervention. Users should not need to manually delete and re-download.

### Table Stakes

| Behavior                                                         | Why Expected                                            | Complexity | Notes                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| Stale "downloaded" DB records cleared when file missing on disk  | Prevents "downloaded" icon for unusable offline content | Medium     | Detected in `isLibraryItemDownloaded` (line 466–471) — TODO comment exists; correction not implemented |
| iOS container path migration handled automatically               | iOS changes app container paths between app updates     | Medium     | Already implemented: `repairDownloadStatus()` does this; needs a trigger                               |
| Reconciliation runs silently on app init or on play              | Users do not think about it                             | Low        | `DownloadService.initialize()` is the right hook for app-init reconciliation                           |
| DB-says-not-downloaded but file exists on disk → mark downloaded | Recovery from interrupted downloads or DB corruption    | Medium     | Reverse direction of reconciliation; files orphaned on disk                                            |

### Differentiators

| Behavior                                 | Value Proposition                                 | Complexity | Notes                                                    |
| ---------------------------------------- | ------------------------------------------------- | ---------- | -------------------------------------------------------- |
| Per-item repair triggered lazily on play | Fast startup; fix only what's needed              | Low        | Check on demand when user taps play                      |
| Re-apply iCloud exclusion during repair  | Files rescued from iOS cleanup won't be backed up | Low        | `setExcludeFromBackup` already exists in DownloadService |

### Anti-Features

| Anti-Feature                                                 | Why Avoid                                                                     | What to Do Instead                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Full scan of all items on every app open                     | O(n) file-system checks add startup latency                                   | Lazy reconciliation: check on play; bulk scan only in storage/diagnostics screen |
| Showing "Downloaded" badge when file is missing              | User taps "offline" expecting local playback; gets error or unexpected stream | Clear DB record when file check fails; show "re-download" option                 |
| Silently falling back to streaming when user expects offline | Surprises user with cellular data usage                                       | Show visible toast or alert: "File missing — streaming instead"                  |

### Current Gap

`isLibraryItemDownloaded` (line 466–471) detects the mismatch (DB says downloaded, file not on disk) and logs a warning but has an explicit `// TODO: Could mark as not downloaded in database here` comment. The detection exists; the correction does not.

`repairDownloadStatus()` implements the full repair algorithm (checks path, tries current container path, clears DB if truly gone) but is not wired to any automatic trigger.

**Expected trigger points:**

1. When `isLibraryItemDownloaded` detects a missing file, call `clearAudioFileDownloadStatus(file.id)` immediately (implement the TODO)
2. In `DownloadService.initialize()`, for all DB-downloaded items, call `repairDownloadStatus()` — this catches iOS container path changes at startup
3. Reverse direction (orphaned files on disk): scan the downloads directory for item subdirectories, compare against DB, mark any missing records as downloaded

**Confidence:** HIGH — gap confirmed directly in `DownloadService.ts`. `repairDownloadStatus` is fully implemented and correct; it simply has no trigger wired to anything that runs automatically.

---

## Feature 3: More Screen Navigation Patterns

### What Users Expect

The More tab is a "catch-all" for less-frequently-used sections. When a user taps "Authors" or "Series" from the More screen, they expect to land in that section exactly as if they had tapped the tab bar directly — with the tab highlighted, back navigation absent, and the tab's own navigation stack intact.

### Table Stakes

| Behavior                                                                     | Why Expected                                                                                  | Complexity | Notes                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| Tapping a hidden tab name in More switches to that tab (not pushes a screen) | iOS HIG: tabs are peers, not children; pushing creates a back button to "More" which is wrong | Low        | Tab switch semantics, not stack push                      |
| Tab bar highlights the newly active tab                                      | Visual confirmation of location                                                               | Low        | React Navigation handles this automatically on tab switch |
| Back navigation not shown when navigating to sibling tab                     | Tabs are lateral moves, not hierarchical                                                      | Low        | Consequence of using navigate vs push                     |
| The tab's own navigation state is preserved                                  | If user had drilled into a series detail, returning to series shows that detail               | Low        | React Navigation default behavior for tab stacks          |

### Differentiators

| Behavior                                               | Value Proposition                                     | Complexity | Notes                                         |
| ------------------------------------------------------ | ----------------------------------------------------- | ---------- | --------------------------------------------- |
| Hidden tab ordering in More matches user's custom sort | Users who customized tab order see same order in More | Low        | Already implemented via `hiddenTabsData` memo |

### Anti-Features

| Anti-Feature                                              | Why Avoid                                                                                                          | What to Do Instead                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `router.push('/authors')` from More when authors is a tab | Pushes Authors as a stack screen on top of More; back button appears; tab bar may not update; breaks spatial model | Use `router.navigate` or equivalent tab-switch API              |
| Modal presentation for tab navigation                     | Covers the tab bar; user cannot see current location                                                               | Tab switch                                                      |
| `router.replace('/authors')` from More                    | Replaces the More screen in its stack; user cannot return to More                                                  | Tab switch preserves both More and Authors stacks independently |

### Current Gap

The current More screen (line 144) uses:

```typescript
onPress: () => router.push(`/${tab.name}`);
```

Expo Router's `push` adds a screen to the current tab's stack. For navigating to a sibling tab, the correct call in Expo Router is `router.navigate` with the tab path. In the tab navigator context, `navigate` to a tab route switches the active tab rather than pushing onto the current stack.

**Expected pattern for Expo Router v3:**

```typescript
// Switch to sibling tab without pushing onto the More stack
router.navigate(`/(tabs)/${tab.name}`);
// or with the group prefix omitted (Expo Router resolves it):
router.navigate(`/${tab.name}`);
```

**Important caveat:** Expo Router tab navigation behavior for sibling-tab switching is version-sensitive and has changed between v2 and v3. The exact behavior of `navigate` vs `push` in a tab context should be verified against Expo Router v3 (which ships with Expo 54) during phase-specific research.

**Confidence:** MEDIUM — the iOS HIG principle (tabs are peers, not children) is HIGH confidence. The correct Expo Router API for tab switching is MEDIUM confidence — needs verification against Expo 54 / Expo Router v3 docs.

**Sources:** Apple WWDC22 "Explore navigation design for iOS", Apple HIG Tab Bars, Expo Router navigation docs

---

## Feature 4: Loading Skeletons for Home Screen

### What Users Expect

During the first load (cold start before cache populates), placeholder shapes appear in the layout positions where content will appear. The placeholders animate with a gentle shimmer. When data arrives, content replaces skeletons without layout shift. A spinner feels slower than a skeleton even at the same actual load time — users perceive progress with skeleton shapes.

### Table Stakes

| Behavior                                            | Why Expected                                                                    | Complexity | Notes                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| Placeholder shapes match the final content layout   | Reduces perceived wait; no jarring spatial rearrangement when real data arrives | Medium     | Cover mode: 140x140 rounded rect + two text blocks. List mode: row with text blocks |
| Shimmer or pulse animation on placeholders          | Signals "loading in progress" without a spinner                                 | Low        | 1.5–2s cycle; left-to-right shimmer is most common                                  |
| Skeleton disappears when data arrives (not before)  | No flash of empty content                                                       | Low        | Gate rendering on actual data presence                                              |
| No layout shift when real content replaces skeleton | CLS causes disorientation                                                       | Medium     | Skeleton must match CoverItem dimensions exactly (140x140)                          |

### Differentiators

| Behavior                                       | Value Proposition     | Complexity | Notes                                       |
| ---------------------------------------------- | --------------------- | ---------- | ------------------------------------------- |
| Cross-fade transition from skeleton to content | Smooth visual handoff | Low        | Opacity transition on the content appearing |
| Skeleton shows section header placeholders too | Full layout preview   | Low        | Header blocks above each section            |

### Anti-Features

| Anti-Feature                                              | Why Avoid                                                         | What to Do Instead                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Full-screen spinner during data load when layout is known | Worse perceived performance than skeleton; blocks entire viewport | Per-section skeleton placeholders in correct positions                   |
| Skeleton showing wrong number of items                    | Layout shift when data arrives at different count                 | Show fixed number (e.g., 5 cards per section) regardless of actual count |
| Overly complex skeleton mimicking individual text glyphs  | Visual noise; not worth the complexity                            | Single block per text line; no glyph-level detail                        |
| Skeleton persisting after data arrives                    | Users see ghost UI layered over real content                      | Strict gate: skeleton OR content, never both                             |

### Current Implementation

The home screen (line 213–222 in `home/index.tsx`) shows a full-screen `ActivityIndicator` only when `isLoadingHome && sections.length === 0`. When sections exist from cache, no loading state is shown — this is correct behavior for the warm path.

The cold-start path (no cache, first ever load) shows the full-screen spinner. This is the gap.

**Cover layout skeleton card:** 140 x 140 rounded rect (8px radius), a 14px-tall block for title (2 lines), a 12px-tall block for author — matching `CoverItem.tsx` exactly.

**Recommended library:** Moti's `Skeleton` component (uses Reanimated 3 which Expo 54 includes). Alternative: a simple `Animated.Value` pulse with no additional dependencies if Moti is not already in the project.

**Verify before implementing:** Check whether `moti` is already in `package.json`. If not, evaluate whether adding it is justified or whether a lightweight inline pulse is preferable.

**Confidence:** HIGH — skeleton loading UX principles are well-established (Nielsen Norman Group). Library recommendation is MEDIUM — verify Moti new architecture compatibility with Expo 54 before adding.

**Sources:** NN/G "Skeleton Screens 101", LogRocket skeleton loading guide, Moti skeleton docs

---

## Feature 5: iCloud Exclusion for Downloaded Media

### What Users Expect

Audiobooks are large — often 300 MB to 1 GB each. Users downloading for offline use do NOT expect them to consume their 5 GB free iCloud quota. The implicit contract is: "Downloaded for offline use = stored locally only, not backed up to the cloud." If Apple prompts the user to upgrade iCloud storage because of audiobook downloads, users blame the app.

### Table Stakes

| Behavior                                                                    | Why Expected                                                | Complexity | Notes                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------- | --------------------------------------------------- |
| All newly downloaded audio files have `NSURLIsExcludedFromBackupKey = true` | Large re-downloadable content must not consume iCloud quota | Low        | Already applied on `task.done` in `DownloadService` |
| Exclusion applied to files downloaded before the feature existed            | Retroactive fix for older installs                          | Low        | Not currently triggered; needs a scan/repair pass   |
| Android: no-op                                                              | Android has no iCloud; iOS-only concern                     | Low        | Already guarded with `Platform.OS !== 'ios'`        |
| Exclusion flag survives app updates                                         | iOS may reset the flag after file modifications             | Low        | Re-apply during reconciliation/repair scans         |

### Differentiators

| Behavior                                              | Value Proposition                               | Complexity | Notes                                                                       |
| ----------------------------------------------------- | ----------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| Storage screen shows per-item iCloud exclusion status | Power users can verify files are not backing up | Low        | Already implemented in `storage.tsx` (checks and shows status)              |
| "Fix iCloud Exclusion" action in diagnostics          | Recovery for mixed/not-excluded files           | Medium     | Iterates all downloaded files and re-applies flag; lives in `/more/actions` |

### Anti-Features

| Anti-Feature                                                  | Why Avoid                                                              | What to Do Instead                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Putting downloads in `Caches/` directory                      | iOS evicts Caches silently to free space; offline content disappears   | Use `Documents/` with `isExcludedFromBackup = true` — already the current pattern              |
| Treating the exclusion flag as a guarantee                    | Apple docs: the flag is guidance, not a guarantee; system may reset it | Best-effort application; document for power users that the Storage screen shows current status |
| Blocking download completion waiting for exclusion to confirm | Exclusion is fire-and-forget; user should not wait for it              | Current pattern: `setExcludeFromBackup` errors are logged but don't fail the download          |

### Current Gap

1. Files downloaded before the `setExcludeFromBackup` call was added to `DownloadService` (or on installations that predated this feature) have no exclusion flag. The Storage screen can show these as "will backup" but provides no one-tap fix.
2. iOS can silently reset the `isExcludedFromBackup` attribute after certain file operations (documented behavior from multiple developer sources). Re-applying exclusion during the download reconciliation scan would address this.

**Expected fix:** In the download reconciliation scan at startup, after confirming a file exists on disk, call `setExcludeFromBackup` on it. This is idempotent — safe to call on already-excluded files. The Actions screen at `/more/actions` should also expose a manual "Repair iCloud Exclusion" trigger.

**Confidence:** HIGH — `NSURLIsExcludedFromBackupKey` behavior is Apple-documented. The flag-reset risk is verified from multiple developer sources. Current implementation gap confirmed by reading `DownloadService.ts`.

**Sources:** Apple NSURLIsExcludedFromBackupKey docs, Eidinger blog "Prevent your app's files from being included in iCloud Backup", Saturn Cloud guide, MacRumors developer forums

---

## Feature 6: Skip Button UX (Tap vs Long-Press)

### What Users Expect

The primary action (tap) performs the configured skip interval. Long-press opens a menu to select a different interval. The selected interval should persist — users should not re-select it every session. The button always shows the active interval value.

### Table Stakes

| Behavior                                     | Why Expected                                                                  | Complexity | Notes                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| Single tap = skip by configured interval     | Universal audiobook convention (Audible, Libby, Overcast all use tap-to-skip) | Low        | Already implemented                                                  |
| Long-press = interval picker menu            | De-facto standard for customization without cluttering the main UI            | Low        | Already implemented via `MenuView shouldOpenOnLongPress`             |
| Button label shows the current interval      | Users know what they'll get before they tap                                   | Low        | Already implemented (SF Symbol `goforward.30`, Android text overlay) |
| Default intervals: 30s forward, 15s backward | Audible and most audiobook apps use these defaults                            | Low        | Already implemented                                                  |

### Differentiators

| Behavior                                        | Value Proposition                                                         | Complexity | Notes                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| Selected interval persists across app sessions  | Users set it once, not every listen                                       | Low        | Requires two new settings store keys: `skipForwardInterval`, `skipBackwardInterval` |
| Per-direction persistence (forward != backward) | Many users want long forward (30s) but short backward (10s) or vice versa | Low        | Two separate keys, not one shared setting                                           |
| Button SF Symbol updates when interval changes  | Visual confirmation that the setting took effect                          | Low        | Already works if interval prop is reactive                                          |

### Anti-Features

| Anti-Feature                         | Why Avoid                                                                       | What to Do Instead                                           |
| ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Long-press = skip; tap = open menu   | Inverts the universal contract; users who tap to skip get a menu pop-up instead | Tap is always the action; long-press is always configuration |
| Single interval for both directions  | Users often have different preferences for forward vs backward                  | Store two separate values                                    |
| Not persisting the selected interval | User must re-select every session; selection feels broken                       | Persist to settings slice                                    |

### Current Gap

The `SkipButton` component correctly separates tap (skip via `onPress`) from long-press (menu via `shouldOpenOnLongPress`). The `onJump` callback exists and fires with the selected seconds. However:

1. The selected interval is not persisted — it only affects the current session if the parent component propagates the change
2. The default intervals (30s forward, 15s backward) are hardcoded in the component/calling code, not in the settings store

**Expected behavior:** When user selects "15 seconds" from the forward-skip menu, the settings slice stores `skipForwardInterval: 15`. Next app open, the button shows the SF Symbol `goforward.15` and skips 15s on tap. The `FullScreenPlayer` and `FloatingPlayer` read the interval from the settings store.

**Confidence:** HIGH — verified against the existing `SkipButton.tsx` component. The tap vs long-press contract is confirmed against industry-standard apps. The persistence gap is confirmed by reading the calling code.

**Sources:** Audiobookshelf app GitHub issue #695 (request for per-direction intervals), Libby help docs (tap interval, drag gesture), Audible documentation (30s default), rntp.dev Events docs

---

## Feature Dependencies

```
Now Playing on Skip
  └── depends on: PlayerService.executeSeek (exists)
  └── depends on: updateNowPlayingMetadata (exists)
  └── gap: executeSeek does not call updateNowPlayingMetadata after resolving
  └── gap: store position may not yet reflect new position when called synchronously post-seek

Download Reconciliation
  └── depends on: repairDownloadStatus (exists, needs a trigger)
  └── depends on: clearAudioFileDownloadStatus (exists)
  └── gap: TODO in isLibraryItemDownloaded never implemented

iCloud Exclusion Repair
  └── depends on: setExcludeFromBackup (exists)
  └── depends on: Download Reconciliation scan (natural integration point)
  └── depends on: /more/actions screen (exists)

Skip Interval Persistence
  └── depends on: Settings slice (exists, needs two new keys)
  └── depends on: SkipButton onJump callback (exists)
  └── gap: onJump result not persisted anywhere

Loading Skeletons
  └── depends on: isLoadingHome state in home store (exists)
  └── depends on: CoverItem dimensions (fixed 140x140, known)
  └── gap: cold-start shows ActivityIndicator, not skeleton

More Screen Tab Navigation
  └── depends on: Expo Router navigate API (exists)
  └── gap: router.push used instead of router.navigate for tab switching
```

---

## MVP Recommendation

Prioritize in this order (impact vs effort):

1. **Now playing metadata on skip** — one call to `updateNowPlayingMetadata` after `executeSeek` resolves; user-visible on every skip action; bug-level severity
2. **Download reconciliation (clear stale records)** — implement the TODO in `isLibraryItemDownloaded`; prevents the "downloaded" badge lying to users
3. **More screen tab navigation** — verify `router.navigate` vs `router.push` in Expo Router v3 for tab switching; likely a one-line fix; high user confusion impact
4. **Skip interval persistence** — adds two settings store keys and wires up `onJump`; improves daily-use friction
5. **iCloud exclusion repair** — retroactive `setExcludeFromBackup` scan during reconciliation; integrate with download reconciliation scan for free
6. **Loading skeletons** — polish item; replace cold-start spinner with skeleton cards matching `CoverItem` layout

Defer:

- Bulk orphaned-files scan (files on disk not in DB) — implement stale-record clearing first; reverse direction can follow
- Skeleton for list layout — cover layout is the primary visual mode; list mode skeleton can come later

---

## Sources

- Apple WWDC22: [Explore media metadata publishing and playback interactions](https://developer.apple.com/videos/play/wwdc2022/110338/)
- Apple Developer Documentation: [MPNowPlayingInfoCenter](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter)
- Apple Developer Documentation: [MPNowPlayingInfoPropertyElapsedPlaybackTime](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfopropertyelapsedplaybacktime)
- Apple Developer Documentation: [NSURLIsExcludedFromBackupKey](https://developer.apple.com/documentation/foundation/nsurlisexcludedfrombackupkey)
- react-native-track-player: [Events API](https://rntp.dev/docs/api/events)
- react-native-track-player GitHub: [iOS lock screen progress bar after seekTo #310](https://github.com/react-native-kit/react-native-track-player/issues/310)
- Audiobookshelf app GitHub: [Separate long and short rewind/forward buttons #695](https://github.com/advplyr/audiobookshelf-app/issues/695)
- Eidinger blog: [Prevent your app's files from being included in iCloud Backup](https://blog.eidinger.info/prevent-your-apps-files-from-being-included-in-icloud-backup)
- Moti: [Skeleton component](https://moti.fyi/skeleton)
- Nielsen Norman Group: [Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/)
- Apple HIG: Tab Bars (WWDC22 "Explore navigation design for iOS")
- Expo Router: [Navigating between pages](https://docs.expo.dev/router/basics/navigation/)
- Libby help: [Rewinding or fast-forwarding](https://help.libbyapp.com/en-us/6114.htm)
- Codebase sources (HIGH confidence, ground truth):
  - `src/services/PlayerService.ts` — `executeSeek` (line 592)
  - `src/stores/slices/playerSlice.ts` — `updateNowPlayingMetadata` (line 576)
  - `src/services/coordinator/PlayerStateCoordinator.ts` — `syncPositionToStore`, `lastSyncedChapterId` debounce
  - `src/services/DownloadService.ts` — `isLibraryItemDownloaded` TODO (line 471), `repairDownloadStatus`
  - `src/components/player/SkipButton.tsx` — tap/long-press contract
  - `src/app/(tabs)/more/index.tsx` — `router.push` for tab navigation (line 144)
  - `src/app/(tabs)/home/index.tsx` — cold-start ActivityIndicator
  - `src/lib/iCloudBackupExclusion.ts` — `setExcludeFromBackup` API

---

_Feature research for: abs-react-native v1.1 Bug Fixes & Polish_
_Researched: 2026-02-20_
