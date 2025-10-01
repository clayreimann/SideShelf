/**
 * ApiLibrary slice for Zustand store
 *
 * This slice manages library-related state including:
 * - Selected library and its items
 * - All available libraries
 * - Sorting configuration
 * - Loading states
 * - Persistence to AsyncStorage
 */

import {
    getAllLibraries,
    getLibraryById,
    LibraryRow,
    marshalLibrariesFromResponse,
    upsertLibraries
} from '@/db/helpers/libraries';
import {
    getLibraryItemsForList,
    LibraryItemListRow,
    marshalLibraryItemsFromResponse,
    transformItemsToDisplayFormat,
    upsertLibraryItems
} from '@/db/helpers/libraryItems';
import { cacheCoversForLibraryItems, upsertBooksMetadata, upsertPodcastsMetadata } from '@/db/helpers/mediaMetadata';
import { fetchLibraries, fetchLibraryItems } from '@/lib/api/endpoints';
import type { ApiBook, ApiPodcast } from '@/types/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
    LoadingStates,
    SliceCreator,
    SortConfig
} from '@/types/store';
import { DEFAULT_SORT_CONFIG, sortLibraryItems, STORAGE_KEYS } from '../utils';

/**
 * ApiLibrary slice state interface - scoped under 'library' to avoid conflicts
 */
export interface LibrarySliceState {
    library: {
        // Core state
        /** Currently selected library ID */
        selectedLibraryId: string | null;
        /** Currently selected library object */
        selectedLibrary: LibraryRow | null;
        /** All available libraries */
        libraries: LibraryRow[];
        /** Raw library items (unsorted) */
        rawItems: LibraryItemListRow[];
        /** Sorted library items (computed from rawItems and sortConfig) */
        items: LibraryItemListRow[];
        /** Current sort configuration */
        sortConfig: SortConfig;
        /** Loading states for different operations */
        loading: LoadingStates;
        /** Whether the slice has been initialized */
        initialized: boolean;
        /** Whether API and DB are ready for operations */
        ready: boolean;
    };
}

/**
 * ApiLibrary slice actions interface
 */
export interface LibrarySliceActions {
    // Public methods
    /** Initialize the slice (load from storage, fetch initial data) */
    initializeLibrarySlice: (apiConfigured: boolean, dbInitialized: boolean) => Promise<void>;
    /** Select a library and load its items */
    selectLibrary: (libraryId: string, fetchFromApi?: boolean) => Promise<void>;
    /** Refresh the library list and refetch the library items from the currently selected library */
    refresh: () => Promise<void>;
    /** Update sort configuration and persist to storage */
    setSortConfig: (config: SortConfig) => Promise<void>;
    /** Reset the slice to initial state */
    resetLibrary: () => void;

    // Internal actions (prefixed with underscore)
    /** Set ready state based on API and DB initialization */
    _setLibraryReady: (apiConfigured: boolean, dbInitialized: boolean) => boolean;
    /** Load data from AsyncStorage */
    _loadLibrarySettingsFromStorage: () => Promise<void>;
}

/**
 * Combined library slice interface
 */
export interface LibrarySlice extends LibrarySliceState, LibrarySliceActions { }

/**
 * Initial loading states
 */
const INITIAL_LOADING_STATES: LoadingStates = {
    isLoadingLibraries: false,
    isLoadingItems: false,
    isSelectingLibrary: false,
    isInitializing: true,
};

/**
 * Initial library slice state
 */
const initialLibraryState: LibrarySliceState = {
    library: {
        selectedLibraryId: null,
        selectedLibrary: null,
        libraries: [],
        rawItems: [],
        items: [],
        sortConfig: DEFAULT_SORT_CONFIG,
        loading: INITIAL_LOADING_STATES,
        initialized: false,
        ready: false,
    },
};

/**
 * Create the library slice
 */
export const createLibrarySlice: SliceCreator<LibrarySlice> = (set, get) => ({
    // Initial state
    ...initialLibraryState,

    /**
     * Initialize the slice by loading from storage and fetching initial data
     */
    initializeLibrarySlice: async (apiConfigured: boolean, dbInitialized: boolean) => {
        const state = get();
        if (state.library.initialized) return;

        console.log('[LibrarySlice] Initializing slice...');

        set((state: LibrarySlice) => ({
            ...state,
            library: {
                ...state.library,
                loading: { ...state.library.loading, isInitializing: true }
            }
        }));

        try {
            // Load from storage first
            await get()._loadLibrarySettingsFromStorage();

            // Set ready state
            const ready = get()._setLibraryReady(apiConfigured, dbInitialized);
            console.log(`[LibrarySlice] ApiLibrary slice ready=${ready} apiConfigured=${apiConfigured} dbInitialized=${dbInitialized}`);

            if (dbInitialized) {
                console.log('[LibrarySlice] Loading cached libraries and items...');

                const { library: { selectedLibraryId } } = get();

                // Load all libraries from database cache
                let libraries = await getAllLibraries();

                // If ready and no libraries in cache, fetch from API
                if (apiConfigured && dbInitialized && libraries.length === 0) {
                    console.log('[LibrarySlice] No cached libraries found, fetching from API...');
                    libraries = await get()._refetchLibraries();
                }

                const selectedLibrary = libraries.find(l => l.id == selectedLibraryId)
                let rawItems: LibraryItemListRow[] = [];
                let items = [];
                if (selectedLibraryId) {
                    items = await getLibraryItemsForList(selectedLibraryId);
                    rawItems = transformItemsToDisplayFormat(items);

                    console.log(`[LibrarySlice] Loaded ${rawItems.length} cached items for library: ${selectedLibrary?.name}`);
                }

                // If no library is selected but we have libraries, select the first one
                let finalSelectedLibraryId = selectedLibraryId;
                let finalSelectedLibrary = selectedLibrary;
                if (!selectedLibraryId && libraries.length > 0) {
                    finalSelectedLibraryId = libraries[0].id;
                    finalSelectedLibrary = libraries[0];
                    console.log(`[LibrarySlice] Auto-selecting first library: ${finalSelectedLibrary.name}`);

                    // Persist the selection
                    try {
                        await AsyncStorage.setItem(STORAGE_KEYS.selectedLibraryId, finalSelectedLibraryId);
                    } catch (error) {
                        console.error('[LibrarySlice] Failed to persist auto-selected library:', error);
                    }
                }

                set((state: LibrarySlice) => ({
                    ...state,
                    library: {
                        ...state.library,
                        initialized: true,
                        selectedLibraryId: finalSelectedLibraryId,
                        selectedLibrary: finalSelectedLibrary,
                        libraries,
                        rawItems,
                        items: sortLibraryItems(rawItems, state.library.sortConfig)
                    }
                }));
            }

            console.log('[LibrarySlice] Slice initialized successfully');
        } catch (error) {
            console.error('[LibrarySlice] Failed to initialize slice:', error);
        } finally {
            set((state: LibrarySlice) => ({
                ...state,
                library: {
                    ...state.library,
                    loading: { ...state.library.loading, isInitializing: false }
                }
            }));
        }
    },

    /**
     * Select a library and load its items
     */
    selectLibrary: async (libraryId: string, fetchFromApi: boolean = false) => {
        const state = get();
        if (!state.library.ready) {
            console.warn('[LibrarySlice] Slice not ready, cannot select library');
            return;
        }

        if (state.library.selectedLibraryId === libraryId && !fetchFromApi) {
            console.log('[LibrarySlice] ApiLibrary already selected:', libraryId);
            return;
        }

        console.log('[LibrarySlice] Selecting library:', libraryId, 'fetchFromApi:', fetchFromApi);

        if (fetchFromApi) {
            // First select the library, then fetch items from API
            await get()._selectLibraryFromCache(libraryId);
            await get()._refetchItems();
        } else {
            // Use cached data only
            await get()._selectLibraryFromCache(libraryId);
        }
    },

    /**
     * Refresh the library list and refetch the library items from the currently selected library
     */
    refresh: async () => {
        const state = get();
        if (!state.library.ready) {
            console.warn('[LibrarySlice] Slice not ready, cannot refresh');
            return;
        }

        console.log('[LibrarySlice] Refreshing libraries and items...');

        try {
            // First refresh the library list
            await get()._refetchLibraries();

            // Then refresh items for the currently selected library if one is selected
            if (state.library.selectedLibraryId) {
                await get()._refetchItems();
            }

            console.log('[LibrarySlice] Refresh completed successfully');
        } catch (error) {
            console.error('[LibrarySlice] Failed to refresh:', error);
        }
    },

    /**
     * Select a library using only cached data (no API calls)
     * This is useful for quick library switching without waiting for API responses
     */
    _selectLibraryFromCache: async (libraryId: string) => {
        const state = get();
        if (!state.library.ready) {
            console.warn('[LibrarySlice] Slice not ready, cannot select library from cache');
            return;
        }

        if (state.library.selectedLibraryId === libraryId) {
            console.log('[LibrarySlice] ApiLibrary already selected:', libraryId);
            return;
        }

        console.log('[LibrarySlice] Selecting library from cache:', libraryId);

        set((state: LibrarySlice) => ({
            ...state,
            library: {
                ...state.library,
                selectedLibraryId: libraryId,
                loading: { ...state.library.loading, isSelectingLibrary: true }
            }
        }));

        try {
            // Persist selection to storage
            await AsyncStorage.setItem(STORAGE_KEYS.selectedLibraryId, libraryId);

            // Get library from database (cached data only)
            const selectedLibrary = await getLibraryById(libraryId);
            if (selectedLibrary) {
                set((state: LibrarySlice) => ({
                    ...state,
                    library: { ...state.library, selectedLibrary }
                }));

                // Load cached items for this library
                await get()._loadCachedItems();
            }

        } catch (error) {
            console.error('[LibrarySlice] Failed to select library from cache:', error);
        } finally {
            set((state: LibrarySlice) => ({
                ...state,
                library: {
                    ...state.library,
                    loading: { ...state.library.loading, isSelectingLibrary: false }
                }
            }));
        }
    },

    /**
     * Load cached items for the currently selected library (no API calls)
     * This loads items from the database only, useful for quick loading
     */
    _loadCachedItems: async () => {
        const state = get();
        const { selectedLibraryId } = state.library;

        if (!selectedLibraryId) {
            console.warn('[LibrarySlice] No library selected, cannot load cached items');
            return;
        }

        console.log('[LibrarySlice] Loading cached items for library:', selectedLibraryId);

        set((state: LibrarySlice) => ({
            ...state,
            library: {
                ...state.library,
                loading: { ...state.library.loading, isLoadingItems: true }
            }
        }));

        try {
            // Get items from database with full metadata for display
            const dbItems = await getLibraryItemsForList(selectedLibraryId);
            const displayItems = transformItemsToDisplayFormat(dbItems);

            set((state: LibrarySlice) => ({
                ...state,
                library: {
                    ...state.library,
                    rawItems: displayItems,
                    items: sortLibraryItems(displayItems, state.library.sortConfig)
                }
            }));

            console.log(`[LibrarySlice] Loaded ${displayItems.length} cached items`);

        } catch (error) {
            console.error('[LibrarySlice] Failed to load cached items:', error);
        } finally {
            set((state: LibrarySlice) => ({
                ...state,
                library: {
                    ...state.library,
                    loading: { ...state.library.loading, isLoadingItems: false }
                }
            }));
        }
    },

    /**
     * Refresh all libraries from API and update database
     */
    _refetchLibraries: async (): Promise<LibraryRow[]> => {
        const state = get();
        if (!state.library.ready) {
            console.warn('[LibrarySlice] Slice not ready, cannot fetch libraries');
            return [];
        }

        set((state: LibrarySlice) => ({
            ...state,
            library: {
                ...state.library,
                loading: { ...state.library.loading, isLoadingLibraries: true }
            }
        }));

        try {
            console.log('[LibrarySlice] Refreshing libraries from API...');

            // Fetch libraries from API
            const response = await fetchLibraries();

            // Marshal and store in database
            const libraryRows = marshalLibrariesFromResponse(response);
            await upsertLibraries(libraryRows);

            // Get updated libraries from database
            const libraries = await getAllLibraries();
            set((state: LibrarySlice) => ({
                ...state,
                library: { ...state.library, libraries }
            }));

            console.log(`[LibrarySlice] Successfully refreshed ${libraries.length} libraries`);
            return libraries;
        } catch (error) {
            console.error('[LibrarySlice] Failed to fetch libraries from API:', error);

            // Fallback to database-only data
            const libraries = await getAllLibraries();
            set((state: LibrarySlice) => ({
                ...state,
                library: { ...state.library, libraries }
            }));

            return libraries;
        } finally {
            set((state: LibrarySlice) => ({
                ...state,
                library: {
                    ...state.library,
                    loading: { ...state.library.loading, isLoadingLibraries: false }
                }
            }));
        }
    },

    /**
     * Refresh items for the currently selected library
     */
    _refetchItems: async () => {
        const state = get();
        const { library: { selectedLibraryId, selectedLibrary, ready } } = state;

        if (!ready || !selectedLibraryId || !selectedLibrary) {
            console.warn('[LibrarySlice] Cannot refresh items: ready=', ready, 'selectedLibraryId=', selectedLibraryId, 'selectedLibrary=', selectedLibrary);
            return;
        }

        set((state: LibrarySlice) => ({
            ...state,
            library: {
                ...state.library,
                loading: { ...state.library.loading, isLoadingItems: true }
            }
        }));

        try {
            console.log('[LibrarySlice] Refreshing items for library:', selectedLibraryId, 'type:', selectedLibrary.mediaType);

            // Fetch library items from API
            const response = await fetchLibraryItems(selectedLibraryId);
            const libraryItemRows = marshalLibraryItemsFromResponse(response);
            await upsertLibraryItems(libraryItemRows);

            // Process media metadata based on library type
            if (selectedLibrary.mediaType === 'book') {
                // Extract books from library items and process metadata
                const books = response.results
                    .filter(item => item.mediaType === 'book' && item.media)
                    .map(item => ({ ...item.media, libraryItemId: item.id }) as ApiBook);

                if (books.length > 0) {
                    console.log('[LibrarySlice] Processing book metadata for', books.length, 'books');
                    await upsertBooksMetadata(books);
                }
            } else if (selectedLibrary.mediaType === 'podcast') {
                // Extract podcasts from library items and process metadata
                const podcasts = response.results
                    .filter(item => item.mediaType === 'podcast' && item.media)
                    .map(item => ({ ...item.media, libraryItemId: item.id }) as ApiPodcast);

                if (podcasts.length > 0) {
                    console.log('[LibrarySlice] Processing podcast metadata for', podcasts.length, 'podcasts');
                    await upsertPodcastsMetadata(podcasts);
                }
            }

            // Get the items from database with full metadata for display
            const dbItems = await getLibraryItemsForList(selectedLibraryId);
            const displayItems = transformItemsToDisplayFormat(dbItems);

            set((state: LibrarySlice) => ({
                ...state,
                library: {
                    ...state.library,
                    rawItems: displayItems,
                    items: sortLibraryItems(displayItems, state.library.sortConfig)
                }
            }));

            // Cache covers in the background (don't await to avoid blocking UI)
            cacheCoversForLibraryItems(selectedLibraryId).then((result) => {
                console.log(`[LibrarySlice] Cover caching completed. Downloaded: ${result.downloadedCount}/${result.totalCount}`);

                // Always refresh the UI after cover caching to show cached covers
                // This ensures that covers persist after refresh and get updated when newly cached
                console.log('[LibrarySlice] Refreshing display with cached covers');
                getLibraryItemsForList(selectedLibraryId).then(updatedItems => {
                    const updatedDisplayItems = transformItemsToDisplayFormat(updatedItems);
                    set((state: LibrarySlice) => ({
                        ...state,
                        library: {
                            ...state.library,
                            rawItems: updatedDisplayItems,
                            items: sortLibraryItems(updatedDisplayItems, state.library.sortConfig)
                        }
                    }));
                });
            }).catch(error => {
                console.error('[LibrarySlice] Cover caching failed:', error);
            });

        } catch (error) {
            console.error('[LibrarySlice] Failed to refresh items:', error);
        } finally {
            set((state: LibrarySlice) => ({
                ...state,
                library: {
                    ...state.library,
                    loading: { ...state.library.loading, isLoadingItems: false }
                }
            }));
        }
    },

    /**
     * Update sort configuration and persist to storage
     */
    setSortConfig: async (config: SortConfig) => {
        console.log('[LibrarySlice] Setting sort config:', config);

        set((state: LibrarySlice) => ({
            ...state,
            library: {
                ...state.library,
                sortConfig: config,
                items: sortLibraryItems(state.library.rawItems, config)
            }
        }));

        try {
            await AsyncStorage.setItem(STORAGE_KEYS.sortConfig, JSON.stringify(config));
        } catch (error) {
            console.error('[LibrarySlice] Failed to save sort config:', error);
        }
    },

    /**
     * Reset the slice to initial state
     */
    resetLibrary: () => {
        console.log('[LibrarySlice] Resetting slice to initial state');
        set((state: LibrarySlice) => ({
            ...state,
            ...initialLibraryState,
        }));
    },

    /**
     * Set ready state based on API and DB initialization
     */
    _setLibraryReady: (apiConfigured: boolean, dbInitialized: boolean): boolean => {
        const ready = apiConfigured && dbInitialized;
        console.log(`[LibrarySlice] Setting ready state: ${ready} (api=${apiConfigured}, db=${dbInitialized})`);
        set((state: LibrarySlice) => ({
            ...state,
            library: { ...state.library, ready }
        }));
        return ready;
    },

    /**
     * Load data from AsyncStorage
     */
    _loadLibrarySettingsFromStorage: async () => {
        try {
            console.log('[LibrarySlice] Loading from storage...');

            const [storedLibraryId, storedSortConfig] = await Promise.all([
                AsyncStorage.getItem(STORAGE_KEYS.selectedLibraryId),
                AsyncStorage.getItem(STORAGE_KEYS.sortConfig),
            ]);

            const updates: Partial<LibrarySliceState['library']> = {};

            if (storedLibraryId) {
                updates.selectedLibraryId = storedLibraryId;
                console.log('[LibrarySlice] Loaded selected library ID from storage:', storedLibraryId);
            }

            if (storedSortConfig) {
                try {
                    const parsedSortConfig = JSON.parse(storedSortConfig) as SortConfig;
                    updates.sortConfig = parsedSortConfig;
                    console.log('[LibrarySlice] Loaded sort config from storage:', parsedSortConfig);
                } catch (parseError) {
                    console.error('[LibrarySlice] Failed to parse stored sort config:', parseError);
                }
            }

            if (Object.keys(updates).length > 0) {
                set((state: LibrarySlice) => ({
                    ...state,
                    library: { ...state.library, ...updates }
                }));
            }
        } catch (error) {
            console.error('[LibrarySlice] Failed to load from storage:', error);
        }
    },

    /**
     * Sort items based on current sort configuration
     */
    _sortLibraryItems: () => {
        set((state: LibrarySlice) => ({
            ...state,
            library: {
                ...state.library,
                items: sortLibraryItems(state.library.rawItems, state.library.sortConfig)
            }
        }));
    },
});
