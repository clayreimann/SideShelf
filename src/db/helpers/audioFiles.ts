import { db } from '@/db/client';
import { audioFiles } from '@/db/schema/audioFiles';
import type { ApiAudioFile } from '@/types/api';
import { and, eq } from 'drizzle-orm';

export type NewAudioFileRow = typeof audioFiles.$inferInsert;
export type AudioFileRow = typeof audioFiles.$inferSelect;

// Marshal ApiAudioFile from API to database row
export function marshalAudioFileFromApi(mediaId: string, apiAudioFile: ApiAudioFile): NewAudioFileRow {
  return {
    id: `${mediaId}_${apiAudioFile.index}`,
    mediaId,
    index: apiAudioFile.index,
    ino: apiAudioFile.ino,
    filename: apiAudioFile.metadata.filename,
    ext: apiAudioFile.metadata.ext,
    path: apiAudioFile.metadata.path,
    relPath: apiAudioFile.metadata.relPath,
    size: apiAudioFile.metadata.size,
    mtimeMs: apiAudioFile.metadata.mtimeMs,
    ctimeMs: apiAudioFile.metadata.ctimeMs,
    birthtimeMs: apiAudioFile.metadata.birthtimeMs,
    addedAt: apiAudioFile.addedAt,
    updatedAt: apiAudioFile.updatedAt,
    trackNumFromMeta: apiAudioFile.trackNumFromMeta,
    discNumFromMeta: apiAudioFile.discNumFromMeta,
    trackNumFromFilename: apiAudioFile.trackNumFromFilename,
    discNumFromFilename: apiAudioFile.discNumFromFilename,
    manuallyVerified: apiAudioFile.manuallyVerified,
    exclude: apiAudioFile.exclude,
    error: apiAudioFile.error,
    format: apiAudioFile.format,
    duration: apiAudioFile.duration,
    bitRate: apiAudioFile.bitRate,
    language: apiAudioFile.language,
    codec: apiAudioFile.codec,
    timeBase: apiAudioFile.timeBase,
    channels: apiAudioFile.channels,
    channelLayout: apiAudioFile.channelLayout,
    embeddedCoverArt: apiAudioFile.embeddedCoverArt,
    mimeType: apiAudioFile.mimeType,
    // Audio meta tags
    tagAlbum: apiAudioFile.metaTags.tagAlbum,
    tagArtist: apiAudioFile.metaTags.tagArtist,
    tagGenre: apiAudioFile.metaTags.tagGenre,
    tagTitle: apiAudioFile.metaTags.tagTitle,
    tagSeries: apiAudioFile.metaTags.tagSeries,
    tagSeriesPart: apiAudioFile.metaTags.tagSeriesPart,
    tagSubtitle: apiAudioFile.metaTags.tagSubtitle,
    tagAlbumArtist: apiAudioFile.metaTags.tagAlbumArtist,
    tagDate: apiAudioFile.metaTags.tagDate,
    tagComposer: apiAudioFile.metaTags.tagComposer,
    tagPublisher: apiAudioFile.metaTags.tagPublisher,
    tagComment: apiAudioFile.metaTags.tagComment,
    tagLanguage: apiAudioFile.metaTags.tagLanguage,
    tagASIN: apiAudioFile.metaTags.tagASIN,
    // Downloaded file info defaults
    isDownloaded: false,
    downloadPath: null,
    downloadedAt: null,
  };
}

// Upsert a single audio file
export async function upsertAudioFile(audioFile: NewAudioFileRow): Promise<AudioFileRow> {
  const results = await db
    .select()
    .from(audioFiles)
    .where(eq(audioFiles.id, audioFile.id))
    .limit(1);
  const existing = results[0];

  if (existing) {
    const [updated] = await db
      .update(audioFiles)
      .set(audioFile)
      .where(eq(audioFiles.id, audioFile.id))
      .returning();
    return updated;
  }

  const [inserted] = await db.insert(audioFiles).values(audioFile).returning();
  return inserted;
}

// Upsert multiple audio files
export async function upsertAudioFiles(audioFileRows: NewAudioFileRow[]): Promise<void> {
  if (audioFileRows.length === 0) return;

  // Use a transaction for batch operations
  await db.transaction(async (tx) => {
    for (const audioFile of audioFileRows) {
      const results = await tx
        .select()
        .from(audioFiles)
        .where(eq(audioFiles.id, audioFile.id))
        .limit(1);
      const existing = results[0];

      if (existing) {
        await tx
          .update(audioFiles)
          .set(audioFile)
          .where(eq(audioFiles.id, audioFile.id));
      } else {
        await tx.insert(audioFiles).values(audioFile);
      }
    }
  });
}

// Get audio files for a media item
export async function getAudioFilesForMedia(mediaId: string): Promise<AudioFileRow[]> {
  return db
    .select()
    .from(audioFiles)
    .where(eq(audioFiles.mediaId, mediaId))
    .orderBy(audioFiles.index);
}

// Mark audio file as downloaded
export async function markAudioFileAsDownloaded(
  audioFileId: string,
  downloadPath: string
): Promise<void> {
  await db
    .update(audioFiles)
    .set({
      isDownloaded: true,
      downloadPath,
      downloadedAt: new Date(),
    })
    .where(eq(audioFiles.id, audioFileId));
}

// Get downloaded audio files for a media item
export async function getDownloadedAudioFilesForMedia(mediaId: string): Promise<AudioFileRow[]> {
  return db
    .select()
    .from(audioFiles)
    .where(and(eq(audioFiles.mediaId, mediaId), eq(audioFiles.isDownloaded, true)))
    .orderBy(audioFiles.index);
}

// Clear download status for audio file
export async function clearAudioFileDownloadStatus(audioFileId: string): Promise<void> {
  await db
    .update(audioFiles)
    .set({
      isDownloaded: false,
      downloadPath: null,
      downloadedAt: null,
    })
    .where(eq(audioFiles.id, audioFileId));
}
