/**
 * Logger slice for Zustand store
 *
 * This slice manages logger-related state including:
 * - Error and warning counts from the database
 * - Error acknowledgment state
 * - Automatic updates when logs are written
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getErrorCount, getWarningCount, getErrorCountSince, getWarningCountSince } from '@/lib/logger';
import type { SliceCreator } from '@/types/store';

const ERRORS_ACKNOWLEDGED_TIMESTAMP_KEY = '@logger/errors_acknowledged_timestamp';

// Create logger slice
export interface LoggerSliceState {
  logger: {
    /** Current error count from database */
    errorCount: number;
    /** Current warning count from database */
    warningCount: number;
    /** Timestamp when errors were last acknowledged (null if never acknowledged) */
    errorsAcknowledgedTimestamp: number | null;
    /** Whether the slice has been initialized */
    initialized: boolean;
  };
}

/**
 * Logger slice actions interface
 */
export interface LoggerSliceActions {
  logger: {
    /** Update error and warning counts from database */
    updateErrorCounts: () => void;
    /** Mark errors as acknowledged */
    acknowledgeErrors: () => Promise<void>;
    /** Reset error acknowledgment flag */
    resetErrorAcknowledgment: () => Promise<void>;
    /** Initialize the slice (load counts and acknowledgment state) */
    initialize: () => Promise<void>;
  };
}

export type LoggerSlice = LoggerSliceState & LoggerSliceActions;

/**
 * Create the logger slice
 */
export const createLoggerSlice: SliceCreator<LoggerSlice> = (set, get) => ({
  logger: {
    errorCount: 0,
    warningCount: 0,
    errorsAcknowledgedTimestamp: null,
    initialized: false,

    /**
     * Update error and warning counts from database
     * Also checks for unacknowledged errors/warnings since last acknowledgment
     */
    updateErrorCounts: () => {
      try {
        const errorCount = getErrorCount();
        const warningCount = getWarningCount();
        const state = get().logger;

        // If there's an acknowledgment timestamp, check for new errors/warnings since then
        let errorsAcknowledgedTimestamp = state.errorsAcknowledgedTimestamp;
        if (errorsAcknowledgedTimestamp !== null) {
          const errorsSince = getErrorCountSince(errorsAcknowledgedTimestamp);
          const warningsSince = getWarningCountSince(errorsAcknowledgedTimestamp);

          // If there are no errors/warnings since acknowledgment, keep the timestamp
          // Otherwise, reset it to null so badge shows again
          if (errorsSince === 0 && warningsSince === 0) {
            // Keep the timestamp - all errors/warnings have been acknowledged
          } else {
            // New errors/warnings appeared, reset acknowledgment
            errorsAcknowledgedTimestamp = null;
            AsyncStorage.removeItem(ERRORS_ACKNOWLEDGED_TIMESTAMP_KEY).catch(() => {
              // Ignore storage errors
            });
          }
        }

        set((state) => ({
          logger: {
            ...state.logger,
            errorCount,
            warningCount,
            errorsAcknowledgedTimestamp,
          },
        }));
      } catch (error) {
        console.error('[LoggerSlice] Failed to update error counts:', error);
      }
    },

    /**
     * Mark errors as acknowledged at the current timestamp
     */
    acknowledgeErrors: async () => {
      try {
        const timestamp = Date.now();
        await AsyncStorage.setItem(ERRORS_ACKNOWLEDGED_TIMESTAMP_KEY, timestamp.toString());
        set((state) => ({
          logger: {
            ...state.logger,
            errorsAcknowledgedTimestamp: timestamp,
          },
        }));
      } catch (error) {
        console.error('[LoggerSlice] Failed to acknowledge errors:', error);
      }
    },

    /**
     * Reset error acknowledgment timestamp
     */
    resetErrorAcknowledgment: async () => {
      try {
        await AsyncStorage.removeItem(ERRORS_ACKNOWLEDGED_TIMESTAMP_KEY);
        set((state) => ({
          logger: {
            ...state.logger,
            errorsAcknowledgedTimestamp: null,
          },
        }));
      } catch (error) {
        console.error('[LoggerSlice] Failed to reset error acknowledgment:', error);
      }
    },

    /**
     * Initialize the slice (load counts and acknowledgment state)
     */
    initialize: async () => {
      if (get().logger.initialized) return;

      try {
        // Load error acknowledgment timestamp
        const acknowledgedTimestampStr = await AsyncStorage.getItem(ERRORS_ACKNOWLEDGED_TIMESTAMP_KEY);
        let errorsAcknowledgedTimestamp: number | null = null;
        if (acknowledgedTimestampStr) {
          const parsed = parseInt(acknowledgedTimestampStr, 10);
          if (!isNaN(parsed)) {
            errorsAcknowledgedTimestamp = parsed;
          }
        }

        // Load initial counts from database
        const errorCount = getErrorCount();
        const warningCount = getWarningCount();

        // If there's an acknowledgment timestamp, verify it's still valid
        // (i.e., no new errors/warnings since then)
        if (errorsAcknowledgedTimestamp !== null) {
          const errorsSince = getErrorCountSince(errorsAcknowledgedTimestamp);
          const warningsSince = getWarningCountSince(errorsAcknowledgedTimestamp);

          // If there are new errors/warnings since acknowledgment, reset it
          if (errorsSince > 0 || warningsSince > 0) {
            errorsAcknowledgedTimestamp = null;
            await AsyncStorage.removeItem(ERRORS_ACKNOWLEDGED_TIMESTAMP_KEY);
          }
        }

        set((state) => ({
          logger: {
            ...state.logger,
            errorCount,
            warningCount,
            errorsAcknowledgedTimestamp,
            initialized: true,
          },
        }));
      } catch (error) {
        console.error('[LoggerSlice] Failed to initialize:', error);
        set((state) => ({
          logger: {
            ...state.logger,
            initialized: true, // Mark as initialized even on error
          },
        }));
      }
    },
  },
});
