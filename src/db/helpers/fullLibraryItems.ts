import { db } from "@/db/client";
import { audioFiles } from "@/db/schema/audioFiles";
import { authors } from "@/db/schema/authors";
import { chapters } from "@/db/schema/chapters";
import { genres } from "@/db/schema/genres";
import { libraryFiles } from "@/db/schema/libraryFiles";
import { libraryItems } from "@/db/schema/libraryItems";
import { mediaAuthors, mediaSeries } from "@/db/schema/mediaJoins";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { narrators } from "@/db/schema/narrators";
import { series } from "@/db/schema/series";
import { tags } from "@/db/schema/tags";
import type { ApiAuthor, ApiBook, ApiLibraryItem, ApiPodcast, ApiSeries } from "@/types/api";
import { and, eq, isNull, sql } from "drizzle-orm";

// Import our new helpers
import { marshalAudioFileFromApi } from "./audioFiles";
import { marshalChapterFromApi, type ApiChapter } from "./chapters";
import { marshalLibraryFileFromApi } from "./libraryFiles";
import { marshalLibraryItemFromApi } from "./libraryItems";
import { upsertBookJoins, upsertPodcastJoins } from "./mediaJoins";
import { marshalBookToMediaMetadata, marshalPodcastToMediaMetadata } from "./mediaMetadata";

export type NewAuthorRow = typeof authors.$inferInsert;
export type NewSeriesRow = typeof series.$inferInsert;
export type NewMediaAuthorRow = typeof mediaAuthors.$inferInsert;
export type NewMediaSeriesRow = typeof mediaSeries.$inferInsert;

// Marshal author from API to database row
export function marshalAuthorFromApi(apiAuthor: ApiAuthor): NewAuthorRow {
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
    description: null, // ApiSeries from batch API don't include description
    addedAt: null,
    updatedAt: null,
  };
}

// Helper functions to upsert genres, narrators, and tags into their base tables
// Each uses a single-statement batch INSERT ON CONFLICT DO NOTHING
export async function upsertGenres(genreNames: string[]): Promise<void> {
  if (!genreNames?.length) return;
  try {
    await db
      .insert(genres)
      .values(genreNames.map((name) => ({ name })))
      .onConflictDoNothing();
  } catch (error) {
    console.error("[fullLibraryItems] upsertGenres failed:", error);
  }
}

export async function upsertNarrators(narratorNames: string[]): Promise<void> {
  if (!narratorNames?.length) return;
  try {
    await db
      .insert(narrators)
      .values(narratorNames.map((name) => ({ name })))
      .onConflictDoNothing();
  } catch (error) {
    console.error("[fullLibraryItems] upsertNarrators failed:", error);
  }
}

export async function upsertTags(tagNames: string[]): Promise<void> {
  if (!tagNames?.length) return;
  try {
    await db
      .insert(tags)
      .values(tagNames.map((name) => ({ name })))
      .onConflictDoNothing();
  } catch (error) {
    console.error("[fullLibraryItems] upsertTags failed:", error);
  }
}

// Process a full library item from batch API response
export async function processFullLibraryItem(apiItem: ApiLibraryItem): Promise<void> {
  // console.log(`[fullLibraryItems] Processing library item:`);

  // Break up processing into smaller transactions to avoid blocking UI
  // Transaction 1: ApiLibrary item and media metadata
  let mediaRow: any = null;
  await db.transaction(async (tx) => {
    // 1. Upsert the library item
    const libraryItemRow = marshalLibraryItemFromApi(apiItem);
    await tx.insert(libraryItems).values(libraryItemRow).onConflictDoUpdate({
      target: libraryItems.id,
      set: libraryItemRow,
    });

    // 2. Process media metadata
    if (apiItem.mediaType === "book" && apiItem.media) {
      const book = apiItem.media as ApiBook;
      // Ensure libraryItemId is set from apiItem if missing from book
      if (!book.libraryItemId) {
        book.libraryItemId = apiItem.id;
      }
      mediaRow = marshalBookToMediaMetadata(book);

      await tx.insert(mediaMetadata).values(mediaRow).onConflictDoUpdate({
        target: mediaMetadata.id,
        set: mediaRow,
      });
    } else if (apiItem.mediaType === "podcast" && apiItem.media) {
      const podcast = apiItem.media as ApiPodcast;
      // Ensure libraryItemId is set from apiItem if missing from podcast
      if (!podcast.libraryItemId) {
        podcast.libraryItemId = apiItem.id;
      }
      mediaRow = marshalPodcastToMediaMetadata(podcast);

      await tx.insert(mediaMetadata).values(mediaRow).onConflictDoUpdate({
        target: mediaMetadata.id,
        set: mediaRow,
      });
    }
  });

  // Yield to event loop after first transaction
  await yieldToEventLoop();

  // Transaction 2: Authors, ApiSeries, Genres, Narrators, and Tags (if we have media)
  if (apiItem.mediaType === "book" && apiItem.media && mediaRow) {
    const book = apiItem.media as ApiBook;

    // First, upsert genres, narrators, and tags into their base tables
    await Promise.all([
      upsertGenres(book.metadata.genres || []),
      upsertNarrators(book.metadata.narrators || []),
      upsertTags(book.tags || []),
    ]);

    await db.transaction(async (tx) => {
      // 3. Process authors — single-statement batch insert
      if (book.metadata.authors && book.metadata.authors.length > 0) {
        const authorRows = book.metadata.authors.map((apiAuthor) =>
          marshalAuthorFromApi(apiAuthor)
        );
        const mediaAuthorRows: NewMediaAuthorRow[] = book.metadata.authors.map((apiAuthor) => ({
          mediaId: mediaRow.id,
          authorId: apiAuthor.id,
        }));

        await tx
          .insert(authors)
          .values(authorRows)
          .onConflictDoUpdate({
            target: authors.id,
            set: { name: sql`excluded.name` },
          });

        await tx.insert(mediaAuthors).values(mediaAuthorRows).onConflictDoNothing();
      }

      // 4. Process series — single-statement batch insert
      if (book.metadata.series && book.metadata.series.length > 0) {
        const seriesRows = book.metadata.series.map((apiSeriesItem) =>
          marshalSeriesFromApi(apiSeriesItem)
        );
        const mediaSeriesRows: NewMediaSeriesRow[] = book.metadata.series.map((apiSeriesItem) => ({
          mediaId: mediaRow.id,
          seriesId: apiSeriesItem.id,
          sequence: apiSeriesItem.sequence,
        }));

        await tx
          .insert(series)
          .values(seriesRows)
          .onConflictDoUpdate({
            target: series.id,
            set: { name: sql`excluded.name` },
          });

        await tx
          .insert(mediaSeries)
          .values(mediaSeriesRows)
          .onConflictDoUpdate({
            target: [mediaSeries.mediaId, mediaSeries.seriesId],
            set: { sequence: sql`excluded.sequence` },
          });
      }
    });

    // 5. Process all media joins (genres, narrators, tags, etc.) using the existing helper
    await upsertBookJoins(book);
  } else if (apiItem.mediaType === "podcast" && apiItem.media && mediaRow) {
    const podcast = apiItem.media as ApiPodcast;

    // First, upsert genres and tags into their base tables (podcasts don't have narrators)
    await Promise.all([
      upsertGenres(podcast.metadata.genres || []),
      upsertTags(podcast.tags || []),
    ]);

    // Process all media joins (genres, tags) using the existing helper
    await upsertPodcastJoins(podcast);
  }

  // Yield to event loop after second transaction
  await yieldToEventLoop();

  // Transaction 3: Audio files and chapters (for books only)
  if (apiItem.mediaType === "book" && apiItem.media && mediaRow) {
    const book = apiItem.media as ApiBook;

    await db.transaction(async (tx) => {
      // 6. Process audio files — single-statement batch insert
      if (book.audioFiles && book.audioFiles.length > 0) {
        const audioFileRows = book.audioFiles.map((af) => marshalAudioFileFromApi(mediaRow.id, af));
        await tx
          .insert(audioFiles)
          .values(audioFileRows)
          .onConflictDoUpdate({
            target: audioFiles.id,
            set: {
              mediaId: sql`excluded.media_id`,
              index: sql`excluded."index"`,
              ino: sql`excluded.ino`,
              filename: sql`excluded.filename`,
              ext: sql`excluded.ext`,
              path: sql`excluded.path`,
              relPath: sql`excluded.rel_path`,
              size: sql`excluded.size`,
              mtimeMs: sql`excluded.mtime_ms`,
              ctimeMs: sql`excluded.ctime_ms`,
              birthtimeMs: sql`excluded.birthtime_ms`,
              addedAt: sql`excluded.added_at`,
              updatedAt: sql`excluded.updated_at`,
              trackNumFromMeta: sql`excluded.track_num_from_meta`,
              discNumFromMeta: sql`excluded.disc_num_from_meta`,
              trackNumFromFilename: sql`excluded.track_num_from_filename`,
              discNumFromFilename: sql`excluded.disc_num_from_filename`,
              manuallyVerified: sql`excluded.manually_verified`,
              exclude: sql`excluded.exclude`,
              error: sql`excluded.error`,
              format: sql`excluded.format`,
              duration: sql`excluded.duration`,
              bitRate: sql`excluded.bit_rate`,
              language: sql`excluded.language`,
              codec: sql`excluded.codec`,
              timeBase: sql`excluded.time_base`,
              channels: sql`excluded.channels`,
              channelLayout: sql`excluded.channel_layout`,
              embeddedCoverArt: sql`excluded.embedded_cover_art`,
              mimeType: sql`excluded.mime_type`,
              tagAlbum: sql`excluded.tag_album`,
              tagArtist: sql`excluded.tag_artist`,
              tagGenre: sql`excluded.tag_genre`,
              tagTitle: sql`excluded.tag_title`,
              tagSeries: sql`excluded.tag_series`,
              tagSeriesPart: sql`excluded.tag_series_part`,
              tagSubtitle: sql`excluded.tag_subtitle`,
              tagAlbumArtist: sql`excluded.tag_album_artist`,
              tagDate: sql`excluded.tag_date`,
              tagComposer: sql`excluded.tag_composer`,
              tagPublisher: sql`excluded.tag_publisher`,
              tagComment: sql`excluded.tag_comment`,
              tagLanguage: sql`excluded.tag_language`,
              tagASIN: sql`excluded.tag_asin`,
            },
          });
      }

      // 7. Process chapters — single-statement batch insert
      if (book.chapters && book.chapters.length > 0) {
        const chapterRows = book.chapters.map((ch) =>
          marshalChapterFromApi(mediaRow.id, ch as ApiChapter)
        );
        await tx
          .insert(chapters)
          .values(chapterRows)
          .onConflictDoUpdate({
            target: chapters.id,
            set: {
              mediaId: sql`excluded.media_id`,
              chapterId: sql`excluded.chapter_id`,
              start: sql`excluded.start`,
              end: sql`excluded.end`,
              title: sql`excluded.title`,
            },
          });
      }
    });
  }

  // Yield to event loop before final transaction
  await yieldToEventLoop();

  // Transaction 4: ApiLibrary files — single-statement batch insert
  if (apiItem.libraryFiles && apiItem.libraryFiles.length > 0) {
    const libraryFileRows = apiItem.libraryFiles.map((lf) =>
      marshalLibraryFileFromApi(apiItem.id, lf)
    );

    await db.transaction(async (tx) => {
      // 8. Process library files
      await tx
        .insert(libraryFiles)
        .values(libraryFileRows)
        .onConflictDoUpdate({
          target: libraryFiles.id,
          set: {
            libraryItemId: sql`excluded.library_item_id`,
            ino: sql`excluded.ino`,
            filename: sql`excluded.filename`,
            ext: sql`excluded.ext`,
            path: sql`excluded.path`,
            relPath: sql`excluded.rel_path`,
            size: sql`excluded.size`,
            mtimeMs: sql`excluded.mtime_ms`,
            ctimeMs: sql`excluded.ctime_ms`,
            birthtimeMs: sql`excluded.birthtime_ms`,
            addedAt: sql`excluded.added_at`,
            updatedAt: sql`excluded.updated_at`,
            fileType: sql`excluded.file_type`,
          },
        });
    });
  }
}

// Utility function to yield control back to the event loop
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Process multiple full library items from batch API response
export async function processFullLibraryItems(apiItems: ApiLibraryItem[]): Promise<void> {
  console.log(`[fullLibraryItems] Processing ${apiItems.length} full library items`);

  for (let i = 0; i < apiItems.length; i++) {
    const apiItem = apiItems[i];
    try {
      await processFullLibraryItem(apiItem);
      // console.log(`[fullLibraryItems] Processed item: ${apiItem.id} (${i + 1}/${apiItems.length})`);

      // Yield control back to the event loop every few items to keep UI responsive
      if ((i + 1) % 3 === 0) {
        await yieldToEventLoop();
      }
    } catch (error) {
      console.error(`[fullLibraryItems] Failed to process item ${apiItem.id}:`, error);
      return;
    }
  }
}

// Get library items that need full data refresh (have basic metadata but missing audio files/chapters)
export async function getLibraryItemsNeedingFullRefresh(limit: number = 50): Promise<string[]> {
  const items = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .innerJoin(mediaMetadata, eq(libraryItems.id, mediaMetadata.libraryItemId))
    .leftJoin(audioFiles, eq(mediaMetadata.id, audioFiles.mediaId))
    .where(
      and(
        eq(libraryItems.mediaType, "book"),
        isNull(audioFiles.id) // No audio files exist for this item
      )
    )
    .limit(limit);

  return items.map((item) => item.id);
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
