/**
 * Tests for chapters database helpers
 */

import { chapters } from '@/db/schema/chapters';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { createTestDb, TestDatabase } from '../../../__tests__/utils/testDb';
import {
  ApiChapter,
  ChapterRow,
  deleteChaptersForMedia,
  getCurrentChapterIndex,
  getChaptersForMedia,
  getPlayedChapters,
  getUpcomingChapters,
  marshalChapterFromApi,
  NewChapterRow,
  upsertChapter,
  upsertChapters,
} from '../chapters';

describe('Chapters Helper', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('marshalChapterFromApi', () => {
    it('should correctly marshal chapter data from API', () => {
      const apiChapter: ApiChapter = {
        id: 1,
        start: 0,
        end: 3600.5,
        title: 'Chapter 1',
      };

      const result = marshalChapterFromApi('media-1', apiChapter);

      expect(result).toEqual({
        id: 'media-1_1',
        mediaId: 'media-1',
        chapterId: 1,
        start: 0,
        end: 3600.5,
        title: 'Chapter 1',
      });
    });

    it('should handle chapter with different data', () => {
      const apiChapter: ApiChapter = {
        id: 5,
        start: 1800.25,
        end: 5400.75,
        title: 'Chapter 5: The Adventure Begins',
      };

      const result = marshalChapterFromApi('media-2', apiChapter);

      expect(result).toEqual({
        id: 'media-2_5',
        mediaId: 'media-2',
        chapterId: 5,
        start: 1800.25,
        end: 5400.75,
        title: 'Chapter 5: The Adventure Begins',
      });
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

    describe('upsertChapter', () => {
      it('should insert a new chapter', async () => {
        const chapterRow: NewChapterRow = {
          id: 'media-1_1',
          mediaId: 'media-1',
          chapterId: 1,
          start: 0,
          end: 1800,
          title: 'Introduction',
        };

        await upsertChapter(chapterRow);

        // Verify the chapter was inserted
        const insertedChapter = await testDb.db
          .select()
          .from(chapters)
          .where(eq(chapters.id, 'media-1_1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedChapter).toBeDefined();
        expect(insertedChapter?.title).toBe('Introduction');
        expect(insertedChapter?.start).toBe(0);
        expect(insertedChapter?.end).toBe(1800);
      });

      it('should update an existing chapter', async () => {
        const chapterRow: NewChapterRow = {
          id: 'media-1_1',
          mediaId: 'media-1',
          chapterId: 1,
          start: 0,
          end: 1800,
          title: 'Introduction',
        };

        // Insert the chapter first
        await upsertChapter(chapterRow);

        // Update the chapter
        const updatedChapterRow: NewChapterRow = {
          ...chapterRow,
          title: 'Updated Introduction',
          end: 2000,
        };

        await upsertChapter(updatedChapterRow);

        // Verify the chapter was updated
        const updatedChapter = await testDb.db
          .select()
          .from(chapters)
          .where(eq(chapters.id, 'media-1_1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(updatedChapter).toBeDefined();
        expect(updatedChapter?.title).toBe('Updated Introduction');
        expect(updatedChapter?.end).toBe(2000);
      });
    });

    describe('upsertChapters', () => {
      it('should insert multiple chapters', async () => {
        const chapterRows: NewChapterRow[] = [
          {
            id: 'media-1_1',
            mediaId: 'media-1',
            chapterId: 1,
            start: 0,
            end: 1800,
            title: 'Chapter 1',
          },
          {
            id: 'media-1_2',
            mediaId: 'media-1',
            chapterId: 2,
            start: 1800,
            end: 3600,
            title: 'Chapter 2',
          },
          {
            id: 'media-1_3',
            mediaId: 'media-1',
            chapterId: 3,
            start: 3600,
            end: 5400,
            title: 'Chapter 3',
          },
        ];

        await upsertChapters(chapterRows);

        // Verify all chapters were inserted
        const insertedChapters = await testDb.db
          .select()
          .from(chapters)
          .where(eq(chapters.mediaId, 'media-1'));

        expect(insertedChapters).toHaveLength(3);
        expect(insertedChapters.map(c => c.title)).toContain('Chapter 1');
        expect(insertedChapters.map(c => c.title)).toContain('Chapter 2');
        expect(insertedChapters.map(c => c.title)).toContain('Chapter 3');
      });

      it('should update existing chapters and insert new ones', async () => {
        // Insert initial chapters
        const initialChapters: NewChapterRow[] = [
          {
            id: 'media-1_1',
            mediaId: 'media-1',
            chapterId: 1,
            start: 0,
            end: 1800,
            title: 'Chapter 1',
          },
          {
            id: 'media-1_2',
            mediaId: 'media-1',
            chapterId: 2,
            start: 1800,
            end: 3600,
            title: 'Chapter 2',
          },
        ];

        await upsertChapters(initialChapters);

        // Update chapter 1 and add chapter 3
        const updatedChapters: NewChapterRow[] = [
          {
            id: 'media-1_1',
            mediaId: 'media-1',
            chapterId: 1,
            start: 0,
            end: 2000,
            title: 'Chapter 1 - Updated',
          },
          {
            id: 'media-1_3',
            mediaId: 'media-1',
            chapterId: 3,
            start: 3600,
            end: 5400,
            title: 'Chapter 3',
          },
        ];

        await upsertChapters(updatedChapters);

        // Verify updates
        const chapter1 = await testDb.db
          .select()
          .from(chapters)
          .where(eq(chapters.id, 'media-1_1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(chapter1?.title).toBe('Chapter 1 - Updated');
        expect(chapter1?.end).toBe(2000);

        const chapter3 = await testDb.db
          .select()
          .from(chapters)
          .where(eq(chapters.id, 'media-1_3'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(chapter3).toBeDefined();
        expect(chapter3?.title).toBe('Chapter 3');
      });

      it('should handle empty array', async () => {
        await expect(upsertChapters([])).resolves.not.toThrow();
      });
    });

    describe('getChaptersForMedia', () => {
      beforeEach(async () => {
        // Insert media-2 parent record
        await testDb.sqlite.execSync(`
          INSERT INTO media_metadata (id, library_item_id, title, media_type)
          VALUES ('media-2', 'li-1', 'Test Media 2', 'book');
        `);

        // Insert test chapters
        const chapterRows: NewChapterRow[] = [
          {
            id: 'media-1_1',
            mediaId: 'media-1',
            chapterId: 1,
            start: 0,
            end: 1800,
            title: 'Chapter 1',
          },
          {
            id: 'media-1_2',
            mediaId: 'media-1',
            chapterId: 2,
            start: 1800,
            end: 3600,
            title: 'Chapter 2',
          },
          {
            id: 'media-2_1',
            mediaId: 'media-2',
            chapterId: 1,
            start: 0,
            end: 2000,
            title: 'Different Media Chapter',
          },
        ];

        await upsertChapters(chapterRows);
      });

      it('should return chapters for specific media', async () => {
        const chapters = await getChaptersForMedia('media-1');

        expect(chapters).toHaveLength(2);
        expect(chapters[0].title).toBe('Chapter 1');
        expect(chapters[1].title).toBe('Chapter 2');
      });

      it('should return empty array for media with no chapters', async () => {
        const chapters = await getChaptersForMedia('media-nonexistent');

        expect(chapters).toHaveLength(0);
      });

      it('should order chapters by chapterId', async () => {
        // Insert media-3 parent record
        await testDb.sqlite.execSync(`
          INSERT INTO media_metadata (id, library_item_id, title, media_type)
          VALUES ('media-3', 'li-1', 'Test Media 3', 'book');
        `);

        // Insert chapters in reverse order
        const chapterRows: NewChapterRow[] = [
          {
            id: 'media-3_3',
            mediaId: 'media-3',
            chapterId: 3,
            start: 3600,
            end: 5400,
            title: 'Chapter 3',
          },
          {
            id: 'media-3_1',
            mediaId: 'media-3',
            chapterId: 1,
            start: 0,
            end: 1800,
            title: 'Chapter 1',
          },
          {
            id: 'media-3_2',
            mediaId: 'media-3',
            chapterId: 2,
            start: 1800,
            end: 3600,
            title: 'Chapter 2',
          },
        ];

        await upsertChapters(chapterRows);

        const chapters = await getChaptersForMedia('media-3');

        expect(chapters).toHaveLength(3);
        expect(chapters[0].chapterId).toBe(1);
        expect(chapters[1].chapterId).toBe(2);
        expect(chapters[2].chapterId).toBe(3);
      });
    });

    describe('deleteChaptersForMedia', () => {
      beforeEach(async () => {
        // Insert media-2 parent record
        await testDb.sqlite.execSync(`
          INSERT INTO media_metadata (id, library_item_id, title, media_type)
          VALUES ('media-2', 'li-1', 'Test Media 2', 'book');
        `);

        // Insert test chapters
        const chapterRows: NewChapterRow[] = [
          {
            id: 'media-1_1',
            mediaId: 'media-1',
            chapterId: 1,
            start: 0,
            end: 1800,
            title: 'Chapter 1',
          },
          {
            id: 'media-1_2',
            mediaId: 'media-1',
            chapterId: 2,
            start: 1800,
            end: 3600,
            title: 'Chapter 2',
          },
          {
            id: 'media-2_1',
            mediaId: 'media-2',
            chapterId: 1,
            start: 0,
            end: 2000,
            title: 'Different Media Chapter',
          },
        ];

        await upsertChapters(chapterRows);
      });

      it('should delete all chapters for specific media', async () => {
        // Verify chapters exist before deletion
        let chapters = await getChaptersForMedia('media-1');
        expect(chapters).toHaveLength(2);

        // Delete chapters
        await deleteChaptersForMedia('media-1');

        // Verify chapters are deleted
        chapters = await getChaptersForMedia('media-1');
        expect(chapters).toHaveLength(0);

        // Verify other media's chapters are not affected
        const otherChapters = await getChaptersForMedia('media-2');
        expect(otherChapters).toHaveLength(1);
      });

      it('should not throw when deleting chapters for media with no chapters', async () => {
        await expect(deleteChaptersForMedia('media-nonexistent')).resolves.not.toThrow();
      });
    });
  });

  describe('Utility Functions', () => {
    const mockChapters: ChapterRow[] = [
      {
        id: 'media-1_1',
        mediaId: 'media-1',
        chapterId: 1,
        start: 0,
        end: 1800,
        title: 'Chapter 1',
      },
      {
        id: 'media-1_2',
        mediaId: 'media-1',
        chapterId: 2,
        start: 1800,
        end: 3600,
        title: 'Chapter 2',
      },
      {
        id: 'media-1_3',
        mediaId: 'media-1',
        chapterId: 3,
        start: 3600,
        end: 5400,
        title: 'Chapter 3',
      },
    ];

    describe('getPlayedChapters', () => {
      it('should return chapters that have been fully played', () => {
        const currentPosition = 3700; // In the middle of chapter 3
        const playedChapters = getPlayedChapters(mockChapters, currentPosition);

        expect(playedChapters).toHaveLength(2);
        expect(playedChapters[0].title).toBe('Chapter 1');
        expect(playedChapters[1].title).toBe('Chapter 2');
      });

      it('should return empty array when at the beginning', () => {
        const currentPosition = 0;
        const playedChapters = getPlayedChapters(mockChapters, currentPosition);

        expect(playedChapters).toHaveLength(0);
      });

      it('should return all chapters when past the end', () => {
        const currentPosition = 6000;
        const playedChapters = getPlayedChapters(mockChapters, currentPosition);

        expect(playedChapters).toHaveLength(3);
      });

      it('should not include the current chapter', () => {
        const currentPosition = 1801; // Just past the start of chapter 2
        const playedChapters = getPlayedChapters(mockChapters, currentPosition);

        expect(playedChapters).toHaveLength(1);
        expect(playedChapters[0].title).toBe('Chapter 1');
      });
    });

    describe('getUpcomingChapters', () => {
      it('should return chapters that are upcoming', () => {
        const currentPosition = 100; // In chapter 1
        const upcomingChapters = getUpcomingChapters(mockChapters, currentPosition);

        expect(upcomingChapters).toHaveLength(3);
        expect(upcomingChapters[0].title).toBe('Chapter 1');
        expect(upcomingChapters[1].title).toBe('Chapter 2');
        expect(upcomingChapters[2].title).toBe('Chapter 3');
      });

      it('should return empty array when at the end', () => {
        const currentPosition = 6000;
        const upcomingChapters = getUpcomingChapters(mockChapters, currentPosition);

        expect(upcomingChapters).toHaveLength(0);
      });

      it('should include current chapter', () => {
        const currentPosition = 1900; // In chapter 2
        const upcomingChapters = getUpcomingChapters(mockChapters, currentPosition);

        expect(upcomingChapters).toHaveLength(2);
        expect(upcomingChapters[0].title).toBe('Chapter 2');
        expect(upcomingChapters[1].title).toBe('Chapter 3');
      });

      it('should return all chapters when at the beginning', () => {
        const currentPosition = 0;
        const upcomingChapters = getUpcomingChapters(mockChapters, currentPosition);

        expect(upcomingChapters).toHaveLength(3);
      });
    });

    describe('getCurrentChapterIndex', () => {
      it('should return correct index for current chapter', () => {
        const currentPosition = 100; // In chapter 1
        const index = getCurrentChapterIndex(mockChapters, currentPosition);

        expect(index).toBe(0);
      });

      it('should return correct index for second chapter', () => {
        const currentPosition = 2000; // In chapter 2
        const index = getCurrentChapterIndex(mockChapters, currentPosition);

        expect(index).toBe(1);
      });

      it('should return correct index for last chapter', () => {
        const currentPosition = 5000; // In chapter 3
        const index = getCurrentChapterIndex(mockChapters, currentPosition);

        expect(index).toBe(2);
      });

      it('should return -1 when before first chapter', () => {
        const currentPosition = -10;
        const index = getCurrentChapterIndex(mockChapters, currentPosition);

        expect(index).toBe(-1);
      });

      it('should return -1 when after last chapter', () => {
        const currentPosition = 6000;
        const index = getCurrentChapterIndex(mockChapters, currentPosition);

        expect(index).toBe(-1);
      });

      it('should handle position at chapter boundary', () => {
        const currentPosition = 1800; // Exactly at start of chapter 2
        const index = getCurrentChapterIndex(mockChapters, currentPosition);

        expect(index).toBe(1);
      });

      it('should return -1 for empty chapter list', () => {
        const currentPosition = 100;
        const index = getCurrentChapterIndex([], currentPosition);

        expect(index).toBe(-1);
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

    it('should handle complete chapter workflow', async () => {
      // Marshal chapters from API
      const apiChapters: ApiChapter[] = [
        { id: 1, start: 0, end: 1800, title: 'Chapter 1' },
        { id: 2, start: 1800, end: 3600, title: 'Chapter 2' },
        { id: 3, start: 3600, end: 5400, title: 'Chapter 3' },
      ];

      const marshaledChapters = apiChapters.map(ch =>
        marshalChapterFromApi('media-1', ch)
      );

      // Upsert the chapters
      await upsertChapters(marshaledChapters);

      // Retrieve chapters
      const retrievedChapters = await getChaptersForMedia('media-1');
      expect(retrievedChapters).toHaveLength(3);

      // Test utility functions with retrieved chapters
      const currentPosition = 2000; // In chapter 2

      const playedChapters = getPlayedChapters(retrievedChapters, currentPosition);
      expect(playedChapters).toHaveLength(1);

      const upcomingChapters = getUpcomingChapters(retrievedChapters, currentPosition);
      expect(upcomingChapters).toHaveLength(2);

      const currentIndex = getCurrentChapterIndex(retrievedChapters, currentPosition);
      expect(currentIndex).toBe(1);

      // Delete chapters
      await deleteChaptersForMedia('media-1');

      const deletedChapters = await getChaptersForMedia('media-1');
      expect(deletedChapters).toHaveLength(0);
    });
  });
});
