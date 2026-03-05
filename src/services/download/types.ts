/**
 * Interface contracts for DownloadService collaborators.
 *
 * Placing interfaces here (not in DownloadService.ts) prevents circular imports:
 * collaborators import from this file only, never from DownloadService.ts directly.
 */

/**
 * Collaborator: DB-backed status queries.
 * Checks whether library items and audio files are downloaded, without access
 * to the activeDownloads Map (which lives exclusively in the DownloadService facade).
 */
export interface IDownloadStatusCollaborator {
  isLibraryItemDownloaded(libraryItemId: string): Promise<boolean>;
  getDownloadProgress(
    libraryItemId: string
  ): Promise<{ downloaded: number; total: number; progress: number }>;
  getDownloadedSize(libraryItemId: string): Promise<number>;
}

/**
 * Collaborator: repair and delete operations.
 * Reads DB + file system, writes DB. No access to the activeDownloads Map.
 */
export interface IDownloadRepairCollaborator {
  repairDownloadStatus(libraryItemId: string): Promise<number>;
  deleteDownloadedLibraryItem(libraryItemId: string): Promise<void>;
}
