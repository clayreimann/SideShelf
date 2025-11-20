/**
 * Logger Type Definitions
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Log entry for database storage
 */
export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  tag: string;
  message: string;
}

/**
 * Database row format (timestamp as number)
 */
export interface LogDbRow {
  id: string;
  timestamp: number;
  level: LogLevel;
  tag: string;
  message: string;
}

/**
 * SubLogger interface for tagged logging
 */
export interface SubLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: Error): void;
  /** Internal method to refresh the extended logger reference */
  _refreshExtendedLogger?: () => void;
}
