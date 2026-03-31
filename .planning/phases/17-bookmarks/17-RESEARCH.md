# Phase 17: Bookmarks - Research

**Researched:** 2026-03-11
**Domain:** React Native bookmark management — ABS API integration, Drizzle/SQLite offline sync queue, Zustand slice extension, iOS/Android cross-platform UI (Alert.prompt, ActionSheetIOS, Modal)
**Confidence:** HIGH (code confirmed by direct read; ABS API confirmed from server source)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **First-tap preference alert:** First bookmark button tap shows Alert with "Auto-create" vs "Always prompt" choices
- **Auto-create title format:** `"<Chapter Title> — 1:23:45"` (em dash). Fallback: `"Bookmark at 1:23:45"` if no active chapter
- **Preference stored in `settingsSlice`:** Key `@app/bookmarkTitleMode`, values `'auto' | 'prompt'`. Default: `'auto'`
- **Settings screen:** Add "Bookmark Title Mode" row in the Player section of Settings
- **Long-press in auto mode:** Long-pressing the bookmark button triggers a one-time title override
- **Prompt mode:** Every tap shows input prompt pre-filled with the auto-generated title
- **Rename trigger:** Long-press on a bookmark row opens context menu (iOS action sheet / ActionSheetIOS or custom menu) with Rename and Delete
- **Trash icon removed:** Always-visible trash icon removed from bookmark row; delete moves to long-press menu only
- **Rename input:** Bottom sheet slides up with text field pre-filled with current title + Save/Cancel
- **Server sync:** Researcher verifies PATCH endpoint — confirmed below (see ABS API section)
- **Offline display:** Show cached SQLite bookmarks without stale indicator
- **Offline writes:** Create and delete while offline → write to SQLite optimistically + persist to `pending_bookmark_ops` table
- **Sync trigger:** When network restores (via existing NetInfo listener in `networkSlice._updateNetworkState`) drain `pending_bookmark_ops`
- **Conflict handling:** Claude's discretion — last-write-wins acceptable
- **Logout/login lifecycle:** `wipeUserData()` clears both `bookmarks` and `pending_bookmark_ops`. `refreshBookmarks()` on login fetches from server and repopulates SQLite
- **Jump behavior:** Tapping a bookmark always loads and plays the item. If already playing: seek only. If not playing: load+play then seek. Stay on item detail screen.

### Claude's Discretion

- Long-press override input UI in auto mode (Alert.prompt on iOS / minimal modal on Android)
- Bottom sheet implementation for rename (Modal vs third-party vs custom)
- Conflict resolution for offline sync queue (last-write-wins recommended)
- Whether `pending_bookmark_ops` uses one table with `operation_type` column or separate tables per type

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
  </user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID          | Description                                                                    | Research Support                                                                         |
| ----------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| BOOKMARK-01 | User can add a bookmark at the current playback position (with optional title) | settingsSlice extension + first-tap Alert + `handleCreateBookmark` rewrite               |
| BOOKMARK-02 | User can view all bookmarks for an item on the item detail screen              | `BookmarksSection` already renders; needs SQLite source + offline reads                  |
| BOOKMARK-03 | User can rename a bookmark                                                     | `renameBookmark` endpoint confirmed (PATCH); bottom sheet UI + `userProfileSlice` action |
| BOOKMARK-04 | User can delete a bookmark                                                     | Existing delete needs path fix (see ABS API section); move to long-press menu            |
| BOOKMARK-05 | Bookmarks are synced with the ABS server via API (create, read, delete)        | Endpoints confirmed from ABS server source code                                          |
| BOOKMARK-06 | Bookmarks are cached in a local SQLite table for offline viewing               | New `bookmarks` + `pending_bookmark_ops` schema tables                                   |

</phase_requirements>

---

## Summary

Phase 17 is a gap-closing phase. A significant portion of the bookmark skeleton already exists: `ApiAudioBookmark` type, `createBookmark`/`deleteBookmark` API functions, `userProfileSlice` state and actions, `BookmarkButton`, `BookmarksSection`, and `LibraryItemDetail` wiring. The work is to add the missing UX layers (first-tap preference, prompt mode, long-press override, rename bottom sheet, context menu), wire up SQLite caching (`bookmarks` + `pending_bookmark_ops` tables), integrate an offline sync queue, and fix one discovered API bug.

**Critical bug found:** The existing `deleteBookmark` endpoint in `endpoints.ts` sends `DELETE /api/me/item/:id/bookmark/:bookmarkId` passing `bookmark.id` — but the ABS server route is `DELETE /api/me/item/:id/bookmark/:time` and deletes by the `time` (numeric seconds) parameter, not by a bookmark UUID. This means the current delete is silently failing or returning a 404 on the server. This must be fixed as part of BOOKMARK-04.

**PATCH rename endpoint confirmed:** The ABS server has `PATCH /api/me/item/:id/bookmark` with body `{ time, title }`. This enables BOOKMARK-03 server sync. Implementation: add `renameBookmark(libraryItemId, time, title)` to `endpoints.ts`, add `renameBookmark` action to `userProfileSlice`.

**Primary recommendation:** Fix the delete endpoint path bug first (change `:bookmarkId` to `:time`), then build outward: DB schema, settings, UI changes, offline sync queue.

---

## Standard Stack

### Core

| Library                         | Version           | Purpose                                                    | Why Standard                                  |
| ------------------------------- | ----------------- | ---------------------------------------------------------- | --------------------------------------------- |
| drizzle-orm                     | already installed | SQLite ORM for `bookmarks` + `pending_bookmark_ops` schema | Already the project ORM for all tables        |
| @react-native-community/netinfo | already installed | Detect network restore for sync queue drain                | Already used in `networkSlice`                |
| AsyncStorage                    | already installed | Persist `bookmarkTitleMode` setting                        | Established `appSettings.ts` pattern          |
| React Native `Alert`            | built-in          | First-tap preference alert, confirm prompts                | Cross-platform, zero dependencies             |
| React Native `ActionSheetIOS`   | built-in          | iOS long-press context menu (Rename / Delete)              | Native iOS sheet, matches platform convention |
| React Native `Modal`            | built-in          | Rename bottom sheet + Android long-press fallback          | Already used elsewhere in project             |

### Supporting

| Library                     | Version             | Purpose                                           | When to Use                                             |
| --------------------------- | ------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| `Alert.prompt`              | iOS only (built-in) | One-time title override on long-press (auto mode) | iOS only; Android needs Modal fallback                  |
| `expo-symbols` / `Ionicons` | already installed   | Bookmark row icons                                | Already used in `BookmarkButton` and `BookmarksSection` |

### Alternatives Considered

| Instead of                          | Could Use                         | Tradeoff                                                                       |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| React Native Modal (rename sheet)   | `@gorhom/bottom-sheet`            | Third-party adds complexity; Modal is sufficient for a simple text input sheet |
| Single `pending_bookmark_ops` table | Three separate tables per op type | Single table with `operation_type` enum is simpler and sufficient              |

**Installation:** No new packages required. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── db/schema/
│   └── bookmarks.ts          # NEW: bookmarks + pending_bookmark_ops tables
├── db/helpers/
│   └── bookmarks.ts          # NEW: upsertBookmark, deleteBookmarkLocal, getBookmarksByItem, enqueuePendingOp, dequeuePendingOps, clearPendingOps
├── lib/
│   └── appSettings.ts        # EXTEND: add bookmarkTitleMode key + getters/setters
├── stores/slices/
│   └── settingsSlice.ts      # EXTEND: bookmarkTitleMode state + updateBookmarkTitleMode action
│   └── userProfileSlice.ts   # EXTEND: renameBookmark + offline-aware create/delete
├── lib/api/
│   └── endpoints.ts          # FIX + EXTEND: fix deleteBookmark path; add renameBookmark
├── components/player/
│   └── BookmarkButton.tsx    # EXTEND: add onLongPress prop
├── components/library/LibraryItemDetail/
│   └── BookmarksSection.tsx  # REWRITE: remove trash icon, add long-press menu, rename sheet, updated jump
├── components/library/
│   └── LibraryItemDetail.tsx # EXTEND: pass onRenameBookmark
├── app/FullScreenPlayer/
│   └── index.tsx             # EXTEND: first-tap logic, long-press, prompt mode
└── app/(tabs)/more/
    └── settings.tsx          # EXTEND: Bookmark Title Mode row in Player section
```

### Pattern 1: Drizzle Schema for New Tables

Both new tables follow the established schema pattern in `src/db/schema/`. Use `integer` for booleans, `real` for time values, `.default()` on all new columns.

```typescript
// src/db/schema/bookmarks.ts
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id").primaryKey(), // ABS bookmark id
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryItemId: text("library_item_id").notNull(),
    title: text("title").notNull(),
    time: real("time").notNull(), // seconds
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp" }),
  },
  (table) => [index("bookmarks_user_item_idx").on(table.userId, table.libraryItemId)]
);

export const pendingBookmarkOps = sqliteTable("pending_bookmark_ops", {
  id: text("id").primaryKey(), // local UUID
  userId: text("user_id").notNull(),
  libraryItemId: text("library_item_id").notNull(),
  operationType: text("operation_type", { enum: ["create", "delete", "rename"] }).notNull(),
  bookmarkId: text("bookmark_id"), // null for create before server assigns id
  time: real("time").notNull(),
  title: text("title"), // null for delete
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type BookmarkRow = typeof bookmarks.$inferSelect;
export type PendingBookmarkOpRow = typeof pendingBookmarkOps.$inferSelect;
```

### Pattern 2: Settings Persistence (Established)

Follow the exact pattern used by `progressFormat` in `appSettings.ts` + `settingsSlice.ts`:

```typescript
// appSettings.ts additions
const SETTINGS_KEYS = {
  // ...existing keys...
  bookmarkTitleMode: "@app/bookmarkTitleMode",
} as const;

export async function getBookmarkTitleMode(): Promise<"auto" | "prompt"> {
  const value = await AsyncStorage.getItem(SETTINGS_KEYS.bookmarkTitleMode);
  return value === "prompt" ? "prompt" : "auto"; // default 'auto'
}

export async function setBookmarkTitleMode(mode: "auto" | "prompt"): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEYS.bookmarkTitleMode, mode);
}
```

### Pattern 3: ABS API Endpoints (Verified from Source)

```typescript
// endpoints.ts — FIX existing deleteBookmark (use time, not bookmarkId)
export async function deleteBookmark(
  libraryItemId: string,
  time: number // WAS: bookmarkId: string — WRONG
): Promise<void> {
  const response = await apiFetch(`/api/me/item/${libraryItemId}/bookmark/${time}`, {
    method: "DELETE",
  });
  await handleResponseError(response, "Failed to delete bookmark");
}

// endpoints.ts — NEW renameBookmark (PATCH)
export async function renameBookmark(
  libraryItemId: string,
  time: number,
  title: string
): Promise<{ bookmark: ApiAudioBookmark }> {
  const response = await apiFetch(`/api/me/item/${libraryItemId}/bookmark`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ time, title }),
  });
  await handleResponseError(response, "Failed to rename bookmark");
  return response.json();
}
```

### Pattern 4: First-Tap Preference Alert

```typescript
// src/app/FullScreenPlayer/index.tsx
const handleCreateBookmark = useCallback(async () => {
  if (!currentTrack || isCreatingBookmark) return;

  const { bookmarkTitleMode, updateBookmarkTitleMode } = useSettings(); // destructure at top of component

  // First-tap: mode not yet set → show preference alert
  if (/* mode not yet set — detect via separate AsyncStorage key or null sentinel */) {
    Alert.alert(
      "Bookmark Style",
      "How would you like to create bookmarks?",
      [
        { text: "Auto-create", onPress: () => { updateBookmarkTitleMode('auto'); doCreate('auto'); } },
        { text: "Always prompt", onPress: () => { updateBookmarkTitleMode('prompt'); doCreate('prompt'); } },
      ]
    );
    return;
  }
  // ... else proceed with saved mode
}, [/* deps */]);
```

**First-tap detection strategy:** Add a second AsyncStorage boolean key `@app/bookmarkTitleModeSet` (or use `null` as the unset sentinel in `settingsSlice`). When `null`, show the preference alert. This avoids mistaking the `'auto'` default for an explicit user choice.

### Pattern 5: Offline Sync Queue Drain

The network restore hook lives in `networkSlice._updateNetworkState`. When `isConnected && isInternetReachable !== false`, `checkServerReachability()` is called. The cleanest hook is in `_updateNetworkState` after the server reachability call resolves:

```typescript
// In _updateNetworkState, after checkServerReachability resolves:
if (isConnected && isInternetReachable !== false) {
  drainPendingBookmarkOps(); // imported from userProfileSlice or a standalone module
}
```

Alternatively, hook into the `checkServerReachability` success path. Keep it as a separate function that takes explicit arguments (no `getInstance()` — anti-circular rule).

### Anti-Patterns to Avoid

- **Do not use `bookmark.id` to delete from ABS server.** The delete route uses `time` (numeric seconds). Use `bookmark.time` in the URL.
- **Do not use object-returning Zustand selectors.** `const { a, b } = useAppStore(s => ({ a: s.x.a, b: s.x.b }))` re-renders every tick.
- **Do not import from `@/db/helpers` barrel inside services.** Import from the specific file (e.g., `@/db/helpers/bookmarks`).
- **Do not call `ServiceClass.getInstance()` inside DB helpers.** Offline sync helpers must accept explicit arguments.
- **Do not use `Alert.prompt` on Android.** It is iOS-only. Gate with `Platform.OS === 'ios'` and use a Modal fallback on Android.

---

## Don't Hand-Roll

| Problem                          | Don't Build                | Use Instead                                               | Why                                                                      |
| -------------------------------- | -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| ActionSheet context menu on iOS  | Custom popover             | `ActionSheetIOS.showActionSheetWithOptions`               | Native iOS sheet, zero layout work                                       |
| Cross-platform text input prompt | Custom modal from scratch  | `Alert.prompt` (iOS) + `Modal` with `TextInput` (Android) | Alert.prompt is single-line and native; Modal handles Android gracefully |
| Network detection                | Custom polling             | `NetInfo` already in `networkSlice`                       | Already wired up, just add a hook                                        |
| Settings persistence             | Direct AsyncStorage inline | `appSettings.ts` getter/setter pattern                    | Consistent with all other settings in the project                        |
| DB migrations                    | Manual SQL                 | `npm run drizzle:generate` after schema changes           | Drizzle auto-generates migration files                                   |

**Key insight:** Every infrastructure piece (NetInfo, AsyncStorage, Drizzle, Alert) already exists in the project. This phase is purely additive wiring.

---

## Common Pitfalls

### Pitfall 1: ABS delete route uses `time`, not `bookmarkId`

**What goes wrong:** `DELETE /api/me/item/:id/bookmark/some-uuid` returns 404 silently (or the server treats the UUID as NaN → deletes nothing)
**Why it happens:** The ABS server's `removeBookmark` handler does `Number(req.params.time)` — passing a UUID string gives `NaN`, no bookmark matched, no error thrown
**How to avoid:** Change `deleteBookmark(libraryItemId, bookmarkId)` → `deleteBookmark(libraryItemId, time: number)`. All callers must pass `bookmark.time` not `bookmark.id`
**Warning signs:** Delete appears to succeed in the UI (optimistic update removes from state) but the bookmark reappears after `refreshBookmarks()`

### Pitfall 2: Alert.prompt Android crash

**What goes wrong:** `Alert.prompt(...)` throws on Android — it is an iOS-only API
**Why it happens:** React Native's Alert interface lists `prompt` as a method but it only works on iOS
**How to avoid:** Gate with `Platform.OS === 'ios'`. Provide a `Modal` + `TextInput` fallback for Android in all prompt-requiring flows (long-press override, rename sheet)
**Warning signs:** Android crash in `handleCreateBookmark` or `handleRenameBookmark`

### Pitfall 3: SQLite `ALTER TABLE ADD COLUMN NOT NULL` without default

**What goes wrong:** Adding a new column to an existing table with `NOT NULL` but no `.default()` fails on rows that already exist
**Why it happens:** SQLite enforces this constraint at migration time
**How to avoid:** ALWAYS include `.default()` for any column added to an existing table. For new tables created in this phase, this is not a concern
**Warning signs:** `drizzle:generate` succeeds but the migration crashes on device with existing data

### Pitfall 4: Drizzle migration not generated after schema changes

**What goes wrong:** New tables exist in TypeScript but not in SQLite; app crashes on `db.select(bookmarks)`
**Why it happens:** Forgetting to run `npm run drizzle:generate` after adding schema files
**How to avoid:** Run `npm run drizzle:generate` after creating `src/db/schema/bookmarks.ts`. Commit the generated migration file.
**Warning signs:** `no such table: bookmarks` runtime error

### Pitfall 5: `userProfileSlice` `deleteBookmark` signature mismatch after fix

**What goes wrong:** `userProfileSlice.deleteBookmark(libraryItemId, bookmarkId)` is called from `LibraryItemDetail.tsx` passing `bookmark.id`; after the endpoint fix it needs `bookmark.time`
**Why it happens:** The slice action's signature matches the old (broken) endpoint signature
**How to avoid:** Update both the endpoint and the slice action simultaneously; search all callers (`LibraryItemDetail.tsx`, `BookmarksSection.tsx`)
**Warning signs:** TypeScript type error on `bookmark.id` vs `number`

### Pitfall 6: Bookmark refresh after offline sync queue drain pollutes Zustand state

**What goes wrong:** Sync queue drains and the slice calls `refreshBookmarks()` (full server fetch), momentarily clearing SQLite bookmarks from state, causing flicker
**Why it happens:** `refreshBookmarks` replaces all state rather than merging
**How to avoid:** After draining, call `refreshBookmarks()` once to reconcile. This is acceptable (user just came back online). Alternatively, merge individual results from drain ops.

### Pitfall 7: `pending_bookmark_ops` `id` field — generate locally before server returns

**What goes wrong:** Creating a bookmark optimistically writes to SQLite with a local temp ID, but `pending_bookmark_ops` needs to replay `create` with `time` and `title` (not the local ID). The server assigns its own ID on creation.
**Why it happens:** The ABS `createBookmark` response returns the server-assigned bookmark with `id`, but the pending op only has local information
**How to avoid:** `pending_bookmark_ops` for `create` operations stores `time` + `title`. On drain, call `createBookmark(libraryItemId, time, title)`, get back the server bookmark, upsert it into the local `bookmarks` table, then delete the pending op.

---

## Code Examples

### DB Helper Pattern (from `src/db/helpers/mediaProgress.ts`)

```typescript
// Source: src/db/helpers/mediaProgress.ts (established project pattern)
import { db } from "@/db/client";
import { eq, and } from "drizzle-orm";
import { bookmarks, type BookmarkRow } from "@/db/schema/bookmarks";

export async function upsertBookmark(row: typeof bookmarks.$inferInsert): Promise<void> {
  await db
    .insert(bookmarks)
    .values(row)
    .onConflictDoUpdate({
      target: bookmarks.id,
      set: { title: row.title, time: row.time, syncedAt: row.syncedAt },
    });
}

export async function getBookmarksByItem(
  userId: string,
  libraryItemId: string
): Promise<BookmarkRow[]> {
  return db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.libraryItemId, libraryItemId)));
}

export async function deleteBookmarkLocal(
  userId: string,
  time: number,
  libraryItemId: string
): Promise<void> {
  await db.delete(bookmarks).where(
    and(
      eq(bookmarks.userId, userId),
      eq(bookmarks.libraryItemId, libraryItemId)
      // match by time since ABS uses time as the key
    )
  );
}
```

### ActionSheetIOS Pattern (iOS long-press context menu)

```typescript
// Source: React Native docs — ActionSheetIOS.showActionSheetWithOptions
import { ActionSheetIOS, Platform } from "react-native";

function showBookmarkMenu(bookmark: ApiAudioBookmark, onRename: () => void, onDelete: () => void) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Cancel", "Rename", "Delete"],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 0,
        title: bookmark.title,
      },
      (index) => {
        if (index === 1) onRename();
        if (index === 2) onDelete();
      }
    );
  } else {
    // Android: show Alert with buttons or a Modal menu
    Alert.alert(bookmark.title, "", [
      { text: "Rename", onPress: onRename },
      { text: "Delete", style: "destructive", onPress: onDelete },
      { text: "Cancel", style: "cancel" },
    ]);
  }
}
```

### Rename Modal Pattern

```typescript
// Minimal Modal bottom sheet for rename — no third-party deps
<Modal
  visible={showRenameModal}
  transparent
  animationType="slide"
  onRequestClose={() => setShowRenameModal(false)}
>
  <View style={{ flex: 1, justifyContent: "flex-end" }}>
    <View style={{ backgroundColor: colors.background, padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
      <TextInput
        value={renameValue}
        onChangeText={setRenameValue}
        autoFocus
        style={[styles.text, { borderWidth: 1, borderColor: colors.border, padding: 8, borderRadius: 8 }]}
      />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <TouchableOpacity onPress={() => setShowRenameModal(false)} style={{ flex: 1 }}>
          <Text style={styles.text}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSaveRename} style={{ flex: 1 }}>
          <Text style={styles.text}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
</Modal>
```

---

## ABS API Reference (Verified from Server Source)

Confirmed from `server/controllers/MeController.js` in the ABS GitHub repo:

| Operation              | Method              | Path                              | Body              | Notes                                        |
| ---------------------- | ------------------- | --------------------------------- | ----------------- | -------------------------------------------- |
| Create bookmark        | POST                | `/api/me/item/:id/bookmark`       | `{ time, title }` | Returns `{ bookmark: ApiAudioBookmark }`     |
| Update/rename bookmark | PATCH               | `/api/me/item/:id/bookmark`       | `{ time, title }` | Uses `time` to identify bookmark             |
| Delete bookmark        | DELETE              | `/api/me/item/:id/bookmark/:time` | —                 | `:time` is numeric seconds, NOT a UUID       |
| List bookmarks         | GET (via `/api/me`) | —                                 | —                 | `fetchMe()` returns `meResponse.bookmarks[]` |

**Confidence:** HIGH — confirmed from server source code.

**Delete path bug in existing code:** Current `endpoints.ts` sends `DELETE .../bookmark/${bookmarkId}` — this is wrong. Must change to `DELETE .../bookmark/${bookmark.time}`.

---

## State of the Art

| Old Approach                       | Current Approach                         | When Changed | Impact                          |
| ---------------------------------- | ---------------------------------------- | ------------ | ------------------------------- |
| Bookmarks in-memory only (Zustand) | Bookmarks in SQLite + Zustand            | Phase 17     | Offline viewing enabled         |
| Delete by bookmarkId (broken)      | Delete by time (correct)                 | Phase 17 fix | Deletes actually work on server |
| Single tap → immediate create      | First-tap preference → mode-aware create | Phase 17     | Flexible UX                     |
| Always-visible trash icon          | Long-press context menu                  | Phase 17     | Cleaner row layout              |

---

## Open Questions

1. **`pending_bookmark_ops` for `rename` while offline**
   - What we know: rename operation needs `time` + `title`. The `bookmarks` SQLite table is updated optimistically.
   - What's unclear: If a bookmark is created offline (pending `create` op) and then renamed while still offline, there are two pending ops for the same logical bookmark. Draining in order (FIFO) handles this correctly as long as `create` comes before `rename`.
   - Recommendation: Add a `createdAt` column to `pending_bookmark_ops` and drain in insertion order. FIFO is sufficient.

2. **`itemBookmarks` useMemo in LibraryItemDetail doesn't read from SQLite**
   - What we know: `getItemBookmarks` currently filters from `userProfileSlice.bookmarks` (in-memory, loaded from server). After Phase 17, bookmarks should be readable from SQLite when offline.
   - What's unclear: Should `getItemBookmarks` fall through to SQLite when the in-memory array is empty (offline startup)?
   - Recommendation: On login, `refreshBookmarks()` populates both SQLite and in-memory state. On offline startup, add a separate `loadBookmarksFromSQLite(userId)` call during `initializeUserProfile` that reads from `bookmarks` table as fallback.

3. **`deleteBookmark` slice action signature change cascades**
   - What we know: After fixing the endpoint to use `time` instead of `bookmarkId`, the slice action and all callers must change.
   - Callers found: `LibraryItemDetail.tsx` (`onDeleteBookmark={deleteBookmark}`), `BookmarksSection.tsx` (`onDeleteBookmark` prop)
   - Recommendation: Change `deleteBookmark(libraryItemId, bookmarkId)` → `deleteBookmark(libraryItemId, time)` everywhere in one atomic change.

---

## Validation Architecture

### Test Framework

| Property           | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| Framework          | Jest + jest-expo preset                                                          |
| Config file        | `jest.config.js` (root)                                                          |
| Quick run command  | `jest src/db/helpers/__tests__/bookmarks.test.ts --testPathPattern bookmarks -x` |
| Full suite command | `npm test`                                                                       |

### Phase Requirements → Test Map

| Req ID      | Behavior                                               | Test Type | Automated Command                                           | File Exists? |
| ----------- | ------------------------------------------------------ | --------- | ----------------------------------------------------------- | ------------ |
| BOOKMARK-01 | `handleCreateBookmark` applies auto-title format       | unit      | `jest src/app/FullScreenPlayer/__tests__/`                  | ❌ Wave 0    |
| BOOKMARK-01 | First-tap shows preference alert                       | unit      | same                                                        | ❌ Wave 0    |
| BOOKMARK-02 | `getBookmarksByItem` returns correct SQLite rows       | unit      | `jest src/db/helpers/__tests__/bookmarks.test.ts`           | ❌ Wave 0    |
| BOOKMARK-03 | `renameBookmark` API endpoint called with correct path | unit      | `jest src/stores/slices/__tests__/userProfileSlice.test.ts` | ❌ Wave 0    |
| BOOKMARK-04 | `deleteBookmark` sends `time` not `bookmarkId` in URL  | unit      | same                                                        | ❌ Wave 0    |
| BOOKMARK-05 | Offline create enqueues `pending_bookmark_ops` row     | unit      | `jest src/db/helpers/__tests__/bookmarks.test.ts`           | ❌ Wave 0    |
| BOOKMARK-06 | `getBookmarksByItem` reads from SQLite when offline    | unit      | same                                                        | ❌ Wave 0    |

### Sampling Rate

- **Per task commit:** `jest src/db/helpers/__tests__/bookmarks.test.ts -x` (or closest test to changed code)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/db/helpers/__tests__/bookmarks.test.ts` — covers BOOKMARK-02, BOOKMARK-05, BOOKMARK-06
- [ ] `src/stores/slices/__tests__/userProfileSlice.test.ts` additions — covers BOOKMARK-03, BOOKMARK-04 (extend existing pattern)
- [ ] Drizzle migration file — generated via `npm run drizzle:generate` after bookmarks schema added
- [ ] Framework install: none — jest-expo + testDb already present

---

## Sources

### Primary (HIGH confidence)

- ABS server source `server/controllers/MeController.js` — confirmed `POST/PATCH /api/me/item/:id/bookmark` and `DELETE /api/me/item/:id/bookmark/:time` (fetched via raw GitHub URL)
- Direct code read: `src/lib/api/endpoints.ts` — confirmed existing `createBookmark` and `deleteBookmark` implementations
- Direct code read: `src/stores/slices/userProfileSlice.ts` — confirmed existing bookmark state and actions
- Direct code read: `src/stores/slices/settingsSlice.ts` + `src/lib/appSettings.ts` — confirmed settings persistence pattern
- Direct code read: `src/stores/slices/networkSlice.ts` — confirmed NetInfo listener location (`_updateNetworkState`)
- Direct code read: `src/db/helpers/wipeUserData.ts` — confirmed wipe order and FK pattern
- Direct code read: `src/components/library/LibraryItemDetail/BookmarksSection.tsx` — confirmed current trash icon + delete pattern
- Direct code read: `src/db/schema/localData.ts` + `src/db/schema/mediaProgress.ts` — confirmed Drizzle schema patterns

### Secondary (MEDIUM confidence)

- `api.audiobookshelf.org` — corroborating documentation for PATCH `/api/me/bookmarks/<ID>` (docs path differs from actual server path; server source is authoritative)

### Tertiary (LOW confidence)

- `deepwiki.com/audiobookshelf/audiobookshelf-api-docs/3.5-user-management` — general user management reference; bookmark details incomplete

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages already installed; confirmed from project code
- Architecture: HIGH — all patterns confirmed from existing project code
- ABS API paths: HIGH — confirmed from server source (MeController.js)
- Delete bug: HIGH — confirmed `deleteBookmark` uses bookmarkId but server expects time
- Pitfalls: HIGH — confirmed from direct code read and ABS source
- Offline sync design: MEDIUM — pattern is new to this codebase; design is sound but untested

**Research date:** 2026-03-11
**Valid until:** 2026-06-11 (ABS API stable; RN/Expo patterns very stable)
