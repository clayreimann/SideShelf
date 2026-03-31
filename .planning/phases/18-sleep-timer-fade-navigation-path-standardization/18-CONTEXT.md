# Phase 18: Sleep Timer Fade + Navigation + Path Standardization - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Four independent workstreams:

1. **Sleep timer fade (SLEEP-01):** Volume fades linearly to silence over the last 30 seconds before the sleep timer stops playback. Volume restores to pre-fade value on cancel or completion.
2. **More tab navigation (NAVIGATION-01/02):** Tapping a series or author from the More tab navigates to the correct detail screen within the More tab's stack (not escaping to the Series/Authors tabs).
3. **Deep linking (NAVIGATION-03):** App registers `sideshelf://` scheme and handles navigation + playback action URLs from outside the app. Supports iOS Shortcuts/Intents.
4. **Path standardization (DEBT-01):** File paths stored in the database are normalized — decoded (no percent-encoding), app-relative (`D:`/`C:` prefix scheme), no `file://` prefix. Researcher audits all path-writing DB helpers and identifies dirty write sites.

</domain>

<decisions>
## Implementation Decisions

### Sleep fade behavior

- **Fade location:** Logic lives in `PlayerBackgroundService` — already runs in background, already checks remaining time each tick. No new infrastructure needed.
- **Fade window:** 30 seconds before the timer fires (matches SLEEP-01 requirement).
- **UI visibility:** Silent fade — audio volume fades but the volume slider/display in the app does NOT visually change. User doesn't see the fade happening.
- **Cancel behavior:** If the user cancels the sleep timer mid-fade, volume restores **immediately** (snap, no ramp-up) to the pre-fade value.
- **On completion:** When the timer reaches 0 and stops playback, volume restores to pre-fade value **at the same moment as the stop**. Next play resumes at normal volume — user never needs to re-adjust.

### Series/Authors navigation (More tab)

- **Fix:** Add `more/series/[seriesId].tsx` and `more/authors/[authorId].tsx` routes + register them in `more/_layout.tsx`. Detail screens stay within the More tab's Stack — back button returns to the series/authors list in More.
- **Approach:** Same screen components as the dedicated tabs (re-export the detail screens), but push to More-stack-scoped paths so navigation stays within the More tab.
- **Problem being fixed:** `router.push('/series/ID')` in the shared `SeriesScreen` escapes to the Series tab stack rather than staying in More. Fix: More tab's list screens push to a relative path that resolves within the More stack.

### Deep link scheme

- **Scheme:** Change from `"side-shelf"` to `"sideshelf"` in `app.json`. Matches the requirement and the server's expected format. Requires a new build.

### Deep link URL targets

Supported URLs (all require the user to be logged in — unauthenticated links go to the login screen, the deep link is discarded):

| URL                                            | Behavior                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `sideshelf://` or `sideshelf://home`           | Open home/library tab                                                                                                         |
| `sideshelf://library`                          | Open library tab                                                                                                              |
| `sideshelf://series`                           | Open series tab                                                                                                               |
| `sideshelf://authors`                          | Open authors tab                                                                                                              |
| `sideshelf://more`                             | Open more tab                                                                                                                 |
| `sideshelf://item/[libraryItemId]`             | Navigate to item detail screen (no auto-play)                                                                                 |
| `sideshelf://item/[libraryItemId]?action=open` | Same as above                                                                                                                 |
| `sideshelf://item/[libraryItemId]?action=play` | Navigate to item detail screen AND start playback from last position                                                          |
| `sideshelf://resume`                           | Resume most recently playing item from last saved position (no navigation — stays on current screen, floating player appears) |
| `sideshelf://play-pause`                       | Toggle play/pause for whatever is currently loaded                                                                            |

**Error handling:**

- Unauthenticated: navigate to login screen, discard the deep link.
- Item not found / no access: show error toast, stay on current screen.
- `sideshelf://resume` with nothing loaded: no-op (or toast: "Nothing to resume").

**iOS Shortcuts/Intents:** These URLs are the intended targets. `sideshelf://resume` and `sideshelf://play-pause` are the primary Shortcuts use cases.

### Path standardization (DEBT-01)

- **Scope:** Researcher audits ALL path-writing DB helpers to find every column that stores file paths and identifies which write sites bypass `toAppRelativePath()`.
- **Two-part fix:**
  1. **SQL migration:** Clean up existing dirty rows — strip `file://` prefix, decode percent-encoded segments (e.g. `Columbus%20Day.m4b` → `Columbus Day.m4b`), convert to `D:`/`C:` prefix scheme. This is a one-time migration added to the Drizzle migrations.
  2. **Write-time enforcement:** Ensure all DB helper write sites call `toAppRelativePath()` before writing. Researcher identifies the specific files/lines that bypass it.
- **Goal state:** No DB row contains a `file://` path, a percent-encoded path segment, or a bare absolute path. All paths use the `D:`/`C:` prefix scheme.
- **Read-time:** `resolveAppPath()` already handles the `D:`/`C:` prefixes — no changes needed there.

### Claude's Discretion

- Sleep fade implementation detail (setInterval cadence in PlayerBackgroundService vs. calculating steps)
- How `PlayerBackgroundService` stores the pre-fade volume to restore it on cancel/completion
- Exact deep link routing implementation (Expo Router `+native-intent.tsx` or custom `Linking.addEventListener`)
- Whether `sideshelf://resume` loads the item detail screen or just silently starts audio via the coordinator
- Percent-decoding approach for the SQL migration (SQL `replace()` for common cases vs. migration script)

</decisions>

<specifics>
## Specific Ideas

- Deep links are intended to power iOS Shortcuts and Siri Shortcuts actions. The `sideshelf://resume` and `sideshelf://play-pause` URLs are the primary Shortcuts targets — keep them simple (no required params).
- Phase 17 bookmark jump precedent: tapping to an item navigates but doesn't auto-open full screen player. Deep link `sideshelf://item/[ID]` follows same convention — navigate to item detail, user expands player manually.
- Path standardization: the existing `fileSystem.ts` (`toAppRelativePath` / `resolveAppPath`) is the correct target format. The issue is inconsistent use at write sites — not a problem with the scheme itself.

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `src/components/player/SleepTimerControl.tsx`: UI component — has `cancelSleepTimer` and timer display. No changes likely needed here for fade (fade is implemented in background service).
- `src/stores/slices/playerSlice.ts`: `cancelSleepTimer()`, `getSleepTimerRemaining()`, `_setVolume()` — the slice already manages volume. Background service can call `_setVolume()` during fade ticks and restore via the same call.
- `src/app/(tabs)/more/_layout.tsx`: Stack layout registers `series` and `authors` screens but NOT their detail sub-routes. Add `[seriesId]` and `[authorId]` to this layout.
- `src/app/(tabs)/more/series.tsx` and `authors.tsx`: Already exist, re-exporting the shared screen components. Need companion detail route files.
- `src/lib/fileSystem.ts`: `toAppRelativePath(path)` — converts absolute/file:// paths to `D:`/`C:` prefix scheme. `resolveAppPath(path)` — resolves stored paths back to absolute. These are the correct functions to enforce at write boundaries.
- `src/db/helpers/migrationHelpers.ts`: Prior migration pattern for cover URL preservation — template for the path cleanup migration.
- `app.json` / `app.config.js`: Both set `scheme: "side-shelf"` — need to update to `"sideshelf"`.

### Established Patterns

- Expo Router deep linking: Expo Router v3 with `+native-intent.tsx` (or `expo-router/build/link/linking.ts` config). Researcher should investigate the current Expo SDK 54 + Expo Router recommendation.
- Background service volume: `playerService.executeSetVolume()` exists (seen in coordinator) — this is the right path for the background service to set volume without going through the coordinator event bus.
- Drizzle migrations: `src/db/migrations/` — add a new migration file for the path cleanup SQL. Always test migration rollback safety.

### Integration Points

- `src/services/PlayerBackgroundService.ts` (or equivalent) → add fade logic to sleep timer tick
- `src/app/(tabs)/more/_layout.tsx` → add `[seriesId]` and `[authorId]` Stack.Screen entries
- `src/app/(tabs)/more/series/[seriesId].tsx` _(new)_ → re-export series detail screen
- `src/app/(tabs)/more/authors/[authorId].tsx` _(new)_ → re-export author detail screen
- `app.json` + `app.config.js` → `scheme: "sideshelf"`
- Deep link handler (new file or root layout) → parse `sideshelf://` URLs and dispatch navigation/playback
- `src/db/migrations/XXXX_normalize_paths.sql` _(new)_ → SQL migration cleaning dirty rows
- DB helpers identified by researcher → add `toAppRelativePath()` calls at write sites

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

_Phase: 18-sleep-timer-fade-navigation-path-standardization_
_Context gathered: 2026-03-16_
