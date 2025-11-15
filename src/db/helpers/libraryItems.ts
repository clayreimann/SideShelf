import { db } from "@/db/client";
import { libraryItems } from "@/db/schema/libraryItems";
import { localCoverCache } from "@/db/schema/localData";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { resolveAppPath } from "@/lib/fileSystem";
import type { ApiLibraryItem, ApiLibraryItemsResponse } from "@/types/api";
import type { LibraryItemDisplayRow } from "@/types/components";
import type { LibraryItemRow, NewLibraryItemRow } from "@/types/database";
import { and, eq, inArray, not, sql } from "drizzle-orm";
import { audioFiles } from "../schema/audioFiles";
import { mediaAuthors, mediaNarrators, mediaSeries } from "../schema/mediaJoins";
import { series } from "../schema/series";

// Marshal a single ApiLibraryItem from API to database row
export function marshalLibraryItemFromApi(item: ApiLibraryItem): NewLibraryItemRow {
  return {
    id: item.id,
    libraryId: item.libraryId,
    ino: parseInt(item.ino) || null,
    folderId: item.folderId || null,
    path: item.path || null,
    relPath: item.relPath || null,
    isFile: item.isFile || false,
    mtimeMs: item.mtimeMs || null,
    ctimeMs: item.ctimeMs || null,
    birthtimeMs: item.birthtimeMs || null,
    addedAt: item.addedAt || null,
    updatedAt: item.updatedAt || null,
    lastScan: item.lastScan || null,
    scanVersion: item.scanVersion ? parseInt(item.scanVersion) : null,
    isMissing: item.isMissing || false,
    isInvalid: item.isInvalid || false,
    mediaType: item.mediaType || null,
  };
}

// Marshal library items from API response
export function marshalLibraryItemsFromResponse(
  response: ApiLibraryItemsResponse
): NewLibraryItemRow[] {
  return response.results.map(marshalLibraryItemFromApi);
}

// Upsert a single library item
export async function upsertLibraryItem(row: NewLibraryItemRow): Promise<LibraryItemRow> {
  const existing = await db.select().from(libraryItems).where(eq(libraryItems.id, row.id)).limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(libraryItems)
      .set(row)
      .where(eq(libraryItems.id, row.id))
      .returning();
    return updated;
  }

  const [inserted] = await db.insert(libraryItems).values(row).returning();
  return inserted;
}

// Upsert multiple library items
export async function upsertLibraryItems(rows: NewLibraryItemRow[]): Promise<void> {
  if (!rows?.length) return;

  for (const row of rows) {
    await upsertLibraryItem(row);
  }
}

// Transaction-aware variant for batch operations
export async function upsertLibraryItemTx(
  tx: typeof db,
  row: NewLibraryItemRow
): Promise<LibraryItemRow> {
  const existing = await tx.select().from(libraryItems).where(eq(libraryItems.id, row.id)).limit(1);

  if (existing.length > 0) {
    const [updated] = await tx
      .update(libraryItems)
      .set(row)
      .where(eq(libraryItems.id, row.id))
      .returning();
    return updated;
  }

  const [inserted] = await tx.insert(libraryItems).values(row).returning();
  return inserted;
}

// Get all library items from database
export async function getAllLibraryItems(): Promise<LibraryItemRow[]> {
  return await db.select().from(libraryItems).orderBy(libraryItems.addedAt);
}

// Get library items by library ID
export async function getLibraryItemsByLibraryId(libraryId: string): Promise<LibraryItemRow[]> {
  return await db
    .select()
    .from(libraryItems)
    .where(eq(libraryItems.libraryId, libraryId))
    .orderBy(libraryItems.addedAt);
}

// Get a single library item by ID
export async function getLibraryItemById(id: string): Promise<LibraryItemRow | null> {
  const result = await db.select().from(libraryItems).where(eq(libraryItems.id, id)).limit(1);

  return result[0] || null;
}

// Check if a library item exists in the database
export async function checkLibraryItemExists(id: string): Promise<boolean> {
  const result = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(eq(libraryItems.id, id))
    .limit(1);

  return result.length > 0;
}

// Delete library items by library ID (useful when library is deleted)
export async function deleteLibraryItemsByLibraryId(libraryId: string): Promise<void> {
  await db.delete(libraryItems).where(eq(libraryItems.libraryId, libraryId));
}

// Delete all library items (useful for refresh scenarios)
export async function deleteAllLibraryItems(): Promise<void> {
  await db.delete(libraryItems);
}

// Get library items that don't have full metadata yet (no author linkage since that's probably the only guaranteed linkage) (for background processing)
export async function getLibraryItemsNeedingFullData(limit: number = 50): Promise<string[]> {
  const itemsWithFullData = await db
    .select({
      id: libraryItems.id,
      mediaMetadataId: mediaMetadata.id,
      mediaAuthorsId: mediaAuthors.authorId,
    })
    .from(libraryItems)
    .innerJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
    .innerJoin(mediaAuthors, eq(mediaMetadata.id, mediaAuthors.mediaId));

  const itemsWithoutFullData = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .leftJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
    .where(
      and(
        eq(libraryItems.mediaType, "book"),
        not(
          inArray(
            mediaMetadata.id,
            itemsWithFullData.map((r) => r.mediaMetadataId)
          )
        )
      )
    )
    .limit(limit);

  return itemsWithoutFullData.map((r) => r.id);
}

// Get library items that might need full data refresh (alternative approach)
export async function getLibraryItemsNeedingRefresh(limit: number = 50): Promise<string[]> {
  const results = await db
    .select({
      id: libraryItems.id,
      hasMetadata: mediaMetadata.id,
      hasAuthors: mediaAuthors.authorId,
      hasAudioFiles: audioFiles.id,
    })
    .from(libraryItems)
    .leftJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
    .leftJoin(mediaAuthors, eq(mediaMetadata.id, mediaAuthors.mediaId))
    .leftJoin(audioFiles, eq(audioFiles.mediaId, mediaMetadata.id))
    .where(eq(libraryItems.mediaType, "book")) // Focus on books for now
    .limit(limit * 2); // Get more to filter from

  // Filter to items that need processing
  const needsProcessing = results.filter(
    (item) => !item.hasMetadata || !item.hasAuthors || !item.hasAudioFiles
  );

  return needsProcessing.slice(0, limit).map((r) => r.id);
}

/**
 * Get library items filtered by author ID from local database
 */
export async function getLibraryItemsByAuthor(
  libraryId: string,
  authorId: string
): Promise<
  {
    id: string;
    libraryId: string;
    mediaType: string;
    addedAt: number;
    updatedAt: number;
    isMissing: boolean;
    isInvalid: boolean;
    title: string;
    subtitle: string;
    author: string;
    authorName: string;
    authorNameLF: string;
    narrator: string;
    releaseDate: string;
    publishedDate: string;
    publishedYear: string;
    duration: number;
    coverUri: string;
    description: string;
    language: string;
    explicit: boolean;
    seriesName: string;
  }[]
> {
  // Subquery to aggregate narrators
  const narratorsSubquery = db
    .select({
      mediaId: mediaNarrators.mediaId,
      narratorNames: sql<string | null>`GROUP_CONCAT(${mediaNarrators.narratorName}, ', ')`.as(
        "narrator_names"
      ),
    })
    .from(mediaNarrators)
    .groupBy(mediaNarrators.mediaId)
    .as("narrators_agg");

  // Subquery to aggregate series names
  const seriesSubquery = db
    .select({
      mediaId: mediaSeries.mediaId,
      seriesNames: sql<string | null>`GROUP_CONCAT(${series.name}, ', ')`.as("series_names"),
    })
    .from(mediaSeries)
    .leftJoin(series, eq(mediaSeries.seriesId, series.id))
    .groupBy(mediaSeries.mediaId)
    .as("series_agg");

  const baseQuery = db
    .select({
      id: libraryItems.id,
      libraryId: libraryItems.libraryId,
      mediaType: libraryItems.mediaType ?? "",
      addedAt: libraryItems.addedAt,
      updatedAt: libraryItems.updatedAt,
      isMissing: libraryItems.isMissing,
      isInvalid: libraryItems.isInvalid,
      // Media metadata fields
      title: mediaMetadata.title,
      subtitle: mediaMetadata.subtitle,
      author: mediaMetadata.author, // For podcasts
      authorName: mediaMetadata.authorName, // For books
      authorNameLF: mediaMetadata.authorNameLF, // For sorting by author last name first
      narrator: narratorsSubquery.narratorNames,
      releaseDate: mediaMetadata.publishedDate,
      publishedDate: mediaMetadata.publishedDate,
      publishedYear: mediaMetadata.publishedYear,
      duration: mediaMetadata.duration,
      coverUri: localCoverCache.localCoverUrl,
      description: mediaMetadata.description,
      language: mediaMetadata.language,
      explicit: mediaMetadata.explicit,
      seriesName: seriesSubquery.seriesNames,
      mediaId: mediaMetadata.id,
    })
    .from(libraryItems)
    .innerJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
    .innerJoin(mediaAuthors, eq(mediaMetadata.id, mediaAuthors.mediaId))
    .leftJoin(localCoverCache, eq(mediaMetadata.id, localCoverCache.mediaId))
    .leftJoin(narratorsSubquery, eq(mediaMetadata.id, narratorsSubquery.mediaId))
    .leftJoin(seriesSubquery, eq(mediaMetadata.id, seriesSubquery.mediaId));

  const rows = await baseQuery
    .where(and(eq(libraryItems.libraryId, libraryId), eq(mediaAuthors.authorId, authorId)))
    .orderBy(mediaMetadata.title);

  return rows.map(({ mediaId, ...row }) => ({
    ...row,
    coverUri: row.coverUri && mediaId ? resolveAppPath(row.coverUri) : undefined,
  }));
}

// Get library items with full metadata for list display
export async function getLibraryItemsForList(libraryId: string): Promise<
  {
    id: string;
    libraryId: string;
    mediaType: string;
    addedAt: number;
    updatedAt: number;
    isMissing: boolean;
    isInvalid: boolean;
    title: string;
    subtitle: string;
    author: string;
    authorName: string;
    authorNameLF: string;
    narrator: string;
    releaseDate: string;
    publishedDate: string;
    publishedYear: string;
    duration: number;
    coverUri: string;
    description: string;
    language: string;
    explicit: boolean;
    seriesName: string;
  }[]
> {
  // Subquery to aggregate narrators
  const narratorsSubquery = db
    .select({
      mediaId: mediaNarrators.mediaId,
      narratorNames: sql<string | null>`GROUP_CONCAT(${mediaNarrators.narratorName}, ', ')`.as(
        "narrator_names"
      ),
    })
    .from(mediaNarrators)
    .groupBy(mediaNarrators.mediaId)
    .as("narrators_agg");

  // Subquery to aggregate series names
  const seriesSubquery = db
    .select({
      mediaId: mediaSeries.mediaId,
      seriesNames: sql<string | null>`GROUP_CONCAT(${series.name}, ', ')`.as("series_names"),
    })
    .from(mediaSeries)
    .leftJoin(series, eq(mediaSeries.seriesId, series.id))
    .groupBy(mediaSeries.mediaId)
    .as("series_agg");

  const baseQuery = db
    .select({
      id: libraryItems.id,
      libraryId: libraryItems.libraryId,
      mediaType: libraryItems.mediaType ?? "",
      addedAt: libraryItems.addedAt,
      updatedAt: libraryItems.updatedAt,
      isMissing: libraryItems.isMissing,
      isInvalid: libraryItems.isInvalid,
      // Media metadata fields
      title: mediaMetadata.title,
      subtitle: mediaMetadata.subtitle,
      author: mediaMetadata.author, // For podcasts
      authorName: mediaMetadata.authorName, // For books
      authorNameLF: mediaMetadata.authorNameLF, // For sorting by author last name first
      narrator: narratorsSubquery.narratorNames,
      releaseDate: mediaMetadata.publishedDate,
      publishedDate: mediaMetadata.publishedDate,
      publishedYear: mediaMetadata.publishedYear, // For sorting by published year
      duration: mediaMetadata.duration,
      coverUri: localCoverCache.localCoverUrl, // Use local cover cache instead of imageUrl
      description: mediaMetadata.description,
      language: mediaMetadata.language,
      explicit: mediaMetadata.explicit,
      seriesName: seriesSubquery.seriesNames,
      mediaId: mediaMetadata.id,
    })
    .from(libraryItems)
    .leftJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
    .leftJoin(localCoverCache, eq(mediaMetadata.id, localCoverCache.mediaId))
    .leftJoin(narratorsSubquery, eq(mediaMetadata.id, narratorsSubquery.mediaId))
    .leftJoin(seriesSubquery, eq(mediaMetadata.id, seriesSubquery.mediaId));

  const rows = await baseQuery
    .where(eq(libraryItems.libraryId, libraryId))
    .orderBy(libraryItems.addedAt);

  return rows.map(({ mediaId, ...row }) => ({
    ...row,
    coverUri: row.coverUri && mediaId ? resolveAppPath(row.coverUri) : undefined,
  }));
}

/**
 * Transform database library items to display format for UI components
 */
export function transformItemsToDisplayFormat(
  dbItems: Awaited<ReturnType<typeof getLibraryItemsForList>>
): Array<LibraryItemDisplayRow> {
  return dbItems.map((item) => ({
    id: item.id,
    mediaType: item.mediaType,
    title: item.title || "Unknown Title",
    author: item.author || item.authorName || "Unknown ApiAuthor",
    authorName: item.authorName || null,
    authorNameLF: item.authorNameLF,
    narrator: item.narrator || null,
    releaseDate: item.releaseDate || item.publishedDate || null,
    publishedYear: item.publishedYear,
    addedAt: item.addedAt,
    duration: item.duration || 0,
    coverUri: item.coverUri,
    seriesName: item.seriesName || null,
  }));
}
