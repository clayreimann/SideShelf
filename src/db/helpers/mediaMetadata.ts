import type { Book, Podcast } from '@/lib/api/types';
import { eq } from 'drizzle-orm';
import { db } from '../client';
import { libraryItems } from '../schema/libraryItems';
import { mediaMetadata, MediaMetadataRow, NewMediaMetadataRow } from '../schema/mediaMetadata';
import { upsertBookJoins, upsertPodcastJoins } from './mediaJoins';

/**
 * Marshal book data from API to media metadata row
 */
export function marshalBookToMediaMetadata(book: Book): NewMediaMetadataRow {
  const metadata = book.metadata;

  return {
    id: book.id,
    libraryItemId: book.libraryItemId,
    mediaType: 'book',

    // Common fields
    title: metadata.title,
    subtitle: metadata.subtitle,
    description: metadata.description,
    language: metadata.language,
    explicit: metadata.explicit,

    // Book-specific fields
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

    // Calculate duration from audio files if available
    duration: book.audioFiles?.reduce((total, file) => total + (file.duration || 0), 0) || null,
    trackCount: book.audioFiles?.length || null,

    // Additional book fields (not in current API but in schema)
    format: null, // Could be derived from audio files
    edition: null,
    abridged: null,
    rating: null,
    ratingCount: null,
    goodreadsId: null,
    googleBooksId: null,

    // Podcast fields (null for books)
    author: null,
    feedUrl: null,
    imageUrl: null,
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
 */
export function marshalPodcastToMediaMetadata(podcast: Podcast): NewMediaMetadataRow {
  const metadata = podcast.metadata;

  return {
    id: podcast.id,
    libraryItemId: podcast.libraryItemId,
    mediaType: 'podcast',

    // Common fields
    title: metadata.title,
    subtitle: null, // Podcasts don't typically have subtitles in this context
    description: metadata.description,
    language: metadata.language,
    explicit: metadata.explicit,

    // Podcast-specific fields
    author: metadata.author,
    feedUrl: metadata.feedUrl,
    imageUrl: metadata.imageUrl,
    itunesPageUrl: metadata.itunesPageUrl,
    itunesId: metadata.itunesId,
    itunesArtistId: metadata.itunesArtistId,
    type: metadata.type,

    // Book fields (null for podcasts)
    publisher: null,
    isbn: null,
    asin: null,
    publishedYear: null,
    publishedDate: metadata.releaseDate, // Map releaseDate to publishedDate
    duration: null, // Podcast duration would be sum of episodes
    trackCount: podcast.episodes?.length || null,
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
export async function upsertBookMetadata(book: Book): Promise<MediaMetadataRow> {
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

  // Update join tables
  await upsertBookJoins(book);

  return result;
}

/**
 * Upsert media metadata for a podcast
 */
export async function upsertPodcastMetadata(podcast: Podcast): Promise<MediaMetadataRow> {
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

  // Update join tables
  await upsertPodcastJoins(podcast);

  return result;
}

/**
 * Upsert multiple book metadata records
 */
export async function upsertBooksMetadata(books: Book[]): Promise<void> {
  if (!books?.length) return;

  for (const book of books) {
    await upsertBookMetadata(book);
  }
}

/**
 * Upsert multiple podcast metadata records
 */
export async function upsertPodcastsMetadata(podcasts: Podcast[]): Promise<void> {
  if (!podcasts?.length) return;

  for (const podcast of podcasts) {
    await upsertPodcastMetadata(podcast);
  }
}

/**
 * Get media metadata by library item ID
 */
export async function getMediaMetadataByLibraryItemId(libraryItemId: string): Promise<MediaMetadataRow | null> {
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
  const result = await db
    .select()
    .from(mediaMetadata)
    .where(eq(mediaMetadata.id, id))
    .limit(1);

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
