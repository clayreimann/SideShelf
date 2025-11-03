/**
 * Logger Database Module
 *
 * Handles all SQLite database operations for the logging system.
 * Uses a separate logs.sqlite database to avoid contention with the main app database.
 */

import type { LogDbRow, LogEntry, LogLevel } from "@/lib/logger/types";
import * as SQLite from "expo-sqlite";

// Re-export LogEntry as LogRow for backward compatibility
export type LogRow = LogEntry;

let logsDb: SQLite.SQLiteDatabase | null = null;

/**
 * Get or initialize the logs database
 */
function getLogsDb(): SQLite.SQLiteDatabase {
  if (!logsDb) {
    console.log("[Logger] Opening logs database");
    logsDb = SQLite.openDatabaseSync("logs.sqlite");

    // Initialize logs table if it doesn't exist
    try {
      logsDb.execSync(`
        CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY NOT NULL,
          timestamp INTEGER NOT NULL,
          level TEXT NOT NULL,
          tag TEXT NOT NULL,
          message TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS logs_timestamp_idx ON logs (timestamp);
        CREATE INDEX IF NOT EXISTS logs_level_idx ON logs (level);
      `);
      console.log("[Logger] Logs database initialized");
    } catch (error) {
      console.error("[Logger] Failed to initialize logs table:", error);
    }
  }
  return logsDb;
}

/**
 * Insert a log entry into the database (async to never block UI)
 */
export function insertLogToDb(log: LogEntry): void {
  const db = getLogsDb();
  db.runAsync(
    "INSERT INTO logs (id, timestamp, level, tag, message) VALUES (?, ?, ?, ?, ?)",
    [log.id, log.timestamp.getTime(), log.level, log.tag, log.message]
  );
}

/**
 * Get all logs from database
 */
export function getAllLogs(limit?: number): LogRow[] {
  const db = getLogsDb();
  const sql = limit
    ? "SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?"
    : "SELECT * FROM logs ORDER BY timestamp DESC";

  const rows = limit
    ? db.getAllSync<LogDbRow>(sql, [limit])
    : db.getAllSync<LogDbRow>(sql);

  return rows.map((row) => ({
    ...row,
    timestamp: new Date(row.timestamp),
  }));
}

/**
 * Get logs by level (inclusive filtering)
 *
 * Level filtering behavior:
 * - debug → all levels (debug, info, warn, error)
 * - info → info, warn, error
 * - warn → warn, error
 * - error → error only
 */
export function getLogsByLevel(level: LogLevel, limit?: number): LogRow[] {
  const db = getLogsDb();

  // Determine which levels to include based on the selected level
  let levelFilter: string;
  switch (level) {
    case "debug":
      levelFilter = "level IN ('debug', 'info', 'warn', 'error')";
      break;
    case "info":
      levelFilter = "level IN ('info', 'warn', 'error')";
      break;
    case "warn":
      levelFilter = "level IN ('warn', 'error')";
      break;
    case "error":
      levelFilter = "level = 'error'";
      break;
    default:
      levelFilter = "level = ?";
  }

  const sql = limit
    ? `SELECT * FROM logs WHERE ${levelFilter} ORDER BY timestamp DESC LIMIT ?`
    : `SELECT * FROM logs WHERE ${levelFilter} ORDER BY timestamp DESC`;

  const rows = limit
    ? db.getAllSync<LogDbRow>(sql, [limit])
    : db.getAllSync<LogDbRow>(sql);

  return rows.map((row) => ({
    ...row,
    timestamp: new Date(row.timestamp),
  }));
}

/**
 * Clear all logs
 */
export function clearAllLogs(): void {
  const db = getLogsDb();
  db.runSync("DELETE FROM logs");
}

/**
 * Delete logs older than a certain date
 */
export function deleteLogsBefore(date: Date): void {
  const db = getLogsDb();
  db.runSync("DELETE FROM logs WHERE timestamp < ?", [date.getTime()]);
}

/**
 * Get all unique tags from logs
 */
export function getAllTags(): string[] {
  const db = getLogsDb();
  const rows = db.getAllSync<{ tag: string }>(
    "SELECT DISTINCT tag FROM logs ORDER BY tag ASC"
  );
  return rows.map((row) => row.tag);
}

/**
 * Get logs for a specific tag
 */
export function getLogsByTag(tag: string, limit?: number): LogRow[] {
  const db = getLogsDb();
  const sql = limit
    ? "SELECT * FROM logs WHERE tag = ? ORDER BY timestamp DESC LIMIT ?"
    : "SELECT * FROM logs WHERE tag = ? ORDER BY timestamp DESC";

  const rows = limit
    ? db.getAllSync<LogDbRow>(sql, [tag, limit])
    : db.getAllSync<LogDbRow>(sql, [tag]);

  return rows.map((row) => ({
    ...row,
    timestamp: new Date(row.timestamp),
  }));
}

/**
 * Get count of error level logs since a specific timestamp
 */
export function getErrorCountSince(timestamp: number): number {
  const db = getLogsDb();
  const row = db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) as count FROM logs WHERE level = 'error' AND timestamp >= ?",
    [timestamp]
  );
  return row?.count ?? 0;
}

/**
 * Get count of warning level logs since a specific timestamp
 */
export function getWarningCountSince(timestamp: number): number {
  const db = getLogsDb();
  const row = db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) as count FROM logs WHERE level = 'warn' AND timestamp >= ?",
    [timestamp]
  );
  return row?.count ?? 0;
}

/**
 * Get count of error level logs
 */
export function getErrorCount(): number {
  const db = getLogsDb();
  const row = db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) as count FROM logs WHERE level = 'error'"
  );
  return row?.count ?? 0;
}

/**
 * Get count of warning level logs
 */
export function getWarningCount(): number {
  const db = getLogsDb();
  const row = db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) as count FROM logs WHERE level = 'warn'"
  );
  return row?.count ?? 0;
}

/**
 * Vacuum the database to reclaim space after deletions
 */
export function vacuumDatabase(): void {
  const db = getLogsDb();
  try {
    db.execSync('VACUUM');
    console.log('[Logger] Database vacuumed successfully');
  } catch (error) {
    console.error('[Logger] Failed to vacuum database:', error);
  }
}

/**
 * Get database size in bytes (approximate)
 * Uses log count as a proxy since PRAGMA commands may not work reliably
 */
export function getDatabaseSize(): number {
  const db = getLogsDb();
  try {
    // Get log count and estimate size
    const logCount = db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM logs"
    )?.count ?? 0;
    // Rough estimate: ~500 bytes per log entry on average
    // This is a conservative estimate - actual size may vary
    return logCount * 500;
  } catch (error) {
    console.error('[Logger] Failed to get database size:', error);
    return 0;
  }
}
