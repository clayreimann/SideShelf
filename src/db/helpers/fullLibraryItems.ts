import { db } from '@/db/client';
import { audioFiles } from '@/db/schema/audioFiles';
import { authors } from '@/db/schema/authors';
import { chapters } from '@/db/schema/chapters';
import { libraryFiles } from '@/db/schema/libraryFiles';
import { libraryItems } from '@/db/schema/libraryItems';
import { mediaAuthors, mediaSeries } from '@/db/schema/mediaJoins';
import { mediaMetadata } from '@/db/schema/mediaMetadata';
import { series } from '@/db/schema/series';
import type { Series as ApiSeries, Author, Book, LibraryItem } from '@/lib/api/types';
import { and, eq, isNull } from 'drizzle-orm';

// Import our new helpers
import { marshalAudioFileFromApi } from './audioFiles';
import { marshalChapterFromApi, type ApiChapter } from './chapters';
import { marshalLibraryFileFromApi } from './libraryFiles';
import { marshalLibraryItemFromApi } from './libraryItems';
import { marshalBookToMediaMetadata } from './mediaMetadata';

export type NewAuthorRow = typeof authors.$inferInsert;
export type NewSeriesRow = typeof series.$inferInsert;
export type NewMediaAuthorRow = typeof mediaAuthors.$inferInsert;
export type NewMediaSeriesRow = typeof mediaSeries.$inferInsert;

// Marshal author from API to database row
export function marshalAuthorFromApi(apiAuthor: Author): NewAuthorRow {
    return {
        id: apiAuthor.id,
        name: apiAuthor.name,
        imageUrl: null, // Authors from batch API don't include imageUrl
        numBooks: null, // Authors from batch API don't include numBooks
    };
}

// Marshal series from API to database row
export function marshalSeriesFromApi(apiSeries: ApiSeries): NewSeriesRow {
    return {
        id: apiSeries.id,
        name: apiSeries.name,
        description: null, // Series from batch API don't include description
        addedAt: null,
        updatedAt: null,
    };
}

// Process a full library item from batch API response
export async function processFullLibraryItem(apiItem: LibraryItem): Promise<void> {
    // console.log(`[fullLibraryItems] Processing library item:`);

    // Break up processing into smaller transactions to avoid blocking UI
    // Transaction 1: Library item and media metadata
    let mediaRow: any = null;
    await db.transaction(async (tx) => {
        // 1. Upsert the library item
        const libraryItemRow = marshalLibraryItemFromApi(apiItem);
        await tx.insert(libraryItems).values(libraryItemRow)
            .onConflictDoUpdate({
                target: libraryItems.id,
                set: libraryItemRow,
            });

        // 2. Process media metadata
        if (apiItem.mediaType === 'book' && apiItem.media) {
            const book = apiItem.media as Book;
            mediaRow = marshalBookToMediaMetadata(book);

            await tx.insert(mediaMetadata).values(mediaRow)
                .onConflictDoUpdate({
                    target: mediaMetadata.id,
                    set: mediaRow,
                });
        }
    });

    // Yield to event loop after first transaction
    await yieldToEventLoop();

    // Transaction 2: Authors and Series (if we have media)
    if (apiItem.mediaType === 'book' && apiItem.media && mediaRow) {
        const book = apiItem.media as Book;

        await db.transaction(async (tx) => {
            // 3. Process authors (batch insert for better performance)
            if (book.metadata.authors && book.metadata.authors.length > 0) {

                // Batch process authors
                const authorRows = book.metadata.authors.map(apiAuthor => marshalAuthorFromApi(apiAuthor));
                const mediaAuthorRows: NewMediaAuthorRow[] = book.metadata.authors.map(apiAuthor => ({
                    mediaId: mediaRow.id,
                    authorId: apiAuthor.id,
                }));

                // Insert authors in batch
                for (const authorRow of authorRows) {
                    await tx.insert(authors).values(authorRow)
                        .onConflictDoUpdate({
                            target: authors.id,
                            set: { name: authorRow.name },
                        });
                }

                // Insert media-author relationships in batch
                for (const mediaAuthorRow of mediaAuthorRows) {
                    await tx.insert(mediaAuthors).values(mediaAuthorRow).onConflictDoNothing();
                }
            }

            // 4. Process series (batch insert for better performance)
            if (book.metadata.series && book.metadata.series.length > 0) {

                // Batch process series
                const seriesRows = book.metadata.series.map(apiSeriesItem => marshalSeriesFromApi(apiSeriesItem));
                const mediaSeriesRows: NewMediaSeriesRow[] = book.metadata.series.map(apiSeriesItem => ({
                    mediaId: mediaRow.id,
                    seriesId: apiSeriesItem.id,
                    sequence: apiSeriesItem.sequence,
                }));

                // Insert series in batch
                for (const seriesRow of seriesRows) {
                    await tx.insert(series).values(seriesRow)
                        .onConflictDoUpdate({
                            target: series.id,
                            set: { name: seriesRow.name },
                        });
                }

                // Insert media-series relationships in batch
                for (const mediaSeriesRow of mediaSeriesRows) {
                    await tx.insert(mediaSeries).values(mediaSeriesRow)
                        .onConflictDoUpdate({
                            target: [mediaSeries.mediaId, mediaSeries.seriesId],
                            set: { sequence: mediaSeriesRow.sequence },
                        });
                }
            }
        });

        // Yield to event loop after second transaction
        await yieldToEventLoop();

        // Transaction 3: Audio files and chapters
        await db.transaction(async (tx) => {
            // 5. Process audio files
            if (book.audioFiles && book.audioFiles.length > 0) {
                const audioFileRows = book.audioFiles.map(af => marshalAudioFileFromApi(mediaRow.id, af));
                for (const audioFileRow of audioFileRows) {
                    await tx.insert(audioFiles).values(audioFileRow)
                        .onConflictDoUpdate({
                            target: audioFiles.id,
                            set: audioFileRow,
                        });
                }
            }

            // 6. Process chapters
            if (book.chapters && book.chapters.length > 0) {
                const chapterRows = book.chapters.map(ch => marshalChapterFromApi(mediaRow.id, ch as ApiChapter));
                for (const chapterRow of chapterRows) {
                    await tx.insert(chapters).values(chapterRow)
                        .onConflictDoUpdate({
                            target: chapters.id,
                            set: chapterRow,
                        });
                }
            }
        });
    }

    // Yield to event loop before final transaction
    await yieldToEventLoop();

    // Transaction 4: Library files
    if (apiItem.libraryFiles && apiItem.libraryFiles.length > 0) {
        const libraryFileRows = apiItem.libraryFiles.map(lf => marshalLibraryFileFromApi(apiItem.id, lf));

        await db.transaction(async (tx) => {
            for (const libraryFileRow of libraryFileRows) {
                await tx.insert(libraryFiles).values(libraryFileRow)
                    .onConflictDoUpdate({
                        target: libraryFiles.id,
                        set: libraryFileRow,
                    });
            }
        });
    }
}

// Utility function to yield control back to the event loop
function yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

// Process multiple full library items from batch API response
export async function processFullLibraryItems(apiItems: LibraryItem[]): Promise<void> {
    console.log(`[fullLibraryItems] Processing ${apiItems.length} full library items`);

    for (let i = 0; i < apiItems.length; i++) {
        const apiItem = apiItems[i];
        try {
            await processFullLibraryItem(apiItem);
            console.log(`[fullLibraryItems] Processed item: ${apiItem.id} (${i + 1}/${apiItems.length})`);

            // Yield control back to the event loop every few items to keep UI responsive
            if ((i + 1) % 3 === 0) {
                await yieldToEventLoop();
            }
        } catch (error) {
            console.error(`[fullLibraryItems] Failed to process item ${apiItem.id}:`, error);
            return
        }
    }

    console.log(`[fullLibraryItems] Finished processing ${apiItems.length} items`);
}

// Get library items that need full data refresh (have basic metadata but missing audio files/chapters)
export async function getLibraryItemsNeedingFullRefresh(limit: number = 50): Promise<string[]> {
    const items = await db
        .select({ id: libraryItems.id })
        .from(libraryItems)
        .innerJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
        .leftJoin(audioFiles, eq(mediaMetadata.id, audioFiles.mediaId))
        .where(and(
            eq(libraryItems.mediaType, 'book'),
            isNull(audioFiles.id) // No audio files exist for this item
        ))
        .limit(limit);

    return items.map(item => item.id);
}

// Check if a library item has been fully processed (has audio files and chapters)
export async function isLibraryItemFullyProcessed(libraryItemId: string): Promise<boolean> {
    const results = await db
        .select()
        .from(mediaMetadata)
        .where(eq(mediaMetadata.libraryItemId, libraryItemId))
        .limit(1);
    const mediaItem = results[0];

    if (!mediaItem) return false;

    const audioFileCount = await db.$count(audioFiles, eq(audioFiles.mediaId, mediaItem.id));
    return audioFileCount > 0;
}
