import { db } from "@/db/client";
import { setLocalCoverCached } from "@/db/helpers/localData";
import { libraryItems } from "@/db/schema/libraryItems";
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

async function ensureCoversDirectory(): Promise<void> {
  const dir = getCoversDirectory();
  try {
    dir.create();
  } catch {}
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

export async function cacheCoversForLibrary(libraryId: string): Promise<void> {
  await ensureCoversDirectory();
  const rows = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(eq(libraryItems.libraryId, libraryId));
  for (const row of rows) {
    if (!row.id) continue;
    try {
      await cacheCoverIfMissing(row.id);
      // update the local cover in the database
      await setLocalCoverCached(row.id, getCoverUri(row.id));
    } catch {}
  }
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
