# Phase 17: Bookmarks - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete bookmark management: add title prompt UX, rename, and SQLite offline caching with a persisted sync queue. The core create/delete API calls, `userProfileSlice` state, `BookmarkButton`, and `BookmarksSection` list/delete view already exist. This phase closes the gaps between the existing skeleton and the full BOOKMARK-01–06 requirements.

</domain>

<decisions>
## Implementation Decisions

### Add bookmark UX (BOOKMARK-01)

- **First-tap preference alert:** The very first time a user taps the bookmark button, show an Alert with two choices: "Auto-create" (uses chapter + timestamp as title) or "Always prompt" (shows an input prompt every time).
- **Auto-create title format:** `"<Chapter Title> — 1:23:45"` — chapter title + em dash + timestamp. If no chapter is active, fall back to `"Bookmark at 1:23:45"`.
- **Preference stored in `settingsSlice`:** Key `@app/bookmarkTitleMode` with values `'auto' | 'prompt'`. Loaded in `initializeSettings()` alongside other settings. Default: `'auto'` (safe fallback if first-tap alert is somehow skipped).
- **Settings screen:** Add a "Bookmark Title Mode" row in the Player section of Settings so users can change this preference after initial setup.
- **Long-press in auto mode:** Long-pressing the bookmark button triggers a one-time title override (Claude decides the input UI — `Alert.prompt` on iOS or a minimal modal on Android).
- **Prompt mode:** Every tap shows an input prompt pre-filled with the auto-generate title (chapter + timestamp). User can edit or tap OK as-is.

### Rename UX (BOOKMARK-03)

- **Trigger:** Long-press on a bookmark row opens a context menu (iOS action sheet / `ActionSheetIOS` or a custom menu) with two actions: **Rename** and **Delete**.
- **Trash icon removed:** The always-visible trash icon is removed from the row. Delete moves exclusively to the long-press context menu. Cleaner row layout.
- **Rename input:** A bottom sheet slides up with a text field pre-filled with the current bookmark title + Save/Cancel buttons. Claude decides the implementation (Modal component, custom sheet, etc.).
- **Server sync:** Researcher verifies the ABS PATCH endpoint (`PATCH /api/me/item/:id/bookmark/:bookmarkId`). If confirmed: rename syncs to server + updates SQLite. If endpoint doesn't exist: rename is SQLite-local only (title diverges from server).

### Offline strategy (BOOKMARK-05, BOOKMARK-06)

- **Display:** Show cached SQLite bookmarks without any stale indicator. Clean, no warning noise.
- **Offline writes:** Creates and deletes made while offline write to SQLite optimistically + persist the operation to a `pending_bookmark_ops` SQLite table (persisted sync queue — survives app restart).
- **Sync trigger:** When network restores (hooked into the existing `NetInfo.addEventListener` pattern), drain `pending_bookmark_ops` and replay operations against the server.
- **Conflict handling:** Claude's discretion — simple approach (last-write-wins or ignore server conflict) is acceptable for beta.
- **Logout/login lifecycle:** `wipeUserData()` clears both `bookmarks` and `pending_bookmark_ops` tables (in FK order). `refreshBookmarks()` on login fetches from server and repopulates SQLite.

### Bookmark jump behavior (BOOKMARK-01 interaction)

- **Tapping a bookmark always loads and plays the item:** If the item is not currently loaded, call into the coordinator to load+play the item and then seek to the bookmark position. Playback starts automatically.
- **If item is already playing:** Just seek to the bookmark position (`playerService.seekTo(time)`). No other change.
- **Navigation:** Stay on the item detail screen after tapping — do not auto-open the full screen player. User can expand it manually.

### Claude's Discretion

- Long-press override input UI in auto mode (Alert.prompt on iOS / minimal modal on Android)
- Bottom sheet implementation for rename (Modal vs third-party vs custom)
- Conflict resolution for offline sync queue (last-write-wins recommended)
- Whether `pending_bookmark_ops` table uses a single `operation_type` column ('create' | 'delete' | 'rename') or separate tables per type

</decisions>

<specifics>
## Specific Ideas

- The "first-time preference alert" pattern: fires exactly once on the first bookmark button tap, then never again. It's a lightweight onboarding moment, not a settings gate.
- The Settings row for bookmark title mode should live in the same "Player" section established in Phase 14 (with Progress Format and jump intervals).
- Rename bottom sheet: should feel like a lightweight edit in context, not a full modal page.
- The existing `BookmarksSection` sorts bookmarks by `time` (ascending) — keep this sort order.

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `ApiAudioBookmark` (`src/types/api.ts`): `{ id, libraryItemId, title, time, createdAt }` — the type already exists; no changes needed.
- `createBookmark` / `deleteBookmark` (`src/lib/api/endpoints.ts`): POST and DELETE endpoints already implemented. Need to add a `renameBookmark` PATCH function if researcher confirms the endpoint exists.
- `userProfileSlice` (`src/stores/slices/userProfileSlice.ts`): already has `bookmarks: ApiAudioBookmark[]` state, `createBookmark`, `deleteBookmark`, `refreshBookmarks`, `getItemBookmarks` actions. Need to add a `renameBookmark` action + offline-aware variants.
- `BookmarkButton` (`src/components/player/BookmarkButton.tsx`): already handles `isCreating` state. Needs `onLongPress` prop added for the auto-mode override.
- `BookmarksSection` (`src/components/library/LibraryItemDetail/BookmarksSection.tsx`): already renders list, handles jump-to and delete with trash icon. Needs: trash icon removed, long-press context menu added, rename action added, jump-to behavior updated to always load+play.
- `LibraryItemDetail.tsx`: already passes `bookmarks` from `getItemBookmarks()` and `onDeleteBookmark` to `BookmarksSection`. Needs `onRenameBookmark` added.
- `settingsSlice` + `appSettings.ts`: established pattern — add `bookmarkTitleMode: 'auto' | 'prompt'` to state, actions, `SETTINGS_KEYS`, and `initializeSettings()`.
- `formatBookmarkTime` (local in `src/app/FullScreenPlayer/index.tsx`): second-precision formatter — stays local per prior decision. `BookmarksSection` has its own equivalent `formatTime` function — these can stay separate or be unified (Claude's call).

### Established Patterns

- Settings persistence: `AsyncStorage` via `appSettings.ts`, loaded in `settingsSlice.initializeSettings()` with `Promise.all`.
- DB schema additions: always include `.default()` for new columns on existing tables (SQLite ALTER TABLE constraint).
- DB helpers: one file per entity — add `src/db/helpers/bookmarks.ts` and `src/db/schema/bookmarks.ts`.
- `wipeUserData.ts`: already wipes in FK order — add bookmarks + pending_bookmark_ops to the wipe sequence.
- NetInfo: `initializeNetwork()` in network service has the connection listener — add the sync queue drain hook here.
- Circular import rule: DB helpers must not call `ServiceClass.getInstance()` — offline sync logic must take explicit arguments.

### Integration Points

- `src/db/schema/bookmarks.ts` — new table (`bookmarks` + `pending_bookmark_ops`)
- `src/db/schema/index.ts` — export new schemas
- `src/db/helpers/bookmarks.ts` — `upsertBookmark()`, `deleteBookmarkLocal()`, `getBookmarksByItem()`, `enqueuePendingOp()`, `dequeuePendingOps()`, `clearPendingOps()`
- `src/db/helpers/wipeUserData.ts` — add bookmarks + pending_bookmark_ops to wipe
- `src/lib/api/endpoints.ts` — add `renameBookmark()` if PATCH endpoint verified
- `src/stores/slices/userProfileSlice.ts` — `renameBookmark` action + offline-aware create/delete
- `src/stores/appStore.ts` — no change (userProfileSlice already registered)
- `src/lib/appSettings.ts` — add `bookmarkTitleMode` key
- `src/stores/slices/settingsSlice.ts` — add `bookmarkTitleMode` state + `updateBookmarkTitleMode` action
- `src/app/FullScreenPlayer/index.tsx` — update `handleCreateBookmark` for first-tap logic + long-press
- `src/components/player/BookmarkButton.tsx` — add `onLongPress` prop
- `src/components/library/LibraryItemDetail/BookmarksSection.tsx` — long-press menu, rename sheet, updated jump behavior
- `src/components/library/LibraryItemDetail.tsx` — pass `onRenameBookmark`
- `src/app/(tabs)/more/settings.tsx` — add Bookmark Title Mode row in Player section
- Network service (wherever NetInfo listener lives) — add sync queue drain on connection restore

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

_Phase: 17-bookmarks_
_Context gathered: 2026-03-11_
