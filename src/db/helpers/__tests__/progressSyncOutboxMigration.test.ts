import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import migrations from "@/db/migrations/migrations";
import { TestDatabase } from "@/__tests__/utils/testDb";
import * as SQLite from "expo-sqlite";

type OutboxRow = {
  sessionId: string;
  desiredRevision: number;
  acknowledgedRevision: number;
  updatedAt: Date;
  lastSyncTime: Date | null;
};

function applyStatements(database: SQLite.SQLiteDatabase, sql: string): void {
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) {
      database.execSync(trimmed);
    }
  }
}

function createPre0015Database(): TestDatabase {
  const testDb = new TestDatabase();
  const bundledMigrations = Object.entries(migrations.migrations)
    .filter(([tag]) => tag <= "m0014")
    .map(([, sql]) => sql);

  for (const migration of bundledMigrations) {
    applyStatements(testDb.sqlite, migration);
  }
  testDb.sqlite.execSync("PRAGMA foreign_keys = OFF");
  return testDb;
}

function insertSession(
  testDb: TestDatabase,
  id: string,
  isSynced: number,
  updatedAt: number,
  lastSyncTime: number | null,
  sessionEnd: number | null
): void {
  testDb.sqlite.execSync(`
    INSERT INTO local_listening_sessions (
      id, user_id, library_item_id, media_id, session_start, session_end,
      start_time, end_time, current_time, duration, time_listening,
      playback_rate, volume, is_synced, sync_attempts, last_sync_time,
      created_at, updated_at
    ) VALUES (
      '${id}', 'user-${id}', 'library-${id}', 'media-${id}', 1700000000, ${sessionEnd ?? "NULL"},
      0, ${sessionEnd === null ? "NULL" : 10}, 10, 100, 10,
      1, 1, ${isSynced}, 0, ${lastSyncTime ?? "NULL"},
      1699990000, ${updatedAt}
    )
  `);
}

function getOutboxRows(testDb: TestDatabase): OutboxRow[] {
  return testDb.sqlite
    .getAllSync<{
      session_id: string;
      desired_revision: number;
      acknowledged_revision: number;
      updated_at: number;
      last_sync_time: number | null;
    }>(
      `
      SELECT outbox.session_id, outbox.desired_revision, outbox.acknowledged_revision,
        outbox.updated_at, session.last_sync_time
      FROM progress_sync_outbox AS outbox
      JOIN local_listening_sessions AS session ON session.id = outbox.session_id
      ORDER BY CASE outbox.session_id
        WHEN 'clean' THEN 1
        WHEN 'active' THEN 2
        WHEN 'ended' THEN 3
        WHEN 'ambiguous' THEN 4
      END
    `
    )
    .map((row) => ({
      sessionId: row.session_id,
      desiredRevision: row.desired_revision,
      acknowledgedRevision: row.acknowledged_revision,
      updatedAt: new Date(row.updated_at * 1000),
      lastSyncTime: row.last_sync_time === null ? null : new Date(row.last_sync_time * 1000),
    }));
}

describe("progress sync outbox migration (0015)", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createPre0015Database();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("backfills active, ended, cleanly synced, and ambiguous sessions deterministically", () => {
    insertSession(testDb, "clean", 1, 1700000200, 1700000200, 1700000300);
    insertSession(testDb, "active", 0, 1700000200, null, null);
    insertSession(testDb, "ended", 0, 1700000200, null, 1700000300);
    insertSession(testDb, "ambiguous", 1, 1700000300, 1700000200, 1700000400);

    const migration = migrations.migrations.m0015;
    expect(migration).toBeDefined();
    applyStatements(testDb.sqlite, migration!);

    const rows = getOutboxRows(testDb);
    expect(rows).toEqual([
      expect.objectContaining({ sessionId: "clean", desiredRevision: 1, acknowledgedRevision: 1 }),
      expect.objectContaining({ sessionId: "active", desiredRevision: 1, acknowledgedRevision: 0 }),
      expect.objectContaining({ sessionId: "ended", desiredRevision: 1, acknowledgedRevision: 0 }),
      expect.objectContaining({
        sessionId: "ambiguous",
        desiredRevision: 1,
        acknowledgedRevision: 0,
      }),
    ]);
    const clean = rows.find((row) => row.sessionId === "clean")!;
    expect(clean.updatedAt.getTime()).toBe(clean.lastSyncTime?.getTime());
  });

  it("migrates an empty pre-0015 database and exposes the journaled runtime bundle", () => {
    const migration = migrations.migrations.m0015;
    expect(migration).toBeDefined();
    expect(migrations.journal.entries.find((entry) => entry.idx === 15)).toEqual(
      expect.objectContaining({ tag: expect.stringMatching(/^0015_/) })
    );
    const statements = migration!
      .split("--> statement-breakpoint")
      .map((statement: string) => statement.trim());
    expect(statements).toHaveLength(9);
    expect(statements.slice(2).every((statement: string) => statement.endsWith(";"))).toBe(true);

    expect(() => applyStatements(testDb.sqlite, migration!)).not.toThrow();
    expect(testDb.sqlite.getAllSync("SELECT * FROM progress_sync_outbox")).toEqual([]);
  });
});
