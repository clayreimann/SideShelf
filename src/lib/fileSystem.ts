import { Directory, File, Paths } from "expo-file-system";

export type StorageLocation = "documents" | "caches";

/**
 * Prefix used to tag app-relative paths stored in the database.
 * "D:" = Documents directory, "C:" = Caches directory.
 * Paths without a prefix are legacy absolute paths or relative paths from
 * the old single-base (Caches) scheme — resolveAppPath handles them as
 * absolute paths (returned unchanged) so existing data still works.
 */
const DOCS_PREFIX = "D:";
const CACHE_PREFIX = "C:";

/**
 * Get the Documents directory.
 * Files here persist unless explicitly deleted, but require iCloud backup exclusion.
 */
export function getDocumentsDirectory(): Directory {
  return Paths.document;
}

/**
 * Get the Caches directory.
 * iOS may delete files here to free space when storage is low.
 */
export function getCachesDirectory(): Directory {
  return Paths.cache;
}

function decodeUriPathSegments(path: string): string {
  if (!path || !path.includes("%")) {
    return path;
  }

  return path
    .split("/")
    .map((segment) => {
      if (!segment || segment === "." || segment === "..") {
        return segment;
      }

      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

function normalizeFileUri(path: string): string {
  if (!path) {
    return path;
  }

  try {
    const url = new URL(path);
    if (url.protocol !== "file:") {
      return path;
    }

    const normalizedPathname = url.pathname
      .split("/")
      .map((segment) => {
        if (!segment || segment === "." || segment === "..") {
          return segment;
        }

        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      })
      .join("/");

    url.pathname = normalizedPathname;
    return url.toString();
  } catch {
    return path;
  }
}

/**
 * Convert an absolute path under the app's Documents or Caches directory into
 * a portable relative path for database storage.
 *
 * Stored format:
 *   "D:downloads/item-id/file.m4b"  — file lives in Documents
 *   "C:downloads/item-id/file.m4b"  — file lives in Caches
 *
 * Paths that don't live under either directory are returned unchanged (this
 * covers cover-image URLs and other non-download paths).
 *
 * The stored path survives iOS app updates because it is resolved at runtime
 * against the current container, rather than storing the container UUID.
 */
export function toAppRelativePath(path: string): string {
  if (!path) {
    return path;
  }

  // Already a prefixed relative path — nothing to do.
  if (path.startsWith(DOCS_PREFIX) || path.startsWith(CACHE_PREFIX)) {
    return path;
  }

  const normalizedPath = normalizeFileUri(path);

  if (!Paths.isAbsolute(normalizedPath)) {
    // Already relative but no prefix — return as-is (legacy or non-download path).
    return normalizedPath;
  }

  // Try Documents first (new downloads always land here).
  const docsRelative = Paths.relative(Paths.document.uri, normalizedPath);
  if (docsRelative && !docsRelative.startsWith("..") && !Paths.isAbsolute(docsRelative)) {
    return DOCS_PREFIX + decodeUriPathSegments(docsRelative);
  }

  // Then try Caches (files moved there by the lifecycle manager).
  const cacheRelative = Paths.relative(Paths.cache.uri, normalizedPath);
  if (cacheRelative && !cacheRelative.startsWith("..") && !Paths.isAbsolute(cacheRelative)) {
    return CACHE_PREFIX + decodeUriPathSegments(cacheRelative);
  }

  // Path is outside both app directories — return unchanged.
  return normalizedPath;
}

/**
 * Resolve a possibly relative path (stored in the database) to an absolute
 * path within the current app container.
 *
 * Handles three formats:
 *   "D:downloads/..."  — resolves against current Documents directory
 *   "C:downloads/..."  — resolves against current Caches directory
 *   "/absolute/path"   — returned as-is (legacy stored absolute paths will be
 *                        stale after an iOS update; callers should use
 *                        verifyFileExists() and repair if needed)
 */
export function resolveAppPath(path: string): string {
  if (!path) {
    return path;
  }

  if (path.startsWith(DOCS_PREFIX)) {
    const relativePart = decodeUriPathSegments(path.slice(DOCS_PREFIX.length));
    return Paths.join(Paths.document.uri, relativePart);
  }

  if (path.startsWith(CACHE_PREFIX)) {
    const relativePart = decodeUriPathSegments(path.slice(CACHE_PREFIX.length));
    return Paths.join(Paths.cache.uri, relativePart);
  }

  // Legacy: already-absolute or unprefixed relative path — return unchanged.
  const normalizedPath = normalizeFileUri(path);
  return normalizedPath;
}

/**
 * Get the downloads directory for a specific library item
 * @param libraryItemId - The library item ID
 * @param location - Where to get the directory from ('documents' or 'caches')
 */
export function getDownloadsDirectory(
  libraryItemId: string,
  location: StorageLocation = "caches"
): Directory {
  const baseDir = location === "documents" ? Paths.document : Paths.cache;
  return new Directory(baseDir, "downloads", libraryItemId);
}

/**
 * Ensure the downloads directory exists for a library item
 * @param libraryItemId - The library item ID
 * @param location - Where to create the directory ('documents' or 'caches')
 */
export async function ensureDownloadsDirectory(
  libraryItemId: string,
  location: StorageLocation = "caches"
): Promise<void> {
  const dir = getDownloadsDirectory(libraryItemId, location);
  try {
    dir.create();
  } catch {
    // Directory might already exist, ignore error
  }
}

/**
 * Check if a file already exists in the downloads directory
 * @param libraryItemId - The library item ID
 * @param filename - The filename to check
 * @param location - Where to check ('documents' or 'caches')
 */
export function downloadFileExists(
  libraryItemId: string,
  filename: string,
  location: StorageLocation = "caches"
): boolean {
  const dir = getDownloadsDirectory(libraryItemId, location);
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
    console.warn("[FileSystem] Error checking file existence:", error);
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
  logPrefix: string = "FileSystem"
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
 * Checks both Documents and Caches directories
 */
export function verifyDownloadedFileExists(libraryItemId: string, filename: string): boolean {
  try {
    // Check Documents first (preferred location)
    const docsDir = getDownloadsDirectory(libraryItemId, "documents");
    const docsFile = new File(docsDir, filename);
    if (docsFile.exists) {
      return true;
    }

    // Check Caches as fallback
    const cacheDir = getDownloadsDirectory(libraryItemId, "caches");
    const cacheFile = new File(cacheDir, filename);
    return cacheFile.exists;
  } catch (error) {
    console.warn("[FileSystem] Error verifying downloaded file:", error);
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
 * @param libraryItemId - The library item ID
 * @param filename - The filename
 * @param location - Where to get the path from ('documents' or 'caches')
 */
export function getDownloadPath(
  libraryItemId: string,
  filename: string,
  location: StorageLocation = "caches"
): string {
  return Paths.join(getDownloadsDirectory(libraryItemId, location).uri, filename);
}

/**
 * Detect the current storage location of an audio file
 * @returns 'documents' | 'caches' | null if file doesn't exist in either location
 */
export function getAudioFileLocation(
  libraryItemId: string,
  filename: string
): StorageLocation | null {
  if (downloadFileExists(libraryItemId, filename, "documents")) {
    return "documents";
  }
  if (downloadFileExists(libraryItemId, filename, "caches")) {
    return "caches";
  }
  return null;
}

/**
 * Move an audio file between Documents and Caches directories
 * @param libraryItemId - The library item ID
 * @param filename - The filename to move
 * @param toDocuments - true to move to Documents, false to move to Caches
 * @returns true if successful, false if failed
 */
export async function moveAudioFile(
  libraryItemId: string,
  filename: string,
  toDocuments: boolean
): Promise<boolean> {
  const sourceLocation: StorageLocation = toDocuments ? "caches" : "documents";
  const destLocation: StorageLocation = toDocuments ? "documents" : "caches";

  try {
    // Get source and destination paths
    const sourcePath = getDownloadPath(libraryItemId, filename, sourceLocation);
    const sourceFile = new File(sourcePath);

    // Check if source file exists
    if (!sourceFile.exists) {
      console.warn(`[FileSystem] Source file does not exist, cannot move: ${sourcePath}`);
      return false;
    }

    // Ensure destination directory exists
    await ensureDownloadsDirectory(libraryItemId, destLocation);

    const destPath = getDownloadPath(libraryItemId, filename, destLocation);
    const destFile = new File(destPath);

    // move file to destination
    sourceFile.move(destFile);

    // Verify the copy succeeded
    if (!destFile.exists) {
      console.error(`[FileSystem] File copy verification failed for ${filename}`);
      return false;
    }

    console.log(
      `[FileSystem] Successfully moved ${filename} from ${sourceLocation} to ${destLocation}`
    );
    return true;
  } catch (error) {
    console.error(`[FileSystem] Error moving file ${filename}:`, error);
    return false;
  }
}
