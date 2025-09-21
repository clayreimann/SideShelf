import type { Book, Podcast } from '@/lib/api/types';
import { eq } from 'drizzle-orm';
import { db } from '../client';
import {
  MediaAuthorRow,
  mediaAuthors,
  mediaGenres,
  mediaNarrators,
  mediaSeries,
  mediaTags
} from '../schema/mediaJoins';

/**
 * Upsert media authors for a book
 */
export async function upsertMediaAuthors(mediaId: string, authors: Array<{ id: string; name: string }>): Promise<void> {
  if (!authors?.length) return;

  // Delete existing author relationships
  await db.delete(mediaAuthors).where(eq(mediaAuthors.mediaId, mediaId));

  // Insert new author relationships
  const authorRows = authors.map(author => ({
    mediaId,
    authorId: author.id,
  }));

  if (authorRows.length > 0) {
    await db.insert(mediaAuthors).values(authorRows);
  }
}

/**
 * Upsert media genres
 */
export async function upsertMediaGenres(mediaId: string, genres: string[]): Promise<void> {
  if (!genres?.length) return;

  // Delete existing genre relationships
  await db.delete(mediaGenres).where(eq(mediaGenres.mediaId, mediaId));

  // Insert new genre relationships
  const genreRows = genres.map(genre => ({
    mediaId,
    genreName: genre,
  }));

  if (genreRows.length > 0) {
    await db.insert(mediaGenres).values(genreRows);
  }
}

/**
 * Upsert media series
 */
export async function upsertMediaSeries(mediaId: string, series: Array<{ id: string; name: string; sequence?: string | null }>): Promise<void> {
  if (!series?.length) return;

  // Delete existing series relationships
  await db.delete(mediaSeries).where(eq(mediaSeries.mediaId, mediaId));

  // Insert new series relationships
  const seriesRows = series.map(serie => ({
    mediaId,
    seriesId: serie.id,
    sequence: serie.sequence || null,
  }));

  if (seriesRows.length > 0) {
    await db.insert(mediaSeries).values(seriesRows);
  }
}

/**
 * Upsert media tags
 */
export async function upsertMediaTags(mediaId: string, tags: string[]): Promise<void> {
  if (!tags?.length) return;

  // Delete existing tag relationships
  await db.delete(mediaTags).where(eq(mediaTags.mediaId, mediaId));

  // Insert new tag relationships
  const tagRows = tags.map(tag => ({
    mediaId,
    tagName: tag,
  }));

  if (tagRows.length > 0) {
    await db.insert(mediaTags).values(tagRows);
  }
}

/**
 * Upsert media narrators (for books only)
 */
export async function upsertMediaNarrators(mediaId: string, narrators: string[]): Promise<void> {
  if (!narrators?.length) return;

  // Delete existing narrator relationships
  await db.delete(mediaNarrators).where(eq(mediaNarrators.mediaId, mediaId));

  // Insert new narrator relationships
  const narratorRows = narrators.map(narrator => ({
    mediaId,
    narratorName: narrator,
  }));

  if (narratorRows.length > 0) {
    await db.insert(mediaNarrators).values(narratorRows);
  }
}

/**
 * Upsert all join table data for a book
 */
export async function upsertBookJoins(book: Book): Promise<void> {
  const mediaId = book.id;
  const metadata = book.metadata;

  await Promise.all([
    upsertMediaAuthors(mediaId, metadata.authors || []),
    upsertMediaGenres(mediaId, metadata.genres || []),
    upsertMediaSeries(mediaId, metadata.series || []),
    upsertMediaTags(mediaId, book.tags || []),
    upsertMediaNarrators(mediaId, metadata.narrators || []),
  ]);
}

/**
 * Upsert all join table data for a podcast
 */
export async function upsertPodcastJoins(podcast: Podcast): Promise<void> {
  const mediaId = podcast.id;
  const metadata = podcast.metadata;

  await Promise.all([
    // Podcasts don't have authors in the same way (just a string), so skip authors
    upsertMediaGenres(mediaId, metadata.genres || []),
    upsertMediaTags(mediaId, podcast.tags || []),
    // Podcasts don't have series or narrators
  ]);
}

/**
 * Get authors for a media item
 */
export async function getMediaAuthors(mediaId: string): Promise<MediaAuthorRow[]> {
  return await db
    .select()
    .from(mediaAuthors)
    .where(eq(mediaAuthors.mediaId, mediaId));
}

/**
 * Get genres for a media item
 */
export async function getMediaGenres(mediaId: string): Promise<string[]> {
  const result = await db
    .select()
    .from(mediaGenres)
    .where(eq(mediaGenres.mediaId, mediaId))
    .orderBy(mediaGenres.genreName);
  return result.map(row => row.genreName);
}

/**
 * Get series for a media item
 */
export async function getMediaSeries(mediaId: string): Promise<string[]> {
  const result = await db
    .select()
    .from(mediaSeries)
    .where(eq(mediaSeries.mediaId, mediaId))
    .orderBy(mediaSeries.seriesId);
  return result.map(row => row.seriesId);
}

/**
 * Get tags for a media item
 */
export async function getMediaTags(mediaId: string): Promise<string[]> {
  const result = await db
    .select()
    .from(mediaTags)
    .where(eq(mediaTags.mediaId, mediaId))
    .orderBy(mediaTags.tagName);
  return result.map(row => row.tagName);
}

/**
 * Get narrators for a media item
 */
export async function getMediaNarrators(mediaId: string): Promise<string[]> {
  const result = await db
    .select()
    .from(mediaNarrators)
    .where(eq(mediaNarrators.mediaId, mediaId))
    .orderBy(mediaNarrators.narratorName);
  return result.map(row => row.narratorName);
}

/**
 * Delete all join table data for a media item
 */
export async function deleteMediaJoins(mediaId: string): Promise<void> {
  await Promise.all([
    db.delete(mediaAuthors).where(eq(mediaAuthors.mediaId, mediaId)),
    db.delete(mediaGenres).where(eq(mediaGenres.mediaId, mediaId)),
    db.delete(mediaSeries).where(eq(mediaSeries.mediaId, mediaId)),
    db.delete(mediaTags).where(eq(mediaTags.mediaId, mediaId)),
    db.delete(mediaNarrators).where(eq(mediaNarrators.mediaId, mediaId)),
  ]);
}
