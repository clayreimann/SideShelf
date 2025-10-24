/**
 * Centralized Logger with SQLite Persistence
 *
 * This logger provides:
 * - Multiple log levels (debug, info, warn, error)
 * - SQLite persistence for all logs in a separate database
 * - Automatic log trimming to prevent database bloat
 * - Export functionality for remote troubleshooting
 * - Built on react-native-logs for robust logging infrastructure
 * - Cached subloggers for improved performance
 *
 * Usage (direct):
 *   import { logger } from '@/lib/logger';
 *   logger.debug('MyComponent', 'Debug message');
 *   logger.info('MyComponent', 'Info message');
 *   logger.warn('MyComponent', 'Warning message');
 *   logger.error('MyComponent', 'Error message', error);
 *
 * Usage (cached sublogger - recommended for frequent logging):
 *   import { logger } from '@/lib/logger';
 *   const log = logger.forTag('MyComponent');
 *   log.info('Info message');
 *   log.error('Error message', error);
 */

import { consoleTransport, logger as rnLogger } from 'react-native-logs';
import { v4 as uuidv4 } from 'uuid';
import { deleteLogsBefore, insertLogToDb, trimLogsToCount } from './db';
import type { LogLevel, SubLogger } from './types';

// Re-export types and DB functions for convenience
export { clearAllLogs, getAllLogs, getLogsByLevel } from './db';
export type { LogRow } from './db';
export type { LogEntry, LogLevel, SubLogger } from './types';

const MAX_LOGS = 1000; // Keep only the most recent 1000 logs
const MAX_LOG_AGE_DAYS = 7; // Delete logs older than 7 days

/**
 * Custom SQLite transport for react-native-logs
 */
const sqliteTransport = (props: any) => {
  const timestamp = new Date();
  const { msg, rawMsg, level, extension, options } = props;

  // Extract tag from extension or use 'App' as default
  const tag = extension || 'App';

  // Format message
  let message = '';
  if (typeof rawMsg[0] === 'string') {
    message = rawMsg[0];
    // Include any additional arguments
    if (rawMsg.length > 1) {
      message += ' ' + rawMsg.slice(1).map((arg: any) => {
        if (arg instanceof Error) {
          return `Error: ${arg.message}\nStack: ${arg.stack}`;
        }
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      }).join(' ');
    }
  } else {
    message = rawMsg.map((arg: any) => {
      if (arg instanceof Error) {
        return `Error: ${arg.message}\nStack: ${arg.stack}`;
      }
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }).join(' ');
  }

  // Write to SQLite database (async, non-blocking)
  insertLogToDb({
    id: uuidv4(),
    timestamp,
    level: level.text as LogLevel,
    tag,
    message,
  });

  // Periodically trim old logs (1% chance per log write)
  if (Math.random() < 0.01) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - MAX_LOG_AGE_DAYS);
      deleteLogsBefore(cutoffDate);
      trimLogsToCount(MAX_LOGS);
    } catch (error) {
      console.error('[Logger] Failed to trim old logs:', error);
    }
  }
};

/**
 * Configure react-native-logs
 */
const config = {
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  },
  severity: __DEV__ ? 'debug' : 'info',
  transport: __DEV__ ? [consoleTransport, sqliteTransport] : [sqliteTransport],
  transportOptions: {
    colors: {
      debug: 'blueBright' as const,
      info: 'green' as const,
      warn: 'yellow' as const,
      error: 'red' as const,
    },
  },
  async: true,
  dateFormat: 'iso' as const,
  printLevel: true,
  printDate: true,
  enabled: true,
};

// Create logger instance
const rnLoggerInstance = rnLogger.createLogger(config);

/**
 * Logger facade that provides a consistent API with cached subloggers
 */
class Logger {
  private static instance: Logger | null = null;
  private subLoggers: Map<string, SubLogger> = new Map();

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Get a cached sublogger for a specific tag
   * This avoids creating multiple subloggers for the same tag
   */
  forTag(tag: string): SubLogger {
    let subLogger = this.subLoggers.get(tag);
    if (!subLogger) {
      const extendedLogger = rnLoggerInstance.extend(tag);
      subLogger = {
        debug: (message: string) => extendedLogger.debug(message),
        info: (message: string) => extendedLogger.info(message),
        warn: (message: string) => extendedLogger.warn(message),
        error: (message: string, error?: Error) => {
          if (error) {
            extendedLogger.error(message, error);
          } else {
            extendedLogger.error(message);
          }
        },
      };
      this.subLoggers.set(tag, subLogger);
    }
    return subLogger;
  }

  /**
   * Log a debug message
   */
  debug(tag: string, message: string): void {
    this.forTag(tag).debug(message);
  }

  /**
   * Log an info message
   */
  info(tag: string, message: string): void {
    this.forTag(tag).info(message);
  }

  /**
   * Log a warning message
   */
  warn(tag: string, message: string): void {
    this.forTag(tag).warn(message);
  }

  /**
   * Log an error message
   * @param tag - Component or module name
   * @param message - Error message
   * @param error - Optional Error object to include stack trace
   */
  error(tag: string, message: string, error?: Error): void {
    this.forTag(tag).error(message, error);
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    if (enabled) {
      rnLoggerInstance.enable();
    } else {
      rnLoggerInstance.disable();
    }
  }

  /**
   * Manually trigger log trimming
   */
  manualTrim(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_LOG_AGE_DAYS);
    deleteLogsBefore(cutoffDate);
    trimLogsToCount(MAX_LOGS);
  }

  /**
   * Clear all logs (exposed on logger instance)
   */
  clearLogs(): void {
    // This is handled by the db module
    const { clearAllLogs } = require('./db');
    clearAllLogs();
  }

  /**
   * Clear the sublogger cache (useful for testing)
   */
  clearCache(): void {
    this.subLoggers.clear();
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
