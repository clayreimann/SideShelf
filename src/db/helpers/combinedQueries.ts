import { db } from '@/db/client';
import { audioFiles } from '@/db/schema/audioFiles';
import { libraryFiles } from '@/db/schema/libraryFiles';
import { localAudioFileDownloads, localCoverCache, localLibraryFileDownloads } from '@/db/schema/localData';
import { mediaMetadata } from '@/db/schema/mediaMetadata';
import { eq } from 'drizzle-orm';

/**
 * Extended types that include local data
 */
export type AudioFileWithDownloadInfo = typeof audioFiles.$inferSelect & {
  downloadInfo?: {
    isDownloaded: boolean;
    downloadPath: string;
    downloadedAt: Date;
    updatedAt: Date;
  };
};

export type LibraryFileWithDownloadInfo = typeof libraryFiles.$inferSelect & {
  downloadInfo?: {
    isDownloaded: boolean;
    downloadPath: string;
    downloadedAt: Date;
    updatedAt: Date;
  };
};

export type MediaMetadataWithCover = typeof mediaMetadata.$inferSelect & {
  localCoverUrl?: string;
};

/**
 * Get audio files for a media item with download information
 */
export async function getAudioFilesWithDownloadInfo(mediaId: string): Promise<AudioFileWithDownloadInfo[]> {
  const result = await db
    .select({
      // Audio file fields
      id: audioFiles.id,
      mediaId: audioFiles.mediaId,
      index: audioFiles.index,
      ino: audioFiles.ino,
      filename: audioFiles.filename,
      ext: audioFiles.ext,
      path: audioFiles.path,
      relPath: audioFiles.relPath,
      size: audioFiles.size,
      mtimeMs: audioFiles.mtimeMs,
      ctimeMs: audioFiles.ctimeMs,
      birthtimeMs: audioFiles.birthtimeMs,
      addedAt: audioFiles.addedAt,
      updatedAt: audioFiles.updatedAt,
      trackNumFromMeta: audioFiles.trackNumFromMeta,
      discNumFromMeta: audioFiles.discNumFromMeta,
      trackNumFromFilename: audioFiles.trackNumFromFilename,
      discNumFromFilename: audioFiles.discNumFromFilename,
      manuallyVerified: audioFiles.manuallyVerified,
      exclude: audioFiles.exclude,
      error: audioFiles.error,
      format: audioFiles.format,
      duration: audioFiles.duration,
      bitRate: audioFiles.bitRate,
      language: audioFiles.language,
      codec: audioFiles.codec,
      timeBase: audioFiles.timeBase,
      channels: audioFiles.channels,
      channelLayout: audioFiles.channelLayout,
      embeddedCoverArt: audioFiles.embeddedCoverArt,
      mimeType: audioFiles.mimeType,
      tagAlbum: audioFiles.tagAlbum,
      tagArtist: audioFiles.tagArtist,
      tagGenre: audioFiles.tagGenre,
      tagTitle: audioFiles.tagTitle,
      tagSeries: audioFiles.tagSeries,
      tagSeriesPart: audioFiles.tagSeriesPart,
      tagSubtitle: audioFiles.tagSubtitle,
      tagAlbumArtist: audioFiles.tagAlbumArtist,
      tagDate: audioFiles.tagDate,
      tagComposer: audioFiles.tagComposer,
      tagPublisher: audioFiles.tagPublisher,
      tagComment: audioFiles.tagComment,
      tagLanguage: audioFiles.tagLanguage,
      tagASIN: audioFiles.tagASIN,
      // Download info fields
      downloadIsDownloaded: localAudioFileDownloads.isDownloaded,
      downloadPath: localAudioFileDownloads.downloadPath,
      downloadedAt: localAudioFileDownloads.downloadedAt,
      downloadUpdatedAt: localAudioFileDownloads.updatedAt,
    })
    .from(audioFiles)
    .leftJoin(localAudioFileDownloads, eq(audioFiles.id, localAudioFileDownloads.audioFileId))
    .where(eq(audioFiles.mediaId, mediaId))
    .orderBy(audioFiles.index);

  return result.map(row => ({
    id: row.id,
    mediaId: row.mediaId,
    index: row.index,
    ino: row.ino,
    filename: row.filename,
    ext: row.ext,
    path: row.path,
    relPath: row.relPath,
    size: row.size,
    mtimeMs: row.mtimeMs,
    ctimeMs: row.ctimeMs,
    birthtimeMs: row.birthtimeMs,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    trackNumFromMeta: row.trackNumFromMeta,
    discNumFromMeta: row.discNumFromMeta,
    trackNumFromFilename: row.trackNumFromFilename,
    discNumFromFilename: row.discNumFromFilename,
    manuallyVerified: row.manuallyVerified,
    exclude: row.exclude,
    error: row.error,
    format: row.format,
    duration: row.duration,
    bitRate: row.bitRate,
    language: row.language,
    codec: row.codec,
    timeBase: row.timeBase,
    channels: row.channels,
    channelLayout: row.channelLayout,
    embeddedCoverArt: row.embeddedCoverArt,
    mimeType: row.mimeType,
    tagAlbum: row.tagAlbum,
    tagArtist: row.tagArtist,
    tagGenre: row.tagGenre,
    tagTitle: row.tagTitle,
    tagSeries: row.tagSeries,
    tagSeriesPart: row.tagSeriesPart,
    tagSubtitle: row.tagSubtitle,
    tagAlbumArtist: row.tagAlbumArtist,
    tagDate: row.tagDate,
    tagComposer: row.tagComposer,
    tagPublisher: row.tagPublisher,
    tagComment: row.tagComment,
    tagLanguage: row.tagLanguage,
    tagASIN: row.tagASIN,
    downloadInfo: row.downloadIsDownloaded ? {
      isDownloaded: row.downloadIsDownloaded,
      downloadPath: row.downloadPath!,
      downloadedAt: row.downloadedAt!,
      updatedAt: row.downloadUpdatedAt!,
    } : undefined,
  }));
}

/**
 * Get library files for an item with download information
 */
export async function getLibraryFilesWithDownloadInfo(libraryItemId: string): Promise<LibraryFileWithDownloadInfo[]> {
  const result = await db
    .select({
      // Library file fields
      id: libraryFiles.id,
      libraryItemId: libraryFiles.libraryItemId,
      ino: libraryFiles.ino,
      filename: libraryFiles.filename,
      ext: libraryFiles.ext,
      path: libraryFiles.path,
      relPath: libraryFiles.relPath,
      size: libraryFiles.size,
      mtimeMs: libraryFiles.mtimeMs,
      ctimeMs: libraryFiles.ctimeMs,
      birthtimeMs: libraryFiles.birthtimeMs,
      isSupplementary: libraryFiles.isSupplementary,
      addedAt: libraryFiles.addedAt,
      updatedAt: libraryFiles.updatedAt,
      fileType: libraryFiles.fileType,
      // Download info fields
      downloadIsDownloaded: localLibraryFileDownloads.isDownloaded,
      downloadPath: localLibraryFileDownloads.downloadPath,
      downloadedAt: localLibraryFileDownloads.downloadedAt,
      downloadUpdatedAt: localLibraryFileDownloads.updatedAt,
    })
    .from(libraryFiles)
    .leftJoin(localLibraryFileDownloads, eq(libraryFiles.id, localLibraryFileDownloads.libraryFileId))
    .where(eq(libraryFiles.libraryItemId, libraryItemId))
    .orderBy(libraryFiles.filename);

  return result.map(row => ({
    id: row.id,
    libraryItemId: row.libraryItemId,
    ino: row.ino,
    filename: row.filename,
    ext: row.ext,
    path: row.path,
    relPath: row.relPath,
    size: row.size,
    mtimeMs: row.mtimeMs,
    ctimeMs: row.ctimeMs,
    birthtimeMs: row.birthtimeMs,
    isSupplementary: row.isSupplementary,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    fileType: row.fileType,
    downloadInfo: row.downloadIsDownloaded ? {
      isDownloaded: row.downloadIsDownloaded,
      downloadPath: row.downloadPath!,
      downloadedAt: row.downloadedAt!,
      updatedAt: row.downloadUpdatedAt!,
    } : undefined,
  }));
}

/**
 * Get media metadata with local cover URL
 */
export async function getMediaMetadataWithCover(mediaId: string): Promise<MediaMetadataWithCover | null> {
  const result = await db
    .select({
      // Media metadata fields
      id: mediaMetadata.id,
      libraryItemId: mediaMetadata.libraryItemId,
      mediaType: mediaMetadata.mediaType,
      title: mediaMetadata.title,
      subtitle: mediaMetadata.subtitle,
      description: mediaMetadata.description,
      language: mediaMetadata.language,
      explicit: mediaMetadata.explicit,
      author: mediaMetadata.author,
      publisher: mediaMetadata.publisher,
      isbn: mediaMetadata.isbn,
      asin: mediaMetadata.asin,
      publishedYear: mediaMetadata.publishedYear,
      publishedDate: mediaMetadata.publishedDate,
      duration: mediaMetadata.duration,
      trackCount: mediaMetadata.trackCount,
      format: mediaMetadata.format,
      edition: mediaMetadata.edition,
      abridged: mediaMetadata.abridged,
      rating: mediaMetadata.rating,
      ratingCount: mediaMetadata.ratingCount,
      goodreadsId: mediaMetadata.goodreadsId,
      googleBooksId: mediaMetadata.googleBooksId,
      feedUrl: mediaMetadata.feedUrl,
      imageUrl: mediaMetadata.imageUrl,
      itunesPageUrl: mediaMetadata.itunesPageUrl,
      itunesId: mediaMetadata.itunesId,
      itunesArtistId: mediaMetadata.itunesArtistId,
      type: mediaMetadata.type,
      authorName: mediaMetadata.authorName,
      authorNameLF: mediaMetadata.authorNameLF,
      narratorName: mediaMetadata.narratorName,
      seriesName: mediaMetadata.seriesName,
      addedAt: mediaMetadata.addedAt,
      updatedAt: mediaMetadata.updatedAt,
      // Local cover URL
      localCoverUrl: localCoverCache.localCoverUrl,
    })
    .from(mediaMetadata)
    .leftJoin(localCoverCache, eq(mediaMetadata.id, localCoverCache.mediaId))
    .where(eq(mediaMetadata.id, mediaId))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return {
    id: row.id,
    libraryItemId: row.libraryItemId,
    mediaType: row.mediaType,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    language: row.language,
    explicit: row.explicit,
    author: row.author,
    publisher: row.publisher,
    isbn: row.isbn,
    asin: row.asin,
    publishedYear: row.publishedYear,
    publishedDate: row.publishedDate,
    duration: row.duration,
    trackCount: row.trackCount,
    format: row.format,
    edition: row.edition,
    abridged: row.abridged,
    rating: row.rating,
    ratingCount: row.ratingCount,
    goodreadsId: row.goodreadsId,
    googleBooksId: row.googleBooksId,
    feedUrl: row.feedUrl,
    imageUrl: row.imageUrl,
    itunesPageUrl: row.itunesPageUrl,
    itunesId: row.itunesId,
    itunesArtistId: row.itunesArtistId,
    type: row.type,
    authorName: row.authorName,
    authorNameLF: row.authorNameLF,
    narratorName: row.narratorName,
    seriesName: row.seriesName,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    localCoverUrl: row.localCoverUrl || undefined,
  };
}

/**
 * Get media metadata by library item ID with local cover URL
 */
export async function getMediaMetadataWithCoverByLibraryItemId(libraryItemId: string): Promise<MediaMetadataWithCover | null> {
  const result = await db
    .select({
      // Media metadata fields
      id: mediaMetadata.id,
      libraryItemId: mediaMetadata.libraryItemId,
      mediaType: mediaMetadata.mediaType,
      title: mediaMetadata.title,
      subtitle: mediaMetadata.subtitle,
      description: mediaMetadata.description,
      language: mediaMetadata.language,
      explicit: mediaMetadata.explicit,
      author: mediaMetadata.author,
      publisher: mediaMetadata.publisher,
      isbn: mediaMetadata.isbn,
      asin: mediaMetadata.asin,
      publishedYear: mediaMetadata.publishedYear,
      publishedDate: mediaMetadata.publishedDate,
      duration: mediaMetadata.duration,
      trackCount: mediaMetadata.trackCount,
      format: mediaMetadata.format,
      edition: mediaMetadata.edition,
      abridged: mediaMetadata.abridged,
      rating: mediaMetadata.rating,
      ratingCount: mediaMetadata.ratingCount,
      goodreadsId: mediaMetadata.goodreadsId,
      googleBooksId: mediaMetadata.googleBooksId,
      feedUrl: mediaMetadata.feedUrl,
      imageUrl: mediaMetadata.imageUrl,
      itunesPageUrl: mediaMetadata.itunesPageUrl,
      itunesId: mediaMetadata.itunesId,
      itunesArtistId: mediaMetadata.itunesArtistId,
      type: mediaMetadata.type,
      authorName: mediaMetadata.authorName,
      authorNameLF: mediaMetadata.authorNameLF,
      narratorName: mediaMetadata.narratorName,
      seriesName: mediaMetadata.seriesName,
      addedAt: mediaMetadata.addedAt,
      updatedAt: mediaMetadata.updatedAt,
      // Local cover URL
      localCoverUrl: localCoverCache.localCoverUrl,
    })
    .from(mediaMetadata)
    .leftJoin(localCoverCache, eq(mediaMetadata.id, localCoverCache.mediaId))
    .where(eq(mediaMetadata.libraryItemId, libraryItemId))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return {
    id: row.id,
    libraryItemId: row.libraryItemId,
    mediaType: row.mediaType,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    language: row.language,
    explicit: row.explicit,
    author: row.author,
    publisher: row.publisher,
    isbn: row.isbn,
    asin: row.asin,
    publishedYear: row.publishedYear,
    publishedDate: row.publishedDate,
    duration: row.duration,
    trackCount: row.trackCount,
    format: row.format,
    edition: row.edition,
    abridged: row.abridged,
    rating: row.rating,
    ratingCount: row.ratingCount,
    goodreadsId: row.goodreadsId,
    googleBooksId: row.googleBooksId,
    feedUrl: row.feedUrl,
    imageUrl: row.imageUrl,
    itunesPageUrl: row.itunesPageUrl,
    itunesId: row.itunesId,
    itunesArtistId: row.itunesArtistId,
    type: row.type,
    authorName: row.authorName,
    authorNameLF: row.authorNameLF,
    narratorName: row.narratorName,
    seriesName: row.seriesName,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
    localCoverUrl: row.localCoverUrl || undefined,
  };
}
