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

import { processFullLibraryItems } from "@/db/helpers/fullLibraryItems";
import {
  getAllLibraries,
  getLibraryById,
  LibraryRow,
  marshalLibrariesFromResponse,
  upsertLibraries,
} from "@/db/helpers/libraries";
import {
  checkLibraryItemExists,
  getLibraryItemsForList,
  marshalLibraryItemFromApi,
  transformItemsToDisplayFormat,
  upsertLibraryItems,
} from "@/db/helpers/libraryItems";
import {
  cacheCoversForLibraryItems,
  upsertBookMetadata,
  upsertPodcastMetadata,
} from "@/db/helpers/mediaMetadata";
import {
  fetchAllLibraryItems,
  fetchLibraries,
  fetchLibraryItemsBatch,
  fetchLibraryItemsByAddedAt,
} from "@/lib/api/endpoints";
import { logger } from "@/lib/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { LibraryItemDisplayRow } from "@/types/components";
import type { SliceCreator, SortConfig } from "@/types/store";
import type { ApiBook, ApiPodcast } from "@/types/api";
import { DEFAULT_SORT_CONFIG, sortLibraryItems, STORAGE_KEYS } from "../utils";

// Create cached sublogger for this slice
const log = logger.forTag("LibrarySlice");

/**
 * Readiness state machine - tracks whether slice can perform API operations
 */
export type ReadinessState = "UNINITIALIZED" | "INITIALIZING" | "NOT_READY" | "READY";

/**
 * Operation state machine - tracks ongoing async operations (only valid when READY)
 */
export type OperationState =
  | "IDLE"
  | "REFRESHING_LIBRARIES"
  | "REFRESHING_ITEMS"
  | "SELECTING_LIBRARY"
  | "CHECKING_NEW_ITEMS";

/**
 * ApiLibrary slice state interface - scoped under 'library' to avoid conflicts
 */
export interface LibrarySliceState {
  library: {
    // State machines
    /** Readiness state - whether API/DB are available */
    readinessState: ReadinessState;
    /** Operation state - what async operation is running */
    operationState: OperationState;

    // Core data
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
  /** Load data from AsyncStorage */
  _loadLibrarySettingsFromStorage: () => Promise<void>;

  // State machine transitions
  /** Update readiness state based on API/DB availability */
  _updateReadiness: (apiConfigured: boolean, dbInitialized: boolean) => void;
  /** Handle side effects when transitioning to READY state */
  _onTransitionToReady: () => void;
}

/**
 * Combined library slice interface
 */
export interface LibrarySlice extends LibrarySliceState, LibrarySliceActions {}

/**
 * Initial library slice state
 */
const initialLibraryState: LibrarySliceState = {
  library: {
    readinessState: "UNINITIALIZED",
    operationState: "IDLE",
    selectedLibraryId: null,
    selectedLibrary: null,
    libraries: [],
    rawItems: [],
    items: [],
    sortConfig: DEFAULT_SORT_CONFIG,
  },
};

/**
 * Helper functions to check state
 */
const isReady = (state: LibrarySliceState) => state.library.readinessState === "READY";
const isInitialized = (state: LibrarySliceState) =>
  state.library.readinessState !== "UNINITIALIZED";
const canPerformOperations = (state: LibrarySliceState) =>
  state.library.readinessState === "READY" && state.library.operationState === "IDLE";

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
    if (isInitialized(state)) {
      log.info(" Slice already initialized, skipping...");
      return;
    }

    log.info(" Initializing slice...");

    // Transition: UNINITIALIZED → INITIALIZING
    set((state: LibrarySlice) => ({
      ...state,
      library: {
        ...state.library,
        readinessState: "INITIALIZING",
      },
    }));

    try {
      // Load from storage first
      await get()._loadLibrarySettingsFromStorage();

      if (dbInitialized) {
        log.info(" Loading cached libraries and items...");

        const {
          library: { selectedLibraryId },
        }: LibrarySliceState = get();

        // Load all libraries from database cache
        let libraries = await getAllLibraries();

        // If we have API access and no libraries in cache, fetch from API
        // Note: apiConfigured can be undefined during initialization, so check truthiness
        if (apiConfigured === true && libraries.length === 0) {
          log.info(" No cached libraries found, fetching from API...");
          libraries = await get()._refetchLibraries();
        }

        // If no library is selected but we have libraries, select the first one by display order
        let finalSelectedLibraryId = selectedLibraryId;
        let finalSelectedLibrary = libraries.find((l) => l.id == selectedLibraryId);
        if (!selectedLibraryId && libraries.length > 0) {
          // Sort by display order and select first
          const sortedLibraries = [...libraries].sort((a, b) => {
            const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
            return orderA - orderB;
          });
          finalSelectedLibraryId = sortedLibraries[0].id;
          finalSelectedLibrary = sortedLibraries[0];
          log.info(`Auto-selecting first library by display order: ${finalSelectedLibrary.name}`);

          // Persist the selection
          try {
            await AsyncStorage.setItem(STORAGE_KEYS.selectedLibraryId, finalSelectedLibraryId);
          } catch (error) {
            log.error(" Failed to persist auto-selected library:", error as Error);
          }
        }

        let rawItems: LibraryItemDisplayRow[] = [];
        let items = [];
        if (finalSelectedLibraryId) {
          items = await getLibraryItemsForList(finalSelectedLibraryId);
          rawItems = transformItemsToDisplayFormat(items);

          log.info(
            `Loaded ${rawItems.length} cached items for library: ${finalSelectedLibrary?.name}`
          );
        }

        // Update state with loaded data
        set((state: LibrarySlice) => ({
          ...state,
          library: {
            ...state.library,
            selectedLibraryId: finalSelectedLibraryId,
            selectedLibrary: finalSelectedLibrary,
            libraries,
            rawItems,
            items: sortLibraryItems(rawItems, state.library.sortConfig),
          },
        }));
      }

      log.info(" Slice initialized successfully");
    } catch (error) {
      log.error(" Failed to initialize slice:", error as Error);
    }

    // Transition: INITIALIZING → NOT_READY or READY (based on API/DB state)
    // This also triggers auto-refresh/sync if transitioning to READY
    get()._updateReadiness(apiConfigured, dbInitialized);
  },

  /**
   * Select a library and load its items
   */
  selectLibrary: async (libraryId: string, fetchFromApi: boolean = false) => {
    const state = get();
    if (!isReady(state)) {
      log.warn(" Slice not ready, cannot select library");
      return;
    }

    if (state.library.selectedLibraryId === libraryId && !fetchFromApi) {
      log.info(` ApiLibrary already selected: ${libraryId}`);
      return;
    }

    log.info(` Selecting library: ${libraryId}, fetchFromApi: ${fetchFromApi}`);

    // Transition: IDLE → SELECTING_LIBRARY
    set((state: LibrarySlice) => ({
      ...state,
      library: { ...state.library, operationState: "SELECTING_LIBRARY" },
    }));

    try {
      if (fetchFromApi) {
        // First select the library, then fetch items from API
        await get()._selectLibraryFromCache(libraryId);
        await get()._refetchItems();
      } else {
        // Use cached data only
        await get()._selectLibraryFromCache(libraryId);
        // Check for new items after switching libraries
        log.info(" Checking for new items after library switch...");
        get()._checkForNewItems();
      }
    } finally {
      // Transition: SELECTING_LIBRARY → IDLE (if not in another operation)
      const currentState = get();
      if (currentState.library.operationState === "SELECTING_LIBRARY") {
        set((state: LibrarySlice) => ({
          ...state,
          library: { ...state.library, operationState: "IDLE" },
        }));
      }
    }
  },

  /**
   * Refresh the library list and refetch the library items from the currently selected library
   */
  refresh: async () => {
    const state = get();
    if (!isReady(state)) {
      log.warn(" Slice not ready, cannot refresh");
      return;
    }

    log.info(" Refreshing libraries and items...");

    try {
      // First refresh the library list (this transitions to REFRESHING_LIBRARIES)
      await get()._refetchLibraries();

      // Then refresh items for the currently selected library if one is selected
      // (this transitions to REFRESHING_ITEMS)
      if (state.library.selectedLibraryId) {
        await get()._refetchItems();
      }

      // Refresh series and authors after library refresh
      log.info(" Refreshing series and authors after library refresh...");
      try {
        await Promise.all([
          get()
            .refetchSeries()
            .catch((error: Error) => {
              log.error(" Failed to refresh series:", error);
            }),
          get()
            .refetchAuthors()
            .catch((error: Error) => {
              log.error(" Failed to refresh authors:", error);
            }),
        ]);
      } catch (error) {
        log.error(" Failed to refresh series/authors:", error as Error);
      }

      log.info(" Refresh completed successfully");
    } catch (error) {
      log.error(" Failed to refresh:", error as Error);
    }
  },

  /**
   * Select a library using only cached data (no API calls)
   * This is useful for quick library switching without waiting for API responses
   * Note: Does not change operation state - caller manages that
   */
  _selectLibraryFromCache: async (libraryId: string) => {
    const state = get();
    if (!isReady(state)) {
      log.warn(" Slice not ready, cannot select library from cache");
      return;
    }

    if (state.library.selectedLibraryId === libraryId) {
      log.info(` ApiLibrary already selected: ${libraryId}`);
      return;
    }

    log.info(` Selecting library from cache: ${libraryId}`);

    set((state: LibrarySlice) => ({
      ...state,
      library: {
        ...state.library,
        selectedLibraryId: libraryId,
      },
    }));

    try {
      // Persist selection to storage
      await AsyncStorage.setItem(STORAGE_KEYS.selectedLibraryId, libraryId);

      // Get library from database (cached data only)
      const selectedLibrary = await getLibraryById(libraryId);
      if (selectedLibrary) {
        set((state: LibrarySlice) => ({
          ...state,
          library: { ...state.library, selectedLibrary },
        }));

        // Load cached items for this library
        await get()._loadCachedItems();
      }
    } catch (error) {
      log.error(" Failed to select library from cache:", error as Error);
    }
  },

  /**
   * Load cached items for the currently selected library (no API calls)
   * This loads items from the database only, useful for quick loading
   * Note: Does not change operation state - caller manages that
   */
  _loadCachedItems: async () => {
    const state: LibrarySliceState = get();
    const { selectedLibraryId } = state.library;

    if (!selectedLibraryId) {
      log.warn(" No library selected, cannot load cached items");
      return;
    }

    log.info(` Loading cached items for library: ${selectedLibraryId}`);

    try {
      // Get items from database with full metadata for display
      const dbItems = await getLibraryItemsForList(selectedLibraryId);
      const displayItems = transformItemsToDisplayFormat(dbItems);

      set((state: LibrarySlice) => ({
        ...state,
        library: {
          ...state.library,
          rawItems: displayItems,
          items: sortLibraryItems(displayItems, state.library.sortConfig),
        },
      }));

      log.info(`Loaded ${displayItems.length} cached items`);
    } catch (error) {
      log.error(" Failed to load cached items:", error as Error);
    }
  },

  /**
   * Refresh all libraries from API and update database
   * Manages operation state transition: IDLE/other → REFRESHING_LIBRARIES → (original state)
   */
  _refetchLibraries: async (): Promise<LibraryRow[]> => {
    const state = get();
    if (!isReady(state)) {
      log.warn(" Slice not ready, cannot fetch libraries");
      return [];
    }

    // Transition to REFRESHING_LIBRARIES
    const previousOperationState = state.library.operationState;
    set((state: LibrarySlice) => ({
      ...state,
      library: {
        ...state.library,
        operationState: "REFRESHING_LIBRARIES",
      },
    }));

    try {
      log.info(" Refreshing libraries from API...");

      // Fetch libraries from API
      const response = await fetchLibraries();

      // Marshal and store in database
      const libraryRows = marshalLibrariesFromResponse(response);
      await upsertLibraries(libraryRows);

      // Get updated libraries from database
      const libraries = await getAllLibraries();
      set((state: LibrarySlice) => ({
        ...state,
        library: { ...state.library, libraries },
      }));

      if (!state.library.selectedLibraryId && libraries.length > 0) {
        // If no library is selected but we have libraries, select the first one by display order
        log.info(" Defaulting to first library by display order");
        const sortedLibraries = [...libraries].sort((a, b) => {
          const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
          return orderA - orderB;
        });
        const selectedLibrary = sortedLibraries[0];
        set((state: LibrarySlice) => ({
          ...state,
          library: {
            ...state.library,
            selectedLibraryId: selectedLibrary.id,
            selectedLibrary,
          },
        }));

        await get()._loadCachedItems();
      }

      log.info(`Successfully refreshed ${libraries.length} libraries`);
      return libraries;
    } catch (error) {
      log.error(" Failed to fetch libraries from API:", error as Error);

      // Fallback to database-only data
      const libraries = await getAllLibraries();
      set((state: LibrarySlice) => ({
        ...state,
        library: { ...state.library, libraries },
      }));

      return libraries;
    } finally {
      // Transition back to previous state (or IDLE if it was REFRESHING_LIBRARIES)
      set((state: LibrarySlice) => ({
        ...state,
        library: {
          ...state.library,
          operationState:
            previousOperationState === "REFRESHING_LIBRARIES" ? "IDLE" : previousOperationState,
        },
      }));
    }
  },

  /**
   * Refresh items for the currently selected library
   * Manages operation state transition: → REFRESHING_ITEMS → IDLE
   */
  _refetchItems: async () => {
    const state: LibrarySliceState = get();
    const {
      library: { selectedLibraryId, selectedLibrary },
    } = state;

    if (!isReady(state) || !selectedLibraryId || !selectedLibrary) {
      log.warn(
        ` Cannot refresh items: ready=${isReady(state)}, selectedLibraryId=${selectedLibraryId}, selectedLibrary=${!!selectedLibrary}`
      );
      return;
    }

    // Transition to REFRESHING_ITEMS
    set((state: LibrarySlice) => ({
      ...state,
      library: {
        ...state.library,
        operationState: "REFRESHING_ITEMS",
      },
    }));

    try {
      log.info(
        ` Refreshing items for library: ${selectedLibraryId}, type: ${selectedLibrary.mediaType}`
      );

      // Step 1: Fetch all simple item details across all pages (minified response includes basic metadata)
      log.info(" Fetching all library items (minified with metadata)...");
      const allItems = await fetchAllLibraryItems(selectedLibraryId);
      log.info(`Fetched ${allItems.length} items from API`);

      // Step 2: Upsert all library items to database
      const libraryItemRows = allItems.map(marshalLibraryItemFromApi);
      await upsertLibraryItems(libraryItemRows);
      log.info(" Upserted all library items to database");

      // Step 3: Extract and upsert basic metadata from minified response so titles show immediately
      log.info(" Upserting basic metadata from minified response...");
      for (const item of allItems) {
        // Minified response doesn't include libraryItemId in media object, so backfill it
        if (item.mediaType === "book") {
          const enrichedBook = {
            ...(item.media as ApiBook),
            libraryItemId: item.id,
          };
          await upsertBookMetadata(enrichedBook);
        } else if (item.mediaType === "podcast") {
          const enrichedPodcast = {
            ...(item.media as ApiPodcast),
            libraryItemId: item.id,
          };
          await upsertPodcastMetadata(enrichedPodcast);
        }
      }
      log.info(" Upserted basic metadata for all items");

      // Step 4: Get initial items from database for display (now has basic metadata with titles!)
      const initialDbItems = await getLibraryItemsForList(selectedLibraryId);
      const initialDisplayItems = transformItemsToDisplayFormat(initialDbItems);

      // Update UI with initial items and transition back to IDLE
      set((state: LibrarySlice) => ({
        ...state,
        library: {
          ...state.library,
          rawItems: initialDisplayItems,
          items: sortLibraryItems(initialDisplayItems, state.library.sortConfig),
          operationState: "IDLE",
        },
      }));

      log.info(
        `Updated UI with ${initialDisplayItems.length} items (with titles from minified metadata)`
      );

      // Step 5: Sort items according to current sort config before batching
      // This ensures batches are fetched in the order users see items on screen
      const sortedItems = sortLibraryItems(
        initialDisplayItems.map((item) => ({
          ...item,
          // Map back to API format for consistent sorting
          id: allItems.find((apiItem) => apiItem.id === item.id)?.id || item.id,
        })),
        state.library.sortConfig
      );
      const sortedItemIds = sortedItems.map((item) => item.id);
      log.info(
        `Sorted ${sortedItemIds.length} items by ${state.library.sortConfig.field} ${state.library.sortConfig.direction} for batch processing`
      );

      // Step 6: Fetch full details in batches using batch endpoint (background, don't await)
      log.info(`Starting background batch fetch for ${sortedItemIds.length} items`);

      // Process batches in background
      (async () => {
        try {
          const BATCH_SIZE = 20;
          let processedCount = 0;

          for (let i = 0; i < sortedItemIds.length; i += BATCH_SIZE) {
            const batch = sortedItemIds.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(sortedItemIds.length / BATCH_SIZE);

            log.info(
              `[Background] Fetching batch ${batchNumber}/${totalBatches} (${batch.length} items)...`
            );
            const fullItems = await fetchLibraryItemsBatch(batch);
            log.info(
              `[Background] Processing batch ${batchNumber}/${totalBatches} (${fullItems.length} items)...`
            );

            await processFullLibraryItems(fullItems);
            processedCount += fullItems.length;

            log.info(
              `[Background] Completed batch ${batchNumber}/${totalBatches} (${processedCount}/${sortedItemIds.length} items processed)`
            );

            // Cache covers for this batch
            log.info(`[Background] Caching covers for batch ${batchNumber}/${totalBatches}...`);
            await cacheCoversForLibraryItems(selectedLibraryId);

            // Update UI after each batch to show progress (including newly cached covers)
            const updatedDbItems = await getLibraryItemsForList(selectedLibraryId);
            const updatedDisplayItems = transformItemsToDisplayFormat(updatedDbItems);

            set((state: LibrarySlice) => ({
              ...state,
              library: {
                ...state.library,
                rawItems: updatedDisplayItems,
                items: sortLibraryItems(updatedDisplayItems, state.library.sortConfig),
              },
            }));

            log.info(
              `[Background] Updated UI after batch ${batchNumber}/${totalBatches} (${updatedDisplayItems.filter((i) => i.coverUri).length} items with covers)`
            );

            // Small delay between batches to keep UI responsive
            if (i + BATCH_SIZE < sortedItemIds.length) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }

          log.info(
            `[Background] Finished processing all ${processedCount} items with full details and covers`
          );
        } catch (error) {
          log.error(" [Background] Batch fetch failed:", error as Error);
        }
      })();
    } catch (error) {
      log.error(" Failed to refresh items:", error as Error);
      // Make sure operation state is cleared even on error
      set((state: LibrarySlice) => ({
        ...state,
        library: {
          ...state.library,
          operationState: "IDLE",
        },
      }));
    }
  },

  /**
   * Check for new items added to the library since the most recent item in local DB
   * Fetches items in batches of 20 sorted by addedAt (newest first) and stops when
   * it encounters an item that already exists in the database
   * Manages operation state transition: → CHECKING_NEW_ITEMS → IDLE
   */
  _checkForNewItems: async () => {
    const state: LibrarySliceState = get();
    const {
      library: { selectedLibraryId },
    } = state;

    if (!isReady(state) || !selectedLibraryId) {
      log.warn(
        ` Cannot check for new items: ready=${isReady(state)}, selectedLibraryId=${selectedLibraryId}`
      );
      return;
    }

    log.info(` Checking for new items in library: ${selectedLibraryId}`);

    // Transition to CHECKING_NEW_ITEMS
    set((state: LibrarySlice) => ({
      ...state,
      library: {
        ...state.library,
        operationState: "CHECKING_NEW_ITEMS",
      },
    }));

    try {
      const BATCH_SIZE = 20;
      let page = 0;
      let foundExistingItem = false;
      let totalNewItems = 0;
      const allNewItems: any[] = [];

      // Fetch items in batches until we find an item that already exists
      while (!foundExistingItem) {
        log.info(`Fetching batch ${page + 1} (${BATCH_SIZE} items, sorted by addedAt DESC)...`);
        const response = await fetchLibraryItemsByAddedAt(selectedLibraryId, page, BATCH_SIZE);

        if (!response.results || response.results.length === 0) {
          log.info(" No more items to fetch");
          break;
        }

        // Check each item in the batch
        for (const item of response.results) {
          const exists = await checkLibraryItemExists(item.id);
          if (exists) {
            log.info(`Found existing item: ${item.id}, stopping incremental sync`);
            foundExistingItem = true;
            break;
          }
          allNewItems.push(item);
        }

        totalNewItems += response.results.length - (foundExistingItem ? 1 : 0);
        page++;

        // Safety check: if we've fetched more than 200 items without finding an existing one,
        // something might be wrong - stop to avoid infinite loop
        if (page >= 10) {
          log.warn(" Fetched 200+ items without finding existing item, stopping sync");
          break;
        }
      }

      if (allNewItems.length === 0) {
        log.info(" No new items found");
        return;
      }

      log.info(`Found ${allNewItems.length} new items, upserting to database...`);

      // Upsert new items to database
      const libraryItemRows = allNewItems.map(marshalLibraryItemFromApi);
      await upsertLibraryItems(libraryItemRows);

      // Get updated items from database and update UI
      const updatedDbItems = await getLibraryItemsForList(selectedLibraryId);
      const updatedDisplayItems = transformItemsToDisplayFormat(updatedDbItems);

      set((state: LibrarySlice) => ({
        ...state,
        library: {
          ...state.library,
          rawItems: updatedDisplayItems,
          items: sortLibraryItems(updatedDisplayItems, state.library.sortConfig),
        },
      }));

      log.info(`Updated UI with ${allNewItems.length} new items`);

      // Process full details for new items in background
      if (allNewItems.length > 0) {
        log.info(" [Background] Fetching full details for new items...");
        (async () => {
          try {
            const newItemIds = allNewItems.map((item) => item.id);
            const fullItems = await fetchLibraryItemsBatch(newItemIds);
            await processFullLibraryItems(fullItems);

            // Cache covers for new items
            await cacheCoversForLibraryItems(selectedLibraryId);

            // Final UI update with full details
            const finalDbItems = await getLibraryItemsForList(selectedLibraryId);
            const finalDisplayItems = transformItemsToDisplayFormat(finalDbItems);

            set((state: LibrarySlice) => ({
              ...state,
              library: {
                ...state.library,
                rawItems: finalDisplayItems,
                items: sortLibraryItems(finalDisplayItems, state.library.sortConfig),
              },
            }));

            log.info(" [Background] Finished processing new items with full details");
          } catch (error) {
            log.error(" [Background] Failed to process new items:", error as Error);
          }
        })();
      }
    } catch (error) {
      log.error(" Failed to check for new items:", error as Error);
    } finally {
      // Transition back to IDLE
      set((state: LibrarySlice) => ({
        ...state,
        library: {
          ...state.library,
          operationState: "IDLE",
        },
      }));
    }
  },

  /**
   * Update sort configuration and persist to storage
   */
  setSortConfig: async (config: SortConfig) => {
    log.info(` Setting sort config: ${JSON.stringify(config)}`);

    set((state: LibrarySlice) => ({
      ...state,
      library: {
        ...state.library,
        sortConfig: config,
        items: sortLibraryItems(state.library.rawItems, config),
      },
    }));

    try {
      await AsyncStorage.setItem(STORAGE_KEYS.sortConfig, JSON.stringify(config));
    } catch (error) {
      log.error(" Failed to save sort config:", error as Error);
    }
  },

  /**
   * Reset the slice to initial state
   */
  resetLibrary: () => {
    log.info(" Resetting slice to initial state");
    set((state: LibrarySlice) => ({
      ...state,
      ...initialLibraryState,
    }));
  },

  /**
   * Load data from AsyncStorage
   */
  _loadLibrarySettingsFromStorage: async () => {
    try {
      log.info(" Loading from storage...");

      const [storedLibraryId, storedSortConfig] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.selectedLibraryId),
        AsyncStorage.getItem(STORAGE_KEYS.sortConfig),
      ]);

      const updates: Partial<LibrarySliceState["library"]> = {};

      if (storedLibraryId) {
        updates.selectedLibraryId = storedLibraryId;
        log.info(` Loaded selected library ID from storage: ${storedLibraryId}`);
      }

      if (storedSortConfig) {
        try {
          const parsedSortConfig = JSON.parse(storedSortConfig) as SortConfig;
          updates.sortConfig = parsedSortConfig;
          log.info(` Loaded sort config from storage: ${JSON.stringify(parsedSortConfig)}`);
        } catch (parseError) {
          log.error(" Failed to parse stored sort config:", parseError as Error);
        }
      }

      if (Object.keys(updates).length > 0) {
        set((state: LibrarySlice) => ({
          ...state,
          library: { ...state.library, ...updates },
        }));
      }
    } catch (error) {
      log.error(" Failed to load from storage:", error as Error);
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
        items: sortLibraryItems(state.library.rawItems, state.library.sortConfig),
      },
    }));
  },

  /**
   * Update readiness state based on API and DB availability
   * Handles state transitions: UNINITIALIZED/INITIALIZING/NOT_READY → READY
   *
   * Note: Library slice can work in limited capacity with just DB (offline mode),
   * but needs both API and DB to be fully READY for sync operations.
   */
  _updateReadiness: (apiConfigured: boolean, dbInitialized: boolean) => {
    const state = get();
    const wasReady = isReady(state);
    // Explicitly check for true to handle undefined during initialization
    const hasApi = apiConfigured === true;
    const hasDb = dbInitialized === true;
    const shouldBeReady = hasApi && hasDb;

    log.info(
      `Updating readiness: api=${apiConfigured}, db=${dbInitialized}, shouldBeReady=${shouldBeReady}`
    );

    // Determine new readiness state
    let newReadinessState: ReadinessState = state.library.readinessState;

    if (shouldBeReady) {
      newReadinessState = "READY";
    } else if (state.library.readinessState === "INITIALIZING") {
      // If we're initializing and not ready, go to NOT_READY
      // This allows offline mode - slice is initialized but not ready for API ops
      newReadinessState = "NOT_READY";
    }

    // Update state
    set((state: LibrarySlice) => ({
      ...state,
      library: { ...state.library, readinessState: newReadinessState },
    }));

    // Trigger side effects on transition to READY
    if (!wasReady && newReadinessState === "READY") {
      log.info(" Transitioned to READY state, triggering side effects...");
      get()._onTransitionToReady();
    }
  },

  /**
   * Handle side effects when transitioning to READY state
   * This is called once per app lifecycle when the slice becomes ready
   */
  _onTransitionToReady: async () => {
    const state = get();
    let { selectedLibraryId, rawItems, libraries } = state.library;

    log.info(
      `_onTransitionToReady: selectedLibraryId=${selectedLibraryId}, itemCount=${rawItems.length}, libraryCount=${libraries.length}`
    );

    // Step 1: If no libraries cached, fetch them from API
    if (libraries.length === 0) {
      log.info(" No libraries cached, fetching from API...");
      libraries = await get()._refetchLibraries();

      // Refresh state after fetching libraries
      const updatedState = get();
      selectedLibraryId = updatedState.library.selectedLibraryId;
      rawItems = updatedState.library.rawItems;
    }

    // Step 2: If we have libraries but none selected, auto-select the first by display order
    if (!selectedLibraryId && libraries.length > 0) {
      const sortedLibraries = [...libraries].sort((a, b) => {
        const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
      selectedLibraryId = sortedLibraries[0].id;
      log.info(
        ` Auto-selecting first library by display order: ${sortedLibraries[0].name} (id=${selectedLibraryId})`
      );

      // For first-time setup, force full API fetch to populate the library
      await get().selectLibrary(selectedLibraryId, true);
      return; // selectLibrary with fetchFromApi=true will handle the full refresh
    }

    // Step 3: If still no library selected (e.g., no libraries exist), skip
    if (!selectedLibraryId) {
      log.info(" No library available, skipping auto-refresh/sync");
      return;
    }

    // Step 4: Trigger refresh or incremental sync based on item count
    if (rawItems.length === 0) {
      log.info(" Library is empty, triggering auto-refresh...");
      get().refresh();
    } else {
      log.info(" Library has items, checking for new items...");
      get()._checkForNewItems();
    }
  },
});
