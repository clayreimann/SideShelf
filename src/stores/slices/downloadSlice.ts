/**
 * Download slice for Zustand store
 *
 * This slice manages download state across the app including:
 * - Active downloads with progress
 * - Downloaded items tracking
 * - Download subscriptions
 * - Centralized download management
 */

import { db } from "@/db/client";
import { audioFiles } from "@/db/schema/audioFiles";
import { libraryItems } from "@/db/schema/libraryItems";
import { localAudioFileDownloads } from "@/db/schema/localData";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { logger } from "@/lib/logger";
import { downloadService, type DownloadProgress } from "@/services/DownloadService";
import { and, eq } from "drizzle-orm";
import type { SliceCreator } from "@/types/store";

// Create cached sublogger for this slice
const log = logger.forTag("DownloadSlice");

/**
 * Download slice state interface - scoped under 'downloads' to avoid conflicts
 */
export interface DownloadSliceState {
  downloads: {
    /** Map of active downloads by library item ID */
    activeDownloads: Record<string, DownloadProgress>;
    /** Set of downloaded item IDs (completed downloads) */
    downloadedItems: Set<string>;
    /** Whether the slice has been initialized */
    initialized: boolean;
    /** Whether downloads are being loaded/checked */
    isLoading: boolean;
  };
}

/**
 * Download slice actions interface
 */
export interface DownloadSliceActions {
  // Public methods
  /** Initialize the slice by checking download states */
  initializeDownloads: () => Promise<void>;
  /** Start a download for an item */
  startDownload: (itemId: string, serverUrl: string, accessToken: string) => Promise<void>;
  /** Update download progress for an item */
  updateDownloadProgress: (itemId: string, progress: DownloadProgress) => void;
  /** Mark download as completed */
  completeDownload: (itemId: string) => void;
  /** Remove download from active list (cancelled/error) */
  removeActiveDownload: (itemId: string) => void;
  /** Delete a downloaded item */
  deleteDownload: (itemId: string) => Promise<void>;
  /** Check if item is downloaded */
  isItemDownloaded: (itemId: string) => boolean;
  /** Get download progress for item */
  getDownloadProgress: (itemId: string) => DownloadProgress | null;
  /** Reset the slice to initial state */
  resetDownloads: () => void;
}

/**
 * Combined Download slice interface
 */
export interface DownloadSlice extends DownloadSliceState, DownloadSliceActions {}

/**
 * Initial state
 */
const initialState: DownloadSliceState = {
  downloads: {
    activeDownloads: {},
    downloadedItems: new Set(),
    initialized: false,
    isLoading: false,
  },
};

/**
 * Create the Download slice
 */
export const createDownloadSlice: SliceCreator<DownloadSlice> = (set, get) => ({
  // Initial state
  ...initialState,

  /**
   * Initialize the slice by checking download states
   */
  initializeDownloads: async () => {
    const state = get();

    if (state.downloads.initialized) {
      log.debug("Downloads already initialized, skipping");
      return;
    }

    log.info("Initializing downloads slice...");

    set((state: DownloadSlice) => ({
      ...state,
      downloads: {
        ...state.downloads,
        isLoading: true,
      },
    }));

    try {
      // Ensure download service is initialized
      await downloadService.initialize();

      // Load list of downloaded items from database
      // Query for library items that have at least one downloaded audio file
      const candidateItems = await db
        .selectDistinct({
          libraryItemId: libraryItems.id,
        })
        .from(libraryItems)
        .innerJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
        .innerJoin(audioFiles, eq(mediaMetadata.id, audioFiles.mediaId))
        .innerJoin(localAudioFileDownloads, eq(audioFiles.id, localAudioFileDownloads.audioFileId))
        .where(and(eq(localAudioFileDownloads.isDownloaded, true)));

      const candidateItemIds = candidateItems.map((item) => item.libraryItemId);
      log.info(`Found ${candidateItemIds.length} candidate items with downloaded files`);

      // Verify each item is fully downloaded (check if ALL audio files are downloaded)
      // Do this in batches to avoid blocking
      const downloadedItemIds = new Set<string>();
      const partiallyDownloadedItems: string[] = [];
      const batchSize = 10;

      for (let i = 0; i < candidateItemIds.length; i += batchSize) {
        const batch = candidateItemIds.slice(i, i + batchSize);
        log.info(
          `Verifying batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(candidateItemIds.length / batchSize)}...`
        );

        const checkPromises = batch.map(async (itemId) => {
          try {
            const isDownloaded = await downloadService.isLibraryItemDownloaded(itemId);
            if (!isDownloaded && candidateItemIds.includes(itemId)) {
              // Item has some downloaded files but not all
              partiallyDownloadedItems.push(itemId);
            }
            return isDownloaded ? itemId : null;
          } catch (error) {
            log.error(`Error checking download status for ${itemId}`, error as Error);
            return null;
          }
        });

        const results = await Promise.all(checkPromises);
        results.forEach((itemId) => {
          if (itemId) {
            downloadedItemIds.add(itemId);
          }
        });
      }

      log.info(`Verified ${downloadedItemIds.size} fully downloaded items`);
      if (partiallyDownloadedItems.length > 0) {
        log.warn(
          `Found ${partiallyDownloadedItems.length} partially downloaded items (some files missing from disk):`,
          partiallyDownloadedItems
        );
      }

      set((state: DownloadSlice) => ({
        ...state,
        downloads: {
          ...state.downloads,
          downloadedItems: downloadedItemIds,
          initialized: true,
          isLoading: false,
        },
      }));

      log.info("Downloads slice initialized successfully");
    } catch (error) {
      log.error("Failed to initialize downloads slice", error as Error);

      set((state: DownloadSlice) => ({
        ...state,
        downloads: {
          ...state.downloads,
          isLoading: false,
        },
      }));

      throw error;
    }
  },

  /**
   * Start a download for an item
   */
  startDownload: async (itemId: string, serverUrl: string, accessToken: string) => {
    log.info(`[DownloadSlice] Starting download for ${itemId}...`, {
      hasServerUrl: !!serverUrl,
      hasAccessToken: !!accessToken,
    });

    try {
      // Start the download with a progress callback that handles all states
      await downloadService.startDownload(itemId, serverUrl, accessToken, (progress) => {
        log.info(`[DownloadSlice] Progress update for ${itemId}:`, {
          status: progress.status,
          totalProgress: progress.totalProgress,
          downloadedFiles: progress.downloadedFiles,
          totalFiles: progress.totalFiles,
        });

        // Update progress in store
        get().updateDownloadProgress(itemId, progress);

        // Handle completion
        if (progress.status === "completed") {
          log.info(`[DownloadSlice] Download completed for ${itemId}`);
          get().completeDownload(itemId);
        } else if (progress.status === "error" || progress.status === "cancelled") {
          log.warn(`[DownloadSlice] Download ${progress.status} for ${itemId}`);
          get().removeActiveDownload(itemId);
        }
      });

      log.info(`[DownloadSlice] Download started successfully for ${itemId}`);
    } catch (error) {
      log.error(`[DownloadSlice] Failed to start download for ${itemId}`, error as Error);
      throw error;
    }
  },

  /**
   * Update download progress for an item
   */
  updateDownloadProgress: (itemId: string, progress: DownloadProgress) => {
    set((state: DownloadSlice) => ({
      ...state,
      downloads: {
        ...state.downloads,
        activeDownloads: {
          ...state.downloads.activeDownloads,
          [itemId]: progress,
        },
      },
    }));
  },

  /**
   * Mark download as completed
   */
  completeDownload: (itemId: string) => {
    log.info(`Download completed for ${itemId}`);

    set((state: DownloadSlice) => {
      const newActiveDownloads = { ...state.downloads.activeDownloads };
      delete newActiveDownloads[itemId];

      const newDownloadedItems = new Set(state.downloads.downloadedItems);
      newDownloadedItems.add(itemId);

      return {
        ...state,
        downloads: {
          ...state.downloads,
          activeDownloads: newActiveDownloads,
          downloadedItems: newDownloadedItems,
        },
      };
    });
  },

  /**
   * Remove download from active list (cancelled/error)
   */
  removeActiveDownload: (itemId: string) => {
    log.info(`Removing active download for ${itemId}`);

    set((state: DownloadSlice) => {
      const newActiveDownloads = { ...state.downloads.activeDownloads };
      delete newActiveDownloads[itemId];

      return {
        ...state,
        downloads: {
          ...state.downloads,
          activeDownloads: newActiveDownloads,
        },
      };
    });
  },

  /**
   * Delete a downloaded item
   */
  deleteDownload: async (itemId: string) => {
    log.info(`Deleting download for ${itemId}...`);

    try {
      await downloadService.deleteDownloadedLibraryItem(itemId);

      set((state: DownloadSlice) => {
        const newDownloadedItems = new Set(state.downloads.downloadedItems);
        newDownloadedItems.delete(itemId);

        return {
          ...state,
          downloads: {
            ...state.downloads,
            downloadedItems: newDownloadedItems,
          },
        };
      });

      log.info(`Download deleted for ${itemId}`);
    } catch (error) {
      log.error(`Failed to delete download for ${itemId}`, error as Error);
      throw error;
    }
  },

  /**
   * Check if item is downloaded
   *
   * First checks the Set (populated on initialization).
   * If not found and store is initialized, returns false (item was checked and not downloaded).
   * If store not initialized yet, can return false - will be checked during initialization.
   */
  isItemDownloaded: (itemId: string) => {
    const state = get();
    return state.downloads.downloadedItems.has(itemId);
  },

  /**
   * Get download progress for item
   */
  getDownloadProgress: (itemId: string) => {
    const state = get();
    return state.downloads.activeDownloads[itemId] || null;
  },

  /**
   * Reset the slice to initial state
   */
  resetDownloads: () => {
    log.info("Resetting downloads slice");
    set((state: DownloadSlice) => ({
      ...state,
      downloads: initialState.downloads,
    }));
  },
});
