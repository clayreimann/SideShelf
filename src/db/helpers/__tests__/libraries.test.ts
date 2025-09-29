/**
 * Tests for library database helpers
 */

import { libraries } from '@/db/schema/libraries';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';
import {
  mockApiLibrary,
  mockApiPodcastLibrary,
  mockLibrariesResponse,
  mockLibraryRow,
  mockPodcastLibraryRow,
} from '../../../__tests__/fixtures';
import { createTestDb, TestDatabase } from '../../../__tests__/utils/testDb';
import {
  deleteAllLibraries,
  getAllLibraries,
  getLibraryById,
  marshalLibrariesFromResponse,
  marshalLibraryFromApi,
  NewLibraryRow,
  upsertLibraries,
  upsertLibrary
} from '../libraries';

describe('Libraries Helper', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('marshalLibraryFromApi', () => {
    it('should correctly marshal library data from API', () => {
      const result = marshalLibraryFromApi(mockApiLibrary);

      expect(result).toEqual({
        id: 'lib-1',
        name: 'My Books',
        icon: 'database',
        displayOrder: 1,
        mediaType: 'book',
        createdAt: 1640995200000,
        updatedAt: 1672531200000,
      });
    });

    it('should handle missing optional fields', () => {
      const libraryWithMissingFields = {
        id: 'lib-minimal',
        name: 'Minimal ApiLibrary',
        folders: [],
        // Missing icon, displayOrder, mediaType, createdAt, lastUpdate
      } as any;

      const result = marshalLibraryFromApi(libraryWithMissingFields);

      expect(result).toEqual({
        id: 'lib-minimal',
        name: 'Minimal ApiLibrary',
        icon: null,
        displayOrder: null,
        mediaType: null,
        createdAt: null,
        updatedAt: null,
      });
    });

    it('should handle podcast library', () => {
      const result = marshalLibraryFromApi(mockApiPodcastLibrary);

      expect(result).toEqual({
        id: 'lib-2',
        name: 'My Podcasts',
        icon: 'podcast',
        displayOrder: 2,
        mediaType: 'podcast',
        createdAt: 1640995200000,
        updatedAt: 1672531200000,
      });
    });
  });

  describe('marshalLibrariesFromResponse', () => {
    it('should marshal multiple libraries from API response', () => {
      const result = marshalLibrariesFromResponse(mockLibrariesResponse);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'lib-1',
        name: 'My Books',
        icon: 'database',
        displayOrder: 1,
        mediaType: 'book',
        createdAt: 1640995200000,
        updatedAt: 1672531200000,
      });
      expect(result[1]).toEqual({
        id: 'lib-2',
        name: 'My Podcasts',
        icon: 'podcast',
        displayOrder: 2,
        mediaType: 'podcast',
        createdAt: 1640995200000,
        updatedAt: 1672531200000,
      });
    });

    it('should handle empty libraries array', () => {
      const emptyResponse = { libraries: [] };
      const result = marshalLibrariesFromResponse(emptyResponse);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });
  });

  describe('Database Operations', () => {
    beforeEach(() => {
      // Mock the database client to use our test database
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));
    });

    describe('upsertLibrary', () => {
      it('should insert a new library', async () => {
        const libraryRow: NewLibraryRow = {
          id: 'lib-new',
          name: 'New ApiLibrary',
          icon: 'book',
          displayOrder: 3,
          mediaType: 'book',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await upsertLibrary(libraryRow);

        // Verify the library was inserted
        const insertedLibrary = await testDb.db
          .select()
          .from(libraries)
          .where(eq(libraries.id, 'lib-new'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedLibrary).toBeDefined();
        expect(insertedLibrary?.name).toBe('New ApiLibrary');
        expect(insertedLibrary?.icon).toBe('book');
        expect(insertedLibrary?.mediaType).toBe('book');
      });

      it('should update an existing library', async () => {
        const libraryRow: NewLibraryRow = {
          id: 'lib-existing',
          name: 'Existing ApiLibrary',
          icon: 'database',
          displayOrder: 1,
          mediaType: 'book',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Insert the library first
        await upsertLibrary(libraryRow);

        // Update the library
        const updatedLibraryRow: NewLibraryRow = {
          ...libraryRow,
          name: 'Updated ApiLibrary',
          icon: 'podcast',
          mediaType: 'podcast',
        };

        await upsertLibrary(updatedLibraryRow);

        // Verify the library was updated
        const updatedLibrary = await testDb.db
          .select()
          .from(libraries)
          .where(eq(libraries.id, 'lib-existing'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(updatedLibrary).toBeDefined();
        expect(updatedLibrary?.name).toBe('Updated ApiLibrary');
        expect(updatedLibrary?.icon).toBe('podcast');
        expect(updatedLibrary?.mediaType).toBe('podcast');
      });
    });

    describe('upsertLibraries', () => {
      it('should insert multiple libraries', async () => {
        const libraryRows: NewLibraryRow[] = [
          {
            id: 'lib-1',
            name: 'ApiLibrary 1',
            icon: 'database',
            displayOrder: 1,
            mediaType: 'book',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'lib-2',
            name: 'ApiLibrary 2',
            icon: 'podcast',
            displayOrder: 2,
            mediaType: 'podcast',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        await upsertLibraries(libraryRows);

        // Verify both libraries were inserted
        const libraries = await getAllLibraries();
        expect(libraries).toHaveLength(2);
        expect(libraries.map(l => l.name)).toContain('ApiLibrary 1');
        expect(libraries.map(l => l.name)).toContain('ApiLibrary 2');
      });

      it('should handle empty array', async () => {
        await expect(upsertLibraries([])).resolves.not.toThrow();

        const libraries = await getAllLibraries();
        expect(libraries).toHaveLength(0);
      });

      it('should handle null/undefined', async () => {
        await expect(upsertLibraries(null as any)).resolves.not.toThrow();
        await expect(upsertLibraries(undefined as any)).resolves.not.toThrow();
      });
    });

    describe('getAllLibraries', () => {
      beforeEach(async () => {
        // Insert test libraries
        await upsertLibraries([mockLibraryRow, mockPodcastLibraryRow]);
      });

      it('should return all libraries ordered by displayOrder and name', async () => {
        const libraries = await getAllLibraries();

        expect(libraries).toHaveLength(2);

        // Should be ordered by displayOrder (1, 2), then by name
        expect(libraries[0].id).toBe('lib-1');
        expect(libraries[0].name).toBe('My Books');
        expect(libraries[0].displayOrder).toBe(1);

        expect(libraries[1].id).toBe('lib-2');
        expect(libraries[1].name).toBe('My Podcasts');
        expect(libraries[1].displayOrder).toBe(2);
      });

      it('should return empty array when no libraries exist', async () => {
        await deleteAllLibraries();

        const libraries = await getAllLibraries();
        expect(libraries).toHaveLength(0);
      });

      it('should handle libraries with same displayOrder', async () => {
        // Insert libraries with same displayOrder
        const sameOrderLibraries: NewLibraryRow[] = [
          {
            id: 'lib-z',
            name: 'Z ApiLibrary',
            icon: 'database',
            displayOrder: 1,
            mediaType: 'book',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'lib-a',
            name: 'A ApiLibrary',
            icon: 'podcast',
            displayOrder: 1,
            mediaType: 'podcast',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        await deleteAllLibraries();
        await upsertLibraries(sameOrderLibraries);

        const libraries = await getAllLibraries();
        expect(libraries).toHaveLength(2);

        // Should be ordered by name when displayOrder is the same
        expect(libraries[0].name).toBe('A ApiLibrary');
        expect(libraries[1].name).toBe('Z ApiLibrary');
      });
    });

    describe('getLibraryById', () => {
      beforeEach(async () => {
        await upsertLibrary(mockLibraryRow);
      });

      it('should find library by ID', async () => {
        const library = await getLibraryById('lib-1');

        expect(library).toBeDefined();
        expect(library?.id).toBe('lib-1');
        expect(library?.name).toBe('My Books');
        expect(library?.mediaType).toBe('book');
      });

      it('should return null for non-existent ID', async () => {
        const library = await getLibraryById('non-existent');
        expect(library).toBeNull();
      });

      it('should handle empty ID', async () => {
        const library = await getLibraryById('');
        expect(library).toBeNull();
      });
    });

    describe('deleteAllLibraries', () => {
      beforeEach(async () => {
        await upsertLibraries([mockLibraryRow, mockPodcastLibraryRow]);
      });

      it('should delete all libraries', async () => {
        // Verify libraries exist
        let libraries = await getAllLibraries();
        expect(libraries).toHaveLength(2);

        // Delete all libraries
        await deleteAllLibraries();

        // Verify libraries are deleted
        libraries = await getAllLibraries();
        expect(libraries).toHaveLength(0);
      });

      it('should handle deleting from empty table', async () => {
        await deleteAllLibraries();

        // Should not throw when deleting from empty table
        await expect(deleteAllLibraries()).resolves.not.toThrow();
      });
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));
    });

    it('should handle complete library workflow', async () => {
      // Marshal libraries from API response
      const marshaledLibraries = marshalLibrariesFromResponse(mockLibrariesResponse);
      expect(marshaledLibraries).toHaveLength(2);

      // Upsert the libraries
      await upsertLibraries(marshaledLibraries);

      // Retrieve all libraries
      const allLibraries = await getAllLibraries();
      expect(allLibraries).toHaveLength(2);

      // Retrieve specific library
      const specificLibrary = await getLibraryById('lib-1');
      expect(specificLibrary).toBeDefined();
      expect(specificLibrary?.name).toBe('My Books');

      // Update a library
      const updatedLibrary = {
        ...marshaledLibraries[0],
        name: 'Updated Books ApiLibrary',
      };
      await upsertLibrary(updatedLibrary);

      // Verify the update
      const retrievedUpdatedLibrary = await getLibraryById('lib-1');
      expect(retrievedUpdatedLibrary?.name).toBe('Updated Books ApiLibrary');

      // Clean up
      await deleteAllLibraries();
      const finalLibraries = await getAllLibraries();
      expect(finalLibraries).toHaveLength(0);
    });

    it('should maintain order consistency', async () => {
      // Create libraries with different display orders
      const libraries: NewLibraryRow[] = [
        {
          id: 'lib-3',
          name: 'Third ApiLibrary',
          icon: 'database',
          displayOrder: 3,
          mediaType: 'book',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'lib-1',
          name: 'First ApiLibrary',
          icon: 'podcast',
          displayOrder: 1,
          mediaType: 'podcast',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'lib-2',
          name: 'Second ApiLibrary',
          icon: 'database',
          displayOrder: 2,
          mediaType: 'book',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      await upsertLibraries(libraries);

      const retrievedLibraries = await getAllLibraries();
      expect(retrievedLibraries).toHaveLength(3);

      // Verify correct order
      expect(retrievedLibraries[0].displayOrder).toBe(1);
      expect(retrievedLibraries[1].displayOrder).toBe(2);
      expect(retrievedLibraries[2].displayOrder).toBe(3);

      expect(retrievedLibraries[0].name).toBe('First ApiLibrary');
      expect(retrievedLibraries[1].name).toBe('Second ApiLibrary');
      expect(retrievedLibraries[2].name).toBe('Third ApiLibrary');
    });
  });
});
