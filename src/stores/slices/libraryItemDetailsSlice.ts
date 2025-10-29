/**
 * LibraryItemDetails slice for Zustand store
 *
 * This slice manages detailed library item data with caching including:
 * - Item metadata (title, author, description, etc.)
 * - Genres and tags
 * - Chapters
 * - Audio files with download status
 * - User progress
 * - LRU cache management
 */

import { ChapterRow, getChaptersForMedia } from '@/db/helpers/chapters';
import {
    AudioFileWithDownloadInfo,
    getAudioFilesWithDownloadInfo
} from '@/db/helpers/combinedQueries';
import { processFullLibraryItems } from '@/db/helpers/fullLibraryItems';
import { getLibraryItemById } from '@/db/helpers/libraryItems';
import { getMediaGenres, getMediaTags } from '@/db/helpers/mediaJoins';
import {
    cacheCoverAndUpdateMetadata,
    getMediaMetadataByLibraryItemId
} from '@/db/helpers/mediaMetadata';
import {
    getMediaProgressForLibraryItem,
    MediaProgressRow
} from '@/db/helpers/mediaProgress';
import { LibraryItemRow } from '@/db/schema/libraryItems';
import { MediaMetadataRow } from '@/db/schema/mediaMetadata';
import { fetchLibraryItemsBatch } from '@/lib/api/endpoints';
import { logger } from '@/lib/logger';
import type { SliceCreator } from '@/types/store';

// Create cached sublogger for this slice
const log = logger.forTag('LibraryItemDetailsSlice');

/**
 * Cached item details with all relations
 */
export interface CachedItemDetails {
    /** Library item basic data */
    item: LibraryItemRow;
    /** Media metadata (title, author, description, etc.) */
    metadata: MediaMetadataRow | null;
    /** Genre list */
    genres: string[];
    /** Tag list */
    tags: string[];
    /** Chapter list */
    chapters: ChapterRow[];
    /** Audio files with download information */
    audioFiles: AudioFileWithDownloadInfo[];
    /** User progress data */
    progress: MediaProgressRow | null;
    /** Timestamp when data was last updated */
    lastUpdated: number;
    /** Number of times this item has been accessed (for LRU) */
    accessCount: number;
}

/**
 * LibraryItemDetails slice state interface - scoped under 'itemDetails' to avoid conflicts
 */
export interface LibraryItemDetailsSliceState {
    itemDetails: {
        /** Cache of item details by itemId */
        itemsCache: Record<string, CachedItemDetails>;
        /** Loading state for each item */
        loading: Record<string, boolean>;
        /** Whether the slice has been initialized */
        initialized: boolean;
        /** Maximum number of items to keep in cache */
        maxCacheSize: number;
    };
}

/**
 * LibraryItemDetails slice actions interface
 */
export interface LibraryItemDetailsSliceActions {
    // Public methods
    /** Fetch and cache item details */
    fetchItemDetails: (itemId: string, userId?: string) => Promise<CachedItemDetails>;
    /** Force refresh item details (bypass cache) */
    refreshItemDetails: (itemId: string, userId?: string) => Promise<CachedItemDetails>;
    /** Update only the progress for an item */
    updateItemProgress: (itemId: string, progress: MediaProgressRow) => void;
    /** Invalidate (remove) an item from cache */
    invalidateItem: (itemId: string) => void;
    /** Clear old cache entries based on LRU */
    clearOldCache: () => void;
    /** Reset the slice to initial state */
    resetItemDetails: () => void;
    /** Get cached item if available */
    getCachedItem: (itemId: string) => CachedItemDetails | null;

    // Internal actions
    /** Fetch item data from database */
    _fetchItemData: (itemId: string, userId?: string) => Promise<CachedItemDetails>;
    /** Enhance item data in background (cover cache, full API fetch) */
    _enhanceItemData: (itemId: string) => Promise<void>;
}

/**
 * Combined LibraryItemDetails slice interface
 */
export interface LibraryItemDetailsSlice extends LibraryItemDetailsSliceState, LibraryItemDetailsSliceActions { }

/**
 * Initial state
 */
const initialState: LibraryItemDetailsSliceState = {
    itemDetails: {
        itemsCache: {},
        loading: {},
        initialized: false,
        maxCacheSize: 20,
    },
};

/**
 * Cache validity duration (10 minutes)
 */
const CACHE_VALID_DURATION = 10 * 60 * 1000;

/**
 * Create the LibraryItemDetails slice
 */
export const createLibraryItemDetailsSlice: SliceCreator<LibraryItemDetailsSlice> = (set, get) => ({
    // Initial state
    ...initialState,

    /**
     * Fetch and cache item details
     */
    fetchItemDetails: async (itemId: string, userId?: string) => {
        const state = get();

        // Check if item is in cache and still valid
        const cached = state.itemDetails.itemsCache[itemId];
        if (cached && Date.now() - cached.lastUpdated < CACHE_VALID_DURATION) {
            log.debug(`Item ${itemId} found in cache and valid`);

            // Update access count for LRU
            set((state: LibraryItemDetailsSlice) => ({
                ...state,
                itemDetails: {
                    ...state.itemDetails,
                    itemsCache: {
                        ...state.itemDetails.itemsCache,
                        [itemId]: {
                            ...cached,
                            accessCount: cached.accessCount + 1,
                        },
                    },
                },
            }));

            // Trigger background enhancement
            get()._enhanceItemData(itemId).catch((error: unknown) => {
                log.error(`Background enhancement failed for ${itemId}`, error as Error);
            });

            return cached;
        }

        // Check if already loading
        if (state.itemDetails.loading[itemId]) {
            log.debug(`Item ${itemId} already loading, waiting...`);
            // Wait for the current fetch to complete
            return new Promise<CachedItemDetails>((resolve, reject) => {
                const checkInterval = setInterval(() => {
                    const currentState = get();
                    if (!currentState.itemDetails.loading[itemId]) {
                        clearInterval(checkInterval);
                        const item = currentState.itemDetails.itemsCache[itemId];
                        if (item) {
                            resolve(item);
                        } else {
                            reject(new Error('Item fetch failed'));
                        }
                    }
                }, 100);
            });
        }

        log.info(`Fetching item details for ${itemId}...`);

        // Set loading state
        set((state: LibraryItemDetailsSlice) => ({
            ...state,
            itemDetails: {
                ...state.itemDetails,
                loading: {
                    ...state.itemDetails.loading,
                    [itemId]: true,
                },
            },
        }));

        try {
            // Fetch item data
            const itemData = await get()._fetchItemData(itemId, userId);

            // Clear old cache if needed
            get().clearOldCache();

            // Update cache
            set((state: LibraryItemDetailsSlice) => ({
                ...state,
                itemDetails: {
                    ...state.itemDetails,
                    itemsCache: {
                        ...state.itemDetails.itemsCache,
                        [itemId]: itemData,
                    },
                    loading: {
                        ...state.itemDetails.loading,
                        [itemId]: false,
                    },
                    initialized: true,
                },
            }));

            // Trigger background enhancement
            get()._enhanceItemData(itemId).catch((error: unknown) => {
                log.error(`Background enhancement failed for ${itemId}`, error as Error);
            });

            log.info(`Item details cached for ${itemId}`);
            return itemData;
        } catch (error) {
            log.error(`Failed to fetch item details for ${itemId}`, error as Error);

            // Clear loading state
            set((state: LibraryItemDetailsSlice) => ({
                ...state,
                itemDetails: {
                    ...state.itemDetails,
                    loading: {
                        ...state.itemDetails.loading,
                        [itemId]: false,
                    },
                },
            }));

            throw error;
        }
    },

    /**
     * Force refresh item details (bypass cache)
     */
    refreshItemDetails: async (itemId: string, userId?: string) => {
        log.info(`Force refreshing item details for ${itemId}...`);

        // Invalidate cache first
        get().invalidateItem(itemId);

        // Fetch fresh data
        return get().fetchItemDetails(itemId, userId);
    },

    /**
     * Update only the progress for an item
     */
    updateItemProgress: (itemId: string, progress: MediaProgressRow) => {
        const state = get();
        const cached = state.itemDetails.itemsCache[itemId];

        if (!cached) {
            log.debug(`Cannot update progress for ${itemId} - not in cache`);
            return;
        }

        log.debug(`Updating progress for ${itemId}`);

        set((state: LibraryItemDetailsSlice) => ({
            ...state,
            itemDetails: {
                ...state.itemDetails,
                itemsCache: {
                    ...state.itemDetails.itemsCache,
                    [itemId]: {
                        ...cached,
                        progress,
                        lastUpdated: Date.now(),
                    },
                },
            },
        }));
    },

    /**
     * Invalidate (remove) an item from cache
     */
    invalidateItem: (itemId: string) => {
        log.info(`Invalidating cache for ${itemId}`);

        set((state: LibraryItemDetailsSlice) => {
            const newCache = { ...state.itemDetails.itemsCache };
            delete newCache[itemId];

            return {
                ...state,
                itemDetails: {
                    ...state.itemDetails,
                    itemsCache: newCache,
                },
            };
        });
    },

    /**
     * Clear old cache entries based on LRU
     */
    clearOldCache: () => {
        const state = get();
        const cacheSize = Object.keys(state.itemDetails.itemsCache).length;

        if (cacheSize <= state.itemDetails.maxCacheSize) {
            return;
        }

        log.info(`Cache size ${cacheSize} exceeds max ${state.itemDetails.maxCacheSize}, clearing old entries...`);

        // Sort items by access count (LRU)
        const sortedItems = Object.entries(state.itemDetails.itemsCache)
            .sort(([, a], [, b]) => (a as CachedItemDetails).accessCount - (b as CachedItemDetails).accessCount);

        // Keep only the most recently accessed items
        const itemsToKeep = sortedItems.slice(-state.itemDetails.maxCacheSize);
        const newCache: Record<string, CachedItemDetails> = {};

        for (const [itemId, data] of itemsToKeep) {
            newCache[itemId] = data as CachedItemDetails;
        }

        set((state: LibraryItemDetailsSlice) => ({
            ...state,
            itemDetails: {
                ...state.itemDetails,
                itemsCache: newCache,
            },
        }));

        log.info(`Cleared ${cacheSize - itemsToKeep.length} old cache entries`);
    },

    /**
     * Reset the slice to initial state
     */
    resetItemDetails: () => {
        log.info('Resetting library item details slice');
        set((state: LibraryItemDetailsSlice) => ({
            ...state,
            itemDetails: initialState.itemDetails,
        }));
    },

    /**
     * Get cached item if available
     */
    getCachedItem: (itemId: string) => {
        const state = get();
        return state.itemDetails.itemsCache[itemId] || null;
    },

    /**
     * Fetch item data from database
     */
    _fetchItemData: async (itemId: string, userId?: string) => {
        // Fetch basic item and metadata
        const item = await getLibraryItemById(itemId);
        if (!item) {
            throw new Error(`Library item ${itemId} not found`);
        }

        const metadata = await getMediaMetadataByLibraryItemId(item.id);

        // Fetch all related data in parallel
        const [genres, tags, chapters, audioFiles, progress] = await Promise.all([
            metadata ? getMediaGenres(metadata.id) : [],
            metadata ? getMediaTags(metadata.id) : [],
            metadata ? getChaptersForMedia(metadata.id) : [],
            metadata ? getAudioFilesWithDownloadInfo(metadata.id) : [],
            userId ? getMediaProgressForLibraryItem(item.id, userId) : null,
        ]);

        return {
            item,
            metadata,
            genres,
            tags,
            chapters,
            audioFiles,
            progress,
            lastUpdated: Date.now(),
            accessCount: 1,
        };
    },

    /**
     * Enhance item data in background (cover cache, full API fetch)
     */
    _enhanceItemData: async (itemId: string) => {
        log.debug(`Enhancing item data for ${itemId} in background...`);

        try {
            // Cache cover in background
            const wasDownloaded = await cacheCoverAndUpdateMetadata(itemId);

            if (wasDownloaded) {
                log.debug(`Cover downloaded for ${itemId}, refreshing metadata`);
                const updatedMetadata = await getMediaMetadataByLibraryItemId(itemId);

                // Update only metadata in cache
                set((state: LibraryItemDetailsSlice) => {
                    const cached = state.itemDetails.itemsCache[itemId];
                    if (!cached) return state;

                    return {
                        ...state,
                        itemDetails: {
                            ...state.itemDetails,
                            itemsCache: {
                                ...state.itemDetails.itemsCache,
                                [itemId]: {
                                    ...cached,
                                    metadata: updatedMetadata,
                                },
                            },
                        },
                    };
                });
            }

            // Fetch full item data from API to ensure all relations are populated
            const libraryItems = await fetchLibraryItemsBatch([itemId]);
            if (libraryItems.length > 0) {
                log.debug(`Fetched full item data for ${itemId}, processing...`);
                await processFullLibraryItems(libraryItems);

                // Refresh chapters and audio files after processing
                const state = get();
                const cached = state.itemDetails.itemsCache[itemId];

                if (cached && cached.metadata) {
                    const [newChapters, newAudioFiles] = await Promise.all([
                        getChaptersForMedia(cached.metadata.id),
                        getAudioFilesWithDownloadInfo(cached.metadata.id),
                    ]);

                    set((state: LibraryItemDetailsSlice) => ({
                        ...state,
                        itemDetails: {
                            ...state.itemDetails,
                            itemsCache: {
                                ...state.itemDetails.itemsCache,
                                [itemId]: {
                                    ...cached,
                                    chapters: newChapters,
                                    audioFiles: newAudioFiles,
                                },
                            },
                        },
                    }));

                    log.debug(`Enhanced data for ${itemId} updated in cache`);
                }
            }
        } catch (error) {
            // Don't throw, this is a background enhancement
            log.error(`Background enhancement failed for ${itemId}`, error as Error);
        }
    },
});
