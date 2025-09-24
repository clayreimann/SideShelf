/**
 * Tests for user database helpers
 */

import { users } from '@/db/schema/users';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';
import {
  mockApiUser,
  mockLoginResponse,
  mockMeResponse,
  mockUserRow
} from '../../../__tests__/fixtures';
import { createTestDb, TestDatabase } from '../../../__tests__/utils/testDb';
import {
  getUserByUsername,
  marshalUserFromAuthResponse,
  marshalUserFromUser,
  NewUserRow,
  upsertUser
} from '../users';

describe('Users Helper', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('marshalUserFromAuthResponse', () => {
    it('should correctly marshal user data from MeResponse', () => {
      const result = marshalUserFromAuthResponse(mockMeResponse);

      expect(result).toEqual({
        id: 'user-1',
        username: 'testuser',
        type: 'admin',
        createdAt: 1640995200000,
        lastSeen: 1672531200000,
        hideFromContinueListening: 'series-1,series-2',
        canDownload: true,
        canUpdate: true,
        canDelete: false,
        canUpload: true,
        canAccessAllLibraries: true,
        canAccessAllTags: true,
        canAccessExplicitContent: false,
      });
    });

    it('should correctly marshal user data from LoginResponse', () => {
      const result = marshalUserFromAuthResponse(mockLoginResponse);

      expect(result).toEqual({
        id: 'user-1',
        username: 'testuser',
        type: 'admin',
        createdAt: 1640995200000,
        lastSeen: 1672531200000,
        hideFromContinueListening: 'series-1,series-2',
        canDownload: true,
        canUpdate: true,
        canDelete: false,
        canUpload: true,
        canAccessAllLibraries: true,
        canAccessAllTags: true,
        canAccessExplicitContent: false,
      });
    });

    it('should return null for invalid user data', () => {
      const invalidResponse = {
        user: {
          id: '',
          username: '',
        },
      } as any;

      const result = marshalUserFromAuthResponse(invalidResponse);
      expect(result).toBeNull();
    });

    it('should handle missing user object', () => {
      const invalidResponse = {} as any;
      const result = marshalUserFromAuthResponse(invalidResponse);
      expect(result).toBeNull();
    });

    it('should handle null/undefined permissions', () => {
      const responseWithoutPermissions = {
        user: {
          id: 'user-1',
          username: 'testuser',
          type: 'user',
          createdAt: 1640995200000,
          lastSeen: 1672531200000,
          // No permissions object
        },
      } as any;

      const result = marshalUserFromAuthResponse(responseWithoutPermissions);

      expect(result).toEqual({
        id: 'user-1',
        username: 'testuser',
        type: 'user',
        createdAt: 1640995200000,
        lastSeen: 1672531200000,
        hideFromContinueListening: null,
        canDownload: null,
        canUpdate: null,
        canDelete: null,
        canUpload: null,
        canAccessAllLibraries: null,
        canAccessAllTags: null,
        canAccessExplicitContent: null,
      });
    });

    it('should handle empty seriesHideFromContinueListening array', () => {
      const responseWithEmptyArray = {
        user: {
          ...mockApiUser,
          seriesHideFromContinueListening: [],
        },
      };

      const result = marshalUserFromAuthResponse(responseWithEmptyArray);
      expect(result?.hideFromContinueListening).toBeNull();
    });
  });

  describe('marshalUserFromUser', () => {
    it('should correctly marshal user data from User object', () => {
      const result = marshalUserFromUser(mockApiUser);

      expect(result).toEqual({
        id: 'user-1',
        username: 'testuser',
        type: 'admin',
        createdAt: 1640995200000,
        lastSeen: 1672531200000,
        hideFromContinueListening: 'series-1,series-2',
        canDownload: true,
        canUpdate: true,
        canDelete: false,
        canUpload: true,
        canAccessAllLibraries: true,
        canAccessAllTags: true,
        canAccessExplicitContent: false,
      });
    });

    it('should return null for invalid user data', () => {
      const invalidUser = {
        id: '',
        username: '',
      } as any;

      const result = marshalUserFromUser(invalidUser);
      expect(result).toBeNull();
    });

    it('should handle null user', () => {
      const result = marshalUserFromUser(null as any);
      expect(result).toBeNull();
    });
  });

  describe('Database Operations', () => {
    // Mock the database client to use our test database
    beforeEach(() => {
      // Replace the imported db with our test db
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));
    });

    describe('upsertUser', () => {
      it('should insert a new user', async () => {
        const userRow: NewUserRow = {
          id: 'user-new',
          username: 'newuser',
          type: 'user',
          createdAt: Date.now(),
          lastSeen: Date.now(),
          hideFromContinueListening: null,
          canDownload: true,
          canUpdate: false,
          canDelete: false,
          canUpload: false,
          canAccessAllLibraries: false,
          canAccessAllTags: false,
          canAccessExplicitContent: false,
        };

        await upsertUser(userRow);

        // Verify the user was inserted
        const insertedUser = await testDb.db
          .select()
          .from(users)
          .where(eq(users.id, 'user-new'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(insertedUser).toBeDefined();
        expect(insertedUser?.username).toBe('newuser');
        expect(insertedUser?.type).toBe('user');
      });

      it('should update an existing user', async () => {
        const userRow: NewUserRow = {
          id: 'user-existing',
          username: 'existinguser',
          type: 'user',
          createdAt: Date.now(),
          lastSeen: Date.now(),
          hideFromContinueListening: null,
          canDownload: false,
          canUpdate: false,
          canDelete: false,
          canUpload: false,
          canAccessAllLibraries: false,
          canAccessAllTags: false,
          canAccessExplicitContent: false,
        };

        // Insert the user first
        await upsertUser(userRow);

        // Update the user
        const updatedUserRow: NewUserRow = {
          ...userRow,
          username: 'updateduser',
          type: 'admin',
          canDownload: true,
        };

        await upsertUser(updatedUserRow);

        // Verify the user was updated
        const updatedUser = await testDb.db
          .select()
          .from(users)
          .where(eq(users.id, 'user-existing'))
          .limit(1)
          .then(rows => rows[0] || null);

        expect(updatedUser).toBeDefined();
        expect(updatedUser?.username).toBe('updateduser');
        expect(updatedUser?.type).toBe('admin');
        expect(updatedUser?.canDownload).toBe(true);
      });

      it('should handle null user row', async () => {
        await expect(upsertUser(null)).resolves.not.toThrow();
      });
    });

    describe('getUserByUsername', () => {
      beforeEach(async () => {
        // Insert a test user
        await upsertUser(mockUserRow);
      });

      it('should find user by username', async () => {
        const user = await getUserByUsername('testuser');

        expect(user).toBeDefined();
        expect(user?.id).toBe('user-1');
        expect(user?.username).toBe('testuser');
        expect(user?.type).toBe('admin');
      });

      it('should return null for non-existent username', async () => {
        const user = await getUserByUsername('nonexistent');
        expect(user).toBeNull();
      });

      it('should handle empty username', async () => {
        const user = await getUserByUsername('');
        expect(user).toBeNull();
      });
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      // Mock the database client
      jest.doMock('@/db/client', () => ({
        db: testDb.db,
      }));
    });

    it('should handle complete user workflow', async () => {
      // Marshal user from API response
      const marshaledUser = marshalUserFromAuthResponse(mockMeResponse);
      expect(marshaledUser).toBeDefined();

      // Upsert the user
      await upsertUser(marshaledUser);

      // Retrieve the user by username
      const retrievedUser = await getUserByUsername('testuser');
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.id).toBe('user-1');

      // Update the user
      const updatedUserData = {
        ...marshaledUser!,
        lastSeen: Date.now(),
        canDownload: false,
      };
      await upsertUser(updatedUserData);

      // Verify the update
      const updatedUser = await getUserByUsername('testuser');
      expect(updatedUser?.canDownload).toBe(false);
      expect(updatedUser?.lastSeen).toBe(updatedUserData.lastSeen);
    });
  });
});
