/**
 * Next Item Helper Functions
 *
 * Functions for finding the next item in a series or podcast
 */

import { eq } from "drizzle-orm";
import { db } from "../client";
import { mediaMetadata } from "../schema/mediaMetadata";
import { mediaSeries } from "../schema/mediaJoins";

/**
 * Find the next item in a series based on the current library item
 * Returns null if there's no next item or if the item is not part of a series
 */
export async function getNextItemInSeries(
  currentLibraryItemId: string
): Promise<{ libraryItemId: string; title: string } | null> {
  try {
    // Get the current item's metadata
    const currentItem = await db
      .select()
      .from(mediaMetadata)
      .where(eq(mediaMetadata.libraryItemId, currentLibraryItemId))
      .limit(1);

    if (!currentItem || currentItem.length === 0) {
      return null;
    }

    const currentMetadata = currentItem[0];

    // Only handle books for now (podcasts don't use the series table)
    if (currentMetadata.mediaType !== "book") {
      return null;
    }

    // Get the series information for the current item
    const currentSeriesInfo = await db
      .select()
      .from(mediaSeries)
      .where(eq(mediaSeries.mediaId, currentMetadata.id))
      .limit(1);

    if (!currentSeriesInfo || currentSeriesInfo.length === 0) {
      return null;
    }

    const seriesId = currentSeriesInfo[0].seriesId;
    const currentSequence = currentSeriesInfo[0].sequence;

    // Get all items in the series, ordered by sequence
    const seriesItems = await db
      .select({
        mediaId: mediaSeries.mediaId,
        sequence: mediaSeries.sequence,
        libraryItemId: mediaMetadata.libraryItemId,
        title: mediaMetadata.title,
      })
      .from(mediaSeries)
      .innerJoin(mediaMetadata, eq(mediaSeries.mediaId, mediaMetadata.id))
      .where(eq(mediaSeries.seriesId, seriesId))
      .orderBy(mediaSeries.sequence);

    if (seriesItems.length === 0) {
      return null;
    }

    // Find the current item's index in the series
    const currentIndex = seriesItems.findIndex(
      (item) => item.libraryItemId === currentLibraryItemId
    );

    if (currentIndex === -1 || currentIndex === seriesItems.length - 1) {
      // Current item not found in series or it's the last item
      return null;
    }

    // Return the next item
    const nextItem = seriesItems[currentIndex + 1];
    return {
      libraryItemId: nextItem.libraryItemId,
      title: nextItem.title || "Unknown Title",
    };
  } catch (error) {
    console.error("[NextItem] Error finding next item in series:", error);
    return null;
  }
}

/**
 * Check if a library item is part of a series
 */
export async function isPartOfSeries(libraryItemId: string): Promise<boolean> {
  try {
    const metadata = await db
      .select()
      .from(mediaMetadata)
      .where(eq(mediaMetadata.libraryItemId, libraryItemId))
      .limit(1);

    if (!metadata || metadata.length === 0) {
      return false;
    }

    if (metadata[0].mediaType !== "book") {
      return false;
    }

    const seriesInfo = await db
      .select()
      .from(mediaSeries)
      .where(eq(mediaSeries.mediaId, metadata[0].id))
      .limit(1);

    return seriesInfo && seriesInfo.length > 0;
  } catch (error) {
    console.error("[NextItem] Error checking if item is part of series:", error);
    return false;
  }
}
