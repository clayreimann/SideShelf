import { getAllDownloadedAudioFiles, getAllDownloadedLibraryFiles } from "@/db/helpers/localData";
import { logger } from "@/lib/logger";
import { downloadService } from "@/services/DownloadService";
import { Directory, File, Paths } from "expo-file-system";

const log = logger.forTag("OrphanScanner");

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
      knownPaths.add(row.downloadPath);
    }
  }

  for (const row of libraryRows) {
    if (row.downloadPath) {
      knownPaths.add(row.downloadPath);
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

        // Normalize URI for comparison — strip trailing slash, decode percent-encoding
        const normalizedUri = decodeURIComponent(file.uri.replace(/\/$/, ""));

        // Check both the raw URI and the decoded URI against known paths
        const isKnown =
          knownPaths.has(file.uri) ||
          knownPaths.has(normalizedUri) ||
          Array.from(knownPaths).some(
            (known) => decodeURIComponent(known.replace(/\/$/, "")) === normalizedUri
          );

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
