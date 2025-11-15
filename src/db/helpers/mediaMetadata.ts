import { cacheCoverIfMissing, getCoverUri, isCoverCached } from "@/lib/covers";
import type { ApiBook, ApiBookMinified, ApiPodcast, ApiPodcastMinified } from "@/types/api";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { libraryItems } from "../schema/libraryItems";
import { mediaMetadata, MediaMetadataRow, NewMediaMetadataRow } from "../schema/mediaMetadata";
import { getLocalCoverUrl, setLocalCoverCached } from "./localData";

/**
 * Marshal book data from API to media metadata row
 * Accepts both full and minified API responses
 */
export function marshalBookToMediaMetadata(book: ApiBook | ApiBookMinified): NewMediaMetadataRow {
  const metadata = book.metadata;

  // Type guard to check if this is a full ApiBook (has audioFiles array)
  const isFullBook = (b: ApiBook | ApiBookMinified): b is ApiBook => "audioFiles" in b;

  return {
    id: book.id,
    libraryItemId: book.libraryItemId!,
    mediaType: "book",

    // Common fields
    title: metadata.title,
    subtitle: metadata.subtitle,
    description: metadata.description,
    language: metadata.language,
    explicit: metadata.explicit,

    // ApiBook-specific fields
    publisher: metadata.publisher,
    isbn: metadata.isbn,
    asin: metadata.asin,
    publishedYear: metadata.publishedYear,
    publishedDate: metadata.publishedDate,

    // Computed fields from API
    authorName: metadata.authorName,
    authorNameLF: metadata.authorNameLF,
    narratorName: metadata.narratorName,
    seriesName: metadata.seriesName,

    // Duration and track count: use array data if available (full response),
    // otherwise use direct fields (minified response)
    duration: isFullBook(book)
      ? book.audioFiles?.reduce((total, file) => total + (file.duration || 0), 0) || null
      : book.duration || null,
    trackCount: isFullBook(book)
      ? book.audioFiles?.length || null
      : book.numAudioFiles || book.numTracks || null,

    // Additional book fields (not in current API but in schema)
    format: null, // Could be derived from audio files
    edition: null,
    abridged: null,
    rating: null,
    ratingCount: null,
    goodreadsId: null,
    googleBooksId: null,

    // ApiPodcast fields (null for books)
    author: null,
    feedUrl: null,
    imageUrl: null, // Will be set only after successful cover caching
    itunesPageUrl: null,
    itunesId: null,
    itunesArtistId: null,
    type: null,

    // Timestamps
    addedAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Marshal podcast data from API to media metadata row
 * Accepts both full and minified API responses
 */
export function marshalPodcastToMediaMetadata(
  podcast: ApiPodcast | ApiPodcastMinified
): NewMediaMetadataRow {
  const metadata = podcast.metadata;

  // Type guard to check if this is a full ApiPodcast (has episodes array)
  const isFullPodcast = (p: ApiPodcast | ApiPodcastMinified): p is ApiPodcast => "episodes" in p;

  return {
    id: podcast.id,
    libraryItemId: podcast.libraryItemId!,
    mediaType: "podcast",

    // Common fields
    title: metadata.title,
    subtitle: null, // Podcasts don't typically have subtitles in this context
    description: metadata.description,
    language: metadata.language,
    explicit: metadata.explicit,

    // ApiPodcast-specific fields
    author: metadata.author,
    feedUrl: metadata.feedUrl,
    imageUrl: metadata.imageUrl,
    itunesPageUrl: metadata.itunesPageUrl,
    itunesId: metadata.itunesId,
    itunesArtistId: metadata.itunesArtistId,
    type: metadata.type,

    // ApiBook fields (null for podcasts)
    publisher: null,
    isbn: null,
    asin: null,
    publishedYear: null,
    publishedDate: metadata.releaseDate, // Map releaseDate to publishedDate
    // Duration and track count: use array data if available (full response),
    // otherwise use direct fields (minified response)
    duration: isFullPodcast(podcast)
      ? null // Podcast duration would be sum of episodes, but we don't calculate it
      : podcast.duration || null,
    trackCount: isFullPodcast(podcast)
      ? podcast.episodes?.length || null
      : podcast.numEpisodes || podcast.numTracks || null,
    format: null,
    edition: null,
    abridged: null,
    rating: null,
    ratingCount: null,
    goodreadsId: null,
    googleBooksId: null,

    // Computed fields (for podcasts these are simpler)
    authorName: metadata.author,
    authorNameLF: metadata.author,
    narratorName: null,
    seriesName: null,

    // Timestamps
    addedAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Upsert media metadata for a book
 */
export async function upsertBookMetadata(book: ApiBook): Promise<MediaMetadataRow> {
  const row = marshalBookToMediaMetadata(book);

  const existing = await db
    .select()
    .from(mediaMetadata)
    .where(eq(mediaMetadata.id, row.id))
    .limit(1);

  let result: MediaMetadataRow;
  if (existing.length > 0) {
    const [updated] = await db
      .update(mediaMetadata)
      .set(row)
      .where(eq(mediaMetadata.id, row.id))
      .returning();
    result = updated;
  } else {
    const [inserted] = await db.insert(mediaMetadata).values(row).returning();
    result = inserted;
  }

  // Note: Join tables (authors, series, etc.) are now populated by the batch API processing
  // in fullLibraryItems.ts, which has access to the complete data from the batch API

  return result;
}

/**
 * Upsert media metadata for a podcast
 */
export async function upsertPodcastMetadata(podcast: ApiPodcast): Promise<MediaMetadataRow> {
  const row = marshalPodcastToMediaMetadata(podcast);

  const existing = await db
    .select()
    .from(mediaMetadata)
    .where(eq(mediaMetadata.id, row.id))
    .limit(1);

  let result: MediaMetadataRow;
  if (existing.length > 0) {
    const [updated] = await db
      .update(mediaMetadata)
      .set(row)
      .where(eq(mediaMetadata.id, row.id))
      .returning();
    result = updated;
  } else {
    const [inserted] = await db.insert(mediaMetadata).values(row).returning();
    result = inserted;
  }

  // Note: Join tables are now populated by the batch API processing
  // in fullLibraryItems.ts, which has access to the complete data from the batch API

  return result;
}

/**
 * Upsert multiple book metadata records
 */
export async function upsertBooksMetadata(books: ApiBook[]): Promise<void> {
  if (!books?.length) return;

  for (const book of books) {
    await upsertBookMetadata(book);
  }
}

/**
 * Upsert multiple podcast metadata records
 */
export async function upsertPodcastsMetadata(podcasts: ApiPodcast[]): Promise<void> {
  if (!podcasts?.length) return;

  for (const podcast of podcasts) {
    await upsertPodcastMetadata(podcast);
  }
}

/**
 * Get media metadata by library item ID
 */
export async function getMediaMetadataByLibraryItemId(
  libraryItemId: string
): Promise<MediaMetadataRow | null> {
  const result = await db
    .select()
    .from(mediaMetadata)
    .where(eq(mediaMetadata.libraryItemId, libraryItemId))
    .limit(1);

  return result[0] || null;
}

/**
 * Get media metadata by ID
 */
export async function getMediaMetadataById(id: string): Promise<MediaMetadataRow | null> {
  const result = await db.select().from(mediaMetadata).where(eq(mediaMetadata.id, id)).limit(1);

  return result[0] || null;
}

/**
 * Get all media metadata for a library
 */
export async function getMediaMetadataByLibraryId(libraryId: string): Promise<MediaMetadataRow[]> {
  return await db
    .select({
      id: mediaMetadata.id,
      libraryItemId: mediaMetadata.libraryItemId,
      mediaType: mediaMetadata.mediaType,
      title: mediaMetadata.title,
      subtitle: mediaMetadata.subtitle,
      description: mediaMetadata.description,
      language: mediaMetadata.language,
      explicit: mediaMetadata.explicit,
      publisher: mediaMetadata.publisher,
      isbn: mediaMetadata.isbn,
      asin: mediaMetadata.asin,
      publishedYear: mediaMetadata.publishedYear,
      publishedDate: mediaMetadata.publishedDate,
      duration: mediaMetadata.duration,
      trackCount: mediaMetadata.trackCount,
      format: mediaMetadata.format,
      edition: mediaMetadata.edition,
      abridged: mediaMetadata.abridged,
      rating: mediaMetadata.rating,
      ratingCount: mediaMetadata.ratingCount,
      goodreadsId: mediaMetadata.goodreadsId,
      googleBooksId: mediaMetadata.googleBooksId,
      author: mediaMetadata.author,
      feedUrl: mediaMetadata.feedUrl,
      imageUrl: mediaMetadata.imageUrl,
      itunesPageUrl: mediaMetadata.itunesPageUrl,
      itunesId: mediaMetadata.itunesId,
      itunesArtistId: mediaMetadata.itunesArtistId,
      type: mediaMetadata.type,
      authorName: mediaMetadata.authorName,
      authorNameLF: mediaMetadata.authorNameLF,
      narratorName: mediaMetadata.narratorName,
      seriesName: mediaMetadata.seriesName,
      addedAt: mediaMetadata.addedAt,
      updatedAt: mediaMetadata.updatedAt,
    })
    .from(mediaMetadata)
    .innerJoin(libraryItems, eq(mediaMetadata.libraryItemId, libraryItems.id))
    .where(eq(libraryItems.libraryId, libraryId))
    .orderBy(mediaMetadata.addedAt);
}

/**
 * Delete media metadata by library item ID
 */
export async function deleteMediaMetadataByLibraryItemId(libraryItemId: string): Promise<void> {
  await db.delete(mediaMetadata).where(eq(mediaMetadata.libraryItemId, libraryItemId));
}

/**
 * Cache cover for a library item and store in local cache
 */
export async function cacheCoverAndUpdateMetadata(libraryItemId: string): Promise<boolean> {
  try {
    // Get the media ID for this library item
    const mediaResult = await db
      .select({ mediaId: mediaMetadata.id })
      .from(mediaMetadata)
      .where(eq(mediaMetadata.libraryItemId, libraryItemId))
      .limit(1);

    if (!mediaResult[0]) {
      console.error(`[mediaMetadata] No media metadata found for library item ${libraryItemId}`);
      return false;
    }

    const mediaId = mediaResult[0].mediaId;

    // Cache the cover
    const result = await cacheCoverIfMissing(libraryItemId);

    // Only update the local cache if the cover was actually downloaded or if it already exists
    if (result.uri) {
      await setLocalCoverCached(mediaId, result.uri);
      console.log(
        `[mediaMetadata] Cached cover for ${libraryItemId} (media: ${mediaId}): ${result.uri} (downloaded: ${result.wasDownloaded})`
      );
      return result.wasDownloaded;
    }

    return false;
  } catch (error) {
    console.error(`[mediaMetadata] Failed to cache cover for ${libraryItemId}:`, error);
    return false;
  }
}

/**
 * Cache covers for all items in a library and update their imageUrls
 */
export async function cacheCoversForLibraryItems(
  libraryId: string
): Promise<{ downloadedCount: number; totalCount: number }> {
  try {
    const items = await db
      .select({
        libraryItemId: mediaMetadata.libraryItemId,
        mediaId: mediaMetadata.id,
        mediaType: mediaMetadata.mediaType,
      })
      .from(mediaMetadata)
      .innerJoin(libraryItems, eq(mediaMetadata.libraryItemId, libraryItems.id))
      .where(eq(libraryItems.libraryId, libraryId));

    // Check which items already have cached covers
    const itemsWithCachedCovers = new Set<string>();
    for (const item of items) {
      const cachedUrl = await getLocalCoverUrl(item.mediaId);
      if (cachedUrl && isCoverCached(item.libraryItemId)) {
        // ensure the cover cache is recorded in local database
        console.log(
          `[mediaMetadata] Cover already cached for ${item.libraryItemId} (media: ${item.mediaId}): ${cachedUrl}`
        );
        await setLocalCoverCached(item.mediaId, getCoverUri(item.libraryItemId));
        itemsWithCachedCovers.add(item.libraryItemId);
      }
    }

    const itemsToCache = items.filter((item) => !itemsWithCachedCovers.has(item.libraryItemId));
    console.log(
      `[mediaMetadata] Caching covers for ${itemsToCache.length} of ${items.length} items in library ${libraryId}`
    );

    let downloadedCount = 0;

    // Cache covers in parallel (but limit concurrency to avoid overwhelming the server)
    const batchSize = 5;
    for (let i = 0; i < itemsToCache.length; i += batchSize) {
      const batch = itemsToCache.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((item) => cacheCoverAndUpdateMetadata(item.libraryItemId))
      );
      downloadedCount += results.filter(Boolean).length;
    }

    console.log(
      `[mediaMetadata] Finished caching covers for library ${libraryId}. Downloaded=${downloadedCount} Already cached=${items.length - itemsToCache.length} Total=${items.length}`
    );
    return { downloadedCount, totalCount: items.length };
  } catch (error) {
    console.error(`[mediaMetadata] Failed to cache covers for library ${libraryId}:`, error);
    return { downloadedCount: 0, totalCount: 0 };
  }
}
