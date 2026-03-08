# Phase 10: DB Quick Wins - Research

**Researched:** 2026-03-03
**Domain:** SQLite / Drizzle ORM / expo-sqlite — performance pragmas, index management, batch upserts, migration error handling
**Confidence:** HIGH

## Summary

This phase addresses three independent database problems: (1) WAL mode + synchronous=NORMAL pragmas are not set anywhere in the app today — the DB opens with SQLite defaults (journal_mode=DELETE, synchronous=FULL), which means every write is fully fsync'd; (2) four foreign-key query paths have no indexes, so reads that filter or join on `library_id`, `library_item_id`, `media_id`, and `(user_id, library_item_id)` do full table scans; (3) every batch-write helper in `src/db/helpers/` uses a `for` loop with a per-row query, meaning a 500-item library sync executes roughly 1,000 sequential queries instead of one.

The N+1 audit revealed five helpers with serial loops: `upsertLibraryItems` (select+update or insert per row), `upsertAudioFiles` (select+update or insert per row), `upsertChapters` (select+update or insert per row), `upsertLibraryFiles` (select+update or insert per row), `upsertLibraries` (insert per row), `upsertMultipleSeries` (insert per row), and `upsertAuthors` (insert per row). The `upsertMediaProgress` helper also has a serial loop but uses `onConflictDoUpdate` correctly — it only needs the loop removed. The `fullLibraryItems.ts` genre/narrator/tag upserts (`upsertGenres`, `upsertNarrators`, `upsertTags`) each loop and fire one INSERT per name. All of these convert to single `db.insert(table).values(rows).onConflictDoUpdate(...)` calls.

The error screen requirement adds one new component: a blocking `DbErrorScreen` rendered by `DbProvider` when migration fails. It replaces the current silent-continue behavior (`success=false, error=Error` just renders children anyway via the current `useMigrations` hook). The logger's separate `logs.sqlite` database and direct `execSync`/`runSync` path means DB errors can be logged without touching the failing main DB.

**Primary recommendation:** Four tasks in sequence — WAL pragmas, indexes via migration, N+1 batch conversion, blocking error screen. Each is independent at the code level; order matters only to avoid merge conflicts.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration failure behavior:**

- Any failed migration OR any unrecoverable DB error (at any point in the app lifecycle, not just startup) must surface a blocking error screen — not silent continue
- Error screen shows a generic message ("Something went wrong with the database") plus a way to copy/save the full technical error details for debugging
- Full error is persisted to logs using the existing logger's bootstrap code path that does NOT write to SQLite (the logger has a pre-DB initialization path; use that to avoid a circular dependency)
- Recovery action is context-aware: offer a "Reset database" button only when a DB reset would plausibly fix the issue — for errors like disk full, explain the actual cause and omit the reset option

**N+1 upsert audit scope:**

- Audit ALL files in `src/db/helpers/` for N+1 patterns (not limited to libraryItems.ts and fullLibraryItems.ts from DB-06/07)
- Fix all N+1 patterns found, regardless of whether they were in the original requirements — they're in scope for this phase
- Single transaction for batch upserts — no chunking needed; all-at-once is the target

### Claude's Discretion

- Error handling strategy for partial metadata failures in fullLibraryItems.ts (genre/narrator/tag insert failures within an otherwise-successful item upsert)
- Whether to write new tests for batch helpers and WAL setup (use judgment on where tests add meaningful coverage vs. over-testing infrastructure)
- Exact error screen component design and message wording

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID    | Description                                                                         | Research Support                                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DB-01 | WAL mode + `synchronous=NORMAL` pragmas configured at DB open                       | `getSQLiteDb()` in `src/db/client.ts` is the single open point; add `execSync('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;')` immediately after `openDatabaseSync`     |
| DB-02 | Index added on `library_items.library_id`                                           | Add `index()` to `libraryItems` schema table definition; generate migration via `npm run drizzle:generate`                                                                     |
| DB-03 | Index added on `media_metadata.library_item_id`                                     | Add `index()` to `mediaMetadata` schema table definition; generate migration                                                                                                   |
| DB-04 | Index added on `audio_files.media_id`                                               | Add `index()` to `audioFiles` schema table definition; generate migration                                                                                                      |
| DB-05 | Composite index added on `media_progress(user_id, library_item_id)`                 | Add `index()` with two columns to `mediaProgress` schema table definition; generate migration                                                                                  |
| DB-06 | `upsertLibraryItems()` converted from serial for-loop to batch `onConflictDoUpdate` | Replace `upsertLibraryItem()` calls in loop with single `db.insert(libraryItems).values(rows).onConflictDoUpdate({ target: libraryItems.id, set: conflictUpdateSetFromRows })` |
| DB-07 | `fullLibraryItems.ts` genre/narrator/tag inserts converted to batch operations      | Replace per-name loops in `upsertGenres`, `upsertNarrators`, `upsertTags` with single `.values(names.map(...)).onConflictDoNothing()` call                                     |

</phase_requirements>

---

## Standard Stack

### Core

| Library     | Version | Purpose              | Why Standard                                                        |
| ----------- | ------- | -------------------- | ------------------------------------------------------------------- |
| drizzle-orm | ^0.44.5 | ORM / query builder  | Already in use; `index()`, `onConflictDoUpdate` are in this version |
| expo-sqlite | ^16.0.8 | Native SQLite bridge | Already in use; `openDatabaseSync`, `execSync` available            |
| drizzle-kit | ^0.31.4 | Migration generator  | Already configured with expo driver                                 |

### Supporting

| Library           | Version | Purpose                 | When to Use                                                                        |
| ----------------- | ------- | ----------------------- | ---------------------------------------------------------------------------------- |
| expo-sqlite (raw) | ^16.0.8 | Direct pragma execution | WAL/synchronous pragmas must be run as raw SQL before Drizzle wraps the connection |

### Alternatives Considered

| Instead of                                 | Could Use                           | Tradeoff                                                                                                                  |
| ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Schema-level `index()` for indexes         | Raw SQL `CREATE INDEX` in migration | Schema-level is preferred — drizzle-kit tracks it and future migrations stay consistent                                   |
| `onConflictDoUpdate` for all batch helpers | `sql.raw` bulk REPLACE              | `onConflictDoUpdate` is type-safe and already used in the codebase (`upsertLibrary`, `upsertUser`, `upsertMediaProgress`) |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes. All changes are within existing files:

```
src/
├── db/
│   ├── client.ts              # ADD: WAL pragma after openDatabaseSync
│   ├── schema/
│   │   ├── libraryItems.ts    # ADD: index on library_id
│   │   ├── mediaMetadata.ts   # ADD: index on library_item_id
│   │   ├── audioFiles.ts      # ADD: index on media_id
│   │   └── mediaProgress.ts   # ADD: composite index on (user_id, library_item_id)
│   ├── migrations/            # NEW: migration file generated by drizzle:generate
│   └── helpers/
│       ├── libraryItems.ts    # REWRITE: upsertLibraryItems → batch onConflictDoUpdate
│       ├── fullLibraryItems.ts # REWRITE: upsertGenres/Narrators/Tags → batch
│       ├── audioFiles.ts      # REWRITE: upsertAudioFiles → batch onConflictDoUpdate
│       ├── chapters.ts        # REWRITE: upsertChapters → batch onConflictDoUpdate
│       ├── libraryFiles.ts    # REWRITE: upsertLibraryFiles → batch onConflictDoUpdate
│       ├── libraries.ts       # REWRITE: upsertLibraries → batch onConflictDoUpdate
│       ├── series.ts          # REWRITE: upsertMultipleSeries → batch onConflictDoUpdate
│       └── authors.ts         # REWRITE: upsertAuthors → batch onConflictDoUpdate
├── providers/
│   └── DbProvider.tsx         # ADD: blocking error screen when migration fails
└── components/
    └── errors/ (or db/)       # ADD: DbErrorScreen component
```

### Pattern 1: WAL Pragma at DB Open

**What:** Execute PRAGMA statements on the raw SQLite connection immediately after `openDatabaseSync`, before Drizzle wraps it.

**When to use:** Every DB open (first open and after `resetDatabaseFile`).

**Where to add:** `getSQLiteDb()` in `src/db/client.ts` — this is the single chokepoint that all DB access flows through. After `openDatabaseSync` succeeds, run pragmas synchronously before returning.

```typescript
// Source: expo-sqlite docs + SQLite pragma documentation
export function getSQLiteDb(): SQLite.SQLiteDatabase {
  if (!sqliteDb) {
    sqliteDb = SQLite.openDatabaseSync(DB_NAME);
    // Set WAL mode and reduce fsync overhead. Must run before Drizzle
    // migrations, but after the file is opened. WAL is persistent after
    // the first PRAGMA — subsequent opens pick it up automatically.
    // synchronous=NORMAL is safe with WAL (only loses committed data on
    // OS crash, not app crash).
    sqliteDb.execSync("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
  }
  return sqliteDb;
}
```

**Critical detail:** `journal_mode=WAL` is a database-level setting that persists across connections once set. After the first run it is a no-op on subsequent opens. `synchronous=NORMAL` is connection-level and must be set every open — which `getSQLiteDb()` handles because it only runs once per app session (the `if (!sqliteDb)` guard).

**After `resetDatabaseFile`:** The existing `resetDatabaseFile()` sets `sqliteDb = null` and then calls `getSQLiteDb()`, which will re-run the pragmas on the new file. This is already correct behavior.

### Pattern 2: Drizzle Schema Index Declaration

**What:** Add `index()` calls to schema table definitions so drizzle-kit generates the correct migration SQL.

**When to use:** Any column used in `WHERE`, `JOIN ON`, or `ORDER BY` that does not have a unique constraint (unique constraints auto-create indexes).

```typescript
// Source: drizzle-orm sqlite-core documentation
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const libraryItems = sqliteTable(
  "library_items",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    // ... other columns unchanged
  },
  (table) => [index("library_items_library_id_idx").on(table.libraryId)]
);
```

For composite indexes (DB-05):

```typescript
// mediaProgress composite index
export const mediaProgress = sqliteTable(
  "media_progress",
  {
    // ... columns unchanged
  },
  (table) => [index("media_progress_user_library_idx").on(table.userId, table.libraryItemId)]
);
```

After schema changes, run `npm run drizzle:generate` to produce the migration SQL file. The generated SQL will contain `CREATE INDEX IF NOT EXISTS ...` statements.

### Pattern 3: Batch `onConflictDoUpdate`

**What:** Replace per-row insert/select/update loops with a single `db.insert(table).values(rows).onConflictDoUpdate(...)` call. Drizzle translates this to a single `INSERT INTO ... ON CONFLICT DO UPDATE SET ...` statement.

**When to use:** Any helper that currently loops over an array and calls insert or upsert per row.

```typescript
// Source: drizzle-orm documentation — INSERT ... ON CONFLICT
// Pattern for tables with a primary key conflict target:

export async function upsertLibraryItems(rows: NewLibraryItemRow[]): Promise<void> {
  if (!rows?.length) return;
  await db
    .insert(libraryItems)
    .values(rows)
    .onConflictDoUpdate({
      target: libraryItems.id,
      set: {
        libraryId: sql`excluded.library_id`,
        ino: sql`excluded.ino`,
        // ... all mutable columns
      },
    });
}
```

**The `sql\`excluded.column\`` pattern** is required when `set` needs to reference the values being inserted (as opposed to hardcoded values). Drizzle ORM supports this via the `sql` tagged template.

**Alternative — `onConflictDoUpdate` with object spread:** For tables where every column should be replaced, Drizzle supports passing the row object directly to `set`. This is the pattern already used in `upsertLibrary`:

```typescript
.onConflictDoUpdate({ target: libraries.id, set: row })
```

This works when there is only one row. For multi-row batch upserts, the `set` must use `excluded.*` references because `row` is not defined in scope.

**`onConflictDoNothing` for junction tables:**

```typescript
// For upsertGenres, upsertNarrators, upsertTags where the name IS the conflict key:
await db
  .insert(genres)
  .values(genreNames.map((name) => ({ name })))
  .onConflictDoNothing();
```

### Pattern 4: Blocking DB Error Screen

**What:** `DbProvider` currently renders children unconditionally after calling `useMigrations`. When `error` is non-null or `success` is false, children should NOT render — instead a blocking screen is shown.

**Current behavior (DbProvider.tsx line 35-39):**

```typescript
const value = useMemo<DbContextValue>(
  () => ({
    initialized: !!success && !error,   // initialized=false but children still render
    error: error ?? null,
    ...
  }),
  ...
);
return (
  <DbContext.Provider value={value} key={resetKey}>
    {children}     // children always render regardless of error
  </DbContext.Provider>
);
```

**Required behavior:**

```typescript
// In DbProvider render — after the useMigrations call:
if (error) {
  // Log to the pre-DB logger path (logs.sqlite — not abs2.sqlite)
  // Determine error category for context-aware recovery UI
  return <DbErrorScreen error={error} onReset={...} />;
}
if (!success) {
  return <DbLoadingScreen />;  // or null — migrations running
}
return (
  <DbContext.Provider value={value} key={resetKey}>
    {children}
  </DbContext.Provider>
);
```

**Logger path for DB errors:** Use `console.error` + `logger.error` (which writes to `logs.sqlite` via `getLogsDb()` — a separate database that does not depend on the failing `abs2.sqlite`). The logger's `insertLogToDb` calls `getLogsDb()` which opens `logs.sqlite` independently. This is the "pre-DB initialization path" referenced in CONTEXT.md.

**Error categorization for recovery action:** Parse the error message to distinguish:

- Migration/schema errors → offer "Reset database" button (data loss warning)
- Disk full errors → explain cause, omit reset button (resetting won't help)
- Unknown errors → show generic message + copy button, offer reset as last resort

**Copy/share pattern:** Use `Share.share({ message: fullErrorText })` from `react-native` to let users copy the stack trace. The existing `ErrorBoundary` uses a scrollable `<Text>` in `__DEV__` — `DbErrorScreen` should show the copy button in all builds since this is a user-facing error.

### Anti-Patterns to Avoid

- **Setting pragmas via Drizzle:** `db.run(sql\`PRAGMA...\`)`goes through Drizzle's statement wrapper and may not apply before migrations run. Always use the raw`sqliteDb.execSync()`.
- **Chunking batch upserts:** CONTEXT.md explicitly rules out chunking. SQLite supports thousands of rows in a single VALUES clause; the limit is bound by the `SQLITE_LIMIT_VARIABLE_NUMBER` setting (default 32766 in most builds), which won't be hit for library syncs.
- **select-then-update in transactions:** The current `upsertAudioFiles`, `upsertChapters`, `upsertLibraryFiles` pattern (select existing → branch update/insert) becomes a select per row. Replace entirely with `onConflictDoUpdate` — no select needed.
- **Wrapping batch upserts in a transaction manually:** `db.insert(...).values(rows).onConflictDoUpdate(...)` is already a single statement and therefore atomic. No additional `db.transaction()` wrapper is needed for the batch upsert itself.

---

## Don't Hand-Roll

| Problem                          | Don't Build                       | Use Instead                                   | Why                                                                        |
| -------------------------------- | --------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| Index creation                   | Manual `CREATE INDEX` SQL in code | Drizzle schema `index()` + `drizzle:generate` | Drizzle-kit tracks schema state; raw SQL creates drift                     |
| WAL detection/conditional pragma | Logic to check if WAL already set | Always run the PRAGMA — it's idempotent       | WAL PRAGMA returns current mode, setting it again is a no-op               |
| Batch upsert chunking            | Split arrays into chunks of N     | Single `values(rows)` call                    | SQLite handles it; chunking adds complexity for no benefit at these scales |
| Error categorization library     | Custom error parser               | Simple string matching on `error.message`     | SQLite error messages are stable and predictable                           |

---

## Common Pitfalls

### Pitfall 1: WAL pragma not applied after DB reset

**What goes wrong:** `resetDatabaseFile()` deletes and recreates the database. The new file starts in DELETE journal mode.

**Why it happens:** `resetDatabaseFile()` calls `getSQLiteDb()` at the end, which runs the pragmas — so this is actually handled correctly by the current flow. But if `resetDatabaseFile` is ever called in a way that bypasses `getSQLiteDb()`, WAL would not be set.

**How to avoid:** Verify `getSQLiteDb()` is the last call in `resetDatabaseFile()` and that it always executes the pragma block (not gated on the `if (!sqliteDb)` check — note that after nulling `sqliteDb`, the guard is false, so pragmas DO run).

**Warning signs:** DB writes are slow after a database reset.

### Pitfall 2: `set` in `onConflictDoUpdate` uses stale single-row reference

**What goes wrong:** When converting from single-row to multi-row batch, using `set: row` (referencing the variable from the loop) doesn't work — `row` is not defined and would cause a TypeScript error.

**Why it happens:** Drizzle's `onConflictDoUpdate` `set` argument must be a static object or `sql\`excluded...\``references. For multi-row batch, only the`excluded.\*` form works.

**How to avoid:** Use `sql\`excluded.column_name\``for each mutable column, or build the`set` object from a known row's key list.

**Warning signs:** TypeScript error "Cannot find name 'row'" or silently updating all conflicting rows with the last inserted value.

### Pitfall 3: Migration file not committed alongside schema change

**What goes wrong:** Schema change in `.ts` file is committed but the generated migration SQL file is not, or vice versa.

**Why it happens:** `drizzle:generate` creates a new `.sql` file in `src/db/migrations/` that must be committed separately.

**How to avoid:** Always commit schema file + generated migration file together. Verify by running `npm run drizzle:generate` a second time and checking it produces no new file.

### Pitfall 4: `upsertLibraryItemTx` not updated alongside `upsertLibraryItems`

**What goes wrong:** The Tx variant in `libraryItems.ts` still uses the old select+branch pattern after the main function is batched.

**Why it happens:** There are two functions — `upsertLibraryItem` (single), `upsertLibraryItems` (batch), and `upsertLibraryItemTx` (transaction-aware single). All three need updating.

**How to avoid:** Search for all upsert variants in each helper file before refactoring.

### Pitfall 5: `fullLibraryItems.ts` serial author/series loops inside transaction

**What goes wrong:** Inside `processFullLibraryItem`, the author and series inserts are already inside a transaction but still use `for` loops. These become batch inserts too.

**How to avoid:** Apply batch conversion to every `for (const x of rows) { await tx.insert(...) }` pattern, not just the top-level helpers.

### Pitfall 6: DbErrorScreen blocks migration loading state

**What goes wrong:** `useMigrations` returns `{ success: false, error: null }` while migrations are running. Showing an error screen during normal loading is wrong.

**How to avoid:** Only show error screen when `error` is non-null. While `!success && !error`, show a loading indicator or return null (splash screen stays visible).

---

## Code Examples

### WAL Pragma — client.ts change

```typescript
// Source: expo-sqlite docs; PRAGMA reference: https://www.sqlite.org/pragma.html#pragma_journal_mode
export function getSQLiteDb(): SQLite.SQLiteDatabase {
  if (!sqliteDb) {
    console.log("Opening SQLite database");
    sqliteDb = SQLite.openDatabaseSync(DB_NAME);
    // WAL mode: concurrent reads don't block writes. synchronous=NORMAL:
    // safe with WAL, ~4x faster writes than FULL.
    sqliteDb.execSync("PRAGMA journal_mode=WAL;");
    sqliteDb.execSync("PRAGMA synchronous=NORMAL;");
  }
  return sqliteDb;
}
```

Note: Two separate `execSync` calls are safer than one combined string if either pragma needs individual error handling.

### Index in Schema — libraryItems.ts

```typescript
// Source: drizzle-orm sqlite-core, index declaration API
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const libraryItems = sqliteTable(
  "library_items",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    // ... all other columns unchanged ...
  },
  (table) => [index("library_items_library_id_idx").on(table.libraryId)]
);
```

### Batch `upsertLibraryItems`

```typescript
// Source: drizzle-orm documentation — batch insert with conflict resolution
import { sql } from "drizzle-orm";

export async function upsertLibraryItems(rows: NewLibraryItemRow[]): Promise<void> {
  if (!rows?.length) return;
  await db
    .insert(libraryItems)
    .values(rows)
    .onConflictDoUpdate({
      target: libraryItems.id,
      set: {
        libraryId: sql`excluded.library_id`,
        ino: sql`excluded.ino`,
        folderId: sql`excluded.folder_id`,
        path: sql`excluded.path`,
        relPath: sql`excluded.rel_path`,
        isFile: sql`excluded.is_file`,
        mtimeMs: sql`excluded.mtime_ms`,
        ctimeMs: sql`excluded.ctime_ms`,
        birthtimeMs: sql`excluded.birthtime_ms`,
        addedAt: sql`excluded.added_at`,
        updatedAt: sql`excluded.updated_at`,
        lastScan: sql`excluded.last_scan`,
        scanVersion: sql`excluded.scan_version`,
        isMissing: sql`excluded.is_missing`,
        isInvalid: sql`excluded.is_invalid`,
        mediaType: sql`excluded.media_type`,
      },
    });
}
```

### Batch `upsertGenres` (onConflictDoNothing variant)

```typescript
// genres table has name as primary key — just ignore duplicates
export async function upsertGenres(genreNames: string[]): Promise<void> {
  if (!genreNames?.length) return;
  await db
    .insert(genres)
    .values(genreNames.map((name) => ({ name })))
    .onConflictDoNothing();
}
```

Same pattern applies to `upsertNarrators` and `upsertTags`.

### `upsertMediaProgress` — remove loop, keep onConflictDoUpdate

```typescript
// Source: existing pattern in libraryItems and users helpers
export async function upsertMediaProgress(rows: NewMediaProgressRow[]): Promise<void> {
  if (!rows?.length) return;
  await db
    .insert(mediaProgress)
    .values(rows)
    .onConflictDoUpdate({ target: mediaProgress.id, set: /* excluded.* */ });
}
```

### `upsertLibraries` — trivial batch (already uses onConflictDoUpdate per-call)

```typescript
export async function upsertLibraries(rows: NewLibraryRow[]): Promise<void> {
  if (!rows?.length) return;
  await db
    .insert(libraries)
    .values(rows)
    .onConflictDoUpdate({ target: libraries.id, set: /* excluded.* */ });
}
```

---

## Complete N+1 Audit Results

All files in `src/db/helpers/` audited. Findings:

| Helper File                 | Function                                | Pattern Found                                                        | Fix                                                              |
| --------------------------- | --------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `libraryItems.ts`           | `upsertLibraryItems`                    | `for (row of rows) await upsertLibraryItem(row)` — 2 queries per row | Batch `onConflictDoUpdate`                                       |
| `libraryItems.ts`           | `upsertLibraryItemTx`                   | select + branch update/insert                                        | Batch `onConflictDoUpdate` or drop Tx variant                    |
| `fullLibraryItems.ts`       | `upsertGenres`                          | `for (name) await db.insert`                                         | Batch `onConflictDoNothing`                                      |
| `fullLibraryItems.ts`       | `upsertNarrators`                       | `for (name) await db.insert`                                         | Batch `onConflictDoNothing`                                      |
| `fullLibraryItems.ts`       | `upsertTags`                            | `for (name) await db.insert`                                         | Batch `onConflictDoNothing`                                      |
| `fullLibraryItems.ts`       | `processFullLibraryItem` (authors)      | `for (authorRow) await tx.insert`                                    | Batch `tx.insert(authors).values(authorRows).onConflictDoUpdate` |
| `fullLibraryItems.ts`       | `processFullLibraryItem` (series)       | `for (seriesRow) await tx.insert`                                    | Batch `tx.insert(series).values(seriesRows).onConflictDoUpdate`  |
| `fullLibraryItems.ts`       | `processFullLibraryItem` (mediaAuthors) | `for (row) await tx.insert(mediaAuthors)`                            | Batch `tx.insert(mediaAuthors).values(rows).onConflictDoNothing` |
| `fullLibraryItems.ts`       | `processFullLibraryItem` (mediaSeries)  | `for (row) await tx.insert(mediaSeries)`                             | Batch `tx.insert(mediaSeries).values(rows).onConflictDoUpdate`   |
| `fullLibraryItems.ts`       | `processFullLibraryItem` (audioFiles)   | `for (row) await tx.insert(audioFiles)`                              | Batch `tx.insert(audioFiles).values(rows).onConflictDoUpdate`    |
| `fullLibraryItems.ts`       | `processFullLibraryItem` (chapters)     | `for (row) await tx.insert(chapters)`                                | Batch `tx.insert(chapters).values(rows).onConflictDoUpdate`      |
| `fullLibraryItems.ts`       | `processFullLibraryItem` (libraryFiles) | `for (row) await tx.insert(libraryFiles)`                            | Batch `tx.insert(libraryFiles).values(rows).onConflictDoUpdate`  |
| `audioFiles.ts`             | `upsertAudioFiles`                      | select+branch per row in transaction                                 | Batch `onConflictDoUpdate`                                       |
| `chapters.ts`               | `upsertChapters`                        | select+branch per row in transaction                                 | Batch `onConflictDoUpdate`                                       |
| `libraryFiles.ts`           | `upsertLibraryFiles`                    | select+branch per row in transaction                                 | Batch `onConflictDoUpdate`                                       |
| `libraries.ts`              | `upsertLibraries`                       | `for (row) await upsertLibrary(row)`                                 | Batch `onConflictDoUpdate`                                       |
| `series.ts`                 | `upsertMultipleSeries`                  | `for (row) await upsertSeries(row)`                                  | Batch `onConflictDoUpdate`                                       |
| `authors.ts`                | `upsertAuthors`                         | `for (row) await upsertAuthor(row)`                                  | Batch `onConflictDoUpdate`                                       |
| `authors.ts`                | `getAllAuthors` (update phase)          | `Promise.all(updates.map(u => db.update...))`                        | Acceptable — parallel not serial; low N                          |
| `mediaProgress.ts`          | `upsertMediaProgress`                   | `for (row) await db.insert(...).onConflictDoUpdate`                  | Batch `onConflictDoUpdate`                                       |
| `mediaMetadata.ts`          | (no batch upsert)                       | No N+1 pattern                                                       | No change needed                                                 |
| `mediaJoins.ts`             | all functions                           | delete-then-insert pattern; batch insert already                     | No N+1 in insert; consider delete+insert wrapping                |
| `users.ts`                  | `upsertUser`                            | Single row only                                                      | No change needed                                                 |
| `tokens.ts`                 | (no batch)                              | No N+1 pattern                                                       | No change needed                                                 |
| `localData.ts`              | (no batch)                              | No N+1 pattern                                                       | No change needed                                                 |
| `homeScreen.ts`             | (read-only)                             | No N+1 pattern                                                       | No change needed                                                 |
| `statistics.ts`             | (read-only)                             | No N+1 pattern                                                       | No change needed                                                 |
| `filterData.ts`             | (read-only)                             | No N+1 pattern                                                       | No change needed                                                 |
| `combinedQueries.ts`        | (read-only)                             | No N+1 pattern                                                       | No change needed                                                 |
| `localListeningSessions.ts` | (no batch)                              | No N+1 pattern                                                       | No change needed                                                 |

---

## Validation Architecture

### Test Framework

| Property           | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| Framework          | Jest 29.7 + jest-expo 54                                       |
| Config file        | `package.json` (jest-expo preset)                              |
| Quick run command  | `npm test -- --testPathPattern="db/helpers" --passWithNoTests` |
| Full suite command | `npm test`                                                     |

### Phase Requirements → Test Map

| Req ID | Behavior                                                          | Test Type                           | Automated Command                                                       | File Exists?   |
| ------ | ----------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- | -------------- |
| DB-01  | WAL pragma executes on DB open                                    | unit (mock execSync spy)            | `npm test -- --testPathPattern="db/client"`                             | Wave 0         |
| DB-02  | Index on `library_items.library_id` exists in migration SQL       | manual check of generated .sql file | N/A — verify SQL content                                                | File generated |
| DB-03  | Index on `media_metadata.library_item_id` exists in migration SQL | manual check                        | N/A                                                                     | File generated |
| DB-04  | Index on `audio_files.media_id` exists in migration SQL           | manual check                        | N/A                                                                     | File generated |
| DB-05  | Composite index on `media_progress(user_id, library_item_id)`     | manual check                        | N/A                                                                     | File generated |
| DB-06  | `upsertLibraryItems([500 items])` makes 1 INSERT statement        | unit (count db.insert calls)        | `npm test -- --testPathPattern="db/helpers/__tests__/libraryItems"`     | Wave 0         |
| DB-07  | `upsertGenres(['a','b','c'])` makes 1 INSERT statement            | unit                                | `npm test -- --testPathPattern="db/helpers/__tests__/fullLibraryItems"` | Wave 0         |

**Testing philosophy (CONTEXT.md: Claude's discretion):** Tests for batch helpers add meaningful coverage — a regression back to per-row loops would be invisible without them. WAL setup is infrastructure and harder to unit test meaningfully (the pragma is applied correctly by construction). Recommend: tests for DB-06 and DB-07 (verifying single-statement execution), skip DB-01 unit test (pragma correctness is verified by construction and integration-testing it requires a real SQLite file on device).

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern="db/helpers" --passWithNoTests`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/db/helpers/__tests__/libraryItems.test.ts` — covers DB-06 batch assertion
- [ ] `src/db/helpers/__tests__/fullLibraryItems.test.ts` — covers DB-07 batch assertion (genres/narrators/tags)

_(Existing test infrastructure: Jest + jest-expo + createTestDb utility in `src/__tests__/utils/testDb.ts` — no new framework setup needed)_

---

## State of the Art

| Old Approach                                  | Current Approach                         | When Changed                                         | Impact                                             |
| --------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Per-row select+update or insert               | Batch `INSERT ... ON CONFLICT DO UPDATE` | drizzle-orm has supported this since early versions  | Single SQL statement vs 2N statements              |
| `PRAGMA journal_mode=DELETE` (SQLite default) | `journal_mode=WAL`                       | No version gating — WAL available in all SQLite 3.7+ | ~4x write throughput for concurrent-read workloads |

**Deprecated/outdated:**

- `upsertLibraryItemTx`: The transaction-aware single-row variant in `libraryItems.ts` was designed for when batch wasn't available. With batch `onConflictDoUpdate`, callers should pass all rows to `upsertLibraryItems` instead. This function can be removed or replaced with a thin wrapper.

---

## Open Questions

1. **`upsertLibraryItemTx` callers**
   - What we know: The function exists and is exported. No grep needed — it appears to be unused outside the file (the only call is from `upsertLibraryItems` which calls `upsertLibraryItem` — not the Tx variant).
   - What's unclear: Are there callers in non-indexed files (generated code, etc.)?
   - Recommendation: Run `grep -r "upsertLibraryItemTx" src/` during implementation to confirm zero callers before removing.

2. **`fullLibraryItems.ts` partial failure strategy (Claude's discretion)**
   - What we know: CONTEXT.md leaves error handling for partial genre/narrator/tag failures to Claude's discretion.
   - Recommendation: Since these are reference/lookup tables and the join tables control the actual relationships, a failure in `upsertGenres` is safe to log-and-continue (the media item and its relationship data are in a separate transaction). Wrap each batch in try/catch, log the error, and let `processFullLibraryItem` continue.

3. **`drizzle-orm` `sql\`excluded.\*\`` column name mapping**
   - What we know: Drizzle's `excluded` references use the SQL column name (snake_case), not the TypeScript property name (camelCase).
   - Recommendation: Double-check each column name against the schema file during implementation (e.g., `sql\`excluded.library_id\``not`sql\`excluded.libraryId\``).

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection of `src/db/client.ts`, `src/db/helpers/*.ts`, `src/db/schema/*.ts`, `src/providers/DbProvider.tsx` — authoritative source for current behavior
- `src/db/migrations/` — confirms no existing indexes on the four target columns
- `package.json` — confirmed drizzle-orm 0.44.5, expo-sqlite 16.0.8

### Secondary (MEDIUM confidence)

- SQLite WAL documentation: https://www.sqlite.org/wal.html — confirmed WAL is connection-persistent, synchronous=NORMAL is connection-level
- drizzle-orm sqlite-core index API: pattern inferred from drizzle-orm source and existing codebase patterns; verified `index()` is exported from `drizzle-orm/sqlite-core`

### Tertiary (LOW confidence)

- Performance claim of ~4x write throughput: from SQLite WAL documentation and common knowledge — not benchmarked against this specific app

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies; all patterns used elsewhere in codebase
- Architecture: HIGH — all change locations identified from direct code inspection
- N+1 audit: HIGH — complete enumeration of all helpers, each file read directly
- Pitfalls: HIGH — derived from code reading, not speculation
- WAL pragma approach: HIGH — well-documented SQLite behavior, expo-sqlite `execSync` is the correct API

**Research date:** 2026-03-03
**Valid until:** 2026-06-01 (stable stack; drizzle API unlikely to change for these primitives)
