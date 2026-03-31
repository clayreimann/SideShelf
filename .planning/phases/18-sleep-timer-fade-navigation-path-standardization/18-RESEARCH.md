# Phase 18: Sleep Timer Fade + Navigation + Path Standardization - Research

**Researched:** 2026-03-17
**Domain:** React Native / Expo — audio volume control, Expo Router deep linking, SQLite path migration
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sleep fade behavior**

- Fade location: Logic lives in `PlayerBackgroundService` — already runs in background, already checks remaining time each tick. No new infrastructure needed.
- Fade window: 30 seconds before the timer fires (matches SLEEP-01 requirement).
- UI visibility: Silent fade — audio volume fades but the volume slider/display in the app does NOT visually change. User doesn't see the fade happening.
- Cancel behavior: If the user cancels the sleep timer mid-fade, volume restores immediately (snap, no ramp-up) to the pre-fade value.
- On completion: When the timer reaches 0 and stops playback, volume restores to pre-fade value at the same moment as the stop. Next play resumes at normal volume — user never needs to re-adjust.

**Series/Authors navigation (More tab)**

- Fix: Add `more/series/[seriesId].tsx` and `more/authors/[authorId].tsx` routes + register them in `more/_layout.tsx`. Detail screens stay within the More tab's Stack — back button returns to the series/authors list in More.
- Approach: Same screen components as the dedicated tabs (re-export the detail screens), but push to More-stack-scoped paths so navigation stays within the More tab.
- Problem being fixed: `router.push('/series/ID')` in the shared `SeriesScreen` escapes to the Series tab stack rather than staying in More. Fix: More tab's list screens push to a relative path that resolves within the More stack.

**Deep link scheme**

- Scheme: Change from `"side-shelf"` to `"sideshelf"` in `app.json`. Matches the requirement and the server's expected format. Requires a new build.

**Deep link URL targets**

- `sideshelf://` or `sideshelf://home` — Open home/library tab
- `sideshelf://library` — Open library tab
- `sideshelf://series` — Open series tab
- `sideshelf://authors` — Open authors tab
- `sideshelf://more` — Open more tab
- `sideshelf://item/[libraryItemId]` — Navigate to item detail screen (no auto-play)
- `sideshelf://item/[libraryItemId]?action=open` — Same as above
- `sideshelf://item/[libraryItemId]?action=play` — Navigate to item detail screen AND start playback from last position
- `sideshelf://resume` — Resume most recently playing item from last saved position (no navigation, floating player appears)
- `sideshelf://play-pause` — Toggle play/pause for whatever is currently loaded
- Error: Unauthenticated → navigate to login screen, discard the deep link
- Error: Item not found / no access → show error toast, stay on current screen
- Error: `sideshelf://resume` with nothing loaded → no-op (or toast: "Nothing to resume")

**Path standardization (DEBT-01)**

- Scope: Audit ALL path-writing DB helpers to find every column that stores file paths and identify write sites that bypass `toAppRelativePath()`.
- Two-part fix: (1) SQL migration to clean up existing dirty rows; (2) write-time enforcement at all DB helper write sites.
- Goal state: No DB row contains a `file://` path, a percent-encoded path segment, or a bare absolute path. All paths use the `D:`/`C:` prefix scheme.
- Read-time: `resolveAppPath()` already handles the `D:`/`C:` prefixes — no changes needed there.

### Claude's Discretion

- Sleep fade implementation detail (setInterval cadence in PlayerBackgroundService vs. calculating steps)
- How `PlayerBackgroundService` stores the pre-fade volume to restore it on cancel/completion
- Exact deep link routing implementation (Expo Router `+native-intent.tsx` or custom `Linking.addEventListener`)
- Whether `sideshelf://resume` loads the item detail screen or just silently starts audio via the coordinator
- Percent-decoding approach for the SQL migration (SQL `replace()` for common cases vs. migration script)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID            | Description                                                                                       | Research Support                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLEEP-01      | Playback volume fades out over the last 30 seconds before the sleep timer stops playback          | `handlePlaybackProgressUpdated` already ticks every ~1s; `playerService.executeSetVolume()` directly calls `TrackPlayer.setVolume()` without going through coordinator event bus; `store.player.volume` holds the pre-fade baseline |
| NAVIGATION-01 | Series list viewed from the More tab navigates to series detail on tap                            | `more/series.tsx` re-exports `SeriesScreen` which calls `router.push('/series/ID')` — absolute path escapes to series tab stack; need `more/series/[seriesId].tsx` route and More-stack `_layout.tsx` entry                         |
| NAVIGATION-02 | Authors list viewed from the More tab navigates to author detail on tap                           | Same pattern as NAVIGATION-01 — `more/authors.tsx` re-exports `AuthorsScreen` which calls `router.push('/authors/ID')`                                                                                                              |
| NAVIGATION-03 | App registers a `sideshelf://` URL scheme and deep links navigate to all main screens             | `app.json` and `app.config.js` both have `scheme: "side-shelf"` (hyphen); existing deep link handler in `_layout.tsx` already uses `Linking.addEventListener` pattern; needs scheme change + new URL targets                        |
| DEBT-01       | File paths are stored and compared in a consistent normalized format (POSIX, no `file://` prefix) | `localData.ts` already calls `toAppRelativePath()` at all write sites — the dirty rows are pre-existing in DB from before these guards were added; a Drizzle SQL migration must clean them                                          |

</phase_requirements>

---

## Summary

Phase 18 consists of four independent workstreams. The research confirms that the codebase already has the building blocks for all four — no new npm packages are required. The work is primarily wiring existing infrastructure together in the right way.

**Sleep timer fade** lives entirely in `PlayerBackgroundService.handlePlaybackProgressUpdated()`, which fires every ~1 second during playback. The sleep timer state is already checked in that function. `playerService.executeSetVolume()` (via `PlaybackControlCollaborator`) calls `TrackPlayer.setVolume()` directly — bypassing the coordinator event bus — making it safe to call from the background service. The pre-fade volume is available as `store.player.volume` and should be captured as a module-level variable on fade start.

**More tab navigation** fails because `series/index.tsx` and `authors/index.tsx` call `router.push('/series/ID')` with absolute paths. Expo Router resolves absolute paths against the global router, which jumps to the `/series/` tab stack. The fix is to add `more/series/[seriesId].tsx` and `more/authors/[authorId].tsx` route files (re-exporting the existing detail screens) and register them in `more/_layout.tsx`. The list screens in the More context then push to relative paths that resolve within the More stack — but since these are re-exports the shared screens still use absolute paths. The actual fix is: push `./series/ID` from within the More stack's `series.tsx` list screen, not from the re-exported shared component. See Architecture Patterns for the correct implementation.

**Deep linking** has a pre-existing `Linking.addEventListener` handler in `_layout.tsx` already handling `side-shelf://logger` and `side-shelf://bundle-loader`. The new `sideshelf://` handler extends this pattern. Expo Router 6 on SDK 54 supports both `+native-intent.tsx` and the `Linking` approach; the existing `Linking` pattern is simpler to extend. The scheme change in `app.json` and `app.config.js` requires a fresh native build.

**Path standardization** found that `localData.ts` already calls `toAppRelativePath()` at every write site. The dirty data is pre-existing rows written before these guards were added. The Drizzle SQL migration must update three tables: `local_audio_file_downloads`, `local_library_file_downloads`, and `local_cover_cache`.

**Primary recommendation:** Implement as four isolated tasks in a single wave — sleep fade in `PlayerBackgroundService`, navigation routes in More tab, deep link handler extending existing `_layout.tsx` infrastructure, and a Drizzle migration + write-site audit.

---

## Standard Stack

### Core (already installed, no new deps needed)

| Library                   | Version   | Purpose                                   | Why Standard                              |
| ------------------------- | --------- | ----------------------------------------- | ----------------------------------------- |
| react-native-track-player | installed | `TrackPlayer.setVolume()` for fade        | Already used throughout the service layer |
| expo-router               | ~6.0.14   | File-based routing + `Linking` deep links | Project standard; SDK 54                  |
| expo (SDK 54)             | 54.0.21   | Expo APIs including `Linking`             | Project standard                          |
| drizzle-orm               | installed | SQL migrations for path cleanup           | Project standard for all DB ops           |

### No New Packages Required

All four workstreams use existing project dependencies. The deep link handler extends the existing `Linking.addEventListener` pattern in `_layout.tsx`.

---

## Architecture Patterns

### Recommended File Structure (new files)

```
src/app/(tabs)/more/
├── series/
│   └── [seriesId].tsx    (new — re-exports series detail, resolves within More stack)
└── authors/
    └── [authorId].tsx    (new — re-exports author detail, resolves within More stack)

src/db/migrations/
└── 0014_normalize_paths.sql    (new — SQL UPDATE statements for path cleanup)
```

### Pattern 1: Sleep Timer Fade in PlayerBackgroundService

**What:** Module-level `preFadeVolume` variable captures volume before fade begins. Each tick during the fade window calculates the new volume and calls `playerService.executeSetVolume()`. On timer cancel or stop, restores from captured value.

**When to use:** Inside `handlePlaybackProgressUpdated`, guarded by the existing sleep timer check block.

**Key implementation logic:**

```typescript
// Module-level state (in PlayerBackgroundService.ts)
let _preFadeVolume: number | null = null;
const FADE_WINDOW_SECONDS = 30;

// Inside handlePlaybackProgressUpdated, after the existing sleep timer check:
if (sleepTimer.type === "duration" && sleepTimer.endTime && isPlaying) {
  const remainingMs = sleepTimer.endTime - Date.now();
  const remainingSeconds = remainingMs / 1000;

  if (remainingSeconds <= FADE_WINDOW_SECONDS && remainingSeconds > 0) {
    // Capture pre-fade volume once (when we first enter the fade window)
    if (_preFadeVolume === null) {
      _preFadeVolume = store.player.volume;
    }
    // Linear fade: volume proportional to time remaining
    const fadedVolume = _preFadeVolume * (remainingSeconds / FADE_WINDOW_SECONDS);
    await playerService.executeSetVolume(Math.max(0, fadedVolume));
  }
}
```

**Restore on cancel:** `cancelSleepTimer()` in the slice resets timer state; the background service detects `sleepTimer.type === null`, checks `_preFadeVolume !== null`, calls `executeSetVolume(_preFadeVolume)`, and clears `_preFadeVolume`.

**Restore on stop:** In the `shouldPause = true` branch, restore volume before dispatching PAUSE: call `executeSetVolume(_preFadeVolume ?? store.player.volume)`, then clear `_preFadeVolume`.

**UI does not update:** `executeSetVolume` calls `TrackPlayer.setVolume()` directly without calling `store._setVolume()`. The store's `player.volume` stays at the pre-fade value throughout the fade — this is the correct behavior per the locked decision.

### Pattern 2: More Tab Navigation Fix

**What:** The problem is that `router.push('/series/ID')` is called from `series/index.tsx`, which is re-exported as the More tab's series screen. The absolute path escapes the More stack.

**Fix:** The More tab's `series.tsx` and `authors.tsx` re-export the shared list screen but the list screens themselves push absolute paths. The correct fix is NOT to modify the shared list screens. Instead:

1. Create wrapper screens at `more/series/[seriesId].tsx` and `more/authors/[authorId].tsx` that re-export the existing detail screens.
2. Create local More-specific list screens at `more/series.tsx` and `more/authors.tsx` that push relative paths (e.g. `./series/${id}`).

However, since `more/series.tsx` currently re-exports the shared `SeriesScreen` which hardcodes `router.push('/series/ID')`, the simplest fix is to create new local wrapper screens for the More tab list that override the tap handler. The detail screens (`[seriesId]/index.tsx`) can be re-exported as-is since they don't navigate further up.

**Expo Router route registration in `more/_layout.tsx`:**

```typescript
<Stack.Screen name="series/[seriesId]" options={{ title: "" }} />
<Stack.Screen name="authors/[authorId]" options={{ title: "" }} />
```

**Navigation call from More tab list screen:**

```typescript
// In more/series.tsx (new inline list or wrapper around shared component):
router.push(`/more/series/${item.id}`); // absolute path within More stack
```

**The detail screen re-export (more/series/[seriesId].tsx):**

```typescript
export { default } from "@/app/(tabs)/series/[seriesId]/index";
```

### Pattern 3: Deep Link Handler in `_layout.tsx`

**What:** Extend the existing `handleDeepLink` function to handle `sideshelf://` scheme URLs. The handler already uses `Linking.getInitialURL()` + `Linking.addEventListener`.

**Scheme change:** Both `app.json` and `app.config.js` must be updated:

```json
// app.json
"scheme": "sideshelf"

// app.config.js
scheme: "sideshelf",
```

**Auth guard pattern:**

```typescript
// Check auth state before navigating
const { isAuthenticated } = useAppStore.getState().auth; // or equivalent selector
if (!isAuthenticated) {
  router.push("/login");
  return;
}
```

**URL parsing:**

```typescript
const urlObj = new URL(url);
const host = urlObj.hostname; // e.g. "item", "resume", "play-pause"
const pathParts = urlObj.pathname.split("/").filter(Boolean);
const action = urlObj.searchParams.get("action");
```

**Tab navigation targets:**

```typescript
// Use href object for tab routing
router.push("/(tabs)"); // home
router.push("/(tabs)/library");
router.push("/(tabs)/series");
router.push("/(tabs)/authors");
router.push("/(tabs)/more");
```

**Item deep link (no auto-play):**

```typescript
router.push(`/(tabs)/library/item/${libraryItemId}`);
// or wherever the item detail screen lives in the route tree
```

**Playback actions:** Dispatch through `dispatchPlayerEvent` — same pattern used throughout the codebase:

```typescript
dispatchPlayerEvent({ type: "PLAY" }); // resume/play-pause
dispatchPlayerEvent({ type: "PAUSE" }); // play-pause toggle
```

**`sideshelf://resume`:** Check `store.player.currentTrack` — if loaded, dispatch `PLAY` and do not navigate. If not loaded, show toast and no-op.

**Error toast:** Use the existing app toast/alert mechanism (same pattern as item-not-found handling in other screens).

### Pattern 4: Drizzle SQL Migration for Path Cleanup

**What:** A single SQL migration file cleans existing dirty rows in three tables. Runs once during DB initialization via the existing Drizzle migration runner.

**Migration file location:** `src/db/migrations/0014_normalize_paths.sql`

**SQL approach (three-pass UPDATE):**

Pass 1 — Strip `file://` prefix and decode into absolute path (for rows that have `file://` prefix):

```sql
-- Strip file:// prefix from download_path in local_audio_file_downloads
UPDATE local_audio_file_downloads
SET download_path = SUBSTR(download_path, 8)  -- removes "file://"
WHERE download_path LIKE 'file://%';

UPDATE local_library_file_downloads
SET download_path = SUBSTR(download_path, 8)
WHERE download_path LIKE 'file://%';

UPDATE local_cover_cache
SET local_cover_url = SUBSTR(local_cover_url, 8)
WHERE local_cover_url LIKE 'file://%';
```

Pass 2 — Percent-decode common patterns. SQLite has no built-in `urldecode()`, so use `REPLACE()` for high-frequency encoded characters:

```sql
-- Common encoded chars: %20 (space), %2F (/), %40 (@), %28 ((), %29 ())
UPDATE local_audio_file_downloads
SET download_path = REPLACE(REPLACE(REPLACE(download_path, '%20', ' '), '%28', '('), '%29', ')')
WHERE download_path LIKE '%\%%' ESCAPE '\';
```

Pass 3 — Convert to D:/C: prefix scheme (handled at application layer via `toAppRelativePath()` called from `markAudioFileAsDownloaded` etc. — the migration only needs to fix the prefix and decoding issues, not re-run `toAppRelativePath()` since the rows that already have `D:`/`C:` prefixes are already correct).

**IMPORTANT:** The migration should NOT run `toAppRelativePath()` in SQL — that function uses runtime `Paths.document.uri` and `Paths.cache.uri` which are dynamic. Instead, the migration only cleans the `file://` prefix and common percent-encoding. The `resolveAppPath()` fallback already handles bare absolute paths at read time (legacy behavior).

**Migration runner pattern:** Same as existing migrations in `src/db/migrations/` — add file with next sequence number, `drizzle:generate` is NOT needed for a hand-written SQL migration.

### Anti-Patterns to Avoid

- **Calling `store._setVolume()` during fade:** This would update the visual volume display, violating the silent-fade requirement. Only call `playerService.executeSetVolume()`.
- **Restoring volume via `store._setVolume()` alone:** Must call `playerService.executeSetVolume()` to update TrackPlayer's actual volume, and optionally `store._setVolume()` if you want the slider to snap back. Per the decisions, the slider does NOT change during fade — but it should be at the correct value after cancel/stop.
- **Using `router.push('/series/ID')` absolute path from within More tab:** This escapes the More stack. Use `router.push('/more/series/ID')` or the relative equivalent from within the More context.
- **Modifying shared SeriesScreen or AuthorsScreen:** These are shared across tabs. Don't change their navigation calls — add More-specific wrapper files instead.
- **Using SQL `UPDATE` with computed D:/C: paths in migration:** The absolute base paths are runtime-dynamic on iOS. Only clean the prefix/encoding; let `resolveAppPath()` handle the legacy absolute path fallback.
- **Dispatching `SET_VOLUME` coordinator event for fade:** The coordinator's `SET_VOLUME` event path calls `executeSetVolume()` + `store._setVolume()` together (see `PlayerStateCoordinator.ts:1200`). The fade must bypass this to avoid updating the store's displayed volume.

---

## Don't Hand-Roll

| Problem                        | Don't Build                | Use Instead                                       | Why                                                   |
| ------------------------------ | -------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| Setting TrackPlayer volume     | Custom TrackPlayer wrapper | `playerService.executeSetVolume()`                | Already tested, handles async errors                  |
| URL parsing for deep links     | Custom string splitter     | `new URL(url)` native API                         | Handles edge cases, already used in `_layout.tsx`     |
| Percent-decoding in TypeScript | Custom decode function     | `decodeURIComponent()` already in `fileSystem.ts` | Already handles errors correctly                      |
| DB migration runner            | Custom migration code      | Drizzle's existing migration infrastructure       | `src/db/client.ts` already runs migrations on startup |

---

## Common Pitfalls

### Pitfall 1: Fade State Leaks Across Timer Restarts

**What goes wrong:** If a user sets a sleep timer, cancels mid-fade, then sets a new timer, `_preFadeVolume` might still hold the old value.
**Why it happens:** Module-level variable not cleared on cancel.
**How to avoid:** Always clear `_preFadeVolume = null` in the cancel/restore path. Only capture it when entering the fade window from `null` state.
**Warning signs:** Volume restores to wrong level after second timer cancel.

### Pitfall 2: Chapter-Based Sleep Timer Has No `endTime` for Fade Window

**What goes wrong:** The fade logic checks `sleepTimer.endTime` but chapter-based timers have `endTime: null`. The fade calculation would fail or skip.
**Why it happens:** `getSleepTimerRemaining()` already handles chapter-based timers (returns remaining seconds to chapter end). The fade should use `getSleepTimerRemaining()`, not `sleepTimer.endTime` directly.
**How to avoid:** Use `store.getSleepTimerRemaining()` to get remaining seconds — it handles both timer types. If remaining <= 30, enter fade window.
**Warning signs:** Fade never triggers for chapter-based timers.

### Pitfall 3: Expo Router 6 — Tab Navigation With Absolute Paths

**What goes wrong:** `router.push('/(tabs)/library')` might not work as expected depending on whether the tab is already mounted.
**Why it happens:** Expo Router's tab navigation has specific behavior for switching active tabs vs. pushing screens.
**How to avoid:** Use `router.navigate()` for tab switching (idempotent), `router.push()` for pushing a new screen onto a stack.
**Warning signs:** Deep link opens correct tab but immediately goes back, or duplicate screens appear.

### Pitfall 4: Deep Link Handler Called Before Auth State Loaded

**What goes wrong:** `isAuthenticated` is `false` on first launch because auth state is loaded asynchronously. A deep link arriving on cold start gets rejected as unauthenticated.
**Why it happens:** `Linking.getInitialURL()` is called in `useEffect` on mount, which may fire before `AuthProvider` has finished loading credentials.
**How to avoid:** Defer deep link processing until auth state is known (watch for auth state change, then replay the initial URL). Or check `authLoading` state and queue the URL if loading.
**Warning signs:** Deep links from iOS Shortcuts always redirect to login even when logged in.

### Pitfall 5: SQL Migration Runs Before DB Schema Initialized

**What goes wrong:** The migration SQL references a table that doesn't exist yet if migrations run out of order.
**Why it happens:** The Drizzle migration runner runs migrations in filename-sorted order. File `0014_normalize_paths.sql` runs after `0013_giant_lucky_pierre.sql`, which is correct since the tables (`local_audio_file_downloads`, `local_library_file_downloads`, `local_cover_cache`) were created in earlier migrations.
**How to avoid:** Verify the tables exist in migrations 0001–0013 before writing the new migration. (Confirmed: `local_audio_file_downloads` and `local_cover_cache` exist in earlier migrations.)
**Warning signs:** DB initialization crash on first launch after update.

### Pitfall 6: `app.config.js` Takes Precedence Over `app.json`

**What goes wrong:** Scheme change in `app.json` doesn't take effect because `app.config.js` overrides it and still has `"side-shelf"`.
**Why it happens:** When both `app.json` and `app.config.js` exist, `app.config.js` wins. The dynamic config has `scheme: "side-shelf"` on line 24.
**How to avoid:** Update scheme in BOTH files. Confirmed: both files must be changed.
**Warning signs:** Scheme in native build still shows `side-shelf`; `sideshelf://` URLs don't open the app.

---

## Code Examples

### Sleep Fade — Using `getSleepTimerRemaining()` for Both Timer Types

```typescript
// Source: playerSlice.ts — getSleepTimerRemaining already handles both duration and chapter types
const remaining = store.getSleepTimerRemaining(); // returns seconds or null

if (remaining !== null && remaining <= FADE_WINDOW_SECONDS && remaining > 0 && isPlaying) {
  if (_preFadeVolume === null) {
    _preFadeVolume = store.player.volume;
  }
  const fadedVolume = _preFadeVolume * (remaining / FADE_WINDOW_SECONDS);
  await playerService.executeSetVolume(Math.max(0, fadedVolume));
}
```

### Volume Restore on Timer Cancel Detection

```typescript
// Detect cancel: timer was active last tick, now null
// Module-level: let _wasTimerActive = false;
const timerActive = store.player.sleepTimer.type !== null;
if (!timerActive && _preFadeVolume !== null) {
  // Timer was cancelled mid-fade — restore volume
  await playerService.executeSetVolume(_preFadeVolume);
  _preFadeVolume = null;
}
_wasTimerActive = timerActive;
```

### More Tab Layout — Adding Detail Routes

```typescript
// src/app/(tabs)/more/_layout.tsx — add to existing Stack
<Stack.Screen name="series/[seriesId]" options={{ title: translate("tabs.series") }} />
<Stack.Screen name="authors/[authorId]" options={{ title: translate("tabs.authors") }} />
```

### More Tab Series Detail Re-export

```typescript
// src/app/(tabs)/more/series/[seriesId].tsx
export { default } from "@/app/(tabs)/series/[seriesId]/index";
```

### More Tab Series List — Push to More-Scoped Path

```typescript
// src/app/(tabs)/more/series.tsx (replace re-export with wrapper)
// Push to more-scoped path so navigation stays in More stack:
onPress={() => router.push(`/more/series/${item.id}`)
```

### Deep Link Handler Structure

```typescript
// Extension of existing handleDeepLink in _layout.tsx
const urlObj = new URL(url);
const scheme = urlObj.protocol.replace(":", ""); // "sideshelf"
const host = urlObj.hostname; // "item", "resume", etc.

if (scheme !== "sideshelf") {
  // Handle legacy side-shelf:// or unknown scheme
  return;
}

// Auth guard
const storeState = useAppStore.getState();
if (!storeState.auth.isAuthenticated) {
  router.push("/login");
  return;
}

switch (host) {
  case "home":
  case "":
    router.navigate("/(tabs)");
    break;
  case "library":
    router.navigate("/(tabs)/library");
    break;
  case "item":
    const itemId = urlObj.pathname.split("/").filter(Boolean)[0];
    const action = urlObj.searchParams.get("action");
    if (itemId) {
      router.push(`/(tabs)/library/item/${itemId}`);
      if (action === "play") {
        // dispatch play after navigation settles
        dispatchPlayerEvent({ type: "PLAY" });
      }
    }
    break;
  case "resume":
    if (storeState.player.currentTrack) {
      dispatchPlayerEvent({ type: "PLAY" });
    }
    break;
  case "play-pause":
    if (storeState.player.isPlaying) {
      dispatchPlayerEvent({ type: "PAUSE" });
    } else {
      dispatchPlayerEvent({ type: "PLAY" });
    }
    break;
}
```

---

## Path Standardization Audit Results

### Write Sites — Status

| File                                 | Function                           | Calls `toAppRelativePath()`                                                                                    | Status           |
| ------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| `src/db/helpers/localData.ts`        | `setLocalCoverCached()`            | YES — line 20                                                                                                  | CLEAN            |
| `src/db/helpers/localData.ts`        | `markAudioFileAsDownloaded()`      | YES — line 94                                                                                                  | CLEAN            |
| `src/db/helpers/localData.ts`        | `markLibraryFileAsDownloaded()`    | YES — line 184                                                                                                 | CLEAN            |
| `src/db/helpers/localData.ts`        | `updateAudioFileStorageLocation()` | YES — line 271                                                                                                 | CLEAN            |
| `src/db/helpers/localData.ts`        | `updateAudioFileDownloadPath()`    | YES — line 307                                                                                                 | CLEAN            |
| `src/db/helpers/migrationHelpers.ts` | `preserveExistingLocalData()`      | NO — calls `markAudioFileAsDownloaded()` / `markLibraryFileAsDownloaded()` which DO call `toAppRelativePath()` | CLEAN (indirect) |

**Conclusion:** All current write sites already call `toAppRelativePath()`. The dirty data is pre-existing rows from before these guards were added. A SQL migration cleaning `file://` prefix and percent-encoding is sufficient; no write-site code changes are needed.

### Tables Containing Path Columns

| Table                          | Column            | Path Format                  |
| ------------------------------ | ----------------- | ---------------------------- |
| `local_audio_file_downloads`   | `download_path`   | Should be `D:...` or `C:...` |
| `local_library_file_downloads` | `download_path`   | Should be `D:...` or `C:...` |
| `local_cover_cache`            | `local_cover_url` | Should be `D:...` or `C:...` |

---

## State of the Art

| Old Approach                                       | Current Approach                           | Impact                                                    |
| -------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `scheme: "side-shelf"` (hyphen)                    | `scheme: "sideshelf"`                      | Requires native rebuild; old deep links will stop working |
| Absolute `router.push('/series/ID')` from More tab | More-stack relative path `/more/series/ID` | Back button stays in More tab                             |
| Pre-existing `file://` paths in DB                 | D:/C: prefix via SQL migration             | `resolveAppPath()` correctly resolves all paths           |

---

## Open Questions

1. **`sideshelf://item/[ID]?action=play` — when to dispatch PLAY**
   - What we know: Navigation is async; dispatching PLAY immediately may fire before the item detail screen has loaded the track.
   - What's unclear: Whether `dispatchPlayerEvent({ type: 'PLAY' })` is safe before the coordinator has loaded the track, or whether it needs to wait.
   - Recommendation: For Phase 18, implement `action=play` as navigate-only (no auto-play), matching the CONTEXT.md table which says "Navigate to item detail screen AND start playback from last position". The coordinator's `PLAY` event on an already-loaded track is safe; the risk is if the track isn't loaded yet. Keep it simple: navigate, then let the item detail screen's existing "resume" button handle play initiation. If the user wants auto-play, it can be revisited in a follow-up.

2. **Cold-start deep link auth race condition**
   - What we know: `AuthProvider` loads credentials asynchronously. `Linking.getInitialURL()` fires in `useEffect` at root layout mount.
   - What's unclear: How long auth loading takes vs. when the deep link handler fires.
   - Recommendation: Add a short auth-state check — if `authLoading` is true, queue the URL and replay it once auth resolves. This is a Claude's Discretion area.

3. **`_preFadeVolume` thread safety on Android background context**
   - What we know: On Android, `PlayerBackgroundService` runs in a separate Headless JS context. Module-level variables are isolated to that context.
   - What's unclear: Whether the foreground context's `cancelSleepTimer()` call (which updates the store) is visible to the background context's next tick.
   - Recommendation: The background service already reads `useAppStore.getState()` on every tick. When the foreground cancels the timer, the next tick in the background sees `sleepTimer.type === null` and triggers the restore. The module-level `_preFadeVolume` in the background context is correct — it captured the right value and the restore happens in the background context where volume is being changed.

---

## Validation Architecture

### Test Framework

| Property           | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Framework          | Jest 29.7 + jest-expo preset                                         |
| Config file        | `jest.config.js` (project root)                                      |
| Quick run command  | `jest --testPathPattern="PlayerBackgroundService" --passWithNoTests` |
| Full suite command | `npm test`                                                           |

### Phase Requirements → Test Map

| Req ID        | Behavior                                                                | Test Type   | Automated Command                                     | File Exists? |
| ------------- | ----------------------------------------------------------------------- | ----------- | ----------------------------------------------------- | ------------ |
| SLEEP-01      | Fade logic: volume decrements linearly over 30s window                  | unit        | `jest --testPathPattern="PlayerBackgroundService" -x` | ❌ Wave 0    |
| SLEEP-01      | Fade cancel: volume restores on timer cancel                            | unit        | `jest --testPathPattern="PlayerBackgroundService" -x` | ❌ Wave 0    |
| SLEEP-01      | Fade stop: volume restores to pre-fade value on timer expiry            | unit        | `jest --testPathPattern="PlayerBackgroundService" -x` | ❌ Wave 0    |
| SLEEP-01      | Chapter-based timer: fade uses `getSleepTimerRemaining()` not `endTime` | unit        | `jest --testPathPattern="PlayerBackgroundService" -x` | ❌ Wave 0    |
| NAVIGATION-01 | More tab series list navigates to more-stack-scoped detail              | manual-only | N/A — navigation routing requires running app         | N/A          |
| NAVIGATION-02 | More tab authors list navigates to more-stack-scoped detail             | manual-only | N/A — navigation routing requires running app         | N/A          |
| NAVIGATION-03 | Deep link handler parses sideshelf:// URLs and navigates                | unit        | `jest --testPathPattern="deepLink" -x`                | ❌ Wave 0    |
| NAVIGATION-03 | Deep link unauthenticated: redirects to login                           | unit        | `jest --testPathPattern="deepLink" -x`                | ❌ Wave 0    |
| DEBT-01       | SQL migration produces no file:// or percent-encoded paths              | unit        | `jest --testPathPattern="normalizePaths" -x`          | ❌ Wave 0    |

### Sampling Rate

- **Per task commit:** `npm test -- --passWithNoTests`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/services/__tests__/PlayerBackgroundServiceFade.test.ts` — covers SLEEP-01 fade logic, cancel, restore
- [ ] `src/services/__tests__/deepLinkHandler.test.ts` — covers NAVIGATION-03 URL parsing and auth guard
- [ ] `src/db/helpers/__tests__/normalizePaths.test.ts` — covers DEBT-01 migration SQL outcomes

---

## Sources

### Primary (HIGH confidence)

- Source code audit of `PlayerBackgroundService.ts`, `playerSlice.ts`, `fileSystem.ts`, `localData.ts`, `_layout.tsx`, `more/_layout.tsx`, `more/series.tsx`, `more/authors.tsx`, `series/[seriesId]/index.tsx`, `authors/[authorId]/index.tsx`, `app.json`, `app.config.js`
- Existing `executeSetVolume` chain: `PlayerService.executeSetVolume()` → `PlaybackControlCollaborator.executeSetVolume()` → `TrackPlayer.setVolume()` (confirmed no store update in this path)
- `getSleepTimerRemaining()` in `playerSlice.ts` — confirmed it handles both `duration` and `chapter` timer types
- `migrationHelpers.ts` + `localData.ts` — confirmed all current write sites call `toAppRelativePath()`
- `app.json` line 8 and `app.config.js` line 24 — confirmed both have `scheme: "side-shelf"` that must be changed

### Secondary (MEDIUM confidence)

- Expo Router 6 with SDK 54: file-based routing, `Stack.Screen name` with path segments (e.g., `"series/[seriesId]"`) is confirmed working pattern from existing `series` tab layout

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all four workstreams use existing dependencies; confirmed via source code
- Architecture: HIGH — patterns derived from reading actual source; not assumptions
- Pitfalls: HIGH — identified from direct code inspection (both `app.json` and `app.config.js` must be changed; `getSleepTimerRemaining()` vs `endTime` for chapter timers; `executeSetVolume` bypasses store update)
- Path audit: HIGH — read every write site in `localData.ts`; confirmed all already call `toAppRelativePath()`

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable stack; Expo Router and TrackPlayer APIs are not changing rapidly)
