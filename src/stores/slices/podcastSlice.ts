/**
 * Podcast slice for Zustand store
 *
 * This slice manages podcast-related state including:
 * - Selected podcast library and its items
 * - All available podcast libraries
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
import { DEFAULT_SORT_CONFIG, sortLibraryItems, STORAGE_KEYS } from "../utils";

// Create cached sublogger for this slice
const log = logger.forTag("PodcastSlice");

// Storage keys for podcast slice
const PODCAST_STORAGE_KEYS = {
  selectedPodcastLibraryId: "@app/selectedPodcastLibraryId",
  podcastSortConfig: "@app/podcastSortConfig",
};

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
 * Podcast slice state interface - scoped under 'podcasts' to avoid conflicts
 */
export interface PodcastSliceState {
  podcasts: {
    // State machines
    /** Readiness state - whether API/DB are available */
    readinessState: ReadinessState;
    /** Operation state - what async operation is running */
    operationState: OperationState;

    // Core data
    /** Currently selected podcast library ID */
    selectedPodcastLibraryId: string | null;
    /** Currently selected podcast library object */
    selectedPodcastLibrary: LibraryRow | null;
    /** All available podcast libraries */
    podcastLibraries: LibraryRow[];
    /** Raw podcast items (unsorted) */
    rawItems: LibraryItemDisplayRow[];
    /** Sorted podcast items (computed from rawItems and sortConfig) */
    items: LibraryItemDisplayRow[];
    /** Current sort configuration */
    sortConfig: SortConfig;
  };
}

/**
 * Podcast slice actions interface
 */
export interface PodcastSliceActions {
  // Public methods
  /** Initialize the slice (load from storage, fetch initial data) */
  initializePodcastSlice: (apiConfigured: boolean, dbInitialized: boolean) => Promise<void>;
  /** Select a podcast library and load its items */
  selectPodcastLibrary: (libraryId: string, fetchFromApi?: boolean) => Promise<void>;
  /** Refresh the podcast library list and refetch items from the currently selected library */
  refreshPodcasts: () => Promise<void>;
  /** Update sort configuration and persist to storage */
  setPodcastSortConfig: (config: SortConfig) => Promise<void>;
  /** Reset the slice to initial state */
  resetPodcasts: () => void;

  // Internal actions (prefixed with underscore)
  /** Load data from AsyncStorage */
  _loadPodcastSettingsFromStorage: () => Promise<void>;

  // State machine transitions
  /** Update readiness state based on API/DB availability */
  _updatePodcastReadiness: (apiConfigured: boolean, dbInitialized: boolean) => void;
  /** Handle side effects when transitioning to READY state */
  _onPodcastTransitionToReady: () => void;
}

/**
 * Combined podcast slice interface
 */
export interface PodcastSlice extends PodcastSliceState, PodcastSliceActions {}

/**
 * Initial podcast slice state
 */
const initialPodcastState: PodcastSliceState = {
  podcasts: {
    readinessState: "UNINITIALIZED",
    operationState: "IDLE",
    selectedPodcastLibraryId: null,
    selectedPodcastLibrary: null,
    podcastLibraries: [],
    rawItems: [],
    items: [],
    sortConfig: DEFAULT_SORT_CONFIG,
  },
};

/**
 * Helper functions to check state
 */
const isReady = (state: PodcastSliceState) => state.podcasts.readinessState === "READY";
const isInitialized = (state: PodcastSliceState) =>
  state.podcasts.readinessState !== "UNINITIALIZED";
const canPerformOperations = (state: PodcastSliceState) =>
  state.podcasts.readinessState === "READY" && state.podcasts.operationState === "IDLE";

/**
 * Create the podcast slice
 */
export const createPodcastSlice: SliceCreator<PodcastSlice> = (set, get) => ({
  // Initial state
  ...initialPodcastState,

  /**
   * Initialize the slice by loading from storage and fetching initial data
   */
  initializePodcastSlice: async (apiConfigured: boolean, dbInitialized: boolean) => {
    const state = get();
    if (isInitialized(state)) {
      log.info("🎙️ Slice already initialized, skipping...");
      return;
    }

    log.info("🎙️ Initializing podcast slice...");

    // Transition: UNINITIALIZED → INITIALIZING
    set((state: PodcastSlice) => ({
      ...state,
      podcasts: {
        ...state.podcasts,
        readinessState: "INITIALIZING",
      },
    }));

    try {
      // Load from storage first
      await get()._loadPodcastSettingsFromStorage();

      if (dbInitialized) {
        log.info("🎙️ Loading cached podcast libraries and items...");

        const {
          podcasts: { selectedPodcastLibraryId },
        }: PodcastSliceState = get();

        // Load all libraries from database cache and filter for podcasts
        let allLibraries = await getAllLibraries();
        let podcastLibraries = allLibraries.filter((lib) => lib.mediaType === "podcast");

        // If ready and no podcast libraries in cache, fetch from API
        if (apiConfigured && dbInitialized && podcastLibraries.length === 0) {
          log.info("🎙️ No cached podcast libraries found, fetching from API...");
          await get()._refetchPodcastLibraries();

          // Reload libraries after fetch
          allLibraries = await getAllLibraries();
          podcastLibraries = allLibraries.filter((lib) => lib.mediaType === "podcast");
        }

        // If no podcast library is selected but we have libraries, select the first one by display order
        let finalSelectedPodcastLibraryId = selectedPodcastLibraryId;
        let finalSelectedPodcastLibrary = podcastLibraries.find(
          (l) => l.id == selectedPodcastLibraryId
        );
        if (!selectedPodcastLibraryId && podcastLibraries.length > 0) {
          // Sort by display order and select first
          const sortedLibraries = [...podcastLibraries].sort((a, b) => {
            const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
            return orderA - orderB;
          });
          finalSelectedPodcastLibraryId = sortedLibraries[0].id;
          finalSelectedPodcastLibrary = sortedLibraries[0];
          log.info(
            `🎙️ Auto-selecting first podcast library by display order: ${finalSelectedPodcastLibrary.name}`
          );

          // Persist the selection
          try {
            await AsyncStorage.setItem(
              PODCAST_STORAGE_KEYS.selectedPodcastLibraryId,
              finalSelectedPodcastLibraryId
            );
          } catch (error) {
            log.error("🎙️ Failed to persist auto-selected podcast library:", error as Error);
          }
        }

        let rawItems: LibraryItemDisplayRow[] = [];
        let items = [];
        if (finalSelectedPodcastLibraryId) {
          items = await getLibraryItemsForList(finalSelectedPodcastLibraryId);
          rawItems = transformItemsToDisplayFormat(items);

          log.info(
            `🎙️ Loaded ${rawItems.length} cached items for podcast library: ${finalSelectedPodcastLibrary?.name}`
          );
        }

        // Update state with loaded data
        set((state: PodcastSlice) => ({
          ...state,
          podcasts: {
            ...state.podcasts,
            selectedPodcastLibraryId: finalSelectedPodcastLibraryId,
            selectedPodcastLibrary: finalSelectedPodcastLibrary,
            podcastLibraries,
            rawItems,
            items: sortLibraryItems(rawItems, state.podcasts.sortConfig),
          },
        }));
      }

      log.info("🎙️ Podcast slice initialized successfully");
    } catch (error) {
      log.error("🎙️ Failed to initialize podcast slice:", error as Error);
    }

    // Transition: INITIALIZING → NOT_READY or READY (based on API/DB state)
    // This also triggers auto-refresh/sync if transitioning to READY
    get()._updatePodcastReadiness(apiConfigured, dbInitialized);
  },

  /**
   * Select a podcast library and load its items
   */
  selectPodcastLibrary: async (libraryId: string, fetchFromApi: boolean = false) => {
    const state = get();
    if (!isReady(state)) {
      log.warn("🎙️ Slice not ready, cannot select podcast library");
      return;
    }

    if (state.podcasts.selectedPodcastLibraryId === libraryId && !fetchFromApi) {
      log.info("🎙️ Podcast library already selected:", libraryId);
      return;
    }

    log.info("🎙️ Selecting podcast library:", libraryId, "fetchFromApi:", fetchFromApi);

    // Transition: IDLE → SELECTING_LIBRARY
    set((state: PodcastSlice) => ({
      ...state,
      podcasts: { ...state.podcasts, operationState: "SELECTING_LIBRARY" },
    }));

    try {
      if (fetchFromApi) {
        // First select the library, then fetch items from API
        await get()._selectPodcastLibraryFromCache(libraryId);
        await get()._refetchPodcastItems();
      } else {
        // Use cached data only
        await get()._selectPodcastLibraryFromCache(libraryId);
        // Check for new items after switching libraries
        log.info("🎙️ Checking for new items after podcast library switch...");
        get()._checkForNewPodcastItems();
      }
    } finally {
      // Transition: SELECTING_LIBRARY → IDLE (if not in another operation)
      const currentState = get();
      if (currentState.podcasts.operationState === "SELECTING_LIBRARY") {
        set((state: PodcastSlice) => ({
          ...state,
          podcasts: { ...state.podcasts, operationState: "IDLE" },
        }));
      }
    }
  },

  /**
   * Refresh the podcast library list and refetch items from the currently selected library
   */
  refreshPodcasts: async () => {
    const state = get();
    if (!isReady(state)) {
      log.warn("🎙️ Slice not ready, cannot refresh");
      return;
    }

    log.info("🎙️ Refreshing podcast libraries and items...");

    try {
      // First refresh the library list (this transitions to REFRESHING_LIBRARIES)
      await get()._refetchPodcastLibraries();

      // Then refresh items for the currently selected library if one is selected
      // (this transitions to REFRESHING_ITEMS)
      if (state.podcasts.selectedPodcastLibraryId) {
        await get()._refetchPodcastItems();
      }

      log.info("🎙️ Refresh completed successfully");
    } catch (error) {
      log.error("🎙️ Failed to refresh:", error as Error);
    }
  },

  /**
   * Select a podcast library using only cached data (no API calls)
   * This is useful for quick library switching without waiting for API responses
   * Note: Does not change operation state - caller manages that
   */
  _selectPodcastLibraryFromCache: async (libraryId: string) => {
    const state = get();
    if (!isReady(state)) {
      log.warn("🎙️ Slice not ready, cannot select podcast library from cache");
      return;
    }

    if (state.podcasts.selectedPodcastLibraryId === libraryId) {
      log.info("🎙️ Podcast library already selected:", libraryId);
      return;
    }

    log.info("🎙️ Selecting podcast library from cache:", libraryId);

    set((state: PodcastSlice) => ({
      ...state,
      podcasts: {
        ...state.podcasts,
        selectedPodcastLibraryId: libraryId,
      },
    }));

    try {
      // Persist selection to storage
      await AsyncStorage.setItem(PODCAST_STORAGE_KEYS.selectedPodcastLibraryId, libraryId);

      // Get library from database (cached data only)
      const selectedPodcastLibrary = await getLibraryById(libraryId);
      if (selectedPodcastLibrary) {
        set((state: PodcastSlice) => ({
          ...state,
          podcasts: { ...state.podcasts, selectedPodcastLibrary },
        }));

        // Load cached items for this library
        await get()._loadCachedPodcastItems();
      }
    } catch (error) {
      log.error("🎙️ Failed to select podcast library from cache:", error as Error);
    }
  },

  /**
   * Load cached items for the currently selected podcast library (no API calls)
   * This loads items from the database only, useful for quick loading
   * Note: Does not change operation state - caller manages that
   */
  _loadCachedPodcastItems: async () => {
    const state: PodcastSliceState = get();
    const { selectedPodcastLibraryId } = state.podcasts;

    if (!selectedPodcastLibraryId) {
      log.warn("🎙️ No podcast library selected, cannot load cached items");
      return;
    }

    log.info("🎙️ Loading cached items for podcast library:", selectedPodcastLibraryId);

    try {
      // Get items from database with full metadata for display
      const dbItems = await getLibraryItemsForList(selectedPodcastLibraryId);
      const displayItems = transformItemsToDisplayFormat(dbItems);

      set((state: PodcastSlice) => ({
        ...state,
        podcasts: {
          ...state.podcasts,
          rawItems: displayItems,
          items: sortLibraryItems(displayItems, state.podcasts.sortConfig),
        },
      }));

      log.info(`🎙️ Loaded ${displayItems.length} cached podcast items`);
    } catch (error) {
      log.error("🎙️ Failed to load cached podcast items:", error as Error);
    }
  },

  /**
   * Refresh all podcast libraries from API and update database
   * Manages operation state transition: IDLE/other → REFRESHING_LIBRARIES → (original state)
   */
  _refetchPodcastLibraries: async (): Promise<LibraryRow[]> => {
    const state = get();
    if (!isReady(state)) {
      log.warn("🎙️ Slice not ready, cannot fetch podcast libraries");
      return [];
    }

    // Transition to REFRESHING_LIBRARIES
    const previousOperationState = state.podcasts.operationState;
    set((state: PodcastSlice) => ({
      ...state,
      podcasts: {
        ...state.podcasts,
        operationState: "REFRESHING_LIBRARIES",
      },
    }));

    try {
      log.info("🎙️ Refreshing podcast libraries from API...");

      // Fetch all libraries from API
      const response = await fetchLibraries();

      // Marshal and store in database
      const libraryRows = marshalLibrariesFromResponse(response);
      await upsertLibraries(libraryRows);

      // Get updated libraries from database and filter for podcasts
      const allLibraries = await getAllLibraries();
      const podcastLibraries = allLibraries.filter((lib) => lib.mediaType === "podcast");

      set((state: PodcastSlice) => ({
        ...state,
        podcasts: { ...state.podcasts, podcastLibraries },
      }));

      if (!state.podcasts.selectedPodcastLibraryId && podcastLibraries.length > 0) {
        // If no podcast library is selected but we have libraries, select the first one by display order
        log.info("🎙️ Defaulting to first podcast library by display order");
        const sortedLibraries = [...podcastLibraries].sort((a, b) => {
          const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
          return orderA - orderB;
        });
        const selectedPodcastLibrary = sortedLibraries[0];
        set((state: PodcastSlice) => ({
          ...state,
          podcasts: {
            ...state.podcasts,
            selectedPodcastLibraryId: selectedPodcastLibrary.id,
            selectedPodcastLibrary,
          },
        }));

        await get()._loadCachedPodcastItems();
      }

      log.info(`🎙️ Successfully refreshed ${podcastLibraries.length} podcast libraries`);
      return podcastLibraries;
    } catch (error) {
      log.error("🎙️ Failed to fetch podcast libraries from API:", error as Error);

      // Fallback to database-only data
      const allLibraries = await getAllLibraries();
      const podcastLibraries = allLibraries.filter((lib) => lib.mediaType === "podcast");
      set((state: PodcastSlice) => ({
        ...state,
        podcasts: { ...state.podcasts, podcastLibraries },
      }));

      return podcastLibraries;
    } finally {
      // Transition back to previous state (or IDLE if it was REFRESHING_LIBRARIES)
      set((state: PodcastSlice) => ({
        ...state,
        podcasts: {
          ...state.podcasts,
          operationState:
            previousOperationState === "REFRESHING_LIBRARIES" ? "IDLE" : previousOperationState,
        },
      }));
    }
  },

  /**
   * Refresh items for the currently selected podcast library
   * Manages operation state transition: → REFRESHING_ITEMS → IDLE
   */
  _refetchPodcastItems: async () => {
    const state: PodcastSliceState = get();
    const {
      podcasts: { selectedPodcastLibraryId, selectedPodcastLibrary },
    } = state;

    if (!isReady(state) || !selectedPodcastLibraryId || !selectedPodcastLibrary) {
      log.warn(
        "🎙️ Cannot refresh items: ready=",
        isReady(state),
        "selectedPodcastLibraryId=",
        selectedPodcastLibraryId,
        "selectedPodcastLibrary=",
        selectedPodcastLibrary
      );
      return;
    }

    // Transition to REFRESHING_ITEMS
    set((state: PodcastSlice) => ({
      ...state,
      podcasts: {
        ...state.podcasts,
        operationState: "REFRESHING_ITEMS",
      },
    }));

    try {
      log.info(
        "🎙️ Refreshing items for podcast library:",
        selectedPodcastLibraryId,
        "type:",
        selectedPodcastLibrary.mediaType
      );

      // Step 1: Fetch all simple item details across all pages (minified response includes basic metadata)
      log.info("🎙️ Fetching all podcast items (minified with metadata)...");
      const allItems = await fetchAllLibraryItems(selectedPodcastLibraryId);
      log.info(`🎙️ Fetched ${allItems.length} podcast items from API`);

      // Step 2: Upsert all library items to database
      const libraryItemRows = allItems.map(marshalLibraryItemFromApi);
      await upsertLibraryItems(libraryItemRows);
      log.info("🎙️ Upserted all podcast items to database");

      // Step 3: Extract and upsert basic metadata from minified response so titles show immediately
      log.info("🎙️ Upserting basic metadata from minified response...");
      for (const item of allItems) {
        // Minified response doesn't include libraryItemId in media object, so backfill it
        if (item.mediaType === "podcast") {
          const enrichedPodcast = {
            ...item.media,
            libraryItemId: item.id,
          };
          await upsertPodcastMetadata(enrichedPodcast);
        }
      }
      log.info("🎙️ Upserted basic metadata for all podcast items");

      // Step 4: Get initial items from database for display (now has basic metadata with titles!)
      const initialDbItems = await getLibraryItemsForList(selectedPodcastLibraryId);
      const initialDisplayItems = transformItemsToDisplayFormat(initialDbItems);

      // Update UI with initial items and transition back to IDLE
      set((state: PodcastSlice) => ({
        ...state,
        podcasts: {
          ...state.podcasts,
          rawItems: initialDisplayItems,
          items: sortLibraryItems(initialDisplayItems, state.podcasts.sortConfig),
          operationState: "IDLE",
        },
      }));

      log.info(
        `🎙️ Updated UI with ${initialDisplayItems.length} podcast items (with titles from minified metadata)`
      );

      // Step 5: Sort items according to current sort config before batching
      // This ensures batches are fetched in the order users see items on screen
      const sortedItems = sortLibraryItems(
        initialDisplayItems.map((item) => ({
          ...item,
          // Map back to API format for consistent sorting
          id: allItems.find((apiItem) => apiItem.id === item.id)?.id || item.id,
        })),
        state.podcasts.sortConfig
      );
      const sortedItemIds = sortedItems.map((item) => item.id);
      log.info(
        `🎙️ Sorted ${sortedItemIds.length} podcast items by ${state.podcasts.sortConfig.field} ${state.podcasts.sortConfig.direction} for batch processing`
      );

      // Step 6: Fetch full details in batches using batch endpoint (background, don't await)
      log.info(`🎙️ Starting background batch fetch for ${sortedItemIds.length} podcast items`);

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
              `🎙️ [Background] Fetching batch ${batchNumber}/${totalBatches} (${batch.length} items)...`
            );
            const fullItems = await fetchLibraryItemsBatch(batch);
            log.info(
              `🎙️ [Background] Processing batch ${batchNumber}/${totalBatches} (${fullItems.length} items)...`
            );

            await processFullLibraryItems(fullItems);
            processedCount += fullItems.length;

            log.info(
              `🎙️ [Background] Completed batch ${batchNumber}/${totalBatches} (${processedCount}/${sortedItemIds.length} podcast items processed)`
            );

            // Cache covers for this batch
            log.info(
              `🎙️ [Background] Caching covers for batch ${batchNumber}/${totalBatches}...`
            );
            await cacheCoversForLibraryItems(selectedPodcastLibraryId);

            // Update UI after each batch to show progress (including newly cached covers)
            const updatedDbItems = await getLibraryItemsForList(selectedPodcastLibraryId);
            const updatedDisplayItems = transformItemsToDisplayFormat(updatedDbItems);

            set((state: PodcastSlice) => ({
              ...state,
              podcasts: {
                ...state.podcasts,
                rawItems: updatedDisplayItems,
                items: sortLibraryItems(updatedDisplayItems, state.podcasts.sortConfig),
              },
            }));

            log.info(
              `🎙️ [Background] Updated UI after batch ${batchNumber}/${totalBatches} (${updatedDisplayItems.filter((i) => i.coverUri).length} podcast items with covers)`
            );

            // Small delay between batches to keep UI responsive
            if (i + BATCH_SIZE < sortedItemIds.length) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }

          log.info(
            `🎙️ [Background] Finished processing all ${processedCount} podcast items with full details and covers`
          );
        } catch (error) {
          log.error("🎙️ [Background] Batch fetch failed:", error);
        }
      })();
    } catch (error) {
      log.error("🎙️ Failed to refresh podcast items:", error as Error);
      // Make sure operation state is cleared even on error
      set((state: PodcastSlice) => ({
        ...state,
        podcasts: {
          ...state.podcasts,
          operationState: "IDLE",
        },
      }));
    }
  },

  /**
   * Check for new podcast items added to the library since the most recent item in local DB
   * Fetches items in batches of 20 sorted by addedAt (newest first) and stops when
   * it encounters an item that already exists in the database
   * Manages operation state transition: → CHECKING_NEW_ITEMS → IDLE
   */
  _checkForNewPodcastItems: async () => {
    const state: PodcastSliceState = get();
    const {
      podcasts: { selectedPodcastLibraryId },
    } = state;

    if (!isReady(state) || !selectedPodcastLibraryId) {
      log.warn(
        "🎙️ Cannot check for new items: ready=",
        isReady(state),
        "selectedPodcastLibraryId=",
        selectedPodcastLibraryId
      );
      return;
    }

    log.info("🎙️ Checking for new podcast items in library:", selectedPodcastLibraryId);

    // Transition to CHECKING_NEW_ITEMS
    set((state: PodcastSlice) => ({
      ...state,
      podcasts: {
        ...state.podcasts,
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
        log.info(
          `🎙️ Fetching batch ${page + 1} (${BATCH_SIZE} items, sorted by addedAt DESC)...`
        );
        const response = await fetchLibraryItemsByAddedAt(selectedPodcastLibraryId, page, BATCH_SIZE);

        if (!response.results || response.results.length === 0) {
          log.info("🎙️ No more podcast items to fetch");
          break;
        }

        // Check each item in the batch
        for (const item of response.results) {
          const exists = await checkLibraryItemExists(item.id);
          if (exists) {
            log.info(`🎙️ Found existing podcast item: ${item.id}, stopping incremental sync`);
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
          log.warn("🎙️ Fetched 200+ podcast items without finding existing item, stopping sync");
          break;
        }
      }

      if (allNewItems.length === 0) {
        log.info("🎙️ No new podcast items found");
        return;
      }

      log.info(`🎙️ Found ${allNewItems.length} new podcast items, upserting to database...`);

      // Upsert new items to database
      const libraryItemRows = allNewItems.map(marshalLibraryItemFromApi);
      await upsertLibraryItems(libraryItemRows);

      // Get updated items from database and update UI
      const updatedDbItems = await getLibraryItemsForList(selectedPodcastLibraryId);
      const updatedDisplayItems = transformItemsToDisplayFormat(updatedDbItems);

      set((state: PodcastSlice) => ({
        ...state,
        podcasts: {
          ...state.podcasts,
          rawItems: updatedDisplayItems,
          items: sortLibraryItems(updatedDisplayItems, state.podcasts.sortConfig),
        },
      }));

      log.info(`🎙️ Updated UI with ${allNewItems.length} new podcast items`);

      // Process full details for new items in background
      if (allNewItems.length > 0) {
        log.info("🎙️ [Background] Fetching full details for new podcast items...");
        (async () => {
          try {
            const newItemIds = allNewItems.map((item) => item.id);
            const fullItems = await fetchLibraryItemsBatch(newItemIds);
            await processFullLibraryItems(fullItems);

            // Cache covers for new items
            await cacheCoversForLibraryItems(selectedPodcastLibraryId);

            // Final UI update with full details
            const finalDbItems = await getLibraryItemsForList(selectedPodcastLibraryId);
            const finalDisplayItems = transformItemsToDisplayFormat(finalDbItems);

            set((state: PodcastSlice) => ({
              ...state,
              podcasts: {
                ...state.podcasts,
                rawItems: finalDisplayItems,
                items: sortLibraryItems(finalDisplayItems, state.podcasts.sortConfig),
              },
            }));

            log.info("🎙️ [Background] Finished processing new podcast items with full details");
          } catch (error) {
            log.error("🎙️ [Background] Failed to process new podcast items:", error as Error);
          }
        })();
      }
    } catch (error) {
      log.error("🎙️ Failed to check for new podcast items:", error as Error);
    } finally {
      // Transition back to IDLE
      set((state: PodcastSlice) => ({
        ...state,
        podcasts: {
          ...state.podcasts,
          operationState: "IDLE",
        },
      }));
    }
  },

  /**
   * Update sort configuration and persist to storage
   */
  setPodcastSortConfig: async (config: SortConfig) => {
    log.info("🎙️ Setting podcast sort config:", config);

    set((state: PodcastSlice) => ({
      ...state,
      podcasts: {
        ...state.podcasts,
        sortConfig: config,
        items: sortLibraryItems(state.podcasts.rawItems, config),
      },
    }));

    try {
      await AsyncStorage.setItem(PODCAST_STORAGE_KEYS.podcastSortConfig, JSON.stringify(config));
    } catch (error) {
      log.error("🎙️ Failed to save podcast sort config:", error);
    }
  },

  /**
   * Reset the slice to initial state
   */
  resetPodcasts: () => {
    log.info("🎙️ Resetting podcast slice to initial state");
    set((state: PodcastSlice) => ({
      ...state,
      ...initialPodcastState,
    }));
  },

  /**
   * Load data from AsyncStorage
   */
  _loadPodcastSettingsFromStorage: async () => {
    try {
      log.info("🎙️ Loading podcast settings from storage...");

      const [storedPodcastLibraryId, storedSortConfig] = await Promise.all([
        AsyncStorage.getItem(PODCAST_STORAGE_KEYS.selectedPodcastLibraryId),
        AsyncStorage.getItem(PODCAST_STORAGE_KEYS.podcastSortConfig),
      ]);

      const updates: Partial<PodcastSliceState["podcasts"]> = {};

      if (storedPodcastLibraryId) {
        updates.selectedPodcastLibraryId = storedPodcastLibraryId;
        log.info("🎙️ Loaded selected podcast library ID from storage:", storedPodcastLibraryId);
      }

      if (storedSortConfig) {
        try {
          const parsedSortConfig = JSON.parse(storedSortConfig) as SortConfig;
          updates.sortConfig = parsedSortConfig;
          log.info("🎙️ Loaded podcast sort config from storage:", parsedSortConfig);
        } catch (parseError) {
          log.error("🎙️ Failed to parse stored podcast sort config:", parseError);
        }
      }

      if (Object.keys(updates).length > 0) {
        set((state: PodcastSlice) => ({
          ...state,
          podcasts: { ...state.podcasts, ...updates },
        }));
      }
    } catch (error) {
      log.error("🎙️ Failed to load podcast settings from storage:", error);
    }
  },

  /**
   * Update readiness state based on API and DB availability
   * Handles state transitions: UNINITIALIZED/INITIALIZING/NOT_READY → READY
   */
  _updatePodcastReadiness: (apiConfigured: boolean, dbInitialized: boolean) => {
    const state = get();
    const wasReady = isReady(state);
    const shouldBeReady = apiConfigured && dbInitialized;

    log.info(
      `🎙️ Updating podcast readiness: api=${apiConfigured}, db=${dbInitialized}, shouldBeReady=${shouldBeReady}`
    );

    // Determine new readiness state
    let newReadinessState: ReadinessState = state.podcasts.readinessState;

    if (shouldBeReady) {
      newReadinessState = "READY";
    } else if (state.podcasts.readinessState === "INITIALIZING") {
      // If we're initializing and not ready, go to NOT_READY
      newReadinessState = "NOT_READY";
    }

    // Update state
    set((state: PodcastSlice) => ({
      ...state,
      podcasts: { ...state.podcasts, readinessState: newReadinessState },
    }));

    // Trigger side effects on transition to READY
    if (!wasReady && newReadinessState === "READY") {
      log.info("🎙️ Transitioned to READY state, triggering side effects...");
      get()._onPodcastTransitionToReady();
    }
  },

  /**
   * Handle side effects when transitioning to READY state
   * This is called once per app lifecycle when the slice becomes ready
   */
  _onPodcastTransitionToReady: async () => {
    const state = get();
    let { selectedPodcastLibraryId, rawItems, podcastLibraries } = state.podcasts;

    log.info(
      `🎙️ _onPodcastTransitionToReady: selectedPodcastLibraryId=${selectedPodcastLibraryId}, itemCount=${rawItems.length}, libraryCount=${podcastLibraries.length}`
    );

    // Step 1: If no podcast libraries cached, fetch them from API
    if (podcastLibraries.length === 0) {
      log.info("🎙️ No podcast libraries cached, fetching from API...");
      podcastLibraries = await get()._refetchPodcastLibraries();

      // Refresh state after fetching libraries
      const updatedState = get();
      selectedPodcastLibraryId = updatedState.podcasts.selectedPodcastLibraryId;
      rawItems = updatedState.podcasts.rawItems;
    }

    // Step 2: If we have podcast libraries but none selected, auto-select the first by display order
    if (!selectedPodcastLibraryId && podcastLibraries.length > 0) {
      const sortedLibraries = [...podcastLibraries].sort((a, b) => {
        const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
      selectedPodcastLibraryId = sortedLibraries[0].id;
      log.info(
        `🎙️ Auto-selecting first podcast library by display order: ${sortedLibraries[0].name} (id=${selectedPodcastLibraryId})`
      );

      // For first-time setup, force full API fetch to populate the library
      await get().selectPodcastLibrary(selectedPodcastLibraryId, true);
      return; // selectPodcastLibrary with fetchFromApi=true will handle the full refresh
    }

    // Step 3: If still no podcast library selected (e.g., no libraries exist), skip
    if (!selectedPodcastLibraryId) {
      log.info("🎙️ No podcast library available, skipping auto-refresh/sync");
      return;
    }

    // Step 4: Trigger refresh or incremental sync based on item count
    if (rawItems.length === 0) {
      log.info("🎙️ Podcast library is empty, triggering auto-refresh...");
      get().refreshPodcasts();
    } else {
      log.info("🎙️ Podcast library has items, checking for new items...");
      get()._checkForNewPodcastItems();
    }
  },
});
