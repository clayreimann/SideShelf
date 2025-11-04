import { apiFetch } from '@/lib/api/api';
import { fetchAuthorImageHead } from '@/lib/api/endpoints';
import { Directory, File, Paths } from 'expo-file-system';

const authorImagesDirectory = new Directory(Paths.cache, 'author_images');

export function getAuthorImagesDirectory(): Directory {
  authorImagesDirectory.create({ intermediates: true, idempotent: true });
  return authorImagesDirectory;
}

export function getAuthorImageUri(authorId: string): string {
  const dir = getAuthorImagesDirectory();
  const file = new File(dir, authorId);
  return file.uri;
}

async function ensureAuthorImagesDirectory(): Promise<void> {
  const dir = getAuthorImagesDirectory();
  try {
    dir.create();
  } catch {}
}

export async function cacheAuthorImageIfMissing(authorId: string): Promise<{ uri: string; wasDownloaded: boolean }> {
  const dir = getAuthorImagesDirectory();
  const destFile = new File(dir, authorId);

  // If file already exists, return it without downloading
  if (destFile.exists) {
    console.log(`[authorImages] Author image for ${authorId} already cached`);
    return { uri: destFile.uri, wasDownloaded: false };
  }

  try {
    const res = await fetchAuthorImageHead(authorId);
    if (!res.ok) return { uri: '', wasDownloaded: false };

    const url = res.url;
    if (!url) return { uri: destFile.uri, wasDownloaded: false };

    // Use apiFetch for the actual image download to ensure proper authentication
    const response = await apiFetch(url);
    if (!response.ok) return { uri: destFile.uri, wasDownloaded: false };

    const bytes = await response.bytes();
    destFile.write(bytes);
    console.log(`[authorImages] Downloaded author image for ${authorId}`);
    return { uri: destFile.uri, wasDownloaded: true };
  } catch (error) {
    console.error(`[authorImages] Failed to download author image for ${authorId}:`, error);
    return { uri: destFile.uri, wasDownloaded: false };
  }
}

/**
 * Check if an author image file exists in cache
 */
export function isAuthorImageCached(authorId: string): boolean {
  const dir = getAuthorImagesDirectory();
  const file = new File(dir, authorId);
  return file.exists;
}

/**
 * Get author initials from name (first letter of first and last name)
 */
export function getAuthorInitials(name: string): string {
  if (!name) return '?';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();

  const first = parts[0][0].toUpperCase();
  const last = parts[parts.length - 1][0].toUpperCase();
  return `${first}${last}`;
}
