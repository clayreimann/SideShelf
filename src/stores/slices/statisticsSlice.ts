/**
 * Statistics slice for Zustand store
 *
 * This slice manages app statistics and caches expensive database queries including:
 * - Database counts (authors, genres, languages, narrators, series, tags)
 * - Storage statistics
 * - Cache invalidation
 */

import { statisticsHelpers } from '@/db/helpers';
import { logger } from '@/lib/logger';
import type { SliceCreator } from '@/types/store';

// Create cached sublogger for this slice
const log = logger.forTag('StatisticsSlice');

/**
 * Database counts
 */
export interface DatabaseCounts {
    authors: number;
    genres: number;
    languages: number;
    narrators: number;
    series: number;
    tags: number;
}

/**
 * Storage entry for storage statistics
 */
export interface StorageEntry {
    id: string;
    title: string;
    count: number;
    size: number;
}

/**
 * Statistics slice state interface - scoped under 'statistics' to avoid conflicts
 */
export interface StatisticsSliceState {
    statistics: {
        /** Database counts */
        counts: DatabaseCounts;
        /** Storage statistics (files and sizes) */
        storageStats: StorageEntry[];
        /** Timestamp of last update */
        lastUpdated: number | null;
        /** Cache validity duration in milliseconds */
        cacheValidMs: number;
        /** Whether the slice has been initialized */
        initialized: boolean;
        /** Whether statistics are being loaded */
        isLoading: boolean;
    };
}

/**
 * Statistics slice actions interface
 */
export interface StatisticsSliceActions {
    // Public methods
    /** Refresh database counts */
    refreshStatistics: () => Promise<void>;
    /** Refresh storage statistics */
    refreshStorageStats: (storageStats: StorageEntry[]) => void;
    /** Invalidate cache (force refresh on next access) */
    invalidateCache: () => void;
    /** Check if cache is still valid */
    isCacheValid: () => boolean;
    /** Reset the slice to initial state */
    resetStatistics: () => void;
}

/**
 * Combined Statistics slice interface
 */
export interface StatisticsSlice extends StatisticsSliceState, StatisticsSliceActions { }

/**
 * Default cache validity (1 minute)
 */
const DEFAULT_CACHE_VALID_MS = 60 * 1000;

/**
 * Initial state
 */
const initialState: StatisticsSliceState = {
    statistics: {
        counts: {
            authors: 0,
            genres: 0,
            languages: 0,
            narrators: 0,
            series: 0,
            tags: 0,
        },
        storageStats: [],
        lastUpdated: null,
        cacheValidMs: DEFAULT_CACHE_VALID_MS,
        initialized: false,
        isLoading: false,
    },
};

/**
 * Create the Statistics slice
 */
export const createStatisticsSlice: SliceCreator<StatisticsSlice> = (set, get) => ({
    // Initial state
    ...initialState,

    /**
     * Refresh database counts
     */
    refreshStatistics: async () => {
        const state = get();

        // Check if cache is still valid
        if (get().isCacheValid()) {
            log.debug('Statistics cache still valid, skipping refresh');
            return;
        }

        log.info('Refreshing statistics...');

        set((state: StatisticsSlice) => ({
            ...state,
            statistics: {
                ...state.statistics,
                isLoading: true,
            },
        }));

        try {
            const counts = await statisticsHelpers.getAllCounts();

            set((state: StatisticsSlice) => ({
                ...state,
                statistics: {
                    ...state.statistics,
                    counts,
                    lastUpdated: Date.now(),
                    initialized: true,
                    isLoading: false,
                },
            }));

            log.info(`Statistics refreshed successfully: authors=${counts.authors}, genres=${counts.genres}, languages=${counts.languages}, narrators=${counts.narrators}, series=${counts.series}, tags=${counts.tags}`);
        } catch (error) {
            log.error('Failed to refresh statistics', error as Error);

            set((state: StatisticsSlice) => ({
                ...state,
                statistics: {
                    ...state.statistics,
                    isLoading: false,
                },
            }));

            throw error;
        }
    },

    /**
     * Refresh storage statistics
     * Note: Storage stats calculation is complex and done in the component/screen
     * This method just updates the store with pre-calculated values
     */
    refreshStorageStats: (storageStats: StorageEntry[]) => {
        log.debug(`Updating storage stats in store: count=${storageStats.length}`);

        set((state: StatisticsSlice) => ({
            ...state,
            statistics: {
                ...state.statistics,
                storageStats,
                lastUpdated: Date.now(),
            },
        }));
    },

    /**
     * Invalidate cache (force refresh on next access)
     */
    invalidateCache: () => {
        log.info('Invalidating statistics cache');

        set((state: StatisticsSlice) => ({
            ...state,
            statistics: {
                ...state.statistics,
                lastUpdated: null,
            },
        }));
    },

    /**
     * Check if cache is still valid
     */
    isCacheValid: () => {
        const state = get();

        if (!state.statistics.lastUpdated) {
            return false;
        }

        const age = Date.now() - state.statistics.lastUpdated;
        return age < state.statistics.cacheValidMs;
    },

    /**
     * Reset the slice to initial state
     */
    resetStatistics: () => {
        log.info('Resetting statistics slice');
        set((state: StatisticsSlice) => ({
            ...state,
            statistics: initialState.statistics,
        }));
    },
});
