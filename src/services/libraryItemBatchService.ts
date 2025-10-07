import { processFullLibraryItems } from '@/db/helpers/fullLibraryItems';
import { getLibraryItemsNeedingRefresh } from '@/db/helpers/libraryItems';
import { fetchLibraryItemsBatch } from '@/lib/api/endpoints';

export class LibraryItemBatchService {
    private static instance: LibraryItemBatchService;
    private isProcessing = false;
    private lastProcessTime = 0;
    private readonly BATCH_SIZE = 50;
    private readonly MIN_INTERVAL_MS = 60000; // 1 minute minimum between batches

    private constructor() { }

    static getInstance(): LibraryItemBatchService {
        if (!LibraryItemBatchService.instance) {
            LibraryItemBatchService.instance = new LibraryItemBatchService();
        }
        return LibraryItemBatchService.instance;
    }

    // Process items with progress first, then background queue
    async processItemsWithProgress(userId: string, itemIds: string[]): Promise<void> {
        if (itemIds.length === 0) return;

        console.log(`[LibraryItemBatchService] Processing ${itemIds.length} items with progress`);

        try {
            // Process in batches
            for (let i = 0; i < itemIds.length; i += this.BATCH_SIZE) {
                const batch = itemIds.slice(i, i + this.BATCH_SIZE);
                console.log(`[LibraryItemBatchService] Fetching batch ${i / this.BATCH_SIZE + 1}: ${batch.length} items`);

                const libraryItems = await fetchLibraryItemsBatch(batch);
                await processFullLibraryItems(libraryItems);

                // Small delay between batches to avoid overwhelming the server and keep UI responsive
                if (i + this.BATCH_SIZE < itemIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            console.error('[LibraryItemBatchService] Error processing items with progress:', error);
            throw error;
        }
    }

    // Background processing of items that need full refresh
    async processBackgroundQueue(userId: string, force: boolean = false): Promise<void> {
        // Debounce: don't run more than once per minute
        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessTime;
        if (!force && (this.isProcessing || timeSinceLastProcess < this.MIN_INTERVAL_MS)) {
            console.log(`[LibraryItemBatchService] Skipping background queue - processing=${this.isProcessing} timeSinceLastProcess=${timeSinceLastProcess} MIN_INTERVAL_MS=${this.MIN_INTERVAL_MS}`);
            return;
        }

        this.isProcessing = true;
        this.lastProcessTime = now;

        let noMedia: string[] = [];
        try {
            noMedia = await getLibraryItemsNeedingRefresh(this.BATCH_SIZE);

            if (noMedia.length === 0) {
                console.log('[LibraryItemBatchService] No items need processing');
                return;
            }

            const libraryItems = await fetchLibraryItemsBatch(noMedia);
            await processFullLibraryItems(libraryItems);

            console.log(`[LibraryItemBatchService] Successfully processed ${libraryItems.length} items in background`);
        } catch (error) {
            console.error(`[LibraryItemBatchService] Error in background queue processing ${noMedia.length}:`, error);
        } finally {
            this.isProcessing = false;
        }
    }

    // Start background processing (can be called periodically)
    startBackgroundProcessing(userId: string, force: boolean = false): void {
        // Process immediately
        this.processBackgroundQueue(userId, force).catch(console.error);

        // Set up periodic processing every 5 minutes
        setInterval(() => {
            this.processBackgroundQueue(userId).catch(console.error);
        }, 300000); // 5 minutes
    }

    // Check if currently processing
    get isCurrentlyProcessing(): boolean {
        return this.isProcessing;
    }
}

// Export singleton instance
export const libraryItemBatchService = LibraryItemBatchService.getInstance();
