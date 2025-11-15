/**
 * Tests for mediaProgress database helpers
 */

import { mediaProgress } from '@/db/schema/mediaProgress';
import type { ApiMediaProgress } from '@/types/api';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { and, eq } from 'drizzle-orm';
import {
  mockApiUser,
  mockMeResponse,
} from '../../../__tests__/fixtures';
import { createTestDb, TestDatabase } from '../../../__tests__/utils/testDb';
import {
  getMediaProgressForLibraryItem,
  marshalMediaProgressFromApi,
  marshalMediaProgressFromArray,
  marshalMediaProgressFromAuthResponse,
  NewMediaProgressRow,
  upsertMediaProgress,
} from '../mediaProgress';

describe('MediaProgress Helper', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('marshalMediaProgressFromAuthResponse', () => {
    it('should correctly marshal media progress from ApiMeResponse', () => {
      const mockResponse = {
        ...mockMeResponse,
        user: {
          ...mockMeResponse.user,
          mediaProgress: [
            {
              id: 'progress-1',
              libraryItemId: 'li-1',
              episodeId: null,
              duration: 3600,
              progress: 0.5,
              currentTime: 1800,
              isFinished: false,
              hideFromContinueListening: false,
              lastUpdate: 1672531200000,
              startedAt: 1672444800000,
              finishedAt: null,
            },
            {
              id: 'progress-2',
              libraryItemId: 'li-2',
              episodeId: 'ep-1',
              duration: 7200,
              progress: 1.0,
              currentTime: 7200,
              isFinished: true,
              hideFromContinueListening: false,
              lastUpdate: 1672617600000,
              startedAt: 1672531200000,
              finishedAt: 1672617600000,
            },
          ],
        },
      };

      const result = marshalMediaProgressFromAuthResponse(mockResponse);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'progress-1',
        userId: 'user-1',
        libraryItemId: 'li-1',
        episodeId: null,
        duration: 3600,
        progress: 0.5,
        currentTime: 1800,
        isFinished: false,
        hideFromContinueListening: false,
        lastUpdate: new Date(1672531200000),
        startedAt: new Date(1672444800000),
        finishedAt: null,
      });
      expect(result[1]).toEqual({
        id: 'progress-2',
        userId: 'user-1',
        libraryItemId: 'li-2',
        episodeId: 'ep-1',
        duration: 7200,
        progress: 1.0,
        currentTime: 7200,
        isFinished: true,
        hideFromContinueListening: false,
        lastUpdate: new Date(1672617600000),
        startedAt: new Date(1672531200000),
        finishedAt: new Date(1672617600000),
      });
    });

    it('should return empty array when no media progress', () => {
      const mockResponse = {
        ...mockMeResponse,
        user: {
          ...mockMeResponse.user,
          mediaProgress: [],
        },
      };

      const result = marshalMediaProgressFromAuthResponse(mockResponse);

      expect(result).toHaveLength(0);
    });

    it('should return empty array when mediaProgress is undefined', () => {
      const mockResponse = {
        ...mockMeResponse,
        user: {
          ...mockMeResponse.user,
        },
      };

      const result = marshalMediaProgressFromAuthResponse(mockResponse);

      expect(result).toHaveLength(0);
    });

    it('should return empty array when userId is missing', () => {
      const mockResponse = {
        id: '',
        mediaProgress: [
          {
            id: 'progress-1',
            libraryItemId: 'li-1',
          },
        ],
      } as any;

      const result = marshalMediaProgressFromAuthResponse(mockResponse);

      expect(result).toHaveLength(0);
    });

    it('should handle null values in media progress', () => {
      const mockResponse = {
        ...mockMeResponse,
        user: {
          ...mockMeResponse.user,
          mediaProgress: [
            {
              id: 'progress-1',
              libraryItemId: 'li-1',
              episodeId: null,
              duration: null,
              progress: null,
              currentTime: null,
              isFinished: null,
              hideFromContinueListening: null,
              lastUpdate: null,
              startedAt: null,
              finishedAt: null,
            },
          ],
        },
      };

      const result = marshalMediaProgressFromAuthResponse(mockResponse);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'progress-1',
        userId: 'user-1',
        libraryItemId: 'li-1',
        episodeId: null,
        duration: null,
        progress: null,
        currentTime: null,
        isFinished: null,
        hideFromContinueListening: null,
        lastUpdate: null,
        startedAt: null,
        finishedAt: null,
      });
    });

    it('should handle ApiUser object directly', () => {
      const mockUser = {
        ...mockApiUser,
        mediaProgress: [
          {
            id: 'progress-1',
            libraryItemId: 'li-1',
            episodeId: null,
            duration: 3600,
            progress: 0.5,
            currentTime: 1800,
            isFinished: false,
            hideFromContinueListening: false,
            lastUpdate: 1672531200000,
            startedAt: 1672444800000,
            finishedAt: null,
          },
        ],
      };

      const result = marshalMediaProgressFromAuthResponse(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
    });
  });

  describe('marshalMediaProgressFromArray', () => {
    it('should correctly marshal media progress from array', () => {
      const mediaProgressList: ApiMediaProgress[] = [
        {
          id: 'progress-1',
          libraryItemId: 'li-1',
          episodeId: null,
          duration: 3600,
          progress: 0.5,
          currentTime: 1800,
          isFinished: false,
          hideFromContinueListening: false,
          lastUpdate: 1672531200000,
          startedAt: 1672444800000,
          finishedAt: null,
        },
      ];

      const result = marshalMediaProgressFromArray(mediaProgressList, 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
      expect(result[0].id).toBe('progress-1');
    });

    it('should return empty array when userId is missing', () => {
      const mediaProgressList: ApiMediaProgress[] = [
        {
          id: 'progress-1',
          libraryItemId: 'li-1',
        } as any,
      ];

      const result = marshalMediaProgressFromArray(mediaProgressList, '');

      expect(result).toHaveLength(0);
    });

    it('should return empty array when list is empty', () => {
      const result = marshalMediaProgressFromArray([], 'user-1');

      expect(result).toHaveLength(0);
    });

    it('should return empty array when list is not an array', () => {
      const result = marshalMediaProgressFromArray(null as any, 'user-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('marshalMediaProgressFromApi', () => {
    it('should correctly marshal single media progress item', () => {
      const apiProgress: ApiMediaProgress = {
        id: 'progress-1',
        libraryItemId: 'li-1',
        episodeId: 'ep-1',
        duration: 3600,
        progress: 0.75,
        currentTime: 2700,
        isFinished: false,
        hideFromContinueListening: false,
        lastUpdate: 1672531200000,
        startedAt: 1672444800000,
        finishedAt: null,
      };

      const result = marshalMediaProgressFromApi(apiProgress, 'user-1');

      expect(result).toEqual({
        id: 'progress-1',
        userId: 'user-1',
        libraryItemId: 'li-1',
        episodeId: 'ep-1',
        duration: 3600,
        progress: 0.75,
        currentTime: 2700,
        isFinished: false,
        hideFromContinueListening: false,
        lastUpdate: new Date(1672531200000),
        startedAt: new Date(1672444800000),
        finishedAt: null,
      });
    });

    it('should handle null values', () => {
      const apiProgress: ApiMediaProgress = {
        id: 'progress-1',
        libraryItemId: 'li-1',
        episodeId: null,
        duration: null,
        progress: null,
        currentTime: null,
        isFinished: null,
        hideFromContinueListening: null,
        lastUpdate: null,
        startedAt: null,
        finishedAt: null,
      };

      const result = marshalMediaProgressFromApi(apiProgress, 'user-1');

      expect(result.episodeId).toBeNull();
      expect(result.duration).toBeNull();
      expect(result.lastUpdate).toBeNull();
    });
  });

  describe('Database Operations', () => {
    beforeEach(() => {
      // Mock the database client to use our test database
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));
    });

    describe('upsertMediaProgress', () => {
      it('should insert new media progress', async () => {
        const progressRows: NewMediaProgressRow[] = [
          {
            id: 'progress-1',
            userId: 'user-1',
            libraryItemId: 'li-1',
            episodeId: null,
            duration: 3600,
            progress: 0.5,
            currentTime: 1800,
            isFinished: false,
            hideFromContinueListening: false,
            lastUpdate: new Date('2023-01-01'),
            startedAt: new Date('2022-12-31'),
            finishedAt: null,
          },
        ];

        await upsertMediaProgress(progressRows);

        // Verify the progress was inserted
        const insertedProgress = await testDb.db
          .select()
          .from(mediaProgress)
          .where(eq(mediaProgress.id, 'progress-1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedProgress).toBeDefined();
        expect(insertedProgress?.userId).toBe('user-1');
        expect(insertedProgress?.libraryItemId).toBe('li-1');
        expect(insertedProgress?.progress).toBe(0.5);
      });

      it('should update existing media progress', async () => {
        const progressRows: NewMediaProgressRow[] = [
          {
            id: 'progress-1',
            userId: 'user-1',
            libraryItemId: 'li-1',
            episodeId: null,
            duration: 3600,
            progress: 0.5,
            currentTime: 1800,
            isFinished: false,
            hideFromContinueListening: false,
            lastUpdate: new Date('2023-01-01'),
            startedAt: new Date('2022-12-31'),
            finishedAt: null,
          },
        ];

        // Insert the progress first
        await upsertMediaProgress(progressRows);

        // Update the progress
        const updatedProgressRows: NewMediaProgressRow[] = [
          {
            ...progressRows[0],
            progress: 0.75,
            currentTime: 2700,
            lastUpdate: new Date('2023-01-02'),
          },
        ];

        await upsertMediaProgress(updatedProgressRows);

        // Verify the progress was updated
        const updatedProgress = await testDb.db
          .select()
          .from(mediaProgress)
          .where(eq(mediaProgress.id, 'progress-1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(updatedProgress).toBeDefined();
        expect(updatedProgress?.progress).toBe(0.75);
        expect(updatedProgress?.currentTime).toBe(2700);
      });

      it('should handle empty array', async () => {
        await expect(upsertMediaProgress([])).resolves.not.toThrow();
      });

      it('should handle null/undefined', async () => {
        await expect(upsertMediaProgress(null as any)).resolves.not.toThrow();
        await expect(upsertMediaProgress(undefined as any)).resolves.not.toThrow();
      });

      it('should handle multiple progress items', async () => {
        const progressRows: NewMediaProgressRow[] = [
          {
            id: 'progress-1',
            userId: 'user-1',
            libraryItemId: 'li-1',
            episodeId: null,
            duration: 3600,
            progress: 0.5,
            currentTime: 1800,
            isFinished: false,
            hideFromContinueListening: false,
            lastUpdate: new Date('2023-01-01'),
            startedAt: new Date('2022-12-31'),
            finishedAt: null,
          },
          {
            id: 'progress-2',
            userId: 'user-1',
            libraryItemId: 'li-2',
            episodeId: 'ep-1',
            duration: 7200,
            progress: 1.0,
            currentTime: 7200,
            isFinished: true,
            hideFromContinueListening: false,
            lastUpdate: new Date('2023-01-02'),
            startedAt: new Date('2023-01-01'),
            finishedAt: new Date('2023-01-02'),
          },
        ];

        await upsertMediaProgress(progressRows);

        const allProgress = await testDb.db.select().from(mediaProgress);
        expect(allProgress).toHaveLength(2);
      });

      it('should mark finished items correctly', async () => {
        const progressRows: NewMediaProgressRow[] = [
          {
            id: 'progress-1',
            userId: 'user-1',
            libraryItemId: 'li-1',
            episodeId: null,
            duration: 3600,
            progress: 1.0,
            currentTime: 3600,
            isFinished: true,
            hideFromContinueListening: false,
            lastUpdate: new Date('2023-01-02'),
            startedAt: new Date('2023-01-01'),
            finishedAt: new Date('2023-01-02'),
          },
        ];

        await upsertMediaProgress(progressRows);

        const insertedProgress = await testDb.db
          .select()
          .from(mediaProgress)
          .where(eq(mediaProgress.id, 'progress-1'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedProgress?.isFinished).toBe(true);
        expect(insertedProgress?.finishedAt).toBeDefined();
      });
    });

    describe('getMediaProgressForLibraryItem', () => {
      beforeEach(async () => {
        // Insert test progress
        const progressRows: NewMediaProgressRow[] = [
          {
            id: 'progress-1',
            userId: 'user-1',
            libraryItemId: 'li-1',
            episodeId: null,
            duration: 3600,
            progress: 0.5,
            currentTime: 1800,
            isFinished: false,
            hideFromContinueListening: false,
            lastUpdate: new Date('2023-01-01'),
            startedAt: new Date('2022-12-31'),
            finishedAt: null,
          },
          {
            id: 'progress-2',
            userId: 'user-1',
            libraryItemId: 'li-2',
            episodeId: null,
            duration: 7200,
            progress: 0.8,
            currentTime: 5760,
            isFinished: false,
            hideFromContinueListening: false,
            lastUpdate: new Date('2023-01-02'),
            startedAt: new Date('2023-01-01'),
            finishedAt: null,
          },
          {
            id: 'progress-3',
            userId: 'user-2',
            libraryItemId: 'li-1',
            episodeId: null,
            duration: 3600,
            progress: 0.3,
            currentTime: 1080,
            isFinished: false,
            hideFromContinueListening: false,
            lastUpdate: new Date('2023-01-03'),
            startedAt: new Date('2023-01-02'),
            finishedAt: null,
          },
        ];

        await upsertMediaProgress(progressRows);
      });

      it('should return progress for specific library item and user', async () => {
        const progress = await getMediaProgressForLibraryItem('li-1', 'user-1');

        expect(progress).toBeDefined();
        expect(progress?.id).toBe('progress-1');
        expect(progress?.libraryItemId).toBe('li-1');
        expect(progress?.userId).toBe('user-1');
      });

      it('should return null for non-existent library item', async () => {
        const progress = await getMediaProgressForLibraryItem('li-nonexistent', 'user-1');

        expect(progress).toBeNull();
      });

      it('should return null for non-existent user', async () => {
        const progress = await getMediaProgressForLibraryItem('li-1', 'user-nonexistent');

        expect(progress).toBeNull();
      });

      it('should return the most recent progress when multiple exist', async () => {
        // Insert another progress for same library item and user with different update time
        const progressRows: NewMediaProgressRow[] = [
          {
            id: 'progress-4',
            userId: 'user-1',
            libraryItemId: 'li-1',
            episodeId: 'ep-2',
            duration: 3600,
            progress: 0.9,
            currentTime: 3240,
            isFinished: false,
            hideFromContinueListening: false,
            lastUpdate: new Date('2023-01-05'),
            startedAt: new Date('2023-01-04'),
            finishedAt: null,
          },
        ];

        await upsertMediaProgress(progressRows);

        const progress = await getMediaProgressForLibraryItem('li-1', 'user-1');

        expect(progress?.id).toBe('progress-4'); // Most recent
        expect(progress?.progress).toBe(0.9);
      });
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));
    });

    it('should handle complete media progress workflow', async () => {
      // Marshal progress from API response
      const mockResponse = {
        ...mockMeResponse,
        user: {
          ...mockMeResponse.user,
          mediaProgress: [
            {
              id: 'progress-1',
              libraryItemId: 'li-1',
              episodeId: null,
              duration: 3600,
              progress: 0.5,
              currentTime: 1800,
              isFinished: false,
              hideFromContinueListening: false,
              lastUpdate: 1672531200000,
              startedAt: 1672444800000,
              finishedAt: null,
            },
          ],
        },
      };

      const marshaledProgress = marshalMediaProgressFromAuthResponse(mockResponse);
      expect(marshaledProgress).toHaveLength(1);

      // Upsert the progress
      await upsertMediaProgress(marshaledProgress);

      // Retrieve progress
      const retrievedProgress = await getMediaProgressForLibraryItem('li-1', 'user-1');
      expect(retrievedProgress).toBeDefined();
      expect(retrievedProgress?.progress).toBe(0.5);

      // Update progress
      const updatedProgress = marshalMediaProgressFromApi(
        {
          id: 'progress-1',
          libraryItemId: 'li-1',
          episodeId: null,
          duration: 3600,
          progress: 1.0,
          currentTime: 3600,
          isFinished: true,
          hideFromContinueListening: false,
          lastUpdate: 1672617600000,
          startedAt: 1672444800000,
          finishedAt: 1672617600000,
        },
        'user-1'
      );

      await upsertMediaProgress([updatedProgress]);

      // Verify update
      const finalProgress = await getMediaProgressForLibraryItem('li-1', 'user-1');
      expect(finalProgress?.isFinished).toBe(true);
      expect(finalProgress?.progress).toBe(1.0);
    });
  });
});
