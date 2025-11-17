/**
 * Tests for series database helpers
 */

import { series } from '@/db/schema/series';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { createTestDb, TestDatabase } from '../../../__tests__/utils/testDb';
import {
  getAllSeries,
  getSeriesById,
  getSeriesByRecent,
  NewSeriesRow,
  SeriesListRow,
  SeriesRow,
  transformSeriesToDisplayFormat,
  upsertMultipleSeries,
  upsertSeries,
} from '../series';

// Mock the fileSystem module
jest.mock('@/lib/fileSystem', () => ({
  resolveAppPath: jest.fn((path: string) => `resolved://${path}`),
}));

describe('Series Helper', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('Database Operations', () => {
    beforeEach(() => {
      // Mock the database client to use our test database
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));
    });

    describe('upsertSeries', () => {
      it('should insert a new series', async () => {
        const seriesRow: NewSeriesRow = {
          id: 'series-1',
          name: 'Harry Potter',
          description: 'A magical adventure series',
          addedAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        };

        await upsertSeries(seriesRow);

        // Verify the series was inserted
        const insertedSeries = await testDb.db
          .select()
          .from(series)
          .where(eq(series.id, 'series-1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedSeries).toBeDefined();
        expect(insertedSeries?.name).toBe('Harry Potter');
        expect(insertedSeries?.description).toBe('A magical adventure series');
      });

      it('should update an existing series', async () => {
        const seriesRow: NewSeriesRow = {
          id: 'series-1',
          name: 'Harry Potter',
          description: 'A magical adventure series',
          addedAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        };

        // Insert the series first
        await upsertSeries(seriesRow);

        // Update the series
        const updatedSeriesRow: NewSeriesRow = {
          ...seriesRow,
          name: 'Harry Potter Series',
          description: 'An updated description',
          updatedAt: new Date('2023-02-01'),
        };

        await upsertSeries(updatedSeriesRow);

        // Verify the series was updated
        const updatedSeries = await testDb.db
          .select()
          .from(series)
          .where(eq(series.id, 'series-1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(updatedSeries).toBeDefined();
        expect(updatedSeries?.name).toBe('Harry Potter Series');
        expect(updatedSeries?.description).toBe('An updated description');
      });

      it('should handle null description', async () => {
        const seriesRow: NewSeriesRow = {
          id: 'series-1',
          name: 'Series without description',
          description: null,
          addedAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        };

        await upsertSeries(seriesRow);

        const insertedSeries = await testDb.db
          .select()
          .from(series)
          .where(eq(series.id, 'series-1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedSeries?.description).toBeNull();
      });

      it('should handle updatedAt when provided', async () => {
        const customDate = new Date('2023-06-15');
        const seriesRow: NewSeriesRow = {
          id: 'series-1',
          name: 'Test Series',
          description: null,
          addedAt: new Date('2023-01-01'),
          updatedAt: customDate,
        };

        const result = await upsertSeries(seriesRow);

        expect(result.updatedAt).toBeDefined();
      });
    });

    describe('upsertMultipleSeries', () => {
      it('should insert multiple series', async () => {
        const seriesRows: NewSeriesRow[] = [
          {
            id: 'series-1',
            name: 'Harry Potter',
            description: 'A magical adventure',
            addedAt: new Date('2023-01-01'),
            updatedAt: new Date('2023-01-01'),
          },
          {
            id: 'series-2',
            name: 'Lord of the Rings',
            description: 'An epic fantasy',
            addedAt: new Date('2023-01-02'),
            updatedAt: new Date('2023-01-02'),
          },
          {
            id: 'series-3',
            name: 'The Expanse',
            description: 'Science fiction series',
            addedAt: new Date('2023-01-03'),
            updatedAt: new Date('2023-01-03'),
          },
        ];

        await upsertMultipleSeries(seriesRows);

        // Verify all series were inserted
        const allSeries = await testDb.db.select().from(series);

        expect(allSeries).toHaveLength(3);
        expect(allSeries.map(s => s.name)).toContain('Harry Potter');
        expect(allSeries.map(s => s.name)).toContain('Lord of the Rings');
        expect(allSeries.map(s => s.name)).toContain('The Expanse');
      });

      it('should handle empty array', async () => {
        await expect(upsertMultipleSeries([])).resolves.not.toThrow();

        const allSeries = await testDb.db.select().from(series);
        expect(allSeries).toHaveLength(0);
      });
    });

    describe('getAllSeries', () => {
      beforeEach(async () => {
        // Insert test series
        const seriesRows: NewSeriesRow[] = [
          {
            id: 'series-1',
            name: 'Harry Potter',
            description: 'Magical adventure',
            addedAt: new Date('2023-01-01'),
            updatedAt: new Date('2023-01-01'),
          },
          {
            id: 'series-2',
            name: 'Lord of the Rings',
            description: 'Epic fantasy',
            addedAt: new Date('2023-01-02'),
            updatedAt: new Date('2023-01-02'),
          },
          {
            id: 'series-3',
            name: 'A Song of Ice and Fire',
            description: 'Fantasy series',
            addedAt: new Date('2023-01-03'),
            updatedAt: new Date('2023-01-03'),
          },
        ];

        await upsertMultipleSeries(seriesRows);
      });

      it('should return all series ordered by name', async () => {
        const allSeries = await getAllSeries();

        expect(allSeries).toHaveLength(3);
        // Should be alphabetically ordered
        expect(allSeries[0].name).toBe('A Song of Ice and Fire');
        expect(allSeries[1].name).toBe('Harry Potter');
        expect(allSeries[2].name).toBe('Lord of the Rings');
      });

      it('should include books array for each series', async () => {
        const allSeries = await getAllSeries();

        allSeries.forEach(serie => {
          expect(serie.books).toBeDefined();
          expect(Array.isArray(serie.books)).toBe(true);
        });
      });

      it('should return empty array when no series exist', async () => {
        await testDb.sqlite.execSync('DELETE FROM series');

        const allSeries = await getAllSeries();
        expect(allSeries).toHaveLength(0);
      });

      it('should populate books for series with media relationships', async () => {
        // Insert parent library first
        await testDb.sqlite.execSync(`
          INSERT INTO libraries (id, name, created_at, updated_at)
          VALUES ('lib-1', 'Test Library', 1640995200, 1640995200);
        `);

        // Insert library items and metadata
        await testDb.sqlite.execSync(`
          INSERT INTO library_items (id, library_id, media_type, added_at, updated_at)
          VALUES ('li-1', 'lib-1', 'book', 1672531200, 1672531200);
        `);

        await testDb.sqlite.execSync(`
          INSERT INTO media_metadata (id, library_item_id, title, author_name, media_type)
          VALUES ('media-1', 'li-1', 'Book 1', 'Author Name', 'book');
        `);

        // Insert media-series relationship
        await testDb.sqlite.execSync(`
          INSERT INTO media_series (media_id, series_id, sequence)
          VALUES ('media-1', 'series-1', '1');
        `);

        const allSeries = await getAllSeries();
        const harryPotter = allSeries.find(s => s.id === 'series-1');

        expect(harryPotter?.books).toHaveLength(1);
        expect(harryPotter?.books[0].title).toBe('Book 1');
      });
    });

    describe('getSeriesById', () => {
      beforeEach(async () => {
        const seriesRow: NewSeriesRow = {
          id: 'series-1',
          name: 'Harry Potter',
          description: 'Magical adventure',
          addedAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        };

        await upsertSeries(seriesRow);
      });

      it('should find series by ID', async () => {
        const foundSeries = await getSeriesById('series-1');

        expect(foundSeries).toBeDefined();
        expect(foundSeries?.id).toBe('series-1');
        expect(foundSeries?.name).toBe('Harry Potter');
      });

      it('should return null for non-existent ID', async () => {
        const foundSeries = await getSeriesById('non-existent');
        expect(foundSeries).toBeNull();
      });

      it('should return null for empty ID', async () => {
        const foundSeries = await getSeriesById('');
        expect(foundSeries).toBeNull();
      });
    });

    describe('getSeriesByRecent', () => {
      beforeEach(async () => {
        // Insert series with different update times
        const seriesRows: NewSeriesRow[] = [
          {
            id: 'series-1',
            name: 'Oldest',
            description: null,
            addedAt: new Date('2023-01-01'),
            updatedAt: new Date('2023-01-01'),
          },
          {
            id: 'series-2',
            name: 'Newest',
            description: null,
            addedAt: new Date('2023-01-02'),
            updatedAt: new Date('2023-03-01'),
          },
          {
            id: 'series-3',
            name: 'Middle',
            description: null,
            addedAt: new Date('2023-01-03'),
            updatedAt: new Date('2023-02-01'),
          },
        ];

        await upsertMultipleSeries(seriesRows);
      });

      it('should return series ordered by most recent update', async () => {
        const recentSeries = await getSeriesByRecent();

        expect(recentSeries).toHaveLength(3);
        expect(recentSeries[0].name).toBe('Newest');
        expect(recentSeries[1].name).toBe('Middle');
        expect(recentSeries[2].name).toBe('Oldest');
      });

      it('should use name as secondary sort for same updatedAt', async () => {
        // Insert series with same updatedAt
        const seriesRows: NewSeriesRow[] = [
          {
            id: 'series-4',
            name: 'Zebra Series',
            description: null,
            addedAt: new Date('2023-01-01'),
            updatedAt: new Date('2023-04-01'),
          },
          {
            id: 'series-5',
            name: 'Apple Series',
            description: null,
            addedAt: new Date('2023-01-01'),
            updatedAt: new Date('2023-04-01'),
          },
        ];

        await upsertMultipleSeries(seriesRows);

        const recentSeries = await getSeriesByRecent();
        const topTwo = recentSeries.slice(0, 2);

        expect(topTwo[0].name).toBe('Apple Series');
        expect(topTwo[1].name).toBe('Zebra Series');
      });

      it('should return empty array when no series exist', async () => {
        await testDb.sqlite.execSync('DELETE FROM series');

        const recentSeries = await getSeriesByRecent();
        expect(recentSeries).toHaveLength(0);
      });
    });
  });

  describe('transformSeriesToDisplayFormat', () => {
    it('should transform series to display format', () => {
      const seriesWithBooks = [
        {
          id: 'series-1',
          name: 'Harry Potter',
          description: 'Magical adventure',
          addedAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
          books: [
            {
              libraryItemId: 'li-1',
              mediaId: 'media-1',
              title: 'Book 1',
              authorName: 'J.K. Rowling',
              sequence: '1',
              coverUrl: 'cover1.jpg',
              duration: 3600,
            },
            {
              libraryItemId: 'li-2',
              mediaId: 'media-2',
              title: 'Book 2',
              authorName: 'J.K. Rowling',
              sequence: '2',
              coverUrl: 'cover2.jpg',
              duration: 4000,
            },
          ],
        },
        {
          id: 'series-2',
          name: 'Empty Series',
          description: null,
          addedAt: new Date('2023-01-02'),
          updatedAt: new Date('2023-01-02'),
          books: [],
        },
      ];

      const displaySeries = transformSeriesToDisplayFormat(seriesWithBooks);

      expect(displaySeries).toHaveLength(2);
      expect(displaySeries[0]).toMatchObject({
        id: 'series-1',
        name: 'Harry Potter',
        description: 'Magical adventure',
        bookCount: 2,
        firstBookCoverUrl: 'cover1.jpg',
      });
      expect(displaySeries[1]).toMatchObject({
        id: 'series-2',
        name: 'Empty Series',
        description: null,
        bookCount: 0,
        firstBookCoverUrl: null,
      });
    });

    it('should handle null/undefined name', () => {
      const seriesWithBooks = [
        {
          id: 'series-1',
          name: null as any,
          description: null,
          addedAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
          books: [],
        },
      ];

      const displaySeries = transformSeriesToDisplayFormat(seriesWithBooks);

      expect(displaySeries[0].name).toBe('Unknown Series');
    });

    it('should handle empty array', () => {
      const displaySeries = transformSeriesToDisplayFormat([]);

      expect(displaySeries).toHaveLength(0);
    });

    it('should calculate book count correctly', () => {
      const seriesWithBooks = [
        {
          id: 'series-1',
          name: 'Test Series',
          description: null,
          addedAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
          books: [
            {
              libraryItemId: 'li-1',
              mediaId: 'media-1',
              title: 'Book 1',
              authorName: null,
              sequence: null,
              coverUrl: null,
              duration: null,
            },
            {
              libraryItemId: 'li-2',
              mediaId: 'media-2',
              title: 'Book 2',
              authorName: null,
              sequence: null,
              coverUrl: null,
              duration: null,
            },
            {
              libraryItemId: 'li-3',
              mediaId: 'media-3',
              title: 'Book 3',
              authorName: null,
              sequence: null,
              coverUrl: null,
              duration: null,
            },
          ],
        },
      ];

      const displaySeries = transformSeriesToDisplayFormat(seriesWithBooks);

      expect(displaySeries[0].bookCount).toBe(3);
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));
    });

    it('should handle complete series workflow', async () => {
      // Create series
      const seriesRows: NewSeriesRow[] = [
        {
          id: 'series-1',
          name: 'Harry Potter',
          description: 'Magical adventure',
          addedAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        },
        {
          id: 'series-2',
          name: 'Lord of the Rings',
          description: 'Epic fantasy',
          addedAt: new Date('2023-01-02'),
          updatedAt: new Date('2023-02-01'),
        },
      ];

      await upsertMultipleSeries(seriesRows);

      // Get all series
      const allSeries = await getAllSeries();
      expect(allSeries).toHaveLength(2);

      // Get series by recent
      const recentSeries = await getSeriesByRecent();
      expect(recentSeries[0].id).toBe('series-2'); // More recent

      // Get specific series
      const harryPotter = await getSeriesById('series-1');
      expect(harryPotter?.name).toBe('Harry Potter');

      // Transform to display format
      const displaySeries = transformSeriesToDisplayFormat(allSeries);
      expect(displaySeries).toHaveLength(2);

      // Update a series
      const updatedSeries: NewSeriesRow = {
        id: 'series-1',
        name: 'Harry Potter - Complete Collection',
        description: 'Updated description',
        addedAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-03-01'),
      };

      await upsertSeries(updatedSeries);

      const updated = await getSeriesById('series-1');
      expect(updated?.name).toBe('Harry Potter - Complete Collection');
    });
  });
});
