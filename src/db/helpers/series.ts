/**
 * Series database helper functions
 *
 * This module provides functions for managing series in the database,
 * including fetching, upserting, and transforming series data.
 */

import { resolveAppPath } from '@/lib/fileSystem';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../client';
import { libraryItems } from '../schema/libraryItems';
import { mediaMetadata } from '../schema/mediaMetadata';
import { mediaSeries } from '../schema/mediaJoins';
import { localCoverCache } from '../schema/localData';
import { series, SeriesRow } from '../schema/series';

export type NewSeriesRow = typeof series.$inferInsert;
export type { SeriesRow };

/**
 * Get all series from database, ordered by name
 */
export async function getAllSeries(): Promise<SeriesWithBooks[]> {
  const seriesRows = await db
    .select()
    .from(series)
    .orderBy(series.name);

  if (!seriesRows.length) {
    return [];
  }

  const seriesIds = seriesRows.map(serie => serie.id);

  const seriesBooks = await db
    .select({
      seriesId: mediaSeries.seriesId,
      libraryItemId: mediaMetadata.libraryItemId,
      mediaId: mediaMetadata.id,
      title: mediaMetadata.title,
      authorName: mediaMetadata.authorName,
      sequence: mediaSeries.sequence,
      coverUrl: localCoverCache.localCoverUrl,
      duration: mediaMetadata.duration,
    })
    .from(mediaSeries)
    .innerJoin(mediaMetadata, eq(mediaSeries.mediaId, mediaMetadata.id))
    .innerJoin(libraryItems, eq(mediaMetadata.libraryItemId, libraryItems.id))
    .leftJoin(localCoverCache, eq(mediaMetadata.id, localCoverCache.mediaId))
    .where(inArray(mediaSeries.seriesId, seriesIds))
    .orderBy(mediaSeries.seriesId, mediaSeries.sequence, mediaMetadata.title);

  const booksBySeries = new Map<string, SeriesBookRow[]>();

  for (const row of seriesBooks) {
    const book: SeriesBookRow = {
      libraryItemId: row.libraryItemId,
      mediaId: row.mediaId,
      title: row.title || 'Unknown Title',
      authorName: row.authorName,
      sequence: row.sequence,
      coverUrl: row.coverUrl ? resolveAppPath(row.coverUrl) : null,
      duration: row.duration ?? null,
    };

    const existing = booksBySeries.get(row.seriesId);
    if (existing) {
      existing.push(book);
    } else {
      booksBySeries.set(row.seriesId, [book]);
    }
  }

  return seriesRows.map<SeriesWithBooks>(serie => ({
    ...serie,
    books: booksBySeries.get(serie.id) || [],
  }));
}

/**
 * Get series by ID
 */
export async function getSeriesById(id: string): Promise<SeriesRow | null> {
  const result = await db
    .select()
    .from(series)
    .where(eq(series.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Get series ordered by most recently updated
 */
export async function getSeriesByRecent(): Promise<SeriesRow[]> {
  return await db
    .select()
    .from(series)
    .orderBy(desc(series.updatedAt), series.name);
}

/**
 * Upsert a single series
 */
export async function upsertSeries(row: NewSeriesRow): Promise<SeriesRow> {
  const result = await db
    .insert(series)
    .values(row)
    .onConflictDoUpdate({
      target: series.id,
      set: {
        name: row.name,
        description: row.description,
        updatedAt: row.updatedAt || new Date(),
      },
    })
    .returning();

  return result[0];
}

/**
 * Upsert multiple series
 */
export async function upsertMultipleSeries(rows: NewSeriesRow[]): Promise<void> {
  if (rows.length === 0) return;

  for (const row of rows) {
    await upsertSeries(row);
  }
}

/**
 * Series display row for lists
 */
export interface SeriesListRow {
  id: string;
  name: string;
  description: string | null;
  addedAt: Date | null;
  updatedAt: Date | null;
  bookCount: number;
}

/**
 * Transform series for display in lists
 */
export function transformSeriesToDisplayFormat(series: SeriesWithBooks[]): SeriesListRow[] {
  return series.map(serie => ({
    id: serie.id,
    name: serie.name || 'Unknown Series',
    description: serie.description,
    addedAt: serie.addedAt,
    updatedAt: serie.updatedAt,
    bookCount: serie.books.length,
  }));
}

/**
 * Series book display row
 */
export interface SeriesBookRow {
  libraryItemId: string;
  mediaId: string;
  title: string;
  authorName: string | null;
  sequence: string | null;
  coverUrl: string | null;
  duration: number | null;
}

/**
 * Series with associated books
 */
export type SeriesWithBooks = SeriesRow & {
  books: SeriesBookRow[];
};
