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
    marshalLibraryItemFromApi,
    transformItemsToDisplayFormat,
    upsertLibraryItems
} from '@/db/helpers/libraryItems';
import { cacheCoversForLibraryItems } from '@/db/helpers/mediaMetadata';
import { processFullLibraryItems } from '@/db/helpers/fullLibraryItems';
import { fetchAllLibraryItems, fetchLibraries, fetchLibraryItemsBatch } from '@/lib/api/endpoints';
import { logger } from '@/lib/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LibraryItemDisplayRow } from '@/types/components';
import type {
    LoadingStates,
    SliceCreator,
    SortConfig
} from '@/types/store';
import { DEFAULT_SORT_CONFIG, sortLibraryItems, STORAGE_KEYS } from '../utils';

// Create cached sublogger for this slice
const log = logger.forTag('LibrarySlice');

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
        rawItems: LibraryItemDisplayRow[];
        /** Sorted library items (computed from rawItems and sortConfig) */
        items: LibraryItemDisplayRow[];
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

        log.info(' Initializing slice...');

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
            log.info(` ApiLibrary slice ready=${ready} apiConfigured=${apiConfigured} dbInitialized=${dbInitialized}`);

            if (dbInitialized) {
                log.info(' Loading cached libraries and items...');

                const { library: { selectedLibraryId } }: LibrarySliceState = get();

                // Load all libraries from database cache
                let libraries = await getAllLibraries();

                // If ready and no libraries in cache, fetch from API
                if (apiConfigured && dbInitialized && libraries.length === 0) {
                    log.info(' No cached libraries found, fetching from API...');
                    libraries = await get()._refetchLibraries();
                }

                // If no library is selected but we have libraries, select the first one
                let finalSelectedLibraryId = selectedLibraryId;
                let finalSelectedLibrary = libraries.find(l => l.id == selectedLibraryId);
                if (!selectedLibraryId && libraries.length > 0) {
                    finalSelectedLibraryId = libraries[0].id;
                    finalSelectedLibrary = libraries[0];
                    log.info(` Auto-selecting first library: ${finalSelectedLibrary.name}`);

                    // Persist the selection
                    try {
                        await AsyncStorage.setItem(STORAGE_KEYS.selectedLibraryId, finalSelectedLibraryId);
                    } catch (error) {
                        log.error(' Failed to persist auto-selected library:', error);
                    }
                }

                let rawItems: LibraryItemDisplayRow[] = [];
                let items = [];
                if (finalSelectedLibraryId) {
                    items = await getLibraryItemsForList(finalSelectedLibraryId);
                    rawItems = transformItemsToDisplayFormat(items);

                    log.info(` Loaded ${rawItems.length} cached items for library: ${finalSelectedLibrary?.name}`);
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

            log.info(' Slice initialized successfully');
        } catch (error) {
            log.error(' Failed to initialize slice:', error);
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
            log.warn(' Slice not ready, cannot select library');
            return;
        }

        if (state.library.selectedLibraryId === libraryId && !fetchFromApi) {
            log.info(' ApiLibrary already selected:', libraryId);
            return;
        }

        log.info(' Selecting library:', libraryId, 'fetchFromApi:', fetchFromApi);

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
            log.warn(' Slice not ready, cannot refresh');
            return;
        }

        log.info(' Refreshing libraries and items...');

        try {
            // First refresh the library list
            await get()._refetchLibraries();

            // Then refresh items for the currently selected library if one is selected
            if (state.library.selectedLibraryId) {
                await get()._refetchItems();
            }

            // Refresh series and authors after library refresh
            log.info(' Refreshing series and authors after library refresh...');
            try {
                await Promise.all([
                    get().refetchSeries().catch(error => {
                        log.error(' Failed to refresh series:', error);
                    }),
                    get().refetchAuthors().catch(error => {
                        log.error(' Failed to refresh authors:', error);
                    }),
                ]);
            } catch (error) {
                log.error(' Failed to refresh series/authors:', error);
            }

            log.info(' Refresh completed successfully');
        } catch (error) {
            log.error(' Failed to refresh:', error);
        }
    },

    /**
     * Select a library using only cached data (no API calls)
     * This is useful for quick library switching without waiting for API responses
     */
    _selectLibraryFromCache: async (libraryId: string) => {
        const state = get();
        if (!state.library.ready) {
            log.warn(' Slice not ready, cannot select library from cache');
            return;
        }

        if (state.library.selectedLibraryId === libraryId) {
            log.info(' ApiLibrary already selected:', libraryId);
            return;
        }

        log.info(' Selecting library from cache:', libraryId);

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
            log.error(' Failed to select library from cache:', error);
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
        const state: LibrarySliceState = get();
        const { selectedLibraryId } = state.library;

        if (!selectedLibraryId) {
            log.warn(' No library selected, cannot load cached items');
            return;
        }

        log.info(' Loading cached items for library:', selectedLibraryId);

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

            log.info(` Loaded ${displayItems.length} cached items`);

        } catch (error) {
            log.error(' Failed to load cached items:', error);
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
            log.warn(' Slice not ready, cannot fetch libraries');
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
            log.info(' Refreshing libraries from API...');

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

            if (!state.library.selectedLibraryId && libraries.length > 0) {
                // If no library is selected but we have libraries, select the first one
                log.info(' Defaulting to first library')
                const selectedLibrary = libraries[0];
                set((state: LibrarySlice) => ({
                    ...state,
                    library: {
                        ...state.library,
                        selectedLibraryId: selectedLibrary.id,
                        selectedLibrary
                    }
                }));

                await get()._loadCachedItems();
            }

            log.info(` Successfully refreshed ${libraries.length} libraries`);
            return libraries;
        } catch (error) {
            log.error(' Failed to fetch libraries from API:', error);

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
        const state: LibrarySliceState = get();
        const { library: { selectedLibraryId, selectedLibrary, ready } } = state;

        if (!ready || !selectedLibraryId || !selectedLibrary) {
            log.warn(' Cannot refresh items: ready=', ready, 'selectedLibraryId=', selectedLibraryId, 'selectedLibrary=', selectedLibrary);
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
            log.info(' Refreshing items for library:', selectedLibraryId, 'type:', selectedLibrary.mediaType);

            // Step 1: Fetch all simple item details across all pages
            log.info(' Fetching all library items (simple details)...');
            const allItems = await fetchAllLibraryItems(selectedLibraryId);
            log.info(` Fetched ${allItems.length} items from API`);

            // Step 2: Upsert all library items to database
            const libraryItemRows = allItems.map(marshalLibraryItemFromApi);
            await upsertLibraryItems(libraryItemRows);
            log.info(' Upserted all library items to database');

            // Step 3: Get initial items from database for display (may have limited metadata)
            const initialDbItems = await getLibraryItemsForList(selectedLibraryId);
            const initialDisplayItems = transformItemsToDisplayFormat(initialDbItems);

            // Update UI with initial items and clear loading state (refresh indicator goes away)
            set((state: LibrarySlice) => ({
                ...state,
                library: {
                    ...state.library,
                    rawItems: initialDisplayItems,
                    items: sortLibraryItems(initialDisplayItems, state.library.sortConfig),
                    loading: { ...state.library.loading, isLoadingItems: false }
                }
            }));

            log.info(` Updated UI with ${initialDisplayItems.length} items (loading cleared, batch fetch starting in background)`);

            // Step 4: Start cover caching before batch updates (so UI updates faster)
            log.info(' [Background] Starting cover caching...');
            const coverCachePromise = cacheCoversForLibraryItems(selectedLibraryId).then(async (result) => {
                log.info(` [Background] Cover caching completed. Downloaded: ${result.downloadedCount}/${result.totalCount}`);

                // Refresh the UI after cover caching to show cached covers
                log.info(' [Background] Refreshing display with cached covers');
                const updatedItems = await getLibraryItemsForList(selectedLibraryId);
                const updatedDisplayItems = transformItemsToDisplayFormat(updatedItems);
                log.info(` [Background] Refreshing display with ${updatedDisplayItems.length} items after cover caching ${updatedDisplayItems.filter(i => i.coverUri).length} with covers`);

                set((state: LibrarySlice) => ({
                    ...state,
                    library: {
                        ...state.library,
                        rawItems: updatedDisplayItems,
                        items: sortLibraryItems(updatedDisplayItems, state.library.sortConfig)
                    }
                }));
            }).catch(error => {
                log.error(' [Background] Cover caching failed:', error);
            });

            // Step 5: Fetch full details in batches using batch endpoint (background, don't await)
            const allItemIds = allItems.map(item => item.id);
            log.info(` Starting background batch fetch for ${allItemIds.length} items`);

            // Process batches in background
            (async () => {
                try {
                    const BATCH_SIZE = 50;
                    let processedCount = 0;

                    for (let i = 0; i < allItemIds.length; i += BATCH_SIZE) {
                        const batch = allItemIds.slice(i, i + BATCH_SIZE);
                        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
                        const totalBatches = Math.ceil(allItemIds.length / BATCH_SIZE);

                        log.info(` [Background] Fetching batch ${batchNumber}/${totalBatches} (${batch.length} items)...`);
                        const fullItems = await fetchLibraryItemsBatch(batch);
                        log.info(` [Background] Processing batch ${batchNumber}/${totalBatches} (${fullItems.length} items)...`);

                        await processFullLibraryItems(fullItems);
                        processedCount += fullItems.length;

                        log.info(` [Background] Completed batch ${batchNumber}/${totalBatches} (${processedCount}/${allItemIds.length} items processed)`);

                        // Update UI after each batch to show progress
                        const updatedDbItems = await getLibraryItemsForList(selectedLibraryId);
                        const updatedDisplayItems = transformItemsToDisplayFormat(updatedDbItems);

                        set((state: LibrarySlice) => ({
                            ...state,
                            library: {
                                ...state.library,
                                rawItems: updatedDisplayItems,
                                items: sortLibraryItems(updatedDisplayItems, state.library.sortConfig)
                            }
                        }));

                        // Small delay between batches to keep UI responsive
                        if (i + BATCH_SIZE < allItemIds.length) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }

                    log.info(` [Background] Finished processing all ${processedCount} items with full details`);

                    // Final UI update after all batches complete
                    const finalDbItems = await getLibraryItemsForList(selectedLibraryId);
                    const finalDisplayItems = transformItemsToDisplayFormat(finalDbItems);

                    set((state: LibrarySlice) => ({
                        ...state,
                        library: {
                            ...state.library,
                            rawItems: finalDisplayItems,
                            items: sortLibraryItems(finalDisplayItems, state.library.sortConfig)
                        }
                    }));

                    // Wait for cover caching to complete if it hasn't already
                    await coverCachePromise;
                } catch (error) {
                    log.error(' [Background] Batch fetch failed:', error);
                }
            })();

        } catch (error) {
            log.error(' Failed to refresh items:', error);
            // Make sure loading state is cleared even on error
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
        log.info(' Setting sort config:', config);

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
            log.error(' Failed to save sort config:', error);
        }
    },

    /**
     * Reset the slice to initial state
     */
    resetLibrary: () => {
        log.info(' Resetting slice to initial state');
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
        log.info(` Setting ready state: ${ready} (api=${apiConfigured}, db=${dbInitialized})`);
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
            log.info(' Loading from storage...');

            const [storedLibraryId, storedSortConfig] = await Promise.all([
                AsyncStorage.getItem(STORAGE_KEYS.selectedLibraryId),
                AsyncStorage.getItem(STORAGE_KEYS.sortConfig),
            ]);

            const updates: Partial<LibrarySliceState['library']> = {};

            if (storedLibraryId) {
                updates.selectedLibraryId = storedLibraryId;
                log.info(' Loaded selected library ID from storage:', storedLibraryId);
            }

            if (storedSortConfig) {
                try {
                    const parsedSortConfig = JSON.parse(storedSortConfig) as SortConfig;
                    updates.sortConfig = parsedSortConfig;
                    log.info(' Loaded sort config from storage:', parsedSortConfig);
                } catch (parseError) {
                    log.error(' Failed to parse stored sort config:', parseError);
                }
            }

            if (Object.keys(updates).length > 0) {
                set((state: LibrarySlice) => ({
                    ...state,
                    library: { ...state.library, ...updates }
                }));
            }
        } catch (error) {
            log.error(' Failed to load from storage:', error);
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
