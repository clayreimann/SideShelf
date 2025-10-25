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
 * Get logs by level
 */
export function getLogsByLevel(level: LogLevel, limit?: number): LogRow[] {
  const db = getLogsDb();
  const sql = limit
    ? "SELECT * FROM logs WHERE level = ? ORDER BY timestamp DESC LIMIT ?"
    : "SELECT * FROM logs WHERE level = ? ORDER BY timestamp DESC";

  const rows = limit
    ? db.getAllSync<LogDbRow>(sql, [level, limit])
    : db.getAllSync<LogDbRow>(sql, [level]);

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
