import { db } from '@/db/client';
import { audioFiles } from '@/db/schema/audioFiles';
import { libraryItems } from '@/db/schema/libraryItems';
import { mediaMetadata } from '@/db/schema/mediaMetadata';
import { mediaProgress } from '@/db/schema/mediaProgress';
import { and, desc, eq, gt, inArray, not } from 'drizzle-orm';

export interface HomeScreenItem {
    id: string;
    title: string;
    subtitle?: string;
    authorName?: string;
    seriesName?: string;
    imageUrl?: string;
    progress?: number;
    currentTime?: number;
    duration?: number;
    isFinished?: boolean;
    lastUpdate?: Date;
    isDownloaded?: boolean;
}

// Get items with in-progress media progress (Continue Listening)
export async function getContinueListeningItems(userId: string, limit: number = 20): Promise<HomeScreenItem[]> {
    const items = await db
        .select({
            id: libraryItems.id,
            title: mediaMetadata.title,
            subtitle: mediaMetadata.subtitle,
            authorName: mediaMetadata.authorName,
            seriesName: mediaMetadata.seriesName,
            imageUrl: mediaMetadata.imageUrl,
            progress: mediaProgress.progress,
            currentTime: mediaProgress.currentTime,
            duration: mediaMetadata.duration,
            isFinished: mediaProgress.isFinished,
            lastUpdate: mediaProgress.lastUpdate,
        })
        .from(libraryItems)
        .innerJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
        .innerJoin(mediaProgress, and(
            eq(mediaProgress.libraryItemId, libraryItems.id),
            eq(mediaProgress.userId, userId)
        ))
        .where(and(
            eq(libraryItems.mediaType, 'book'),
            eq(mediaProgress.isFinished, false),
            eq(mediaProgress.hideFromContinueListening, false),
            gt(mediaProgress.progress, 0)
        ))
        .orderBy(desc(mediaProgress.lastUpdate))
        .limit(limit);

    return items.map(item => ({
        id: item.id,
        title: item.title || 'Unknown Title',
        subtitle: item.subtitle || undefined,
        authorName: item.authorName || undefined,
        seriesName: item.seriesName || undefined,
        imageUrl: item.imageUrl || undefined,
        progress: item.progress || undefined,
        currentTime: item.currentTime || undefined,
        duration: item.duration || undefined,
        isFinished: item.isFinished || false,
        lastUpdate: item.lastUpdate || undefined,
        isDownloaded: false, // Will be updated below
    }));
}

// Get items that have been downloaded (Downloaded items)
export async function getDownloadedItems(limit: number = 20): Promise<HomeScreenItem[]> {
    const items = await db
        .select({
            id: libraryItems.id,
            title: mediaMetadata.title,
            subtitle: mediaMetadata.subtitle,
            authorName: mediaMetadata.authorName,
            seriesName: mediaMetadata.seriesName,
            imageUrl: mediaMetadata.imageUrl,
            duration: mediaMetadata.duration,
        })
        .from(libraryItems)
        .innerJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
        .innerJoin(audioFiles, eq(mediaMetadata.id, audioFiles.mediaId))
        .where(and(
            eq(libraryItems.mediaType, 'book'),
            eq(audioFiles.isDownloaded, true)
        ))
        .groupBy(libraryItems.id, mediaMetadata.title, mediaMetadata.subtitle,
            mediaMetadata.authorName, mediaMetadata.seriesName,
            mediaMetadata.imageUrl, mediaMetadata.duration)
        .orderBy(desc(libraryItems.addedAt))
        .limit(limit);

    return items.map(item => ({
        id: item.id,
        title: item.title || 'Unknown Title',
        subtitle: item.subtitle || undefined,
        authorName: item.authorName || undefined,
        seriesName: item.seriesName || undefined,
        imageUrl: item.imageUrl || undefined,
        duration: item.duration || undefined,
        isDownloaded: true,
    }));
}

// Get items with completed media progress (Listen Again)
export async function getListenAgainItems(userId: string, limit: number = 20): Promise<HomeScreenItem[]> {
    const items = await db
        .select({
            id: libraryItems.id,
            title: mediaMetadata.title,
            subtitle: mediaMetadata.subtitle,
            authorName: mediaMetadata.authorName,
            seriesName: mediaMetadata.seriesName,
            imageUrl: mediaMetadata.imageUrl,
            progress: mediaProgress.progress,
            duration: mediaMetadata.duration,
            isFinished: mediaProgress.isFinished,
            finishedAt: mediaProgress.finishedAt,
        })
        .from(libraryItems)
        .innerJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
        .innerJoin(mediaProgress, and(
            eq(mediaProgress.libraryItemId, libraryItems.id),
            eq(mediaProgress.userId, userId)
        ))
        .where(and(
            eq(libraryItems.mediaType, 'book'),
            eq(mediaProgress.isFinished, true)
        ))
        .orderBy(desc(mediaProgress.finishedAt))
        .limit(limit);

    return items.map(item => ({
        id: item.id,
        title: item.title || 'Unknown Title',
        subtitle: item.subtitle || undefined,
        authorName: item.authorName || undefined,
        seriesName: item.seriesName || undefined,
        imageUrl: item.imageUrl || undefined,
        progress: item.progress || undefined,
        duration: item.duration || undefined,
        isFinished: item.isFinished || false,
        isDownloaded: false, // Will be updated if needed
    }));
}

// Get all home screen data in one call
export async function getHomeScreenData(userId: string): Promise<{
    continueListening: HomeScreenItem[];
    downloaded: HomeScreenItem[];
    listenAgain: HomeScreenItem[];
}> {
    const [continueListening, downloaded, listenAgain] = await Promise.all([
        getContinueListeningItems(userId),
        getDownloadedItems(),
        getListenAgainItems(userId),
    ]);

    return {
        continueListening,
        downloaded,
        listenAgain,
    };
}

// Check if any items need full data refresh (they have metadata but no audio file metadata) and return their IDs
export async function getItemsWithProgressNeedingFullRefresh(userId: string, limit: number = 50): Promise<string[]> {
    // Get items with audio files
    const itemsWithAudioFiles = await db
        .select({ libraryItemId: mediaMetadata.libraryItemId })
        .from(mediaMetadata)
        .innerJoin(audioFiles, eq(mediaMetadata.id, audioFiles.mediaId))
        .where(and(
            eq(mediaMetadata.mediaType, 'book'),
        ));
    console.log(`[getItemsNeedingFullRefresh] Found ${itemsWithAudioFiles.length} items with audio files`);

    // Select a batch of library items not in the itemsWithAudioFiles array
    const itemsWithProgress = await db
        .select({ libraryItemId: mediaProgress.libraryItemId })
        .from(mediaProgress)
        .where(and(
            eq(mediaProgress.userId, userId),
            eq(mediaProgress.isFinished, false),
            eq(mediaProgress.hideFromContinueListening, false),
            not(inArray(mediaProgress.libraryItemId, itemsWithAudioFiles.map(item => item.libraryItemId)))
        ))
        .limit(limit);
    console.log(`[getItemsNeedingFullRefresh] Found ${itemsWithProgress.length} items with progress`);

    return itemsWithProgress.map(item => item.libraryItemId);
}
