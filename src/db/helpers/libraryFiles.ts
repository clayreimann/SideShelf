import { db } from '@/db/client';
import { libraryFiles } from '@/db/schema/libraryFiles';
import type { LibraryFile } from '@/lib/api/types';
import { and, eq } from 'drizzle-orm';

export type NewLibraryFileRow = typeof libraryFiles.$inferInsert;
export type LibraryFileRow = typeof libraryFiles.$inferSelect;

// Marshal LibraryFile from API to database row
export function marshalLibraryFileFromApi(libraryItemId: string, apiLibraryFile: LibraryFile): NewLibraryFileRow {
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
    // Downloaded file info defaults
    isDownloaded: false,
    downloadPath: null,
    downloadedAt: null,
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
  await db
    .update(libraryFiles)
    .set({
      isDownloaded: true,
      downloadPath,
      downloadedAt: new Date(),
    })
    .where(eq(libraryFiles.id, libraryFileId));
}

// Get downloaded library files for a library item
export async function getDownloadedLibraryFilesForItem(libraryItemId: string): Promise<LibraryFileRow[]> {
  return db
    .select()
    .from(libraryFiles)
    .where(and(eq(libraryFiles.libraryItemId, libraryItemId), eq(libraryFiles.isDownloaded, true)))
    .orderBy(libraryFiles.filename);
}

// Get audio library files for a library item
export async function getAudioLibraryFilesForItem(libraryItemId: string): Promise<LibraryFileRow[]> {
  return db
    .select()
    .from(libraryFiles)
    .where(and(eq(libraryFiles.libraryItemId, libraryItemId), eq(libraryFiles.fileType, 'audio')))
    .orderBy(libraryFiles.filename);
}

// Delete library files for a library item
export async function deleteLibraryFilesForItem(libraryItemId: string): Promise<void> {
  await db.delete(libraryFiles).where(eq(libraryFiles.libraryItemId, libraryItemId));
}
