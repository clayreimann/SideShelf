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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { consoleTransport, logger as rnLogger } from "react-native-logs";
import { v4 as uuidv4 } from "uuid";
import { deleteLogsBefore, insertLogToDb } from "./db";
import type { LogLevel, SubLogger } from "./types";

const DISABLED_TAGS_KEY = "@logger/disabled_tags";
const RETENTION_DURATION_KEY = "@logger/retention_duration_ms";
const DEFAULTED_TO_DISABLED_KEY = "@logger/defaulted_to_disabled";
const TAG_LEVELS_KEY = "@logger/tag_levels";
const DEFAULT_LOG_LEVEL_KEY = "@logger/default_log_level";

// Re-export types and DB functions for convenience
export {
  clearAllLogs,
  getAllLogs,
  getAllTags,
  getLogsByLevel,
  getLogsByTag,
  getErrorCount,
  getWarningCount,
  getErrorCountSince,
  getWarningCountSince,
  vacuumDatabase,
  getDatabaseSize,
} from "./db";
export type { LogRow } from "./db";
export type { LogEntry, LogLevel, SubLogger } from "./types";

const ONE_HOUR_MS = 60 * 60 * 1000;
const MIN_LOG_RETENTION_MS = ONE_HOUR_MS; // Always keep at least 1 hour of logs
const DEFAULT_LOG_RETENTION_MS = ONE_HOUR_MS; // Default retention when no preference is stored

/**
 * Tags that should be disabled by default when first encountered.
 * This list can be updated over time as new verbose logging tags are added.
 * The system tracks which tags have been processed to avoid overriding user preferences.
 */
const DEFAULT_DISABLED_TAGS = ["api:fetch:detailed"];

let currentRetentionDurationMs = DEFAULT_LOG_RETENTION_MS;
let defaultLogLevel: LogLevel = "info"; // Default log level (can be overridden)
let logWriteCount = 0;
const PURGE_EVERY_N_LOGS = 100; // Purge every 100 logs instead of random 1%
let lastPurgeTime = 0;
const PURGE_INTERVAL_MS = 5 * 60 * 1000; // Also purge every 5 minutes

const clampRetentionDuration = (durationMs: number): number =>
  Math.max(durationMs, MIN_LOG_RETENTION_MS);

/**
 * Custom SQLite transport for react-native-logs
 */
const sqliteTransport = (props: any) => {
  const timestamp = new Date();
  const { rawMsg, level, extension } = props;

  // Extract tag from extension or use 'App' as default
  const tag = extension || "App";

  const includeStack = __DEV__;
  const formatArg = (arg: any): string => {
    if (arg instanceof Error) {
      if (includeStack && arg.stack) {
        return `Error: ${arg.message}\nStack: ${arg.stack}`;
      }
      return `Error: ${arg.message}`;
    }

    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }

    return String(arg);
  };

  // Format message
  let message = "";
  if (typeof rawMsg[0] === "string") {
    message = rawMsg[0];
    // Include any additional arguments
    if (rawMsg.length > 1) {
      message += " " + rawMsg.slice(1).map(formatArg).join(" ");
    }
  } else {
    message = rawMsg.map(formatArg).join(" ");
  }

  // Write to SQLite database (async, non-blocking)
  const logLevel = level.text as LogLevel;
  insertLogToDb({
    id: uuidv4(),
    timestamp,
    level: logLevel,
    tag,
    message,
  });

  // Notify subscribers if error or warning was logged
  if (logLevel === "error" || logLevel === "warn") {
    // Notify subscribers asynchronously to avoid blocking
    setTimeout(() => {
      try {
        const loggerInstance = Logger.getInstance();
        if (loggerInstance) {
          loggerInstance.notifyCountUpdate();
        }
      } catch (error) {
        // Silently fail - notification is not critical
      }
    }, 0);
  }

  // Periodically trim old logs (every N logs or every N minutes)
  logWriteCount++;
  const now = Date.now();
  const shouldPurge =
    logWriteCount >= PURGE_EVERY_N_LOGS || now - lastPurgeTime >= PURGE_INTERVAL_MS;

  if (shouldPurge) {
    try {
      const retentionMs = currentRetentionDurationMs;
      const cutoffDate = new Date(now - retentionMs);
      const cutoffTimestamp = cutoffDate.getTime();
      deleteLogsBefore(cutoffDate);
      lastPurgeTime = now;
      logWriteCount = 0;

      // VACUUM after purging to reclaim space
      const { vacuumDatabase } = require("./db");
      vacuumDatabase();

      // If there's an acknowledgment timestamp older than the cutoff,
      // reset it so new errors/warnings will show the badge again
      try {
        // Lazy import to avoid circular dependency
        const { useAppStore } = require("@/stores/appStore");
        const loggerSlice = useAppStore.getState().logger;
        if (
          loggerSlice?.errorsAcknowledgedTimestamp !== null &&
          loggerSlice.errorsAcknowledgedTimestamp < cutoffTimestamp
        ) {
          // Acknowledgment timestamp is older than the cutoff - reset it
          loggerSlice.resetErrorAcknowledgment();
          // Also update counts to check for any remaining errors/warnings
          loggerSlice.updateErrorCounts();
        } else {
          // Just update counts in case there are new errors/warnings
          loggerSlice?.updateErrorCounts();
        }
      } catch (error) {
        // Ignore errors - store might not be available yet
      }
    } catch (error) {
      console.error("[Logger] Failed to trim old logs:", error);
    }
  }
};

/**
 * Get the minimum log level required based on default level and per-tag levels
 * This ensures react-native-logs doesn't filter out messages we want to handle per-tag
 *
 * @param tagLevelsMap - Optional map of tag levels (used during logger initialization)
 */
const getMinimumSeverity = (tagLevelsMap?: Map<string, LogLevel>): LogLevel => {
  // Start with the default level
  let minLevel: LogLevel = defaultLogLevel;

  // If no tag levels map provided, just return the default
  if (!tagLevelsMap || tagLevelsMap.size === 0) {
    return minLevel;
  }

  // Check if any tag has a lower (more verbose) level than the default
  const levelValues: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  let minLevelValue = levelValues[defaultLogLevel];

  for (const tagLevel of tagLevelsMap.values()) {
    const tagLevelValue = levelValues[tagLevel];
    if (tagLevelValue < minLevelValue) {
      minLevelValue = tagLevelValue;
      minLevel = tagLevel;
    }
  }

  return minLevel;
};

/**
 * Configure react-native-logs
 * Note: severity is set to the minimum level needed to support all tag-level configurations
 *
 * @param tagLevelsMap - Optional map of tag levels (used during logger initialization)
 */
const getConfig = (tagLevelsMap?: Map<string, LogLevel>) => ({
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  },
  severity: getMinimumSeverity(tagLevelsMap),
  transport: __DEV__ ? [consoleTransport, sqliteTransport] : [sqliteTransport],
  transportOptions: {
    colors: {
      debug: "blueBright" as const,
      info: "green" as const,
      warn: "yellow" as const,
      error: "red" as const,
    },
  },
  async: true,
  dateFormat: "iso" as const,
  printLevel: true,
  printDate: true,
  enabled: true,
});

// Create logger instance with initial config
// Note: We'll need to recreate it if the default log level changes
let rnLoggerInstance = rnLogger.createLogger(getConfig());

/**
 * Logger facade that provides a consistent API with cached subloggers
 */
type LogCountUpdateCallback = (errorCount: number, warningCount: number) => void;

class Logger {
  private static instance: Logger | null = null;
  private subLoggers: Map<string, SubLogger> = new Map();
  private disabledTags: Set<string> = new Set();
  private tagLevels: Map<string, LogLevel> = new Map();
  private initialized: boolean = false;
  private countUpdateCallbacks: Set<LogCountUpdateCallback> = new Set();

  private constructor() {
    // Load persisted settings on initialization
    this.loadSettings();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Load disabled tags from AsyncStorage
   */
  private async loadSettings(): Promise<void> {
    try {
      const [storedTags, storedRetention, storedDefaulted, storedTagLevels, storedDefaultLevel] =
        await Promise.all([
          AsyncStorage.getItem(DISABLED_TAGS_KEY),
          AsyncStorage.getItem(RETENTION_DURATION_KEY),
          AsyncStorage.getItem(DEFAULTED_TO_DISABLED_KEY),
          AsyncStorage.getItem(TAG_LEVELS_KEY),
          AsyncStorage.getItem(DEFAULT_LOG_LEVEL_KEY),
        ]);

      // Load existing disabled tags
      if (storedTags) {
        const tags = JSON.parse(storedTags) as string[];
        this.disabledTags = new Set(tags);
        console.log(`[Logger] Loaded ${tags.length} disabled tags from storage`);
      }

      // Load the set of tags that have already been processed for default disabling
      const defaultedTags = storedDefaulted
        ? new Set(JSON.parse(storedDefaulted) as string[])
        : new Set<string>();

      // Check for new tags in DEFAULT_DISABLED_TAGS that haven't been processed yet
      const newTagsToDisable: string[] = [];
      for (const tag of DEFAULT_DISABLED_TAGS) {
        if (!defaultedTags.has(tag)) {
          // This tag is new - add it to disabled tags
          this.disabledTags.add(tag);
          defaultedTags.add(tag);
          newTagsToDisable.push(tag);
        }
      }

      // If we processed any new default tags, save the updated state
      if (newTagsToDisable.length > 0) {
        console.log(
          `[Logger] Applied default disabled state to ${newTagsToDisable.length} new tags: ${newTagsToDisable.join(", ")}`
        );
        await Promise.all([
          this.saveDisabledTags(),
          AsyncStorage.setItem(
            DEFAULTED_TO_DISABLED_KEY,
            JSON.stringify(Array.from(defaultedTags))
          ),
        ]);
      }

      if (storedRetention) {
        const parsedRetention = Number(storedRetention);
        if (!Number.isNaN(parsedRetention) && parsedRetention > 0) {
          currentRetentionDurationMs = clampRetentionDuration(parsedRetention);
          console.log(
            `[Logger] Loaded log retention preference: ${Math.round(
              currentRetentionDurationMs / ONE_HOUR_MS
            )}h`
          );
        }
      }

      // Load per-tag log levels
      if (storedTagLevels) {
        const tagLevelsObj = JSON.parse(storedTagLevels) as Record<string, LogLevel>;
        for (const [tag, level] of Object.entries(tagLevelsObj)) {
          this.tagLevels.set(tag, level);
        }
        console.log(`[Logger] Loaded ${this.tagLevels.size} tag level configurations`);
      }

      // Load default log level
      if (storedDefaultLevel) {
        const level = storedDefaultLevel as LogLevel;
        if (["debug", "info", "warn", "error"].includes(level)) {
          defaultLogLevel = level;
          console.log(`[Logger] Loaded default log level: ${level}`);
        }
      }

      // Recreate the logger instance with loaded tag levels
      // This ensures the global severity accounts for any per-tag debug levels
      if (this.tagLevels.size > 0) {
        rnLoggerInstance = rnLogger.createLogger(getConfig(this.tagLevels));
        // Refresh any already-created subloggers (shouldn't be any at init, but for safety)
        this.refreshAllSubLoggers();
        console.log("[Logger] Recreated logger instance with tag-level configurations");
      }

      this.initialized = true;
    } catch (error) {
      console.error("[Logger] Failed to load logger settings from storage:", error);
      this.initialized = true;
    }
  }

  /**
   * Save disabled tags to AsyncStorage
   */
  private async saveDisabledTags(): Promise<void> {
    try {
      const tags = Array.from(this.disabledTags);
      await AsyncStorage.setItem(DISABLED_TAGS_KEY, JSON.stringify(tags));
    } catch (error) {
      console.error("[Logger] Failed to save disabled tags to storage:", error);
    }
  }

  /**
   * Wait for initialization to complete
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // Wait for initialization with timeout
    const timeout = 1000; // 1 second
    const start = Date.now();
    while (!this.initialized && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Get a cached sublogger for a specific tag
   * This avoids creating multiple subloggers for the same tag
   *
   * The sublogger holds a reference to an extended logger that can be refreshed
   * when rnLoggerInstance is recreated
   */
  forTag(tag: string): SubLogger {
    let subLogger = this.subLoggers.get(tag);
    if (!subLogger) {
      const isTagDisabled = () => this.disabledTags.has(tag);
      const getTagLevel = () => this.tagLevels.get(tag);
      const getGlobalSeverity = () => defaultLogLevel;

      // Helper to check if a log level should be logged based on tag's configured level
      const shouldLog = (messageLevel: LogLevel): boolean => {
        if (isTagDisabled()) return false;
        const tagLevel = getTagLevel();
        const globalSeverity = getGlobalSeverity();
        const effectiveLevel: LogLevel = (tagLevel || globalSeverity) as LogLevel;

        // Map severity string to LogLevel for comparison
        const levelValues: Record<LogLevel, number> = {
          debug: 0,
          info: 1,
          warn: 2,
          error: 3,
        };

        const messageLevelValue = levelValues[messageLevel];
        const effectiveLevelValue = levelValues[effectiveLevel] ?? levelValues.info;

        return messageLevelValue >= effectiveLevelValue;
      };

      // Hold a reference to the extended logger that can be updated
      let extendedLogger = rnLoggerInstance.extend(tag);

      subLogger = {
        debug: (message: string) => {
          if (shouldLog("debug")) extendedLogger.debug(message);
        },
        info: (message: string) => {
          if (shouldLog("info")) extendedLogger.info(message);
        },
        warn: (message: string) => {
          if (shouldLog("warn")) extendedLogger.warn(message);
        },
        error: (message: string, error?: Error) => {
          if (shouldLog("error")) {
            if (error) {
              extendedLogger.error(message, error);
            } else {
              extendedLogger.error(message);
            }
          }
        },
        // Internal method to refresh the extended logger when rnLoggerInstance is recreated
        _refreshExtendedLogger: () => {
          extendedLogger = rnLoggerInstance.extend(tag);
        },
      };
      this.subLoggers.set(tag, subLogger);
    }
    return subLogger;
  }

  /**
   * Get a diagnostic sublogger for verbose diagnostic logging
   * Diagnostic loggers are prefixed with "DIAG:" and can be enabled/disabled separately
   * from the main logger for that tag. This is useful for detailed debugging without
   * cluttering the main logs.
   *
   * @param tag - The base tag (e.g., "PlayerService")
   * @returns A SubLogger that logs to "DIAG:{tag}"
   */
  forDiagnostics(tag: string): SubLogger {
    const diagTag = `DIAG:${tag}`;
    return this.forTag(diagTag);
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
   * Manually trigger log trimming and vacuum
   * Also checks if acknowledgment timestamp should be reset due to trimming
   */
  manualTrim(): void {
    try {
      const retentionMs = currentRetentionDurationMs;
      const cutoffDate = new Date(Date.now() - retentionMs);
      const cutoffTimestamp = cutoffDate.getTime();

      deleteLogsBefore(cutoffDate);

      // VACUUM after purging to reclaim space
      const { vacuumDatabase } = require("./db");
      vacuumDatabase();

      // Reset counters
      logWriteCount = 0;
      lastPurgeTime = Date.now();

      // If there's an acknowledgment timestamp older than the cutoff,
      // reset it so new errors/warnings will show the badge again
      try {
        // Lazy import to avoid circular dependency
        const { useAppStore } = require("@/stores/appStore");
        const loggerSlice = useAppStore.getState().logger;
        if (
          loggerSlice?.errorsAcknowledgedTimestamp !== null &&
          loggerSlice.errorsAcknowledgedTimestamp < cutoffTimestamp
        ) {
          // Acknowledgment timestamp is older than the cutoff - reset it
          loggerSlice.resetErrorAcknowledgment();
          // Also update counts to check for any remaining errors/warnings
          loggerSlice.updateErrorCounts();
        } else {
          // Just update counts in case there are new errors/warnings
          loggerSlice?.updateErrorCounts();
        }
      } catch (error) {
        // Ignore errors - store might not be available yet
        console.error("[Logger] Failed to update acknowledgment after trim:", error);
      }
    } catch (error) {
      console.error("[Logger] Failed to manually trim logs:", error);
    }
  }

  /**
   * Clear all logs (exposed on logger instance)
   */
  clearLogs(): void {
    // This is handled by the db module
    const { clearAllLogs } = require("./db");
    clearAllLogs();
  }

  /**
   * Get the current log retention duration in milliseconds
   */
  getRetentionDurationMs(): number {
    return currentRetentionDurationMs;
  }

  /**
   * Get the current log retention duration in hours (rounded)
   */
  getRetentionDurationHours(): number {
    return Math.round(currentRetentionDurationMs / ONE_HOUR_MS);
  }

  /**
   * Update the log retention duration (milliseconds)
   */
  async setRetentionDurationMs(durationMs: number): Promise<void> {
    const clampedDuration = clampRetentionDuration(durationMs);
    const hasChanged = clampedDuration !== currentRetentionDurationMs;
    currentRetentionDurationMs = clampedDuration;

    try {
      await AsyncStorage.setItem(RETENTION_DURATION_KEY, clampedDuration.toString());
    } catch (error) {
      console.error("[Logger] Failed to save log retention preference:", error);
    }

    if (hasChanged) {
      this.manualTrim();
    }
  }

  /**
   * Update the log retention duration (hours)
   */
  async setRetentionDurationHours(hours: number): Promise<void> {
    const durationMs = Math.round(hours) * ONE_HOUR_MS;
    await this.setRetentionDurationMs(durationMs);
  }

  /**
   * Refresh all cached subloggers to use the current rnLoggerInstance
   * Called when rnLoggerInstance is recreated
   */
  private refreshAllSubLoggers(): void {
    for (const subLogger of this.subLoggers.values()) {
      subLogger._refreshExtendedLogger?.();
    }
  }

  /**
   * Clear the sublogger cache (useful for testing)
   */
  clearCache(): void {
    this.subLoggers.clear();
  }

  /**
   * Enable logging for a specific tag
   */
  enableTag(tag: string): void {
    this.disabledTags.delete(tag);
    this.saveDisabledTags(); // Persist changes
  }

  /**
   * Disable logging for a specific tag
   */
  disableTag(tag: string): void {
    this.disabledTags.add(tag);
    this.saveDisabledTags(); // Persist changes
  }

  /**
   * Check if a tag is enabled
   */
  isTagEnabled(tag: string): boolean {
    return !this.disabledTags.has(tag);
  }

  /**
   * Get all disabled tags
   */
  getDisabledTags(): string[] {
    return Array.from(this.disabledTags);
  }

  /**
   * Enable all tags
   */
  enableAllTags(): void {
    this.disabledTags.clear();
    this.saveDisabledTags(); // Persist changes
  }

  /**
   * Initialize the logger and load persisted settings
   * Call this early in app startup to ensure settings are loaded
   */
  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  /**
   * Save tag levels to AsyncStorage
   */
  private async saveTagLevels(): Promise<void> {
    try {
      const tagLevelsObj: Record<string, LogLevel> = {};
      for (const [tag, level] of this.tagLevels.entries()) {
        tagLevelsObj[tag] = level;
      }
      await AsyncStorage.setItem(TAG_LEVELS_KEY, JSON.stringify(tagLevelsObj));
    } catch (error) {
      console.error("[Logger] Failed to save tag levels to storage:", error);
    }
  }

  /**
   * Set log level for a specific tag
   */
  async setTagLevel(tag: string, level: LogLevel): Promise<void> {
    this.tagLevels.set(tag, level);
    await this.saveTagLevels();

    // Recreate the logger instance to update global severity if needed
    // This is necessary when a tag level is more verbose than the current global severity
    rnLoggerInstance = rnLogger.createLogger(getConfig(this.tagLevels));

    // Refresh all cached subloggers to use the new logger instance
    this.refreshAllSubLoggers();
  }

  /**
   * Get log level for a specific tag
   * Returns undefined if tag has no custom level (uses global severity)
   */
  getTagLevel(tag: string): LogLevel | undefined {
    return this.tagLevels.get(tag);
  }

  /**
   * Get all tag levels as a record
   */
  getAllTagLevels(): Record<string, LogLevel> {
    const result: Record<string, LogLevel> = {};
    for (const [tag, level] of this.tagLevels.entries()) {
      result[tag] = level;
    }
    return result;
  }

  /**
   * Remove custom log level for a tag (revert to global severity)
   */
  async clearTagLevel(tag: string): Promise<void> {
    this.tagLevels.delete(tag);
    await this.saveTagLevels();

    // Recreate the logger instance to update global severity if needed
    // This is necessary when removing a tag level that was the most verbose
    rnLoggerInstance = rnLogger.createLogger(getConfig(this.tagLevels));

    // Refresh all cached subloggers to use the new logger instance
    this.refreshAllSubLoggers();
  }

  /**
   * Get the default log level
   */
  getDefaultLogLevel(): LogLevel {
    return defaultLogLevel;
  }

  /**
   * Set the default log level
   * This affects all loggers that don't have a specific level set
   */
  async setDefaultLogLevel(level: LogLevel): Promise<void> {
    defaultLogLevel = level;
    await AsyncStorage.setItem(DEFAULT_LOG_LEVEL_KEY, level);

    // Recreate the logger instance with new severity config
    // This ensures react-native-logs respects the new default level
    rnLoggerInstance = rnLogger.createLogger(getConfig(this.tagLevels));

    // Refresh all cached subloggers to use the new logger instance
    this.refreshAllSubLoggers();

    console.log(`[Logger] Default log level set to: ${level}`);
  }

  /**
   * Subscribe to error/warning count updates
   * Returns an unsubscribe function
   */
  subscribeToCountUpdates(callback: LogCountUpdateCallback): () => void {
    this.countUpdateCallbacks.add(callback);
    // Immediately call with current counts
    this.notifyCountUpdate(callback);
    // Return unsubscribe function
    return () => {
      this.countUpdateCallbacks.delete(callback);
    };
  }

  /**
   * Notify all subscribers of current error/warning counts
   * Public method called from transport when errors/warnings are logged
   */
  notifyCountUpdate(callback?: LogCountUpdateCallback): void {
    try {
      const { getErrorCount, getWarningCount } = require("./db");
      const errorCount = getErrorCount();
      const warningCount = getWarningCount();

      if (callback) {
        callback(errorCount, warningCount);
      } else {
        // Notify all subscribers
        for (const cb of this.countUpdateCallbacks) {
          cb(errorCount, warningCount);
        }
      }
    } catch (error) {
      console.error("[Logger] Failed to notify count update:", error);
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
