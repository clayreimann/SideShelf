/**
 * Authors slice for Zustand store
 *
 * This slice manages authors-related state including:
 * - All available authors
 * - Sorting configuration
 * - Loading states
 * - Persistence to AsyncStorage
 */

import {
    AuthorListRow,
    AuthorRow,
    getAllAuthors,
    transformAuthorsToDisplayFormat
} from '@/db/helpers/authors';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    AuthorSortConfig,
    LoadingStates,
    SliceCreator
} from '@/types/store';
import { DEFAULT_AUTHOR_SORT_CONFIG, sortAuthors, STORAGE_KEYS } from '../utils';

/**
 * Authors slice state interface - scoped under 'authors' to avoid conflicts
 */
export interface AuthorsSliceState {
    authors: {
        /** All available authors */
        authors: AuthorRow[];
        /** Raw authors (unsorted) */
        rawItems: AuthorListRow[];
        /** Sorted authors (computed from rawItems and sortConfig) */
        items: AuthorListRow[];
        /** Current sort configuration */
        sortConfig: AuthorSortConfig;
        /** Loading states for different operations */
        loading: LoadingStates;
        /** Whether the slice has been initialized */
        initialized: boolean;
        /** Whether API and DB are ready for operations */
        ready: boolean;
    };
}

/**
 * Authors slice actions interface
 */
export interface AuthorsSliceActions {
    // Public actions
    /** Initialize the slice (load from storage, fetch initial data) */
    initializeAuthors: (apiConfigured: boolean, dbInitialized: boolean) => Promise<void>;
    /** Refresh all authors from database */
    refetchAuthors: () => Promise<AuthorRow[]>;
    /** Update sort configuration and persist to storage */
    setAuthorsSortConfig: (config: AuthorSortConfig) => Promise<void>;
    /** Reset the slice to initial state */
    resetAuthors: () => void;

    // Internal actions (prefixed with underscore)
    /** Set ready state based on API and DB initialization */
    _setAuthorsReady: (apiConfigured: boolean, dbInitialized: boolean) => void;
    /** Load data from AsyncStorage */
    _loadAuthorsSettingsFromStorage: () => Promise<void>;
}

/**
 * Combined authors slice interface
 */
export interface AuthorsSlice extends AuthorsSliceState, AuthorsSliceActions { }

/**
 * Initial loading states
 */
const INITIAL_AUTHORS_LOADING_STATES: LoadingStates = {
    isLoadingLibraries: false, // Not used for authors
    isLoadingItems: false,
    isSelectingLibrary: false, // Not used for authors
    isInitializing: true,
};

/**
 * Initial authors slice state
 */
const initialAuthorsState: AuthorsSliceState = {
    authors: {
        authors: [],
        rawItems: [],
        items: [],
        sortConfig: DEFAULT_AUTHOR_SORT_CONFIG,
        loading: INITIAL_AUTHORS_LOADING_STATES,
        initialized: false,
        ready: false,
    },
};

/**
 * Create the authors slice
 */
export const createAuthorsSlice: SliceCreator<AuthorsSlice> = (set, get) => ({
    // Initial state
    ...initialAuthorsState,

    /**
     * Initialize the slice by loading from storage and fetching initial data
     */
    initializeAuthors: async (apiConfigured: boolean, dbInitialized: boolean) => {
        const state = get();
        if (state.authors.initialized) return;

        console.log('[AuthorsSlice] Initializing slice...');

        set((state: AuthorsSlice) => ({
            ...state,
            authors: {
                ...state.authors,
                loading: { ...state.authors.loading, isInitializing: true }
            }
        }));

        try {
            // Load from storage first
            await get()._loadAuthorsSettingsFromStorage();

            // Set ready state
            get()._setAuthorsReady(apiConfigured, dbInitialized);

            // If ready, fetch initial data
            if (apiConfigured && dbInitialized) {
                console.log('[AuthorsSlice] API and DB ready, fetching initial data...');
                await get().refetchAuthors();
            }

            set((state: AuthorsSlice) => ({
                ...state,
                authors: {
                    ...state.authors,
                    initialized: true,
                    loading: { ...state.authors.loading, isInitializing: false }
                }
            }));

            console.log('[AuthorsSlice] Slice initialized successfully');
        } catch (error) {
            console.error('[AuthorsSlice] Failed to initialize slice:', error);
            set((state: AuthorsSlice) => ({
                ...state,
                authors: {
                    ...state.authors,
                    loading: { ...state.authors.loading, isInitializing: false }
                }
            }));
        }
    },

    /**
     * Refresh all authors from database
     */
    refetchAuthors: async (): Promise<AuthorRow[]> => {
        const state = get();
        if (!state.authors.ready) {
            console.warn('[AuthorsSlice] Slice not ready, cannot fetch authors');
            return [];
        }

        set((state: AuthorsSlice) => ({
            ...state,
            authors: {
                ...state.authors,
                loading: { ...state.authors.loading, isLoadingItems: true }
            }
        }));

        try {
            console.log('[AuthorsSlice] Refreshing authors from database...');

            // Fetch authors from database
            const authors = await getAllAuthors();
            const displayItems = transformAuthorsToDisplayFormat(authors);

            set((state: AuthorsSlice) => ({
                ...state,
                authors: {
                    ...state.authors,
                    authors,
                    rawItems: displayItems,
                    items: sortAuthors(displayItems, state.authors.sortConfig)
                }
            }));

            console.log(`[AuthorsSlice] Successfully refreshed ${authors.length} authors`);
            return authors;
        } catch (error) {
            console.error('[AuthorsSlice] Failed to fetch authors from database:', error);
            return [];
        } finally {
            set((state: AuthorsSlice) => ({
                ...state,
                authors: {
                    ...state.authors,
                    loading: { ...state.authors.loading, isLoadingItems: false }
                }
            }));
        }
    },

    /**
     * Update sort configuration and persist to storage
     */
    setAuthorsSortConfig: async (config: AuthorSortConfig) => {
        console.log('[AuthorsSlice] Setting sort config:', config);

        set((state: AuthorsSlice) => ({
            ...state,
            authors: {
                ...state.authors,
                sortConfig: config,
                items: sortAuthors(state.authors.rawItems, config)
            }
        }));

        try {
            await AsyncStorage.setItem(`${STORAGE_KEYS.sortConfig}_authors`, JSON.stringify(config));
        } catch (error) {
            console.error('[AuthorsSlice] Failed to save sort config:', error);
        }
    },

    /**
     * Reset the slice to initial state
     */
    resetAuthors: () => {
        console.log('[AuthorsSlice] Resetting slice to initial state');
        set((state: AuthorsSlice) => ({
            ...state,
            ...initialAuthorsState,
        }));
    },

    /**
     * Set ready state based on API and DB initialization
     */
    _setAuthorsReady: (apiConfigured: boolean, dbInitialized: boolean) => {
        const ready = apiConfigured && dbInitialized;
        console.log(`[AuthorsSlice] Setting ready state: ${ready} (api=${apiConfigured}, db=${dbInitialized})`);
        set((state: AuthorsSlice) => ({
            ...state,
            authors: { ...state.authors, ready }
        }));
    },

    /**
     * Load data from AsyncStorage
     */
    _loadAuthorsSettingsFromStorage: async () => {
        try {
            console.log('[AuthorsSlice] Loading from storage...');

            const storedSortConfig = await AsyncStorage.getItem(`${STORAGE_KEYS.sortConfig}_authors`);

            const updates: Partial<AuthorsSliceState['authors']> = {};

            if (storedSortConfig) {
                try {
                    const parsedSortConfig = JSON.parse(storedSortConfig) as AuthorSortConfig;
                    updates.sortConfig = parsedSortConfig;
                    console.log('[AuthorsSlice] Loaded sort config from storage:', parsedSortConfig);
                } catch (parseError) {
                    console.error('[AuthorsSlice] Failed to parse stored sort config:', parseError);
                }
            }

            if (Object.keys(updates).length > 0) {
                set((state: AuthorsSlice) => ({
                    ...state,
                    authors: { ...state.authors, ...updates }
                }));
            }
        } catch (error) {
            console.error('[AuthorsSlice] Failed to load from storage:', error);
        }
    },

    /**
     * Sort items based on current sort configuration
     */
    _sortAuthorsItems: () => {
        set((state: AuthorsSlice) => ({
            ...state,
            authors: {
                ...state.authors,
                items: sortAuthors(state.authors.rawItems, state.authors.sortConfig)
            }
        }));
    },
});
