import { db } from '@/db/client';
import { audioFiles } from '@/db/schema/audioFiles';
import { isFileDownloadedAndExists } from '@/lib/fileSystem';
import type { ApiAudioFile } from '@/types/api';
import { eq } from 'drizzle-orm';
import {
  clearAudioFileDownloadStatus as clearAudioFileDownloadStatusLocal,
  getAllDownloadedAudioFiles,
  getAudioFileDownloadInfo,
  markAudioFileAsDownloaded as markAudioFileDownloadedLocal
} from './localData';

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
  await markAudioFileDownloadedLocal(audioFileId, downloadPath);
}

// Get downloaded audio files for a media item
export async function getDownloadedAudioFilesForMedia(mediaId: string): Promise<(AudioFileRow & { downloadInfo: { downloadPath: string; downloadedAt: Date } })[]> {
  const downloadedFiles = await getAllDownloadedAudioFiles();
  const downloadedFileIds = new Set(downloadedFiles.map(d => d.audioFileId));

  const audioFilesForMedia = await db
    .select()
    .from(audioFiles)
    .where(eq(audioFiles.mediaId, mediaId))
    .orderBy(audioFiles.index);

  return audioFilesForMedia
    .filter(af => downloadedFileIds.has(af.id))
    .map(af => {
      const downloadInfo = downloadedFiles.find(d => d.audioFileId === af.id)!;
      return {
        ...af,
        downloadInfo: {
          downloadPath: downloadInfo.downloadPath,
          downloadedAt: downloadInfo.downloadedAt,
        }
      };
    });
}

// Clear download status for audio file
export async function clearAudioFileDownloadStatus(audioFileId: string): Promise<void> {
  await clearAudioFileDownloadStatusLocal(audioFileId);
}

// Check if an audio file is downloaded and actually exists on disk
export async function isAudioFileDownloaded(audioFileId: string): Promise<boolean> {
  const downloadInfo = await getAudioFileDownloadInfo(audioFileId);
  return isFileDownloadedAndExists(
    downloadInfo,
    audioFileId,
    clearAudioFileDownloadStatusLocal,
    'AudioFiles'
  );
}
