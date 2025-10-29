/**
 * Home slice for Zustand store
 *
 * This slice manages home screen personalized data including:
 * - Continue listening items
 * - Downloaded items
 * - Listen again items
 * - Loading states
 * - Data caching to reduce database queries
 */

import {
    getContinueListeningItems,
    getDownloadedItems,
    getHomeScreenData,
    getListenAgainItems,
    type HomeScreenItem
} from '@/db/helpers/homeScreen';
import { logger } from '@/lib/logger';
import type { SliceCreator } from '@/types/store';

// Create cached sublogger for this slice
const log = logger.forTag('HomeSlice');

/**
 * Loading states for home screen operations
 */
interface HomeLoadingStates {
    /** Whether home data is being loaded/refreshed */
    isLoadingHome: boolean;
    /** Whether a specific section is being refreshed */
    isRefreshingSection: boolean;
}

/**
 * Home slice state interface - scoped under 'home' to avoid conflicts
 */
export interface HomeSliceState {
    home: {
        // Core state
        /** Continue listening items (in-progress) */
        continueListening: HomeScreenItem[];
        /** Downloaded items */
        downloaded: HomeScreenItem[];
        /** Listen again items (finished) */
        listenAgain: HomeScreenItem[];
        /** Loading states for different operations */
        loading: HomeLoadingStates;
        /** Whether the slice has been initialized */
        initialized: boolean;
        /** Timestamp of last fetch (for cache invalidation) */
        lastFetchTime: number | null;
        /** User ID that data was fetched for */
        userId: string | null;
    };
}

/**
 * Home slice actions interface
 */
export interface HomeSliceActions {
    // Public methods
    /** Initialize the slice with user data */
    initializeHome: (userId: string) => Promise<void>;
    /** Refresh all home screen data */
    refreshHome: (userId: string, force?: boolean) => Promise<void>;
    /** Refresh a specific section */
    refreshSection: (section: 'continueListening' | 'downloaded' | 'listenAgain', userId: string) => Promise<void>;
    /** Reset the slice to initial state */
    resetHome: () => void;

    // Internal actions
    /** Check if cache is still valid */
    _isHomeCacheValid: () => boolean;
}

/**
 * Combined home slice interface
 */
export interface HomeSlice extends HomeSliceState, HomeSliceActions { }

/**
 * Initial loading states
 */
const INITIAL_LOADING_STATES: HomeLoadingStates = {
    isLoadingHome: false,
    isRefreshingSection: false,
};

/**
 * Initial home slice state
 */
const initialHomeState: HomeSliceState = {
    home: {
        continueListening: [],
        downloaded: [],
        listenAgain: [],
        loading: INITIAL_LOADING_STATES,
        initialized: false,
        lastFetchTime: null,
        userId: null,
    },
};

/**
 * Cache validity duration (5 minutes)
 */
const CACHE_VALID_DURATION = 5 * 60 * 1000;

/**
 * Create the home slice
 */
export const createHomeSlice: SliceCreator<HomeSlice> = (set, get) => ({
    // Initial state
    ...initialHomeState,

    /**
     * Initialize the slice by loading home screen data
     */
    initializeHome: async (userId: string) => {
        const state = get();

        // If already initialized for this user and cache is valid, skip
        if (state.home.initialized && state.home.userId === userId && get()._isHomeCacheValid()) {
            log.debug('Home already initialized with valid cache, skipping');
            return;
        }

        log.info('Initializing home slice...');

        set((state: HomeSlice) => ({
            ...state,
            home: {
                ...state.home,
                loading: { ...state.home.loading, isLoadingHome: true },
            },
        }));

        try {
            // Fetch all home screen data
            const data = await getHomeScreenData(userId);

            set((state: HomeSlice) => ({
                ...state,
                home: {
                    ...state.home,
                    continueListening: data.continueListening,
                    downloaded: data.downloaded,
                    listenAgain: data.listenAgain,
                    loading: { ...state.home.loading, isLoadingHome: false },
                    initialized: true,
                    lastFetchTime: Date.now(),
                    userId,
                },
            }));

            log.info(`Home slice initialized successfully: continueListening=${data.continueListening.length}, downloaded=${data.downloaded.length}, listenAgain=${data.listenAgain.length}`);
        } catch (error) {
            log.error('Failed to initialize home slice', error as Error);
            set((state: HomeSlice) => ({
                ...state,
                home: {
                    ...state.home,
                    loading: { ...state.home.loading, isLoadingHome: false },
                },
            }));
            throw error;
        }
    },

    /**
     * Refresh all home screen data
     */
    refreshHome: async (userId: string, force = false) => {
        const state = get();

        // If cache is still valid and not forcing, skip refresh
        if (!force && get()._isHomeCacheValid() && state.home.userId === userId) {
            log.debug('Home cache still valid, skipping refresh');
            return;
        }

        log.info('Refreshing home data...');

        set((state: HomeSlice) => ({
            ...state,
            home: {
                ...state.home,
                loading: { ...state.home.loading, isLoadingHome: true },
            },
        }));

        try {
            // Fetch all home screen data
            const data = await getHomeScreenData(userId);

            set((state: HomeSlice) => ({
                ...state,
                home: {
                    ...state.home,
                    continueListening: data.continueListening,
                    downloaded: data.downloaded,
                    listenAgain: data.listenAgain,
                    loading: { ...state.home.loading, isLoadingHome: false },
                    lastFetchTime: Date.now(),
                    userId,
                },
            }));

            log.info('Home data refreshed successfully');
        } catch (error) {
            log.error('Failed to refresh home data', error as Error);
            set((state: HomeSlice) => ({
                ...state,
                home: {
                    ...state.home,
                    loading: { ...state.home.loading, isLoadingHome: false },
                },
            }));
            throw error;
        }
    },

    /**
     * Refresh a specific section of the home screen
     */
    refreshSection: async (section: 'continueListening' | 'downloaded' | 'listenAgain', userId: string) => {
        log.info(`Refreshing ${section} section...`);

        set((state: HomeSlice) => ({
            ...state,
            home: {
                ...state.home,
                loading: { ...state.home.loading, isRefreshingSection: true },
            },
        }));

        try {
            let data: HomeScreenItem[] = [];

            // Fetch data for specific section
            switch (section) {
                case 'continueListening':
                    data = await getContinueListeningItems(userId);
                    break;
                case 'downloaded':
                    data = await getDownloadedItems();
                    break;
                case 'listenAgain':
                    data = await getListenAgainItems(userId);
                    break;
            }

            set((state: HomeSlice) => ({
                ...state,
                home: {
                    ...state.home,
                    [section]: data,
                    loading: { ...state.home.loading, isRefreshingSection: false },
                    lastFetchTime: Date.now(),
                },
            }));

            log.info(`${section} section refreshed successfully: count=${data.length}`);
        } catch (error) {
            log.error(`Failed to refresh ${section} section`, error as Error);
            set((state: HomeSlice) => ({
                ...state,
                home: {
                    ...state.home,
                    loading: { ...state.home.loading, isRefreshingSection: false },
                },
            }));
            throw error;
        }
    },

    /**
     * Reset the slice to initial state
     */
    resetHome: () => {
        log.info('Resetting home slice');
        set((state: HomeSlice) => ({
            ...state,
            home: initialHomeState.home,
        }));
    },

    /**
     * Check if the home cache is still valid
     */
    _isHomeCacheValid: () => {
        const state = get();
        if (!state.home.lastFetchTime) return false;
        return Date.now() - state.home.lastFetchTime < CACHE_VALID_DURATION;
    },
});
