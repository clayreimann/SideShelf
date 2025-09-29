import { Directory, File, Paths } from 'expo-file-system';

/**
 * Get the downloads directory for a specific library item
 */
export function getDownloadsDirectory(libraryItemId: string): Directory {
  return new Directory(Paths.cache, 'downloads', libraryItemId);
}

/**
 * Ensure the downloads directory exists for a library item
 */
export async function ensureDownloadsDirectory(libraryItemId: string): Promise<void> {
  const dir = getDownloadsDirectory(libraryItemId);
  try {
    dir.create();
  } catch {
    // Directory might already exist, ignore error
  }
}

/**
 * Check if a file already exists in the downloads directory
 */
export function downloadFileExists(libraryItemId: string, filename: string): boolean {
  const dir = getDownloadsDirectory(libraryItemId);
  const file = new File(dir, filename);
  return file.exists;
}

/**
 * Construct download URL for an audio file based on the Swift code pattern
 */
export function constructDownloadUrl(
  libraryItemId: string,
  audioFileIno: string,
  serverUrl: string
): string {
  return `${serverUrl}/api/items/${libraryItemId}/file/${audioFileIno}/download`;
}

/**
 * Get the full path for a downloaded file
 */
export function getDownloadPath(libraryItemId: string, filename: string): string {
  return `${getDownloadsDirectory(libraryItemId).uri}/${filename}`;
}
