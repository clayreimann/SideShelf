/**
 * Tests for audioFiles database helpers
 */

import { audioFiles } from '@/db/schema/audioFiles';
import type { ApiAudioFile } from '@/types/api';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { mockBook } from '../../../__tests__/fixtures';
import { createTestDb, TestDatabase } from '../../../__tests__/utils/testDb';
import {
  AudioFileRow,
  clearAudioFileDownloadStatus,
  getAudioFilesForMedia,
  getDownloadedAudioFilesForMedia,
  isAudioFileDownloaded,
  markAudioFileAsDownloaded,
  marshalAudioFileFromApi,
  NewAudioFileRow,
  upsertAudioFile,
  upsertAudioFiles,
} from '../audioFiles';

// Mock the localData module
jest.mock('../localData', () => ({
  getAllDownloadedAudioFiles: jest.fn(() => Promise.resolve([])),
  getAudioFileDownloadInfo: jest.fn(() => Promise.resolve(null)),
  markAudioFileAsDownloaded: jest.fn(() => Promise.resolve()),
  clearAudioFileDownloadStatus: jest.fn(() => Promise.resolve()),
}));

// Mock the fileSystem module
jest.mock('@/lib/fileSystem', () => ({
  isFileDownloadedAndExists: jest.fn(() => Promise.resolve(false)),
}));

describe('AudioFiles Helper', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
    jest.clearAllMocks();
  });

  describe('marshalAudioFileFromApi', () => {
    it('should correctly marshal audio file data from API', () => {
      const apiAudioFile: ApiAudioFile = mockBook.audioFiles[0];

      const result = marshalAudioFileFromApi('media-1', apiAudioFile);

      expect(result).toEqual({
        id: 'media-1_1',
        mediaId: 'media-1',
        index: 1,
        ino: '1234567890',
        filename: 'chapter01.mp3',
        ext: '.mp3',
        path: '/audiobooks/gatsby/chapter01.mp3',
        relPath: 'chapter01.mp3',
        size: 15728640,
        mtimeMs: 1640995200000,
        ctimeMs: 1640995200000,
        birthtimeMs: 1640995200000,
        addedAt: 1640995200000,
        updatedAt: 1640995200000,
        trackNumFromMeta: 1,
        discNumFromMeta: 1,
        trackNumFromFilename: 1,
        discNumFromFilename: 1,
        manuallyVerified: false,
        exclude: false,
        error: null,
        format: 'MP3',
        duration: 3600.5,
        bitRate: 128000,
        language: 'en',
        codec: 'mp3',
        timeBase: '1/14112000',
        channels: 2,
        channelLayout: 'stereo',
        embeddedCoverArt: null,
        mimeType: 'audio/mpeg',
        tagAlbum: 'The Great Gatsby',
        tagArtist: 'F. Scott Fitzgerald',
        tagGenre: 'Fiction',
        tagTitle: 'Chapter 1',
        tagSeries: undefined,
        tagSeriesPart: undefined,
        tagSubtitle: undefined,
        tagAlbumArtist: 'F. Scott Fitzgerald',
        tagDate: '1925',
        tagComposer: undefined,
        tagPublisher: undefined,
        tagComment: undefined,
        tagLanguage: undefined,
        tagASIN: undefined,
      });
    });

    it('should handle audio file with different index', () => {
      const apiAudioFile: ApiAudioFile = {
        ...mockBook.audioFiles[0],
        index: 5,
      };

      const result = marshalAudioFileFromApi('media-2', apiAudioFile);

      expect(result.id).toBe('media-2_5');
      expect(result.mediaId).toBe('media-2');
      expect(result.index).toBe(5);
    });

    it('should handle null values', () => {
      const apiAudioFile: ApiAudioFile = {
        ...mockBook.audioFiles[0],
        error: null,
        embeddedCoverArt: null,
        language: null,
        trackNumFromMeta: null,
        discNumFromMeta: null,
      };

      const result = marshalAudioFileFromApi('media-1', apiAudioFile);

      expect(result.error).toBeNull();
      expect(result.embeddedCoverArt).toBeNull();
    });
  });

  describe('Database Operations', () => {
    beforeEach(async () => {
      // Mock the database client to use our test database
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));

      // Insert parent records required for foreign key constraints
      await testDb.sqlite.execSync(`
        INSERT INTO libraries (id, name, created_at, updated_at)
        VALUES ('lib-1', 'Test Library', 1640995200, 1640995200);
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO library_items (id, library_id, media_type, added_at, updated_at)
        VALUES ('li-1', 'lib-1', 'book', 1640995200, 1640995200);
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO media_metadata (id, library_item_id, title, media_type)
        VALUES ('media-1', 'li-1', 'Test Media', 'book');
      `);
    });

    describe('upsertAudioFile', () => {
      it('should insert a new audio file', async () => {
        const audioFileRow: NewAudioFileRow = {
          id: 'media-1_1',
          mediaId: 'media-1',
          index: 1,
          ino: '1234567890',
          filename: 'chapter01.mp3',
          ext: '.mp3',
          path: '/audiobooks/test/chapter01.mp3',
          relPath: 'chapter01.mp3',
          size: 15728640,
          mtimeMs: 1640995200000,
          ctimeMs: 1640995200000,
          birthtimeMs: 1640995200000,
          addedAt: 1640995200000,
          updatedAt: 1640995200000,
          trackNumFromMeta: 1,
          discNumFromMeta: 1,
          trackNumFromFilename: 1,
          discNumFromFilename: 1,
          manuallyVerified: false,
          exclude: false,
          error: null,
          format: 'MP3',
          duration: 3600.5,
          bitRate: 128000,
          language: 'en',
          codec: 'mp3',
          timeBase: '1/14112000',
          channels: 2,
          channelLayout: 'stereo',
          embeddedCoverArt: null,
          mimeType: 'audio/mpeg',
          tagAlbum: 'Test Album',
          tagArtist: 'Test Artist',
          tagGenre: 'Fiction',
          tagTitle: 'Chapter 1',
          tagSeries: null,
          tagSeriesPart: null,
          tagSubtitle: null,
          tagAlbumArtist: 'Test Artist',
          tagDate: '2023',
          tagComposer: null,
          tagPublisher: null,
          tagComment: null,
          tagLanguage: null,
          tagASIN: null,
        };

        await upsertAudioFile(audioFileRow);

        // Verify the audio file was inserted
        const insertedAudioFile = await testDb.db
          .select()
          .from(audioFiles)
          .where(eq(audioFiles.id, 'media-1_1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedAudioFile).toBeDefined();
        expect(insertedAudioFile?.filename).toBe('chapter01.mp3');
        expect(insertedAudioFile?.duration).toBe(3600.5);
      });

      it('should update an existing audio file', async () => {
        const audioFileRow: NewAudioFileRow = {
          id: 'media-1_1',
          mediaId: 'media-1',
          index: 1,
          ino: '1234567890',
          filename: 'chapter01.mp3',
          ext: '.mp3',
          path: '/audiobooks/test/chapter01.mp3',
          relPath: 'chapter01.mp3',
          size: 15728640,
          mtimeMs: 1640995200000,
          ctimeMs: 1640995200000,
          birthtimeMs: 1640995200000,
          addedAt: 1640995200000,
          updatedAt: 1640995200000,
          trackNumFromMeta: 1,
          discNumFromMeta: 1,
          trackNumFromFilename: 1,
          discNumFromFilename: 1,
          manuallyVerified: false,
          exclude: false,
          error: null,
          format: 'MP3',
          duration: 3600.5,
          bitRate: 128000,
          language: 'en',
          codec: 'mp3',
          timeBase: '1/14112000',
          channels: 2,
          channelLayout: 'stereo',
          embeddedCoverArt: null,
          mimeType: 'audio/mpeg',
          tagAlbum: null,
          tagArtist: null,
          tagGenre: null,
          tagTitle: null,
          tagSeries: null,
          tagSeriesPart: null,
          tagSubtitle: null,
          tagAlbumArtist: null,
          tagDate: null,
          tagComposer: null,
          tagPublisher: null,
          tagComment: null,
          tagLanguage: null,
          tagASIN: null,
        };

        // Insert the audio file first
        await upsertAudioFile(audioFileRow);

        // Update the audio file
        const updatedAudioFileRow: NewAudioFileRow = {
          ...audioFileRow,
          duration: 3800.0,
          tagTitle: 'Updated Chapter 1',
        };

        await upsertAudioFile(updatedAudioFileRow);

        // Verify the audio file was updated
        const updatedAudioFile = await testDb.db
          .select()
          .from(audioFiles)
          .where(eq(audioFiles.id, 'media-1_1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(updatedAudioFile).toBeDefined();
        expect(updatedAudioFile?.duration).toBe(3800.0);
        expect(updatedAudioFile?.tagTitle).toBe('Updated Chapter 1');
      });
    });

    describe('upsertAudioFiles', () => {
      it('should insert multiple audio files', async () => {
        const audioFileRows: NewAudioFileRow[] = [
          {
            id: 'media-1_1',
            mediaId: 'media-1',
            index: 1,
            ino: '1111111111',
            filename: 'chapter01.mp3',
            ext: '.mp3',
            path: '/audiobooks/test/chapter01.mp3',
            relPath: 'chapter01.mp3',
            size: 15728640,
            mtimeMs: 1640995200000,
            ctimeMs: 1640995200000,
            birthtimeMs: 1640995200000,
            addedAt: 1640995200000,
            updatedAt: 1640995200000,
            trackNumFromMeta: 1,
            discNumFromMeta: 1,
            trackNumFromFilename: 1,
            discNumFromFilename: 1,
            manuallyVerified: false,
            exclude: false,
            error: null,
            format: 'MP3',
            duration: 3600.5,
            bitRate: 128000,
            language: 'en',
            codec: 'mp3',
            timeBase: '1/14112000',
            channels: 2,
            channelLayout: 'stereo',
            embeddedCoverArt: null,
            mimeType: 'audio/mpeg',
            tagAlbum: null,
            tagArtist: null,
            tagGenre: null,
            tagTitle: null,
            tagSeries: null,
            tagSeriesPart: null,
            tagSubtitle: null,
            tagAlbumArtist: null,
            tagDate: null,
            tagComposer: null,
            tagPublisher: null,
            tagComment: null,
            tagLanguage: null,
            tagASIN: null,
          },
          {
            id: 'media-1_2',
            mediaId: 'media-1',
            index: 2,
            ino: '2222222222',
            filename: 'chapter02.mp3',
            ext: '.mp3',
            path: '/audiobooks/test/chapter02.mp3',
            relPath: 'chapter02.mp3',
            size: 16777216,
            mtimeMs: 1640995200000,
            ctimeMs: 1640995200000,
            birthtimeMs: 1640995200000,
            addedAt: 1640995200000,
            updatedAt: 1640995200000,
            trackNumFromMeta: 2,
            discNumFromMeta: 1,
            trackNumFromFilename: 2,
            discNumFromFilename: 1,
            manuallyVerified: false,
            exclude: false,
            error: null,
            format: 'MP3',
            duration: 3800.0,
            bitRate: 128000,
            language: 'en',
            codec: 'mp3',
            timeBase: '1/14112000',
            channels: 2,
            channelLayout: 'stereo',
            embeddedCoverArt: null,
            mimeType: 'audio/mpeg',
            tagAlbum: null,
            tagArtist: null,
            tagGenre: null,
            tagTitle: null,
            tagSeries: null,
            tagSeriesPart: null,
            tagSubtitle: null,
            tagAlbumArtist: null,
            tagDate: null,
            tagComposer: null,
            tagPublisher: null,
            tagComment: null,
            tagLanguage: null,
            tagASIN: null,
          },
        ];

        await upsertAudioFiles(audioFileRows);

        // Verify all audio files were inserted
        const insertedAudioFiles = await testDb.db
          .select()
          .from(audioFiles)
          .where(eq(audioFiles.mediaId, 'media-1'));

        expect(insertedAudioFiles).toHaveLength(2);
        expect(insertedAudioFiles.map(af => af.filename)).toContain('chapter01.mp3');
        expect(insertedAudioFiles.map(af => af.filename)).toContain('chapter02.mp3');
      });

      it('should handle empty array', async () => {
        await expect(upsertAudioFiles([])).resolves.not.toThrow();
      });
    });

    describe('getAudioFilesForMedia', () => {
      beforeEach(async () => {
        // Insert media-2 parent records
        await testDb.sqlite.execSync(`
          INSERT INTO media_metadata (id, library_item_id, title, media_type)
          VALUES ('media-2', 'li-1', 'Test Media 2', 'book');
        `);

        // Insert test audio files
        const audioFileRows: NewAudioFileRow[] = [
          {
            id: 'media-1_2',
            mediaId: 'media-1',
            index: 2,
            ino: '2222222222',
            filename: 'chapter02.mp3',
            ext: '.mp3',
            path: '/test/chapter02.mp3',
            relPath: 'chapter02.mp3',
            size: 16777216,
            mtimeMs: 1640995200000,
            ctimeMs: 1640995200000,
            birthtimeMs: 1640995200000,
            addedAt: 1640995200000,
            updatedAt: 1640995200000,
            trackNumFromMeta: 2,
            discNumFromMeta: 1,
            trackNumFromFilename: 2,
            discNumFromFilename: 1,
            manuallyVerified: false,
            exclude: false,
            error: null,
            format: 'MP3',
            duration: 3800.0,
            bitRate: 128000,
            language: 'en',
            codec: 'mp3',
            timeBase: '1/14112000',
            channels: 2,
            channelLayout: 'stereo',
            embeddedCoverArt: null,
            mimeType: 'audio/mpeg',
            tagAlbum: null,
            tagArtist: null,
            tagGenre: null,
            tagTitle: null,
            tagSeries: null,
            tagSeriesPart: null,
            tagSubtitle: null,
            tagAlbumArtist: null,
            tagDate: null,
            tagComposer: null,
            tagPublisher: null,
            tagComment: null,
            tagLanguage: null,
            tagASIN: null,
          },
          {
            id: 'media-1_1',
            mediaId: 'media-1',
            index: 1,
            ino: '1111111111',
            filename: 'chapter01.mp3',
            ext: '.mp3',
            path: '/test/chapter01.mp3',
            relPath: 'chapter01.mp3',
            size: 15728640,
            mtimeMs: 1640995200000,
            ctimeMs: 1640995200000,
            birthtimeMs: 1640995200000,
            addedAt: 1640995200000,
            updatedAt: 1640995200000,
            trackNumFromMeta: 1,
            discNumFromMeta: 1,
            trackNumFromFilename: 1,
            discNumFromFilename: 1,
            manuallyVerified: false,
            exclude: false,
            error: null,
            format: 'MP3',
            duration: 3600.5,
            bitRate: 128000,
            language: 'en',
            codec: 'mp3',
            timeBase: '1/14112000',
            channels: 2,
            channelLayout: 'stereo',
            embeddedCoverArt: null,
            mimeType: 'audio/mpeg',
            tagAlbum: null,
            tagArtist: null,
            tagGenre: null,
            tagTitle: null,
            tagSeries: null,
            tagSeriesPart: null,
            tagSubtitle: null,
            tagAlbumArtist: null,
            tagDate: null,
            tagComposer: null,
            tagPublisher: null,
            tagComment: null,
            tagLanguage: null,
            tagASIN: null,
          },
          {
            id: 'media-2_1',
            mediaId: 'media-2',
            index: 1,
            ino: '3333333333',
            filename: 'different.mp3',
            ext: '.mp3',
            path: '/test/different.mp3',
            relPath: 'different.mp3',
            size: 10485760,
            mtimeMs: 1640995200000,
            ctimeMs: 1640995200000,
            birthtimeMs: 1640995200000,
            addedAt: 1640995200000,
            updatedAt: 1640995200000,
            trackNumFromMeta: 1,
            discNumFromMeta: 1,
            trackNumFromFilename: 1,
            discNumFromFilename: 1,
            manuallyVerified: false,
            exclude: false,
            error: null,
            format: 'MP3',
            duration: 2400.0,
            bitRate: 128000,
            language: 'en',
            codec: 'mp3',
            timeBase: '1/14112000',
            channels: 2,
            channelLayout: 'stereo',
            embeddedCoverArt: null,
            mimeType: 'audio/mpeg',
            tagAlbum: null,
            tagArtist: null,
            tagGenre: null,
            tagTitle: null,
            tagSeries: null,
            tagSeriesPart: null,
            tagSubtitle: null,
            tagAlbumArtist: null,
            tagDate: null,
            tagComposer: null,
            tagPublisher: null,
            tagComment: null,
            tagLanguage: null,
            tagASIN: null,
          },
        ];

        await upsertAudioFiles(audioFileRows);
      });

      it('should return audio files for specific media ordered by index', async () => {
        const audioFilesForMedia = await getAudioFilesForMedia('media-1');

        expect(audioFilesForMedia).toHaveLength(2);
        expect(audioFilesForMedia[0].index).toBe(1);
        expect(audioFilesForMedia[1].index).toBe(2);
        expect(audioFilesForMedia[0].filename).toBe('chapter01.mp3');
        expect(audioFilesForMedia[1].filename).toBe('chapter02.mp3');
      });

      it('should return empty array for media with no audio files', async () => {
        const audioFilesForMedia = await getAudioFilesForMedia('media-nonexistent');

        expect(audioFilesForMedia).toHaveLength(0);
      });
    });

    describe('Download Operations', () => {
      it('should mark audio file as downloaded', async () => {
        await expect(
          markAudioFileAsDownloaded('audio-1', '/path/to/download.mp3')
        ).resolves.not.toThrow();

        // Verify the mock was called
        const { markAudioFileAsDownloaded: mockMarkDownloaded } = require('../localData');
        expect(mockMarkDownloaded).toHaveBeenCalledWith('audio-1', '/path/to/download.mp3');
      });

      it('should clear audio file download status', async () => {
        await expect(clearAudioFileDownloadStatus('audio-1')).resolves.not.toThrow();

        // Verify the mock was called
        const { clearAudioFileDownloadStatus: mockClearStatus } = require('../localData');
        expect(mockClearStatus).toHaveBeenCalledWith('audio-1');
      });

      it('should check if audio file is downloaded', async () => {
        const result = await isAudioFileDownloaded('audio-1');

        expect(result).toBe(false);

        // Verify the mocks were called
        const { getAudioFileDownloadInfo } = require('../localData');
        expect(getAudioFileDownloadInfo).toHaveBeenCalledWith('audio-1');
      });
    });
  });

  describe('Integration Tests', () => {
    beforeEach(async () => {
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));

      // Insert parent records required for foreign key constraints
      await testDb.sqlite.execSync(`
        INSERT INTO libraries (id, name, created_at, updated_at)
        VALUES ('lib-1', 'Test Library', 1640995200, 1640995200);
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO library_items (id, library_id, media_type, added_at, updated_at)
        VALUES ('li-1', 'lib-1', 'book', 1640995200, 1640995200);
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO media_metadata (id, library_item_id, title, media_type)
        VALUES ('media-1', 'li-1', 'Test Media', 'book');
      `);
    });

    it('should handle complete audio file workflow', async () => {
      // Marshal audio file from API
      const apiAudioFile: ApiAudioFile = mockBook.audioFiles[0];
      const marshaledAudioFile = marshalAudioFileFromApi('media-1', apiAudioFile);

      // Upsert the audio file
      await upsertAudioFile(marshaledAudioFile);

      // Retrieve audio files
      const audioFilesForMedia = await getAudioFilesForMedia('media-1');
      expect(audioFilesForMedia).toHaveLength(1);
      expect(audioFilesForMedia[0].filename).toBe('chapter01.mp3');

      // Update the audio file
      const updatedAudioFile: NewAudioFileRow = {
        ...marshaledAudioFile,
        duration: 4000.0,
      };

      await upsertAudioFile(updatedAudioFile);

      // Verify update
      const updatedAudioFiles = await getAudioFilesForMedia('media-1');
      expect(updatedAudioFiles[0].duration).toBe(4000.0);
    });
  });
});
