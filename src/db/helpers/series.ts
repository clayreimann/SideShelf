/**
 * Series database helper functions
 *
 * This module provides functions for managing series in the database,
 * including fetching, upserting, and transforming series data.
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { series, SeriesRow } from '../schema/series';

export type NewSeriesRow = typeof series.$inferInsert;
export type { SeriesRow };

/**
 * Get all series from database, ordered by name
 */
export async function getAllSeries(): Promise<SeriesRow[]> {
  return await db
    .select()
    .from(series)
    .orderBy(series.name);
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
}

/**
 * Transform series for display in lists
 */
export function transformSeriesToDisplayFormat(series: SeriesRow[]): SeriesListRow[] {
  return series.map(serie => ({
    id: serie.id,
    name: serie.name || 'Unknown Series',
    description: serie.description,
    addedAt: serie.addedAt,
    updatedAt: serie.updatedAt,
  }));
}
