/**
 * ApiSeries slice for Zustand store
 *
 * This slice manages series-related state including:
 * - All available series
 * - Sorting configuration
 * - Loading states
 * - Persistence to AsyncStorage
 */

import {
    getAllSeries,
    SeriesListRow,
    SeriesWithBooks,
    transformSeriesToDisplayFormat
} from '@/db/helpers/series';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    LoadingStates,
    SeriesSortConfig,
    SliceCreator
} from '@/types/store';
import { DEFAULT_SERIES_SORT_CONFIG, sortSeries, STORAGE_KEYS } from '../utils';

/**
 * ApiSeries slice state interface - scoped under 'series' to avoid conflicts
 */
export interface SeriesSliceState {
    series: {
        /** All available series */
        series: SeriesWithBooks[];
        /** Raw series (unsorted) */
        rawItems: SeriesListRow[];
        /** Sorted series (computed from rawItems and sortConfig) */
        items: SeriesListRow[];
        /** Current sort configuration */
        sortConfig: SeriesSortConfig;
        /** Loading states for different operations */
        loading: LoadingStates;
        /** Whether the slice has been initialized */
        initialized: boolean;
        /** Whether API and DB are ready for operations */
        ready: boolean;
    };
}

/**
 * ApiSeries slice actions interface
 */
export interface SeriesSliceActions {
    // Public actions
    /** Initialize the slice (load from storage, fetch initial data) */
    initializeSeries: (apiConfigured: boolean, dbInitialized: boolean) => Promise<void>;
    /** Refresh all series from database */
    refetchSeries: () => Promise<SeriesWithBooks[]>;
    /** Update sort configuration and persist to storage */
    setSeriesSortConfig: (config: SeriesSortConfig) => Promise<void>;
    /** Reset the slice to initial state */
    resetSeries: () => void;

    // Internal actions (prefixed with underscore)
    /** Set ready state based on API and DB initialization */
    _setSeriesReady: (apiConfigured: boolean, dbInitialized: boolean) => void;
    /** Load data from AsyncStorage */
    _loadSeriesSettingsFromStorage: () => Promise<void>;
    /** Sort items based on current sort configuration */
    _sortSeriesItems: () => void;
}

/**
 * Combined series slice interface
 */
export interface SeriesSlice extends SeriesSliceState, SeriesSliceActions { }

/**
 * Initial loading states
 */
const INITIAL_SERIES_LOADING_STATES: LoadingStates = {
    isLoadingLibraries: false, // Not used for series
    isLoadingItems: false,
    isSelectingLibrary: false, // Not used for series
    isInitializing: true,
};

/**
 * Initial series slice state
 */
const initialSeriesState: SeriesSliceState = {
    series: {
        series: [],
        rawItems: [],
        items: [],
        sortConfig: DEFAULT_SERIES_SORT_CONFIG,
        loading: INITIAL_SERIES_LOADING_STATES,
        initialized: false,
        ready: false,
    },
};

/**
 * Create the series slice
 */
export const createSeriesSlice: SliceCreator<SeriesSlice> = (set, get) => ({
    // Initial state
    ...initialSeriesState,

    /**
     * Initialize the slice by loading from storage and fetching initial data
     */
    initializeSeries: async (apiConfigured: boolean, dbInitialized: boolean) => {
        const state = get();
        if (state.series.initialized) return;

        console.log('[SeriesSlice] Initializing slice...');

        set((state: SeriesSlice) => ({
            ...state,
            series: {
                ...state.series,
                loading: { ...state.series.loading, isInitializing: true }
            }
        }));

        try {
            // Load from storage first
            await get()._loadSeriesSettingsFromStorage();

            // Set ready state
            get()._setSeriesReady(apiConfigured, dbInitialized);

            // If ready, fetch initial data
            if (apiConfigured && dbInitialized) {
                console.log('[SeriesSlice] API and DB ready, fetching initial data...');
                await get().refetchSeries();
            }

            set((state: SeriesSlice) => ({
                ...state,
                series: {
                    ...state.series,
                    initialized: true,
                    loading: { ...state.series.loading, isInitializing: false }
                }
            }));

            console.log('[SeriesSlice] Slice initialized successfully');
        } catch (error) {
            console.error('[SeriesSlice] Failed to initialize slice:', error);
            set((state: SeriesSlice) => ({
                ...state,
                series: {
                    ...state.series,
                    loading: { ...state.series.loading, isInitializing: false }
                }
            }));
        }
    },

    /**
     * Refresh all series from database
     */
    refetchSeries: async (): Promise<SeriesWithBooks[]> => {
        const state = get();
        if (!state.series.ready) {
            console.warn('[SeriesSlice] Slice not ready, cannot fetch series');
            return [];
        }

        set((state: SeriesSlice) => ({
            ...state,
            series: {
                ...state.series,
                loading: { ...state.series.loading, isLoadingItems: true }
            }
        }));

        try {
            console.log('[SeriesSlice] Refreshing series from database...');

            // Fetch series from database
            const series = await getAllSeries();
            const displayItems = transformSeriesToDisplayFormat(series);

            set((state: SeriesSlice) => ({
                ...state,
                series: {
                    ...state.series,
                    series,
                    rawItems: displayItems,
                    items: sortSeries(displayItems, state.series.sortConfig)
                }
            }));

            console.log(`[SeriesSlice] Successfully refreshed ${series.length} series`);
            return series;
        } catch (error) {
            console.error('[SeriesSlice] Failed to fetch series from database:', error);
            return [];
        } finally {
            set((state: SeriesSlice) => ({
                ...state,
                series: {
                    ...state.series,
                    loading: { ...state.series.loading, isLoadingItems: false }
                }
            }));
        }
    },

    /**
     * Update sort configuration and persist to storage
     */
    setSeriesSortConfig: async (config: SeriesSortConfig) => {
        console.log('[SeriesSlice] Setting sort config:', config);

        set((state: SeriesSlice) => ({
            ...state,
            series: {
                ...state.series,
                sortConfig: config,
                items: sortSeries(state.series.rawItems, config)
            }
        }));

        try {
            await AsyncStorage.setItem(`${STORAGE_KEYS.sortConfig}_series`, JSON.stringify(config));
        } catch (error) {
            console.error('[SeriesSlice] Failed to save sort config:', error);
        }
    },

    /**
     * Reset the slice to initial state
     */
    resetSeries: () => {
        console.log('[SeriesSlice] Resetting slice to initial state');
        set((state: SeriesSlice) => ({
            ...state,
            ...initialSeriesState,
        }));
    },

    /**
     * Set ready state based on API and DB initialization
     */
    _setSeriesReady: (apiConfigured: boolean, dbInitialized: boolean) => {
        const ready = apiConfigured && dbInitialized;
        console.log(`[SeriesSlice] Setting ready state: ${ready} (api=${apiConfigured}, db=${dbInitialized})`);
        set((state: SeriesSlice) => ({
            ...state,
            series: { ...state.series, ready }
        }));
    },

    /**
     * Load data from AsyncStorage
     */
    _loadSeriesSettingsFromStorage: async () => {
        try {
            console.log('[SeriesSlice] Loading from storage...');

            const storedSortConfig = await AsyncStorage.getItem(`${STORAGE_KEYS.sortConfig}_series`);

            const updates: Partial<SeriesSliceState['series']> = {};

            if (storedSortConfig) {
                try {
                    const parsedSortConfig = JSON.parse(storedSortConfig) as SeriesSortConfig;
                    updates.sortConfig = parsedSortConfig;
                    console.log('[SeriesSlice] Loaded sort config from storage:', parsedSortConfig);
                } catch (parseError) {
                    console.error('[SeriesSlice] Failed to parse stored sort config:', parseError);
                }
            }

            if (Object.keys(updates).length > 0) {
                set((state: SeriesSlice) => ({
                    ...state,
                    series: { ...state.series, ...updates }
                }));
            }
        } catch (error) {
            console.error('[SeriesSlice] Failed to load from storage:', error);
        }
    },

    /**
     * Sort items based on current sort configuration
     */
    _sortSeriesItems: () => {
        set((state: SeriesSlice) => ({
            ...state,
            series: {
                ...state.series,
                items: sortSeries(state.series.rawItems, state.series.sortConfig)
            }
        }));
    },
});
