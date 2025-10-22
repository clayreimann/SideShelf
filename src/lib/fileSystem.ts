import { Directory, File, Paths } from 'expo-file-system';

/**
 * Get the base directory used for app-managed files.
 */
function getAppBaseDirectory(): Directory {
  return Paths.cache;
}

function decodeUriPathSegments(path: string): string {
  if (!path || !path.includes('%')) {
    return path;
  }

  return path
    .split('/')
    .map((segment) => {
      if (!segment || segment === '.' || segment === '..') {
        return segment;
      }

      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}

function normalizeFileUri(path: string): string {
  if (!path) {
    return path;
  }

  try {
    const url = new URL(path);
    if (url.protocol !== 'file:') {
      return path;
    }

    const normalizedPathname = url.pathname
      .split('/')
      .map((segment) => {
        if (!segment || segment === '.' || segment === '..') {
          return segment;
        }

        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      })
      .join('/');

    url.pathname = normalizedPathname;
    return url.toString();
  } catch {
    return path;
  }
}

/**
 * Convert an absolute path that lives under the app base directory into
 * a relative path for storage. Paths outside of the base directory are
 * returned unchanged.
 */
export function toAppRelativePath(path: string): string {
  if (!path) {
    return path;
  }

  const normalizedPath = normalizeFileUri(path);

  if (!Paths.isAbsolute(normalizedPath)) {
    return normalizedPath;
  }

  const baseDirectory = getAppBaseDirectory();
  const relative = Paths.relative(baseDirectory.uri, normalizedPath);

  if (!relative || relative.startsWith('..') || Paths.isAbsolute(relative)) {
    return normalizedPath;
  }

  return decodeUriPathSegments(relative);
}

/**
 * Resolve a possibly relative path (stored in the database) to an absolute
 * path within the app base directory.
 */
export function resolveAppPath(path: string): string {
  if (!path) {
    return path;
  }

  const normalizedPath = normalizeFileUri(path);

  if (Paths.isAbsolute(normalizedPath)) {
    return normalizedPath;
  }

  const baseDirectory = getAppBaseDirectory();
  const decodedRelativePath = decodeUriPathSegments(normalizedPath);
  return Paths.join(baseDirectory.uri, decodedRelativePath);
}

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
 * Verify that a file actually exists at the given path
 * This is important for cache directories where the OS might delete files
 */
export async function verifyFileExists(filePath: string): Promise<boolean> {
  try {
    const resolvedPath = resolveAppPath(filePath);
    return new File(resolvedPath).exists;
  } catch (error) {
    console.warn('[FileSystem] Error checking file existence:', error);
    return false;
  }
}

/**
 * Generic function to check if a file is downloaded and actually exists on disk
 * Works with any download info that has isDownloaded flag and downloadPath
 */
export async function isFileDownloadedAndExists(
  downloadInfo: { isDownloaded: boolean; downloadPath: string } | null | undefined,
  fileId: string,
  clearDownloadStatusFn: (fileId: string) => Promise<void>,
  logPrefix: string = 'FileSystem'
): Promise<boolean> {
  if (!downloadInfo?.isDownloaded) {
    return false;
  }

  // Verify the file actually exists on disk
  const fileExists = await verifyFileExists(downloadInfo.downloadPath);
  if (!fileExists) {
    const resolvedPath = resolveAppPath(downloadInfo.downloadPath);
    console.warn(`[${logPrefix}] File marked as downloaded but missing: ${resolvedPath}`);

    try {
      await clearDownloadStatusFn(fileId);
      console.log(`[${logPrefix}] Cleared download status for missing file: ${fileId}`);
    } catch (error) {
      console.error(`[${logPrefix}] Failed to clear download status:`, error);
    }
  }

  return fileExists;
}

/**
 * Verify that a downloaded audio file actually exists
 */
export function verifyDownloadedFileExists(libraryItemId: string, filename: string): boolean {
  try {
    const dir = getDownloadsDirectory(libraryItemId);
    const file = new File(dir, filename);
    return file.exists;
  } catch (error) {
    console.warn('[FileSystem] Error verifying downloaded file:', error);
    return false;
  }
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
  return Paths.join(getDownloadsDirectory(libraryItemId).uri, filename);
}
