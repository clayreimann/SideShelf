# Localization Audit — React Native Client

_Generated: 2025‑03‑06_

## Legend
| Status | Meaning |
| --- | --- |
| ⚠️ | Hard-coded user-facing string – needs extraction to i18n resources |
| ✅ | Uses the new `translate()` helper / already externalized |
| 🔄 | Runtime-composed string that will need tokenized translation support |

> Scope: `abs-react-native/src` (Expo/React Native application). Strings from supporting libraries or server projects are out of scope for this pass.

## High-Level Summary
- ✅ Screens already migrated: `src/app/login.tsx`, `src/app/(tabs)/home/index.tsx`, `src/app/(tabs)/library/index.tsx`, `src/components/ui/SortMenu.tsx`.
- ⚠️ 29 React/TSX files still contain hard-coded UI copy.
- ⚠️ 6 helper/utility files expose fallback text that surfaces in the UI (e.g., “Unknown Title”).
- 🔄 Several interpolated strings rely on template literals; these will need replacement with translation tokens (e.g., `` `Libraries found: ${libraries.length}` ``).

## Detailed Findings

### App Shell & Navigation
- ⚠️ `src/app/_layout.tsx:139` – `headerTitle: "Sign in"` (login modal title).  
- ⚠️ `src/app/_layout.tsx:138-144` – `presentation: "formSheet"` block still hard-codes header styling copy (consider moving to translation when localizing headers globally).

### Tabs & Layout
- ✅ `src/app/(tabs)/_layout.tsx` – tab labels already use `translate()`.
- ⚠️ `src/app/(tabs)/more/_layout.tsx:16` – Stack title resolved during render but still hard-coded via `translate('tabs.more')`; ensure key exists for every locale (already added in `en`, note for future locales).

### Library & Browsing Screens
- ✅ `src/app/(tabs)/library/index.tsx` – core copy now localized; keep `library.sortOptions.*` keys up to date.
- ⚠️ `src/components/ui/HeaderControls.tsx:20-47` – defaults: `"Sort"`, `"List"`, `"Grid"` (and optional `viewToggleLabel`) remain literal. Promote to translation props with sensible defaults from i18n.
- ⚠️ `src/components/library/LibraryItem.tsx:98` – `"Narrated by {item.narrator}"`.

### Series Screen
- ⚠️ `src/app/(tabs)/series/index.tsx:38-40` – sort option labels `"Name"`, `"Date Added"`, `"Last Updated"`.
- ⚠️ `src/app/(tabs)/series/index.tsx:58-60` – info row `"Updated: {date}"`.
- ⚠️ `src/app/(tabs)/series/index.tsx:70` – `"Loading series..."`.
- ⚠️ `src/app/(tabs)/series/index.tsx:71` – Stack header `"Series"`.
- ⚠️ `src/app/(tabs)/series/index.tsx:81-98` – empty-state messaging: `"No series found"`, `"Series will appear here..."`, `"Reload Series"`.
- ⚠️ `src/app/(tabs)/series/index.tsx:124` – commented Stack header uses literal string if re-enabled.

### Authors Screen
- ⚠️ `src/app/(tabs)/authors/index.tsx:37-38` – sort labels `"Name"`, `"Number of Books"`.
- ⚠️ `src/app/(tabs)/authors/index.tsx:51` – pluralization uses inline `"book"`/`"books"` logic; should move to i18n plural rules.
- ⚠️ `src/app/(tabs)/authors/index.tsx:61` – `"Loading authors..."`.
- ⚠️ `src/app/(tabs)/authors/index.tsx:72-88` – empty-state copy `"No authors found"`, `"Authors will appear..."`, `"Reload Authors"`.
- ⚠️ `src/app/(tabs)/authors/index.tsx:90` – literal header `"Authors"`.
- ⚠️ `src/app/(tabs)/authors/index.tsx:114` – header template `` `Authors (${items.length})` ``.

### “More” Section
- ⚠️ `src/app/(tabs)/more/index.tsx:20-25` – menu labels `"Collections"`, `"About Me"`, `"Settings"`, `"Advanced"`, `"Logs"`, `"Log out"`.
- ⚠️ `src/app/(tabs)/more/index.tsx:39` – Stack title `"More"` (now duplicated with layout header; align on single source).
- ⚠️ `src/app/(tabs)/more/collections.tsx:11-14` – `"Collections screen"` body and `"Collections"` header.
- ⚠️ `src/app/(tabs)/more/me.tsx:12-15` – `"ApiUser:"`, `"Audiobookshelf:"`, `"About Me"`.
- ⚠️ `src/app/(tabs)/more/settings.tsx:10-13` – `"Settings"` body/header.

#### Advanced Screen
- ⚠️ `src/app/(tabs)/more/advanced.tsx:86` – section title `"DB Info"`.
- 🔄 `src/app/(tabs)/more/advanced.tsx:89-127` – templated labels `` `Libraries found: ${libraries.length}` `` etc. Need parameterized translations for each (`libraries.count`, `libraries.selected`, `counts.authors`, etc.).
- ⚠️ `src/app/(tabs)/more/advanced.tsx:131` – title `"Device Info"` & subsequent entries using `"N/A"`, `"Unknown"`, `"Device:"`, `"OS:"`, `"Type:"`, `"Manufacturer:"`, `"Model:"`, `"SDK Version:"`, `"Client:"`, `"Device ID:"`.
- ⚠️ `src/app/(tabs)/more/advanced.tsx:182-217` – `"Actions"` section & button labels `"Copy access token to clipboard"`, `"Refresh libraries and items"`, `"Refresh counts"`, `"Clear cover cache"`, `"Reset app"`.
- ⚠️ `src/app/(tabs)/more/advanced.tsx:239` – header text reuse of section titles.
- ⚠️ `src/app/(tabs)/more/advanced.tsx:244-245` – Pressable text toggles rely on `styles.link` vs `styles.text`; ensure translated labels remain accessible.
- ⚠️ `src/app/(tabs)/more/advanced.tsx:254` – Stack title `"Advanced"`.

#### Logs Screen
- ⚠️ `src/app/(tabs)/more/logs.tsx:210-253` – action buttons `"Refresh"`, `"Earlier"`, `"Clear"`, `"Copy"`, `"Share File"`.
- ⚠️ `src/app/(tabs)/more/logs.tsx:323` – alert dialog `"Error" / "Failed to load logs"`.
- ⚠️ `src/app/(tabs)/more/logs.tsx:359-375` – confirmation `"Clear All Logs"`, question `"Are you sure..."`, buttons `"Cancel"`, `"Clear"`.
- ⚠️ `src/app/(tabs)/more/logs.tsx:368-375` – success/error alerts `"Success"`, `"All logs cleared"`, `"Failed to clear logs"`.
- ⚠️ `src/app/(tabs)/more/logs.tsx:393-397` – clipboard export `"Logs copied to clipboard"` + error string.
- ⚠️ `src/app/(tabs)/more/logs.tsx:414-427` – file export copy: `"Export Logs"`, `"Sharing is not available on this device"`, `"Failed to export logs to file"`.
- ⚠️ `src/app/(tabs)/more/logs.tsx:466-475` – Stack title `"Logs"` and header button icon (labelless but consider accessibility).
- ⚠️ `src/app/(tabs)/more/logs.tsx:488-512` – search placeholder `"Search logs..."`.
- ⚠️ `src/app/(tabs)/more/logs.tsx:508-539` – filter badges `"All"`, `"Debug"`, `"Info"`, `"Warn"`, `"Error"`.
- ⚠️ `src/app/(tabs)/more/logs.tsx:545-575` – `"Filter by Tag"` and toggle indicator (`"▼"`/`"▶"` – consider LTR/RTL).
- ⚠️ `src/app/(tabs)/more/logs.tsx:591-597` – summary string `` `{filteredLogs.length} log(s)` `` and hidden tag annotation.
- ⚠️ `src/app/(tabs)/more/logs.tsx:609-612` – empty-state `"No logs found"`.

#### Logger Settings
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:15` – log tag `LoggerSettingsScreen` (internal).
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:18-23` – retention options `"1 hour"`, `"6 hours"`, `"12 hours"`, `"1 day"`, `"3 days"`, `"7 days"`.
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:47-48` – alert `"Error" / "Failed to load logger settings"`.
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:89-90` – alert `"Failed to update log retention"`.
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:145-153` – description text block.
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:156-207` – `"Log Retention"` heading + explanatory copy + option labels (reused above).
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:212-214` – status bar `` `{availableTags.length - disabledTags.length} of ...` ``.
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:226-229` – empty-state `"No tags found. Tags appear after the app creates logs."`
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:244-288` – action buttons `"Enable All"`, `"Disable All"`.
- ⚠️ `src/app/(tabs)/more/logger-settings.tsx:145` – Stack title `"Logger Settings"`.

### Player Experience
- ⚠️ `src/app/FullScreenPlayer/index.tsx:147` – fallback `"Loading..."` for chapter title.
- ⚠️ `src/app/FullScreenPlayer/index.tsx:157` – close button `"Done"`.
- ⚠️ `src/app/FullScreenPlayer/index.tsx:214` – suffix `"remaining"` inside template literal (needs tokenization).
- ⚠️ `src/app/FullScreenPlayer/index.tsx:239` – label `"Speed"`.
- ⚠️ `src/app/FullScreenPlayer/index.tsx:270` – label `"Volume"`.
- ⚠️ `src/components/ui/FloatingPlayer.tsx:41` – fallback `"Loading..."`.
- ⚠️ `src/components/ui/FloatingPlayer.tsx:70` – placeholder `"No track selected"`.
- ⚠️ `src/components/ui/FloatingPlayer.tsx:79` – placeholder `"No selection"`.

### Library Item Detail
- ⚠️ `src/components/library/LibraryItemDetail.tsx:167` – fallback `"Unknown Title"`.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:179` – error title `"Item not found"` (passed to `onTitleChange`).
- ⚠️ `src/components/library/LibraryItemDetail.tsx:452-455` – alert `"Download Failed"`, message `` `Failed to download library item: ${error}` ``, button `"OK"`.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:465-498` – confirmation `"Delete Download"` with body `"Are you sure..."`, buttons `"Cancel"`, `"Delete"`, follow-up `"Delete Failed"` alert.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:526` – alert `"Cannot Play"` / `"Item not found."`.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:543` – alert `"Playback Failed"` with templated message and `"OK"`.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:565` – empty-state `"Item not found."`.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:571-575` – fallbacks `"Unknown Title"` / `"Unknown Author"`.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:735-758` – play button states `"Loading..."`, `"Pause"`, `"Play"`.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:820` – collapsible section `"Description"`.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:835` – section title `` `Audio Files (${audioFiles.length})` ``.
- ⚠️ `src/components/library/LibraryItemDetail.tsx:855-870` – inline labels `"Duration:"`, fallback `"Unknown"`, `"Size:"`, `"⬇ Downloaded"`.

#### Subcomponents
- ⚠️ `src/components/library/LibraryItemDetail/ChapterList.tsx:17` – `"No chapters available."`
- ⚠️ `src/components/library/LibraryItemDetail/ChapterList.tsx:24` – heading `` `Chapters (${chapters.length})` ``.
- ⚠️ `src/components/library/LibraryItemDetail/DownloadProgressView.tsx:51` – `"Preparing download..."`.
- ⚠️ `src/components/library/LibraryItemDetail/DownloadProgressView.tsx:66-82` – status strings `"Downloading:"`, `"Downloading file {x} of {y}"`, `"Download Complete!"`, `"Download Cancelled"`, `"Download Error"`, `"Download Paused"`.
- ⚠️ `src/components/library/LibraryItemDetail/DownloadProgressView.tsx:112-188` – labels `"Overall Progress:"`, `"Current File:"`, `"Files:"`, `"Size:"`, `"Speed:"`, `"ETA:"`.
- ⚠️ `src/components/library/LibraryItemDetail/DownloadProgressView.tsx:219-257` – control buttons `"⏸️ Pause"`, `"▶️ Resume"`, `"Cancel"`.

### Generic Fallbacks & Utilities
- ⚠️ `src/services/DownloadService.ts:661` – `currentFile: 'Unknown'` (surface in download progress view).
- ⚠️ `src/services/PlayerService.ts:239-240` – fallback title/author `"Unknown Title"`, `"Unknown Author"` for player state; ensure localization matches UI keys.
- ⚠️ `src/services/ProgressService.ts:639,668,688` – failure reasons `'Unknown sync error'`, `'Unknown error'` persisted to logs/UI badges (if exposed to users).
- ⚠️ `src/lib/api/api.ts:142` – platform string fallback `'Unknown'`.
- ⚠️ `src/db/helpers/*` – multiple `'Unknown Title'`, `'Unknown ApiAuthor'`, `'Unknown Series'` values used when seeding rows. Confirm whether they surface in UI; if so, pull from translations.

### Already Localized (Reference)
- ✅ `src/app/login.tsx` – all copy uses `translate()` keys (`auth.*`).
- ✅ `src/app/(tabs)/home/index.tsx` – section titles, errors, loading states via `translate()`.
- ✅ `src/app/(tabs)/library/index.tsx` – empty state and header copy via `translate()`.
- ✅ `src/components/ui/SortMenu.tsx` – modal title & sort direction labels localized.

## Recommendations
1. **Expand `src/i18n/locales/en.ts`** with keys covering every ⚠️ entry. Use nested namespaces (`players.*`, `library.detail.*`, `more.logs.*`) to keep structure navigable.
2. **Replace template literals** with `translate()` calls and interpolation maps, e.g.\
   ```ts
   translate('advanced.librariesFound', { count: libraries.length })
   ```
   Configure ICU pluralization where counts vary.
3. **Headings & Stack titles** – centralize via a helper so Stack options read from translations (consider `withScreenOptions(key)` utility).
4. **Fallback constants** (`"Unknown Title"`, `"N/A"`) – move into `i18n` to keep terminology consistent across app and services.
5. **Accessibility** – when localizing icon-only controls (Logs header gear, action glyph buttons), ensure translated `accessibilityLabel` strings accompany them.

Once the above items are addressed, re-run this audit (or integrate an ESLint rule) to keep hard-coded text from re-entering the codebase.
