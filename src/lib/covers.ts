import { db } from '@/db/client';
import { libraryItems } from '@/db/schema_old';
import { fetchLibraryItemCoverHead } from '@/lib/api/endpoints';
import { eq } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';

export function getCoversDirectory(): Directory {
  return new Directory(Paths.cache, 'covers');
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

export async function cacheCoverIfMissing(libraryItemId: string): Promise<string> {
  await ensureCoversDirectory();
  const dir = getCoversDirectory();
  const destFile = new File(dir, libraryItemId);
  if (destFile.exists) return destFile.uri;

  try {
    const res = await fetchLibraryItemCoverHead(libraryItemId);
    if (!res.ok) return destFile.uri;
    const url = res.url;
    if (!url) return destFile.uri;
    const response = await fetch(url);
    const bytes = await response.bytes();
    destFile.write(bytes);
  } catch {}
  return destFile.uri;
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
    } catch {}
  }
}
