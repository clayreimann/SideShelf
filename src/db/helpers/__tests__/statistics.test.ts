/**
 * Tests for statistics database helpers
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { TestDatabase, createTestDb } from '../../../__tests__/utils/testDb';
import {
  getAllCounts,
  getAuthorCount,
  getGenreCount,
  getLanguageCount,
  getNarratorCount,
  getSeriesCount,
  getTagCount,
} from '../statistics';

describe('Statistics Helper', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();

    // Mock the database client to use our test database
    jest.doMock('@/db/client', () => ({
      db: testDb.db,
    }));
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('Individual count functions', () => {
    beforeEach(async () => {
      // Insert test data for each table
      await testDb.sqlite.execSync(`
        INSERT INTO authors (id, name) VALUES
        ('author-1', 'ApiAuthor 1'),
        ('author-2', 'ApiAuthor 2'),
        ('author-3', 'ApiAuthor 3');
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO genres (name) VALUES
        ('Fiction'),
        ('Non-Fiction');
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO languages (name) VALUES
        ('English'),
        ('Spanish'),
        ('French'),
        ('German');
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO narrators (name) VALUES
        ('Narrator 1');
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO series (id, name, added_at, updated_at) VALUES
        ('series-1', 'ApiSeries 1', 1672531200, 1672531200),
        ('series-2', 'ApiSeries 2', 1672617600, 1672617600),
        ('series-3', 'ApiSeries 3', 1672704000, 1672704000),
        ('series-4', 'ApiSeries 4', 1672790400, 1672790400),
        ('series-5', 'ApiSeries 5', 1672876800, 1672876800);
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO tags (name) VALUES
        ('Tag 1'),
        ('Tag 2'),
        ('Tag 3'),
        ('Tag 4'),
        ('Tag 5'),
        ('Tag 6');
      `);
    });

    it('should return correct author count', async () => {
      const count = await getAuthorCount();
      expect(count).toBe(3);
    });

    it('should return correct genre count', async () => {
      const count = await getGenreCount();
      expect(count).toBe(2);
    });

    it('should return correct language count', async () => {
      const count = await getLanguageCount();
      expect(count).toBe(4);
    });

    it('should return correct narrator count', async () => {
      const count = await getNarratorCount();
      expect(count).toBe(1);
    });

    it('should return correct series count', async () => {
      const count = await getSeriesCount();
      expect(count).toBe(5);
    });

    it('should return correct tag count', async () => {
      const count = await getTagCount();
      expect(count).toBe(6);
    });
  });

  describe('getAllCounts', () => {
    beforeEach(async () => {
      // Insert different amounts of test data
      await testDb.sqlite.execSync(`
        INSERT INTO authors (id, name) VALUES
        ('author-1', 'ApiAuthor 1'),
        ('author-2', 'ApiAuthor 2');
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO genres (name) VALUES
        ('Fiction'),
        ('Non-Fiction'),
        ('Mystery');
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO languages (name) VALUES
        ('English');
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO narrators (name) VALUES
        ('Narrator 1'),
        ('Narrator 2'),
        ('Narrator 3'),
        ('Narrator 4');
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO series (id, name, added_at, updated_at) VALUES
        ('series-1', 'ApiSeries 1', 1672531200, 1672531200),
        ('series-2', 'ApiSeries 2', 1672617600, 1672617600),
        ('series-3', 'ApiSeries 3', 1672704000, 1672704000),
        ('series-4', 'ApiSeries 4', 1672790400, 1672790400),
        ('series-5', 'ApiSeries 5', 1672876800, 1672876800);
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO tags (name) VALUES
        ('Tag 1'),
        ('Tag 2'),
        ('Tag 3'),
        ('Tag 4'),
        ('Tag 5'),
        ('Tag 6'),
        ('Tag 7');
      `);
    });

    it('should return all counts in a single object', async () => {
      const counts = await getAllCounts();

      expect(counts).toEqual({
        authors: 2,
        genres: 3,
        languages: 1,
        narrators: 4,
        series: 5,
        tags: 7,
      });
    });

    it('should handle empty tables', async () => {
      // Clear all tables
      await testDb.clearAllTables();

      const counts = await getAllCounts();

      expect(counts).toEqual({
        authors: 0,
        genres: 0,
        languages: 0,
        narrators: 0,
        series: 0,
        tags: 0,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close the database to simulate an error
      await testDb.cleanup();

      // Functions should return 0 gracefully instead of throwing
      await expect(getAuthorCount()).resolves.toBe(0);
      await expect(getAllCounts()).resolves.toEqual({
        authors: 0,
        genres: 0,
        languages: 0,
        narrators: 0,
        series: 0,
        tags: 0,
      });
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', async () => {
      // Insert a larger dataset
      const insertPromises = [];

      for (let i = 1; i <= 1000; i++) {
        insertPromises.push(
          testDb.sqlite.execSync(`
            INSERT INTO authors (id, name)
            VALUES ('author-${i}', 'ApiAuthor ${i}');
          `)
        );
      }

      await Promise.all(insertPromises);

      const startTime = Date.now();
      const count = await getAuthorCount();
      const endTime = Date.now();

      expect(count).toBe(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should batch all count queries efficiently', async () => {
      // Insert moderate amount of data in each table
      for (let i = 1; i <= 100; i++) {
        await testDb.sqlite.execSync(`
          INSERT INTO authors (id, name)
          VALUES ('author-${i}', 'ApiAuthor ${i}');
        `);
        await testDb.sqlite.execSync(`
          INSERT INTO genres (name)
          VALUES ('Genre ${i}');
        `);
        await testDb.sqlite.execSync(`
          INSERT INTO series (id, name, added_at, updated_at)
          VALUES ('series-${i}', 'ApiSeries ${i}', 1672531200, 1672531200);
        `);
      }

      const startTime = Date.now();
      const counts = await getAllCounts();
      const endTime = Date.now();

      expect(counts.authors).toBe(100);
      expect(counts.genres).toBe(100);
      expect(counts.series).toBe(100);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
