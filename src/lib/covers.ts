import { db } from "@/db/client";
import { setLocalCoverCached } from "@/db/helpers/localData";
import { localCoverCache } from "@/db/schema/localData";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { apiFetch } from "@/lib/api/api";
import { fetchLibraryItemCoverHead } from "@/lib/api/endpoints";
import { eq } from "drizzle-orm";
import { Directory, File, Paths } from "expo-file-system";

const coversDirectory = new Directory(Paths.cache, "covers");

export function getCoversDirectory(): Directory {
  coversDirectory.create({ intermediates: true, idempotent: true });
  return coversDirectory;
}

export function getCoverUri(libraryItemId: string): string {
  const dir = getCoversDirectory();
  const file = new File(dir, libraryItemId);
  return file.uri;
}

export async function cacheCoverIfMissing(
  libraryItemId: string
): Promise<{ uri: string; wasDownloaded: boolean }> {
  const dir = getCoversDirectory();
  const destFile = new File(dir, libraryItemId);

  // If file already exists, return it without downloading
  if (destFile.exists) {
    return { uri: destFile.uri, wasDownloaded: false };
  }

  try {
    const res = await fetchLibraryItemCoverHead(libraryItemId);
    if (!res.ok) return { uri: "", wasDownloaded: false };

    const url = res.url;
    if (!url) return { uri: "", wasDownloaded: false };

    // Use apiFetch for the actual image download to ensure proper authentication
    const response = await apiFetch(url);
    if (!response.ok) return { uri: "", wasDownloaded: false };

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    destFile.write(bytes);
    console.log(`[covers] Downloaded cover for ${libraryItemId}`);
    return { uri: destFile.uri, wasDownloaded: true };
  } catch (error) {
    console.error(`[covers] Failed to download cover for ${libraryItemId}:`, error);
    return { uri: "", wasDownloaded: false };
  }
}

/**
 * Download a library item's cover if missing, and persist the local cache record.
 *
 * Extracted so both @/db/helpers/mediaMetadata (which resolves mediaId from
 * libraryItemId via its own DB query) and repairMissingCoverArt below (which already
 * has both IDs from its own query) can share this logic. Callers pass mediaId
 * explicitly rather than covers.ts importing back into mediaMetadata.ts to look it up
 * — that reverse import used to form a circular dependency between the two modules.
 */
export async function cacheCoverAndPersist(
  libraryItemId: string,
  mediaId: string
): Promise<{ uri: string; wasDownloaded: boolean }> {
  const result = await cacheCoverIfMissing(libraryItemId);
  if (result.uri) {
    await setLocalCoverCached(mediaId, result.uri);
  }
  return result;
}

/**
 * Check if a cover file exists in cache
 */
export function isCoverCached(libraryItemId: string): boolean {
  const dir = getCoversDirectory();
  const file = new File(dir, libraryItemId);
  return file.exists;
}

/**
 * Clear all cached covers
 */
export async function clearAllCoverCache(): Promise<void> {
  try {
    const dir = getCoversDirectory();
    if (dir.exists) {
      await dir.delete();
      console.log("[covers] Cleared all cover cache");
    }
  } catch (error) {
    console.error("[covers] Failed to clear cover cache:", error);
  }
}

/**
 * Clear cover cache for a specific library item
 */
export async function clearCoverCache(libraryItemId: string): Promise<void> {
  try {
    const dir = getCoversDirectory();
    const file = new File(dir, libraryItemId);
    if (file.exists) {
      await file.delete();
      console.log(`[covers] Cleared cover cache for ${libraryItemId}`);
    }
  } catch (error) {
    console.error(`[covers] Failed to clear cover cache for ${libraryItemId}:`, error);
  }
}

/**
 * Scan all library items in the database and re-download any missing cover art files.
 *
 * Runs fire-and-forget on app startup to fix cover art gaps caused by fresh install
 * or iOS container UUID rotation. An item is repaired when its cover FILE is
 * missing on disk or its `local_cover_cache` ROW is missing — the two can
 * diverge, and because every cover-rendering query joins on that row, a
 * present file with an absent row renders blank permanently. Items with both
 * are skipped. Work is batched (5 concurrent) to avoid overwhelming the server.
 *
 * Note: Does NOT update the lock screen after download — executeLoadTrack() calls
 * getCoverUri() at track load time, which always returns the current path. Cover art
 * will be correct the next time the user starts playback.
 */
export async function repairMissingCoverArt(): Promise<void> {
  try {
    const allItems = await db
      .select({
        libraryItemId: mediaMetadata.libraryItemId,
        mediaId: mediaMetadata.id,
        cacheRowMediaId: localCoverCache.mediaId,
      })
      .from(mediaMetadata)
      .leftJoin(localCoverCache, eq(mediaMetadata.id, localCoverCache.mediaId));

    // An item needs repair if its cover file is missing on disk OR its
    // local_cover_cache row is missing — every cover-rendering query joins
    // against that row, so a missing row blanks the cover forever even when
    // the file itself downloaded fine. cacheCoverAndPersist below already
    // skips re-downloading when the file exists, so this only adds a DB
    // write for the file-present-but-row-missing case, not a new download.
    const itemsNeedingCovers = allItems.filter(
      (row) =>
        row.libraryItemId !== null &&
        (!isCoverCached(row.libraryItemId) || row.cacheRowMediaId === null)
    );

    console.log(
      `[covers] Repair scan: ${itemsNeedingCovers.length} of ${allItems.length} items missing covers`
    );

    if (itemsNeedingCovers.length === 0) return;

    const batchSize = 5;
    let downloadedCount = 0;
    let rowOnlyCount = 0;

    for (let i = 0; i < itemsNeedingCovers.length; i += batchSize) {
      const batch = itemsNeedingCovers.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((item) =>
          item.libraryItemId
            ? cacheCoverAndPersist(item.libraryItemId, item.mediaId)
                .then((result) => result.wasDownloaded)
                .catch(() => null)
            : Promise.resolve(null)
        )
      );
      downloadedCount += results.filter((r) => r === true).length;
      rowOnlyCount += results.filter((r) => r === false).length;
    }

    // Report the two repair kinds separately. Counting only downloads would
    // log "0 covers downloaded" for a run that healed hundreds of missing
    // local_cover_cache rows — reading as "nothing was wrong" for precisely
    // the failure this scan was widened to catch (files present, rows absent,
    // covers blank forever). A null result means the item genuinely failed.
    console.log(
      `[covers] Repair scan complete: ${downloadedCount} downloaded, ` +
        `${rowOnlyCount} cache rows restored without re-downloading`
    );
  } catch (error) {
    console.error("[covers] Repair scan failed:", error);
    throw error; // re-throw so caller's .catch() receives it for logging
  }
}
