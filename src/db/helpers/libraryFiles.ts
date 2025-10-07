import { db } from '@/db/client';
import { libraryFiles } from '@/db/schema/libraryFiles';
import { isFileDownloadedAndExists } from '@/lib/fileSystem';
import type { ApiLibraryFile } from '@/types/api';
import { and, eq } from 'drizzle-orm';
import {
  clearLibraryFileDownloadStatus as clearLibraryFileDownloadStatusLocal,
  getAllDownloadedLibraryFiles,
  getLibraryFileDownloadInfo,
  markLibraryFileAsDownloaded as markLibraryFileDownloadedLocal
} from './localData';

export type NewLibraryFileRow = typeof libraryFiles.$inferInsert;
export type LibraryFileRow = typeof libraryFiles.$inferSelect;

// Marshal ApiLibraryFile from API to database row
export function marshalLibraryFileFromApi(libraryItemId: string, apiLibraryFile: ApiLibraryFile): NewLibraryFileRow {
  return {
    id: `${libraryItemId}_${apiLibraryFile.ino}`,
    libraryItemId,
    ino: apiLibraryFile.ino,
    filename: apiLibraryFile.metadata.filename,
    ext: apiLibraryFile.metadata.ext,
    path: apiLibraryFile.metadata.path,
    relPath: apiLibraryFile.metadata.relPath,
    size: apiLibraryFile.metadata.size,
    mtimeMs: apiLibraryFile.metadata.mtimeMs,
    ctimeMs: apiLibraryFile.metadata.ctimeMs,
    birthtimeMs: apiLibraryFile.metadata.birthtimeMs,
    addedAt: apiLibraryFile.addedAt,
    updatedAt: apiLibraryFile.updatedAt,
    fileType: apiLibraryFile.fileType,
  };
}

// Upsert a single library file
export async function upsertLibraryFile(libraryFile: NewLibraryFileRow): Promise<LibraryFileRow> {
  const results = await db
    .select()
    .from(libraryFiles)
    .where(eq(libraryFiles.id, libraryFile.id))
    .limit(1);
  const existing = results[0];

  if (existing) {
    const [updated] = await db
      .update(libraryFiles)
      .set(libraryFile)
      .where(eq(libraryFiles.id, libraryFile.id))
      .returning();
    return updated;
  }

  const [inserted] = await db.insert(libraryFiles).values(libraryFile).returning();
  return inserted;
}

// Upsert multiple library files
export async function upsertLibraryFiles(libraryFileRows: NewLibraryFileRow[]): Promise<void> {
  if (libraryFileRows.length === 0) return;

  // Use a transaction for batch operations
  await db.transaction(async (tx) => {
    for (const libraryFile of libraryFileRows) {
      const results = await tx
        .select()
        .from(libraryFiles)
        .where(eq(libraryFiles.id, libraryFile.id))
        .limit(1);
      const existing = results[0];

      if (existing) {
        await tx
          .update(libraryFiles)
          .set(libraryFile)
          .where(eq(libraryFiles.id, libraryFile.id));
      } else {
        await tx.insert(libraryFiles).values(libraryFile);
      }
    }
  });
}

// Get library files for a library item
export async function getLibraryFilesForItem(libraryItemId: string): Promise<LibraryFileRow[]> {
  return db
    .select()
    .from(libraryFiles)
    .where(eq(libraryFiles.libraryItemId, libraryItemId))
    .orderBy(libraryFiles.filename);
}

// Mark library file as downloaded
export async function markLibraryFileAsDownloaded(
  libraryFileId: string,
  downloadPath: string
): Promise<void> {
  await markLibraryFileDownloadedLocal(libraryFileId, downloadPath);
}

// Get downloaded library files for a library item
export async function getDownloadedLibraryFilesForItem(libraryItemId: string): Promise<(LibraryFileRow & { downloadInfo: { downloadPath: string; downloadedAt: Date } })[]> {
  const downloadedFiles = await getAllDownloadedLibraryFiles();
  const downloadedFileIds = new Set(downloadedFiles.map(d => d.libraryFileId));

  const libraryFilesForItem = await db
    .select()
    .from(libraryFiles)
    .where(eq(libraryFiles.libraryItemId, libraryItemId))
    .orderBy(libraryFiles.filename);

  return libraryFilesForItem
    .filter(lf => downloadedFileIds.has(lf.id))
    .map(lf => {
      const downloadInfo = downloadedFiles.find(d => d.libraryFileId === lf.id)!;
      return {
        ...lf,
        downloadInfo: {
          downloadPath: downloadInfo.downloadPath,
          downloadedAt: downloadInfo.downloadedAt,
        }
      };
    });
}

// Get audio library files for a library item
export async function getAudioLibraryFilesForItem(libraryItemId: string): Promise<LibraryFileRow[]> {
  return db
    .select()
    .from(libraryFiles)
    .where(and(eq(libraryFiles.libraryItemId, libraryItemId), eq(libraryFiles.fileType, 'audio')))
    .orderBy(libraryFiles.filename);
}

// Check if a library file is downloaded and actually exists on disk
export async function isLibraryFileDownloaded(libraryFileId: string): Promise<boolean> {
  const downloadInfo = await getLibraryFileDownloadInfo(libraryFileId);
  return isFileDownloadedAndExists(
    downloadInfo,
    libraryFileId,
    clearLibraryFileDownloadStatusLocal,
    'LibraryFiles'
  );
}

// Clear download status for library file
export async function clearLibraryFileDownloadStatus(libraryFileId: string): Promise<void> {
  await clearLibraryFileDownloadStatusLocal(libraryFileId);
}

// Delete library files for a library item
export async function deleteLibraryFilesForItem(libraryItemId: string): Promise<void> {
  await db.delete(libraryFiles).where(eq(libraryFiles.libraryItemId, libraryItemId));
}
