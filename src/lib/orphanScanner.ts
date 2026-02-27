import { getAllDownloadedAudioFiles, getAllDownloadedLibraryFiles } from "@/db/helpers/localData";
import { logger } from "@/lib/logger";
import { downloadService } from "@/services/DownloadService";
import { resolveAppPath } from "@/lib/fileSystem";
import { Directory, File, Paths } from "expo-file-system";

const log = logger.forTag("OrphanScanner");

/**
 * Decode a file URI to a canonical string by repeatedly applying decodeURIComponent
 * until the result stabilises (max 3 passes).
 *
 * This is needed because expo-file-system's dir.list() can return double-encoded
 * URIs (%2520 → %20 → space) while resolveAppPath() / Paths.join() returns
 * unencoded URIs with literal spaces. Normalising both sides to the same decoded
 * representation makes the comparison encoding-independent.
 */
function fullyDecode(uri: string): string {
  let current = uri.replace(/\/$/, "");
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

export interface OrphanFile {
  uri: string;
  filename: string;
  libraryItemId: string;
  size: number;
}

/**
 * Scan download directories for files with no matching DB record.
 * Called lazily on Storage tab focus — not on every foreground resume.
 * Skips library item directories that have an active download in progress.
 */
export async function scanForOrphanFiles(): Promise<OrphanFile[]> {
  const orphans: OrphanFile[] = [];

  // Build a Set of all known download paths (from DB)
  const [audioRows, libraryRows] = await Promise.all([
    getAllDownloadedAudioFiles(),
    getAllDownloadedLibraryFiles(),
  ]);

  const knownPaths = new Set<string>();

  for (const row of audioRows) {
    if (row.downloadPath) {
      // Resolve portable "D:..." / "C:..." paths to current-container absolute paths so
      // the comparison against on-disk file URIs works regardless of storage format.
      knownPaths.add(resolveAppPath(row.downloadPath));
    }
  }

  for (const row of libraryRows) {
    if (row.downloadPath) {
      knownPaths.add(resolveAppPath(row.downloadPath));
    }
  }

  // Walk both documents and caches download directories
  const locations = [
    new Directory(Paths.document, "downloads"),
    new Directory(Paths.cache, "downloads"),
  ];

  for (const downloadsDir of locations) {
    if (!downloadsDir.exists) continue;

    // Each subdirectory is a library item ID
    const itemDirs = downloadsDir.list();
    for (const itemDir of itemDirs) {
      if (!(itemDir instanceof Directory)) continue;

      // Extract library item ID from directory name
      const libraryItemId = itemDir.uri.split("/").filter(Boolean).pop() ?? "";
      if (!libraryItemId) continue;

      // Skip items with active downloads — partial files are not orphans
      if (downloadService.isDownloadActive(libraryItemId)) {
        log.debug(`Skipping active download: ${libraryItemId}`);
        continue;
      }

      const files = itemDir.list();
      for (const file of files) {
        if (!(file instanceof File)) continue;

        // Fully decode both sides to a canonical string before comparing.
        // dir.list() may return double-encoded URIs (%2520) while resolveAppPath
        // returns unencoded paths with literal spaces — fullyDecode normalises both.
        const fileDecoded = fullyDecode(file.uri);
        const isKnown =
          knownPaths.has(file.uri) ||
          Array.from(knownPaths).some((known) => fullyDecode(known) === fileDecoded);

        if (!isKnown) {
          const filename = file.uri.split("/").filter(Boolean).pop() ?? file.uri;
          orphans.push({
            uri: file.uri,
            filename,
            libraryItemId,
            size: file.size ?? 0,
          });
          log.info(`Orphan found: ${filename} (${libraryItemId})`);
        }
      }
    }
  }

  log.info(`Scan complete. Found ${orphans.length} orphan file(s).`);
  return orphans;
}
