/**
 * TDD RED stubs — Path Normalization SQL Migration (DEBT-01)
 *
 * Tests the SQL migration 0014_normalize_paths.sql by running its UPDATE
 * statements against an in-memory SQLite test database.
 *
 * These tests FAIL in RED state because 0014_normalize_paths.sql does not
 * exist yet. Plans 03/04 will create the migration and make these tests GREEN.
 *
 * Test strategy:
 *  - Use testDb helper (in-memory SQLite with full schema migrations run first)
 *  - Insert dirty rows (file:// prefixed, percent-encoded) via raw SQL (bypasses FK)
 *  - Run the UPDATE statements from the migration file
 *  - Assert resulting rows match expected clean format
 *
 * Tables under test:
 *  - local_audio_file_downloads.download_path
 *  - local_library_file_downloads.download_path
 *  - local_cover_cache.local_cover_url
 */

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createTestDb, TestDatabase } from "@/__tests__/utils/testDb";
import * as fs from "fs";
import * as path from "path";

// Path to the migration SQL file that will be created by Plan 03/04
const MIGRATION_SQL_PATH = path.resolve(
  __dirname,
  "../../../db/migrations/0014_normalize_paths.sql"
);

/**
 * Load and return the migration SQL statements as an array.
 * Splits on semicolons, filters empty statements.
 */
function loadMigrationStatements(): string[] {
  if (!fs.existsSync(MIGRATION_SQL_PATH)) {
    throw new Error(
      `Migration file not found: ${MIGRATION_SQL_PATH}\n` +
        "This test is in RED state — 0014_normalize_paths.sql must be created in Plan 03/04."
    );
  }
  const sql = fs.readFileSync(MIGRATION_SQL_PATH, "utf-8");
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

describe("normalizePaths migration (0014_normalize_paths.sql)", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
    // Disable FK constraints so we can insert test rows without satisfying references
    testDb.sqlite.execSync("PRAGMA foreign_keys = OFF");
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.cleanup();
    }
  });

  it("test 1: path with 'file://' prefix is stripped to bare absolute path", () => {
    // Insert a dirty row with file:// prefix
    testDb.sqlite.execSync(`
      INSERT INTO local_audio_file_downloads
        (audio_file_id, is_downloaded, download_path, downloaded_at, updated_at, storage_location)
      VALUES
        ('audio-file-1', 1, 'file:///var/mobile/Media/Books/Columbus%20Day.m4b', 1700000000, 1700000000, 'documents')
    `);

    // Run the migration SQL
    const statements = loadMigrationStatements();
    for (const stmt of statements) {
      testDb.sqlite.execSync(stmt);
    }

    // Assert the row now has no file:// prefix
    const rows = testDb.sqlite.getAllSync<{ download_path: string }>(
      "SELECT download_path FROM local_audio_file_downloads WHERE audio_file_id = 'audio-file-1'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].download_path).not.toContain("file://");
  });

  it("test 2: path with '%20' encoding is decoded to space character", () => {
    // Insert a dirty row with percent-encoded space
    testDb.sqlite.execSync(`
      INSERT INTO local_audio_file_downloads
        (audio_file_id, is_downloaded, download_path, downloaded_at, updated_at, storage_location)
      VALUES
        ('audio-file-2', 1, '/var/mobile/Media/Books/Columbus%20Day.m4b', 1700000000, 1700000000, 'documents')
    `);

    const statements = loadMigrationStatements();
    for (const stmt of statements) {
      testDb.sqlite.execSync(stmt);
    }

    const rows = testDb.sqlite.getAllSync<{ download_path: string }>(
      "SELECT download_path FROM local_audio_file_downloads WHERE audio_file_id = 'audio-file-2'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].download_path).toContain(" ");
    expect(rows[0].download_path).not.toContain("%20");
  });

  it("test 3: path with '%28' / '%29' is decoded to parentheses", () => {
    // Insert a dirty row with percent-encoded parentheses
    testDb.sqlite.execSync(`
      INSERT INTO local_audio_file_downloads
        (audio_file_id, is_downloaded, download_path, downloaded_at, updated_at, storage_location)
      VALUES
        ('audio-file-3', 1, '/var/mobile/Media/Books/Title%20%28Unabridged%29.m4b', 1700000000, 1700000000, 'documents')
    `);

    const statements = loadMigrationStatements();
    for (const stmt of statements) {
      testDb.sqlite.execSync(stmt);
    }

    const rows = testDb.sqlite.getAllSync<{ download_path: string }>(
      "SELECT download_path FROM local_audio_file_downloads WHERE audio_file_id = 'audio-file-3'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].download_path).toContain("(");
    expect(rows[0].download_path).toContain(")");
    expect(rows[0].download_path).not.toContain("%28");
    expect(rows[0].download_path).not.toContain("%29");
  });

  it("test 4: path already in D: prefix scheme is unchanged", () => {
    // Insert a clean row — should not be modified
    testDb.sqlite.execSync(`
      INSERT INTO local_audio_file_downloads
        (audio_file_id, is_downloaded, download_path, downloaded_at, updated_at, storage_location)
      VALUES
        ('audio-file-4', 1, 'D:books/My Book/chapter1.m4b', 1700000000, 1700000000, 'documents')
    `);

    const statements = loadMigrationStatements();
    for (const stmt of statements) {
      testDb.sqlite.execSync(stmt);
    }

    const rows = testDb.sqlite.getAllSync<{ download_path: string }>(
      "SELECT download_path FROM local_audio_file_downloads WHERE audio_file_id = 'audio-file-4'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].download_path).toBe("D:books/My Book/chapter1.m4b");
  });

  it("test 5: path in C: prefix scheme is unchanged", () => {
    // Insert a clean row with C: prefix — should not be modified
    testDb.sqlite.execSync(`
      INSERT INTO local_cover_cache
        (media_id, local_cover_url, cached_at, updated_at)
      VALUES
        ('media-1', 'C:covers/item1/cover.jpg', 1700000000, 1700000000)
    `);

    const statements = loadMigrationStatements();
    for (const stmt of statements) {
      testDb.sqlite.execSync(stmt);
    }

    const rows = testDb.sqlite.getAllSync<{ local_cover_url: string }>(
      "SELECT local_cover_url FROM local_cover_cache WHERE media_id = 'media-1'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].local_cover_url).toBe("C:covers/item1/cover.jpg");
  });

  it("test 6: three tables are updated — local_audio_file_downloads, local_library_file_downloads, and local_cover_cache", () => {
    // Insert dirty rows into all three tables
    testDb.sqlite.execSync(`
      INSERT INTO local_audio_file_downloads
        (audio_file_id, is_downloaded, download_path, downloaded_at, updated_at, storage_location)
      VALUES
        ('audio-6', 1, 'file:///var/mobile/books/audio.m4b', 1700000000, 1700000000, 'documents')
    `);

    testDb.sqlite.execSync(`
      INSERT INTO local_library_file_downloads
        (library_file_id, is_downloaded, download_path, downloaded_at, updated_at)
      VALUES
        ('lib-file-6', 1, 'file:///var/mobile/books/lib.epub', 1700000000, 1700000000)
    `);

    testDb.sqlite.execSync(`
      INSERT INTO local_cover_cache
        (media_id, local_cover_url, cached_at, updated_at)
      VALUES
        ('media-6', 'file:///var/mobile/covers/cover.jpg', 1700000000, 1700000000)
    `);

    const statements = loadMigrationStatements();
    for (const stmt of statements) {
      testDb.sqlite.execSync(stmt);
    }

    // All three tables should have clean paths (no file:// prefix)
    const audioRows = testDb.sqlite.getAllSync<{ download_path: string }>(
      "SELECT download_path FROM local_audio_file_downloads WHERE audio_file_id = 'audio-6'"
    );
    const libRows = testDb.sqlite.getAllSync<{ download_path: string }>(
      "SELECT download_path FROM local_library_file_downloads WHERE library_file_id = 'lib-file-6'"
    );
    const coverRows = testDb.sqlite.getAllSync<{ local_cover_url: string }>(
      "SELECT local_cover_url FROM local_cover_cache WHERE media_id = 'media-6'"
    );

    expect(audioRows[0].download_path).not.toContain("file://");
    expect(libRows[0].download_path).not.toContain("file://");
    expect(coverRows[0].local_cover_url).not.toContain("file://");
  });
});
