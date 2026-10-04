import { afterEach, describe, expect, it } from "@jest/globals";
import migrations from "@/db/migrations/migrations";
import { TestDatabase } from "@/__tests__/utils/testDb";

function applyStatements(database: TestDatabase["sqlite"], sql: string): void {
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) database.execSync(trimmed);
  }
}

describe("local listening session episode migration (0016)", () => {
  const testDb = new TestDatabase();

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("adds nullable episode identity without changing existing session data", () => {
    const migrationEntries = Object.entries(migrations.migrations);
    for (const [tag, sql] of migrationEntries.filter(([tag]) => tag <= "m0015")) {
      expect(tag).toMatch(/^m\d{4}$/);
      applyStatements(testDb.sqlite, sql);
    }
    testDb.sqlite.execSync("PRAGMA foreign_keys = OFF");
    testDb.sqlite.execSync(`
      INSERT INTO local_listening_sessions (
        id, user_id, library_item_id, media_id, session_start,
        start_time, current_time, duration, time_listening,
        playback_rate, volume, is_synced, sync_attempts, created_at, updated_at
      ) VALUES ('session-1', 'user-1', 'item-1', 'media-1', 1700000000,
        0, 10, 100, 10, 1, 1, 0, 0, 1700000000, 1700000010)
    `);

    const migration = (migrations.migrations as Record<string, string>).m0016;
    expect(migration).toBeDefined();
    applyStatements(testDb.sqlite, migration);

    expect(
      testDb.sqlite.getFirstSync<{ episode_id: string | null }>(
        "SELECT episode_id FROM local_listening_sessions WHERE id = 'session-1'"
      )
    ).toEqual({ episode_id: null });
    expect(migrations.journal.entries.at(-1)).toEqual(
      expect.objectContaining({ tag: expect.stringMatching(/^0016_/) })
    );
  });
});
