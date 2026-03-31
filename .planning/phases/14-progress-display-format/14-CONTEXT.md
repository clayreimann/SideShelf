# Phase 14: Progress Display Format - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

User can select a progress display format in Settings and see it consistently across all three player surfaces: full screen player, floating player, and item details player controls. This phase also collapses the ProgressSection into the MetadataSection on item details. Creating bookmarks, AirPlay, or redesigning the full screen player are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Format definitions (book-level time for all formats)

- **Time Remaining:** `"1h 23m remaining"` — friendly, matches existing hardcoded text
- **Elapsed / Total:** `"1:23:45 / 3:45:30"` — compact clock format, familiar from podcast apps
- **% Complete:** `"47%"` — minimal, no suffix
- All formats use **book-level** time (total audiobook position/duration), not chapter-level
- **Default format:** Time Remaining — zero visual disruption on first launch (matches current hardcoded text)

### Persistence

- Stored in `settingsSlice` + `appSettings.ts` (AsyncStorage) following the existing jump interval / smart rewind pattern
- Key: `@app/progressFormat` with values `"remaining" | "elapsed" | "percent"`
- Loaded in `initializeSettings()` alongside other settings

### Settings UI placement

- Progress Format lives in a new **"Player" section** in the Settings screen, grouped with jump forward/backward intervals and smart rewind
- Tapping "Progress Format" pushes to a sub-screen with a radio list (checkmark on active choice) — same pattern as jump interval selection
- **In the Phase 16 UIMenu:** the format toggle will use an inline radio-selection style with section dividers (not a push navigation) — note this for Phase 16 planning

### Full screen player surface

- Middle area below the chapter seek bar shows the format text
- Currently hardcoded as `"${formatTimeWithUnits(duration - currentPosition, false)} remaining"` — replace with formatter driven by `settings.progressFormat`
- Time references: book-level `duration` and `currentPosition` from `usePlayer()`

### Floating player surface

- **Layout (two-line, replacing existing two-line layout):**
  - Line 1: `"Chapter 5: Dark Forest | The Dark Forest"` — chapter title + `|` separator + book title. Chapter title can marquee/scroll if long; book title truncated with ellipsis.
  - Line 2: Progress format text (`"1h 23m remaining"` etc.)
- No mini progress bar — text format only
- Book-level time for all three formats

### Item details surface: ConsolidatedPlayerControls

- The chapter seek bar in ConsolidatedPlayerControls shows the format text below/near the bar
- Uses book-level time (player's `position` and `currentTrack.duration`)
- ProgressSection (standalone book-level progress box) is **removed** from item details — see below

### Item details surface: ProgressSection → MetadataSection collapse

- **Remove** the dedicated ProgressSection box (currently shows book-level bar + time labels + percentage)
- **Add** progress inline to the MetadataSection row: `Author · Narrator · Year · 3h 21m / 8h 00m · Downloaded`
  - Uses stored progress values (currentTime / duration) from `MediaProgressRow`
  - Format: elapsed / total time (`"3h 21m / 8h 00m"`) — always this format in metadata row, not the user's selected format (it's static book context, not the live player display)
  - Only shown when there is actual progress (currentTime > 0); not shown for unstarted items

### Claude's Discretion

- Exact typography/spacing for the progress text on each surface
- Marquee/scroll implementation for the floating player chapter title
- Formatter function location (new `src/lib/helpers/progressFormat.ts` or inline in settingsSlice is fine)

</decisions>

<specifics>
## Specific Ideas

- Phase 16 UIMenu (settings button): when the user opens it from the full screen player, the progress format toggle should use inline radio selection with section dividers — not a push navigation. Design it so the format can be changed without leaving the player.
- The floating player layout change (chapter | title on one line, progress on second) is a visual redesign driven by this feature — keep it clean and not cramped.

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `ProgressBar` (`src/components/ui/ProgressBar.tsx`): accepts `customPercentageText` prop — the format strings slot directly in. `showTimeLabels` + `showPercentage` control what's rendered alongside the bar.
- `settingsSlice` (`src/stores/slices/settingsSlice.ts`): established pattern for adding a new setting (add to state, add `update*` action, load in `initializeSettings`, persist via `appSettings.ts`)
- `appSettings.ts` (`src/lib/appSettings.ts`): `SETTINGS_KEYS` + getter/setter pattern — add `progressFormat` key here
- `usePlayer()` hook: exposes `position`, `currentTrack.duration` — book-level time is already available

### Established Patterns

- Settings persistence: `AsyncStorage` via `appSettings.ts`, loaded in `settingsSlice.initializeSettings()` with `Promise.all`
- Optimistic update + revert on error (all settings actions in settingsSlice follow this)
- `formatTimeWithUnits()` already exists in `src/app/FullScreenPlayer/index.tsx` — may need extracting to a shared util for reuse across surfaces

### Integration Points

- `src/app/FullScreenPlayer/index.tsx`: replace hardcoded `customPercentageText` with formatter call; read `settings.progressFormat` from store
- `src/components/ui/FloatingPlayer.tsx`: restructure the two info lines; add format text as second line
- `src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx`: add format text below chapter seek bar
- `src/components/library/LibraryItemDetail/ProgressSection.tsx`: **remove** this component from `LibraryItemDetail.tsx`
- `src/components/library/LibraryItemDetail/MetadataSection.tsx`: add inline elapsed/total time from `MediaProgressRow`
- `src/app/(tabs)/more/settings.tsx` (or wherever settings screen lives): add "Player" section with Progress Format row

</code_context>

<deferred>
## Deferred Ideas

- Phase 16: UIMenu settings button will include a "Progress Format" shortcut using inline radio selection (not push navigation) — design accordingly when building the UIMenu
- Future: full item details screen redesign may revisit the metadata row layout further

</deferred>

---

_Phase: 14-progress-display-format_
_Context gathered: 2026-03-09_
