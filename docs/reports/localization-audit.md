# Localization Audit Report

This report documents all hardcoded user-facing strings in the React Native app that should be localized.

**Generated:** 2025-11-09

## Summary

The app has partial localization support via the `i18n` system, but many user-facing strings remain hardcoded throughout the codebase. This audit identifies all strings that need to be moved to localization files.

### Current i18n Coverage

The app currently has localization for:

- Authentication flow (sign in, server connection)
- Tab navigation labels
- Home screen sections and states
- Library sorting options
- Common error messages

### Files with Hardcoded Strings

---

## 1. Alert Messages

### `/src/components/library/LibraryItemDetail.tsx`

**Alert.alert() calls:**

- `Alert.alert("Error", "User not found")`
  - Line 269
  - Context: When user is not found during finished status toggle

- `Alert.alert("Error", "Failed to update finished status. Please try again.")`
  - Line 318
  - Context: Error updating media progress finished status

- `Alert.alert("Download Failed", \`Failed to download library item: ${error}\`, [{ text: "OK" }])`
  - Line 333
  - Context: Download error handler

- `Alert.alert("Delete Download", "Are you sure you want to delete the downloaded files? This will free up storage space.", [...])`
  - Line 340-342
  - Context: Confirmation dialog for deleting downloads
  - Button labels: "Cancel", "Delete"

- `Alert.alert("Delete Failed", \`Failed to delete downloaded files: ${error}\`, [{ text: "OK" }])`
  - Line 353
  - Context: Error deleting downloaded files

- `Alert.alert("Cannot Play", "Item not found.")`
  - Line 387
  - Context: Playback error when item not found

- `Alert.alert("Playback Failed", \`Failed to start playback: ${error}\`, [{ text: "OK" }])`
  - Line 404
  - Context: Playback error handler

**Menu Action Labels:**

- Line 436: `"Delete Download"`
- Line 444: `"Download"`
- Line 454: `"Mark as Unfinished"`
- Line 460: `"Mark as Finished"`

**Status Messages:**

- Line 156: `"Unknown Title"`
- Line 160: `"Item not found"`
- Line 480: `"Item not found."`
- Line 486: `"Unknown Title"`
- Line 489: `"Unknown Author"`
- Line 648: `"⬇ Downloaded"`
- Line 711-715: `"Loading..."`, `"Pause"`, `"Play"`
- Line 773: `"Description"` (collapsible section title)
- Line 793: `"Audio Files (${audioFiles.length})"` (collapsible section title)
- Line 811: `"Duration: "`, `"Unknown"`
- Line 815: `"Size: "`
- Line 820: `"⬇ Downloaded"`
- Line 834: `"Options"` (menu title)

### `/src/app/(tabs)/more/settings.tsx`

**Alert.alert() calls:**

- Line 43, 53, 63, 73: `Alert.alert('Error', 'Failed to save setting')`
  - Context: Error saving various settings

**UI Labels:**

- Line 82: `"Loading settings..."`
- Line 90: `"Settings"` (screen title)
- Line 97: `"Library Selection"` (section header)
- Line 101: `"Current Library"`
- Line 130: `"Playback Controls"` (section header)
- Line 136: `"Jump Forward Interval"`
- Line 159: `"Jump Backward Interval"`
- Line 190: `"Smart Rewind on Resume"`
- Line 193: `"Automatically rewind a few seconds when resuming playback after a pause. The rewind time increases based on how long playback was paused (3s to 30s)."`
- Line 203: `"Advanced"` (section header)
- Line 217: `"Auto-reconnect Background Service"`
- Line 220: `"Automatically reconnect the audio player background service when the app returns from background or after context recreation. Disable if experiencing issues with playback."`

### `/src/app/(tabs)/more/logs.tsx`

**Alert.alert() calls:**

- Line 344: `Alert.alert("Error", "Failed to load logs")`
- Line 389: `Alert.alert("Clear All Logs", "Are you sure you want to clear all logs?", [...])`
  - Button labels: "Cancel", "Clear"
- Line 402: `Alert.alert("Success", "All logs cleared")`
- Line 405: `Alert.alert("Error", "Failed to clear logs")`
- Line 427: `Alert.alert("Success", "Logs copied to clipboard")`
- Line 430: `Alert.alert("Error", "Failed to export logs to clipboard")`
- Line 461: `Alert.alert("Error", "Sharing is not available on this device")`
- Line 465: `Alert.alert("Error", "Failed to export logs to file")`

**UI Labels:**

- Line 231-232: `"Refresh"`
- Line 244: `"Earlier"`
- Line 252: `"Clear"`
- Line 266: `"Copy"`
- Line 274: `"Share File"`
- Line 500: `"Logs"` (screen title)
- Line 529: `"Search logs..."` (placeholder)
- Line 543: `"All"`
- Line 550: `"Debug"`
- Line 557: `"Info"`
- Line 564: `"Warn"`
- Line 571: `"Error"`
- Line 584: `"Filter by Tag"`
- Line 626: `"${filteredLogs.length} ${filteredLogs.length === 1 ? "log" : "logs"}"`
- Line 628: `"(filtered from ${logs.length})"`
- Line 629: `"${hiddenTagCount} tags hidden"`
- Line 645: `"No logs found"`

### `/src/app/(tabs)/more/logger-settings.tsx`

**Alert.alert() calls:**

- Line 76: `Alert.alert('Error', 'Failed to load logger settings')`
- Line 107: `Alert.alert('Error', \`Failed to set log level for tag "${tag}"\`)`
- Line 134: `Alert.alert('Error', 'Failed to update log retention')`
- Line 151: `Alert.alert('Error', 'Failed to update default log level')`

**UI Labels:**

- Line 24: `"1 hour"`, `"6 hours"`, `"12 hours"`, `"1 day"`, `"3 days"`, `"7 days"`
- Line 30: `"Default"`, `"Debug"`, `"Info"`, `"Warn"`, `"Error"`
- Line 173: `"Default Log Level"`
- Line 211: `"Log Retention"`
- Line 225: `"Not set"`
- Line 287: `"${availableTags.length - disabledTags.length} of ${availableTags.length} tags enabled"`
- Line 288: `"${disabledTags.length} disabled"`
- Line 289: `"DB: ${formatBytes(dbSize)}"`
- Line 324: `"Enable All"`
- Line 347: `"Disable All"`
- Line 357: `"Logger Settings"` (screen title)
- Line 375: `"No tags found. Tags appear after the app creates logs."`

### `/src/app/(tabs)/more/index.tsx`

**Alert.alert() calls:**

- Line 55: `Alert.alert('Log out', 'Are you sure you want to log out?', [...])`
  - Button labels: "Cancel", "Log out"

**UI Labels:**

- Line 43: `"About Me"`
- Line 44: `"Settings"`
- Line 45: `"Advanced"`
- Line 47: `"Logs"`
- Line 52: `"Log out"`
- Line 104: `"Version ${appVersion}"`
- Line 111: `"More"` (screen title)

### `/src/app/(tabs)/home/index.tsx`

**Alert messages** (already localized via translate()):

- Uses `translate('common.error')` and `translate('home.errors.loadHomeData')`
- Uses `translate('home.loading')`, `translate('home.requireLogin')`, `translate('home.emptyState')`

---

## 2. Component Labels & Status Text

### `/src/components/library/LibraryItemDetail/ChapterList.tsx`

- Line 71: `"No chapters available."`
- Line 94: `"Chapters (${chapters.length})"` (collapsible section title)
- Line 108: `"Show ${playedChapters.length} Played Chapter${playedChapters.length !== 1 ? 's' : ''}"`
- Line 126: `"Hide Played Chapters"`

### `/src/components/library/LibraryItemDetail/DownloadProgressView.tsx`

- Line 51: `"Preparing download..."`
- Line 62: `"Preparing download..."`
- Line 67: `"Downloading: ${downloadProgress.currentFile || ''}"`
- Line 68: `"Downloading file ${downloadProgress.downloadedFiles || 0} of ${downloadProgress.totalFiles || 0}"`
- Line 71: `"Download Complete!"`
- Line 74: `"Download Cancelled"`
- Line 77: `"Download Error"`
- Line 80: `"Download Paused"`
- Line 113: `"Overall Progress: ${Math.round((downloadProgress.totalProgress || 0) * 100)}%"`
- Line 126: `"Current File: ${Math.round((downloadProgress.fileProgress || 0) * 100)}%"`
- Line 150: `"Files: "`
- Line 160: `"Size: "`
- Line 171: `"Speed: "`
- Line 180: `"ETA: "`
- Line 219: `"⏸️ Pause"`
- Line 239: `"▶️ Resume"`
- Line 263: `"❌ Cancel"`

### `/src/components/player/SleepTimerControl.tsx`

- Line 76: `"Off"`
- Line 80: `"${target} (${formatTime(remainingTime)})"`
  - Where target is either `"Chapter"` or `"Next Chapter"`
- Line 94: `"${minutes} minutes"`
- Line 98: `"End of Current Chapter"`
- Line 102: `"End of Next Chapter"`
- Line 106: `"Turn Off"`
- Line 116: `"Sleep Timer"` (menu title)

### `/src/components/player/PlaybackSpeedControl.tsx`

- Line 32: `"Playback Speed"` (menu title)
- Line 39: `"${rate}x"`

### `/src/components/library/LibraryItemList.tsx`

- Line placeholder: `"Search by author, title, series, or narrator..."`

---

## 3. Screen Titles & Navigation

### `/src/app/(tabs)/authors/index.tsx`

- Line 35: `"Name"`, `"Name (Last Name)"`, `"Number of Books"`
- Line 86: `"${item.numBooks} book${item.numBooks !== 1 ? 's' : ''}"`
- Line 98: `"Loading authors..."`
- Line 99, 113, 135: `"Authors"` (screen title)
- Line 109: `"No authors found"`
- Line 111: `"Authors will appear here once you have books in your library"`

### `/src/app/(tabs)/series/index.tsx`

- Line 36: `"Name"`, `"Series Length"`, `"Date Added"`, `"Last Updated"`
- Line 43: `"1 book"`, `"${item.bookCount} books"`
- Line 76: `"Updated: ${new Date(item.updatedAt).toLocaleDateString()}"`
- Line 89: `"Loading series..."`
- Line 90, 104, 127: `"Series"` (screen title)
- Line 100: `"No series found"`
- Line 102: `"Series will appear here once you have books that are part of a series"`

### `/src/app/(tabs)/more/me.tsx`

- Line 23: `"Account"` (section title)
- Line 25: `"User"`, `"Server"`
- Line 30: `"Device Info"` (section title)
- Line 32: `"Device"`, `"N/A"`
- Line 33: `"OS"`, `"Unknown"`, `"v?.?"`
- Line 34: `"Type"`
- Line 35: `"Manufacturer"`
- Line 36: `"Model"`
- Line 37: `"SDK Version"`
- Line 38: `"Client"`
- Line 39: `"Device ID"`
- Line 62: `"About Me"` (screen title)

### `/src/app/(tabs)/more/advanced.tsx`

**UI Labels:**

- Line 91: `"Unknown item"`
- Line 97: `"Unknown item"`
- Line 105-121: State labels: `"None"`, `"Ready"`, `"Playing"`, `"Paused"`, `"Stopped"`, `"Buffering"`, `"Connecting"`, `"Error"`, `"Unknown"`
- Line 202: `"Error"` (TrackPlayer state error)
- Line 376: `"Metadata database"`
- Line 382: `"Log database"`
- Line 388: `"Cover cache"`
- Line 416: `"Total storage used"`
- Line 457: `"Library Stats"` (section title)
- Line 459: `"Libraries found: ${libraries.length}"`
- Line 460: `"Selected library: ${selectedLibrary?.name ?? 'None'}"`
- Line 461: `"Authors: ${counts.authors}"`
- Line 462: `"Genres: ${counts.genres}"`
- Line 463: `"Languages: ${counts.languages}"`
- Line 464: `"Narrators: ${counts.narrators}"`
- Line 465: `"Series: ${counts.series}"`
- Line 466: `"Tags: ${counts.tags}"`
- Line 471: `"Storage"` (section title)
- Line 477: `['Storage item', 'Files', 'Size']`
- Line 491: `"Track Player"` (section title)
- Line 493: `"State: ${trackPlayerState.state}"`
- Line 494: `"Queue length: ${trackPlayerState.queueLength}"`
- Line 496: `"Current track: "`, `"#${trackPlayerState.currentTrackIndex}"`, `"None"`
- Line 501: `"Track: "`, `"None"`
- Line 506: `"Position: "`, `" buffered"`
- Line 510: `"Playback rate: ${trackPlayerState.rate.toFixed(2)}x"`
- Line 511: `"Volume: ${(trackPlayerState.volume * 100).toFixed(0)}%"`
- Line 516: `"Actions"` (section title)
- Line 519: `"Copy access token to clipboard"`
- Line 528: `"Refresh libraries and items"`
- Line 533: `"Refresh all stats"`
- Line 538: `"Clear cover cache"`
- Line 543: `"Reset app"`
- Line 635: `"Advanced"` (screen title)

---

## 4. Existing Localization (i18n/locales/en.ts)

Currently localized strings:

- Authentication: Sign in, server URL, username, password placeholders
- Tabs: Home, Library, Series, Authors, More
- Home sections: Continue Listening, Downloaded, Listen Again
- Common: Error
- Home states: Loading, require login, empty state
- Library: Sort options, empty state, title
- Sort menu: Title, directions (A-Z, Z-A)

---

## 5. Recommendations

### High Priority (User-facing error/success messages)

1. All `Alert.alert()` calls should use localized strings
2. Download status messages
3. Playback error messages
4. Settings save confirmations

### Medium Priority (Screen labels & navigation)

1. Screen titles
2. Section headers
3. Button labels
4. Menu action labels

### Low Priority (Status text & formatting)

1. "Loading..." states
2. Count displays (e.g., "5 books")
3. File size/duration formatters

### Implementation Strategy

1. **Create comprehensive locale files** with all identified strings
2. **Add pluralization support** for count-based strings (e.g., "1 book" vs "5 books")
3. **Use context-aware keys** to avoid ambiguity (e.g., `download.status.preparing` vs `settings.loading`)
4. **Extract formatting functions** for common patterns (file sizes, durations, counts)
5. **Test with pseudo-localization** to identify missed strings

### Suggested Key Structure

```typescript
{
  // Alerts & Dialogs
  "alerts.error.userNotFound": "User not found",
  "alerts.error.updateFinishedStatus": "Failed to update finished status. Please try again.",
  "alerts.download.failed": "Failed to download library item: {error}",
  "alerts.download.delete.title": "Delete Download",
  "alerts.download.delete.message": "Are you sure you want to delete the downloaded files? This will free up storage space.",
  "alerts.playback.cannotPlay": "Cannot Play",
  "alerts.playback.itemNotFound": "Item not found.",

  // Common Actions
  "common.ok": "OK",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.download": "Download",
  "common.refresh": "Refresh",

  // Download States
  "download.status.preparing": "Preparing download...",
  "download.status.downloading": "Downloading: {filename}",
  "download.status.downloadingMultiple": "Downloading file {current} of {total}",
  "download.status.complete": "Download Complete!",
  "download.status.cancelled": "Download Cancelled",
  "download.status.error": "Download Error",
  "download.status.paused": "Download Paused",

  // Settings
  "settings.title": "Settings",
  "settings.sections.librarySelection": "Library Selection",
  "settings.sections.playbackControls": "Playback Controls",
  "settings.sections.advanced": "Advanced",
  "settings.loading": "Loading settings...",
  "settings.error.saveFailed": "Failed to save setting",

  // And so on...
}
```

---

## Next Steps

1. Review and approve the proposed localization structure
2. Create updated locale files with all identified strings
3. Systematically replace hardcoded strings with `translate()` calls
4. Add tests to ensure all user-facing strings are localized
5. Prepare for additional language support
