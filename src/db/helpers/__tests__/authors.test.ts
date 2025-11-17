/**
 * Tests for authors database helpers
 */

import { authors } from '@/db/schema/authors';
import { mediaAuthors } from '@/db/schema/mediaJoins';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { createTestDb, TestDatabase } from '../../../__tests__/utils/testDb';
import {
  AuthorListRow,
  AuthorRow,
  getAllAuthors,
  getAuthorById,
  getAuthorsByPopularity,
  NewAuthorRow,
  transformAuthorsToDisplayFormat,
  updateAuthorBookCount,
  upsertAuthor,
  upsertAuthors,
} from '../authors';

// Mock the authorImages module
jest.mock('@/lib/authorImages', () => ({
  isAuthorImageCached: jest.fn(() => false),
  getAuthorImageUri: jest.fn(() => null),
}));

describe('Authors Helper', () => {
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

    describe('upsertAuthor', () => {
      it('should insert a new author', async () => {
        const authorRow: NewAuthorRow = {
          id: 'author-1',
          name: 'J.K. Rowling',
          imageUrl: 'https://example.com/rowling.jpg',
          numBooks: 7,
        };

        await upsertAuthor(authorRow);

        // Verify the author was inserted
        const insertedAuthor = await testDb.db
          .select()
          .from(authors)
          .where(eq(authors.id, 'author-1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedAuthor).toBeDefined();
        expect(insertedAuthor?.name).toBe('J.K. Rowling');
        expect(insertedAuthor?.imageUrl).toBe('https://example.com/rowling.jpg');
        expect(insertedAuthor?.numBooks).toBe(7);
      });

      it('should update an existing author', async () => {
        const authorRow: NewAuthorRow = {
          id: 'author-1',
          name: 'J.K. Rowling',
          imageUrl: 'https://example.com/rowling.jpg',
          numBooks: 7,
        };

        // Insert the author first
        await upsertAuthor(authorRow);

        // Update the author
        const updatedAuthorRow: NewAuthorRow = {
          ...authorRow,
          name: 'J.K. Rowling (Updated)',
          numBooks: 8,
        };

        await upsertAuthor(updatedAuthorRow);

        // Verify the author was updated
        const updatedAuthor = await testDb.db
          .select()
          .from(authors)
          .where(eq(authors.id, 'author-1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(updatedAuthor).toBeDefined();
        expect(updatedAuthor?.name).toBe('J.K. Rowling (Updated)');
        expect(updatedAuthor?.numBooks).toBe(8);
      });

      it('should handle null values', async () => {
        const authorRow: NewAuthorRow = {
          id: 'author-2',
          name: 'Unknown Author',
          imageUrl: null,
          numBooks: null,
        };

        await upsertAuthor(authorRow);

        const insertedAuthor = await testDb.db
          .select()
          .from(authors)
          .where(eq(authors.id, 'author-2'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedAuthor).toBeDefined();
        expect(insertedAuthor?.imageUrl).toBeNull();
        expect(insertedAuthor?.numBooks).toBeNull();
      });
    });

    describe('upsertAuthors', () => {
      it('should insert multiple authors', async () => {
        const authorRows: NewAuthorRow[] = [
          {
            id: 'author-1',
            name: 'J.K. Rowling',
            imageUrl: 'https://example.com/rowling.jpg',
            numBooks: 7,
          },
          {
            id: 'author-2',
            name: 'George R.R. Martin',
            imageUrl: 'https://example.com/martin.jpg',
            numBooks: 5,
          },
          {
            id: 'author-3',
            name: 'Stephen King',
            imageUrl: 'https://example.com/king.jpg',
            numBooks: 60,
          },
        ];

        await upsertAuthors(authorRows);

        // Verify all authors were inserted
        const allAuthors = await testDb.db.select().from(authors);

        expect(allAuthors).toHaveLength(3);
        expect(allAuthors.map(a => a.name)).toContain('J.K. Rowling');
        expect(allAuthors.map(a => a.name)).toContain('George R.R. Martin');
        expect(allAuthors.map(a => a.name)).toContain('Stephen King');
      });

      it('should handle empty array', async () => {
        await expect(upsertAuthors([])).resolves.not.toThrow();

        const allAuthors = await testDb.db.select().from(authors);
        expect(allAuthors).toHaveLength(0);
      });
    });

    describe('getAllAuthors', () => {
      beforeEach(async () => {
        // Insert test authors
        const authorRows: NewAuthorRow[] = [
          {
            id: 'author-1',
            name: 'J.K. Rowling',
            imageUrl: 'https://example.com/rowling.jpg',
            numBooks: 0,
          },
          {
            id: 'author-2',
            name: 'George R.R. Martin',
            imageUrl: 'https://example.com/martin.jpg',
            numBooks: 0,
          },
          {
            id: 'author-3',
            name: 'Stephen King',
            imageUrl: 'https://example.com/king.jpg',
            numBooks: 0,
          },
        ];

        await upsertAuthors(authorRows);
      });

      it('should return all authors ordered by name', async () => {
        const allAuthors = await getAllAuthors();

        expect(allAuthors).toHaveLength(3);
        expect(allAuthors[0].name).toBe('George R.R. Martin');
        expect(allAuthors[1].name).toBe('J.K. Rowling');
        expect(allAuthors[2].name).toBe('Stephen King');
      });

      it('should calculate book counts from mediaAuthors', async () => {
        // Insert parent records first
        await testDb.sqlite.execSync(`
          INSERT INTO libraries (id, name, created_at, updated_at)
          VALUES ('lib-1', 'Test Library', 1640995200, 1640995200);
        `);

        await testDb.sqlite.execSync(`
          INSERT INTO library_items (id, library_id, media_type, added_at, updated_at)
          VALUES
          ('li-1', 'lib-1', 'book', 1640995200, 1640995200),
          ('li-2', 'lib-1', 'book', 1640995200, 1640995200),
          ('li-3', 'lib-1', 'book', 1640995200, 1640995200);
        `);

        await testDb.sqlite.execSync(`
          INSERT INTO media_metadata (id, library_item_id, title, media_type)
          VALUES
          ('media-1', 'li-1', 'Test Media 1', 'book'),
          ('media-2', 'li-2', 'Test Media 2', 'book'),
          ('media-3', 'li-3', 'Test Media 3', 'book');
        `);

        // Insert media-author relationships
        await testDb.sqlite.execSync(`
          INSERT INTO media_authors (media_id, author_id)
          VALUES
          ('media-1', 'author-1'),
          ('media-2', 'author-1'),
          ('media-3', 'author-2');
        `);

        const allAuthors = await getAllAuthors();

        const rowling = allAuthors.find(a => a.id === 'author-1');
        const martin = allAuthors.find(a => a.id === 'author-2');
        const king = allAuthors.find(a => a.id === 'author-3');

        expect(rowling?.numBooks).toBe(2);
        expect(martin?.numBooks).toBe(1);
        expect(king?.numBooks).toBe(0);
      });

      it('should return empty array when no authors exist', async () => {
        // Clear all authors
        await testDb.sqlite.execSync('DELETE FROM authors');

        const allAuthors = await getAllAuthors();
        expect(allAuthors).toHaveLength(0);
      });

      it('should handle database errors gracefully', async () => {
        // Close the database to simulate an error
        await testDb.cleanup();

        const allAuthors = await getAllAuthors();
        // Should return authors without book counts instead of throwing
        expect(Array.isArray(allAuthors)).toBe(true);
      });
    });

    describe('getAuthorById', () => {
      beforeEach(async () => {
        const authorRow: NewAuthorRow = {
          id: 'author-1',
          name: 'J.K. Rowling',
          imageUrl: 'https://example.com/rowling.jpg',
          numBooks: 7,
        };

        await upsertAuthor(authorRow);
      });

      it('should find author by ID', async () => {
        const author = await getAuthorById('author-1');

        expect(author).toBeDefined();
        expect(author?.id).toBe('author-1');
        expect(author?.name).toBe('J.K. Rowling');
      });

      it('should return null for non-existent ID', async () => {
        const author = await getAuthorById('non-existent');
        expect(author).toBeNull();
      });

      it('should return null for empty ID', async () => {
        const author = await getAuthorById('');
        expect(author).toBeNull();
      });
    });

    describe('getAuthorsByPopularity', () => {
      beforeEach(async () => {
        // Insert authors with different book counts
        const authorRows: NewAuthorRow[] = [
          {
            id: 'author-1',
            name: 'J.K. Rowling',
            imageUrl: null,
            numBooks: 7,
          },
          {
            id: 'author-2',
            name: 'George R.R. Martin',
            imageUrl: null,
            numBooks: 5,
          },
          {
            id: 'author-3',
            name: 'Stephen King',
            imageUrl: null,
            numBooks: 60,
          },
          {
            id: 'author-4',
            name: 'Agatha Christie',
            imageUrl: null,
            numBooks: 60, // Same as Stephen King
          },
        ];

        await upsertAuthors(authorRows);
      });

      it('should return authors ordered by book count (descending)', async () => {
        const popularAuthors = await getAuthorsByPopularity();

        expect(popularAuthors).toHaveLength(4);
        expect(popularAuthors[0].numBooks).toBe(60);
        expect(popularAuthors[1].numBooks).toBe(60);
        expect(popularAuthors[2].numBooks).toBe(7);
        expect(popularAuthors[3].numBooks).toBe(5);
      });

      it('should use name as secondary sort for same book counts', async () => {
        const popularAuthors = await getAuthorsByPopularity();

        // For authors with 60 books, should be sorted by name
        const topTwo = popularAuthors.slice(0, 2);
        const names = topTwo.map(a => a.name);

        expect(names).toContain('Agatha Christie');
        expect(names).toContain('Stephen King');
        expect(names[0]).toBe('Agatha Christie'); // Alphabetically first
      });

      it('should return empty array when no authors exist', async () => {
        await testDb.sqlite.execSync('DELETE FROM authors');

        const popularAuthors = await getAuthorsByPopularity();
        expect(popularAuthors).toHaveLength(0);
      });
    });

    describe('updateAuthorBookCount', () => {
      beforeEach(async () => {
        const authorRow: NewAuthorRow = {
          id: 'author-1',
          name: 'J.K. Rowling',
          imageUrl: null,
          numBooks: 7,
        };

        await upsertAuthor(authorRow);
      });

      it('should update author book count', async () => {
        await updateAuthorBookCount('author-1', 10);

        const author = await getAuthorById('author-1');
        expect(author?.numBooks).toBe(10);
      });

      it('should update to zero', async () => {
        await updateAuthorBookCount('author-1', 0);

        const author = await getAuthorById('author-1');
        expect(author?.numBooks).toBe(0);
      });

      it('should not throw for non-existent author', async () => {
        await expect(updateAuthorBookCount('non-existent', 5)).resolves.not.toThrow();
      });
    });
  });

  describe('transformAuthorsToDisplayFormat', () => {
    it('should transform authors to display format', () => {
      const authors: AuthorRow[] = [
        {
          id: 'author-1',
          name: 'F. Scott Fitzgerald',
          imageUrl: 'https://example.com/fitzgerald.jpg',
          numBooks: 5,
        },
        {
          id: 'author-2',
          name: 'George Orwell',
          imageUrl: null,
          numBooks: 3,
        },
      ];

      const displayAuthors = transformAuthorsToDisplayFormat(authors);

      expect(displayAuthors).toHaveLength(2);
      expect(displayAuthors[0]).toMatchObject({
        id: 'author-1',
        name: 'F. Scott Fitzgerald',
        nameLF: 'Fitzgerald, F. Scott',
        imageUrl: 'https://example.com/fitzgerald.jpg',
        numBooks: 5,
      });
      expect(displayAuthors[1]).toMatchObject({
        id: 'author-2',
        name: 'George Orwell',
        nameLF: 'Orwell, George',
        imageUrl: null,
        numBooks: 3,
      });
    });

    it('should handle author with single name', () => {
      const authors: AuthorRow[] = [
        {
          id: 'author-1',
          name: 'Voltaire',
          imageUrl: null,
          numBooks: 10,
        },
      ];

      const displayAuthors = transformAuthorsToDisplayFormat(authors);

      expect(displayAuthors[0].nameLF).toBe('Voltaire');
    });

    it('should handle author with multiple middle names', () => {
      const authors: AuthorRow[] = [
        {
          id: 'author-1',
          name: 'J. R. R. Tolkien',
          imageUrl: null,
          numBooks: 20,
        },
      ];

      const displayAuthors = transformAuthorsToDisplayFormat(authors);

      expect(displayAuthors[0].nameLF).toBe('Tolkien, J. R. R.');
    });

    it('should preserve name if already in "Last, First" format', () => {
      const authors: AuthorRow[] = [
        {
          id: 'author-1',
          name: 'Christie, Agatha',
          imageUrl: null,
          numBooks: 66,
        },
      ];

      const displayAuthors = transformAuthorsToDisplayFormat(authors);

      expect(displayAuthors[0].nameLF).toBe('Christie, Agatha');
    });

    it('should handle null/undefined name', () => {
      const authors: AuthorRow[] = [
        {
          id: 'author-1',
          name: null as any,
          imageUrl: null,
          numBooks: 0,
        },
      ];

      const displayAuthors = transformAuthorsToDisplayFormat(authors);

      expect(displayAuthors[0].name).toBe('Unknown ApiAuthor');
      expect(displayAuthors[0].nameLF).toBe('ApiAuthor, Unknown');
    });

    it('should handle null numBooks', () => {
      const authors: AuthorRow[] = [
        {
          id: 'author-1',
          name: 'Test Author',
          imageUrl: null,
          numBooks: null,
        },
      ];

      const displayAuthors = transformAuthorsToDisplayFormat(authors);

      expect(displayAuthors[0].numBooks).toBe(0);
    });

    it('should set cachedImageUri to null when image not cached', () => {
      const authors: AuthorRow[] = [
        {
          id: 'author-1',
          name: 'Test Author',
          imageUrl: 'https://example.com/author.jpg',
          numBooks: 5,
        },
      ];

      const displayAuthors = transformAuthorsToDisplayFormat(authors);

      expect(displayAuthors[0].cachedImageUri).toBeNull();
    });

    it('should handle empty array', () => {
      const displayAuthors = transformAuthorsToDisplayFormat([]);

      expect(displayAuthors).toHaveLength(0);
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));
    });

    it('should handle complete author workflow', async () => {
      // Create authors
      const authorRows: NewAuthorRow[] = [
        {
          id: 'author-1',
          name: 'J.K. Rowling',
          imageUrl: 'https://example.com/rowling.jpg',
          numBooks: 0,
        },
        {
          id: 'author-2',
          name: 'George R.R. Martin',
          imageUrl: 'https://example.com/martin.jpg',
          numBooks: 0,
        },
      ];

      await upsertAuthors(authorRows);

      // Insert parent records first
      await testDb.sqlite.execSync(`
        INSERT INTO libraries (id, name, created_at, updated_at)
        VALUES ('lib-1', 'Test Library', 1640995200, 1640995200);
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO library_items (id, library_id, media_type, added_at, updated_at)
        VALUES
        ('li-1', 'lib-1', 'book', 1640995200, 1640995200),
        ('li-2', 'lib-1', 'book', 1640995200, 1640995200),
        ('li-3', 'lib-1', 'book', 1640995200, 1640995200),
        ('li-4', 'lib-1', 'book', 1640995200, 1640995200);
      `);

      await testDb.sqlite.execSync(`
        INSERT INTO media_metadata (id, library_item_id, title, media_type)
        VALUES
        ('media-1', 'li-1', 'Test Media 1', 'book'),
        ('media-2', 'li-2', 'Test Media 2', 'book'),
        ('media-3', 'li-3', 'Test Media 3', 'book'),
        ('media-4', 'li-4', 'Test Media 4', 'book');
      `);

      // Add media-author relationships
      await testDb.sqlite.execSync(`
        INSERT INTO media_authors (media_id, author_id)
        VALUES
        ('media-1', 'author-1'),
        ('media-2', 'author-1'),
        ('media-3', 'author-1'),
        ('media-4', 'author-2');
      `);

      // Get all authors with book counts
      const allAuthors = await getAllAuthors();
      expect(allAuthors).toHaveLength(2);

      const rowling = allAuthors.find(a => a.id === 'author-1');
      expect(rowling?.numBooks).toBe(3);

      // Get authors by popularity
      const popularAuthors = await getAuthorsByPopularity();
      expect(popularAuthors[0].id).toBe('author-1'); // Rowling has more books

      // Transform to display format
      const displayAuthors = transformAuthorsToDisplayFormat(allAuthors);
      expect(displayAuthors[0].nameLF).toContain(',');

      // Update book count
      await updateAuthorBookCount('author-2', 10);

      const updatedMartin = await getAuthorById('author-2');
      expect(updatedMartin?.numBooks).toBe(10);
    });
  });
});
