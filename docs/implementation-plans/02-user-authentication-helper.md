# Implementation Plan: User Authentication Helper

**Priority:** P1 - Critical
**Risk Level:** Low
**Estimated Effort:** 4-6 hours
**Impact:** Eliminates 60-75 lines of duplicated code

---

## Overview

Create centralized user authentication helpers to eliminate repeated username/user ID retrieval pattern that appears 15+ times across services.

**Current State:**
- User authentication pattern repeated 15+ times
- Identical error handling duplicated across files
- Inconsistent error messages
- No centralized validation

**Target State:**
- Single source of truth for user authentication
- Consistent error handling
- Type-safe user retrieval
- Easier to modify authentication logic globally

---

## Problem Analysis

### Current Pattern (Repeated 15+ Times)

```typescript
// PlayerService.ts:213-222
const username = await getStoredUsername();
if (!username) {
    throw new Error("No authenticated user found");
}

const user = await getUserByUsername(username);
if (!user?.id) {
    throw new Error("User not found in database");
}

// Now use user.id
const userId = user.id;
```

**Locations:**
- `PlayerService.ts`: Lines 213-222, 599-607, 920-929, 1278-1289
- `ProgressService.ts`: Lines 244-248, 530-531, 599-607, 734-737
- `PlayerBackgroundService.ts`: Lines 110-120, 245-248, 299-300, 649-650, 695-696

---

## Step 1: Create Authentication Helpers Directory

```bash
mkdir -p src/lib/authHelpers
```

**Files to create:**
- `src/lib/authHelpers/index.ts` - Main exports
- `src/lib/authHelpers/userHelpers.ts` - User retrieval functions
- `src/lib/authHelpers/types.ts` - Type definitions
- `src/lib/authHelpers/__tests__/userHelpers.test.ts` - Tests

---

## Step 2: Define Types

**File:** `src/lib/authHelpers/types.ts`

```typescript
/**
 * Result of user authentication
 */
export interface AuthenticatedUser {
  username: string;
  userId: string;
  user: UserRow;
}

/**
 * User authentication error codes
 */
export enum AuthErrorCode {
  NO_STORED_USERNAME = 'NO_STORED_USERNAME',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  INVALID_USER_DATA = 'INVALID_USER_DATA',
}

/**
 * Custom error for authentication failures
 */
export class AuthenticationError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
```

---

## Step 3: Implement User Helpers

**File:** `src/lib/authHelpers/userHelpers.ts`

```typescript
import { getStoredUsername } from '@/lib/utils/asyncStorage';
import { getUserByUsername } from '@/db/helpers/users';
import { logger } from '@/lib/logger';
import { AuthenticationError, AuthErrorCode, AuthenticatedUser } from './types';
import type { UserRow } from '@/db/schema';

const log = logger.child({ module: 'AuthHelpers' });

/**
 * Get the currently authenticated user's ID
 *
 * This is the most common use case - when you just need the user ID
 * for database queries or API calls.
 *
 * @throws {AuthenticationError} If no user is authenticated or user not found
 * @returns The authenticated user's ID
 *
 * @example
 * const userId = await getCurrentUserId();
 * const session = await getActiveSession(userId, itemId);
 */
export async function getCurrentUserId(): Promise<string> {
  const username = await getStoredUsername();

  if (!username) {
    log.error('No stored username found');
    throw new AuthenticationError(
      AuthErrorCode.NO_STORED_USERNAME,
      'No authenticated user found. Please log in.'
    );
  }

  const user = await getUserByUsername(username);

  if (!user?.id) {
    log.error('User not found in database', { username });
    throw new AuthenticationError(
      AuthErrorCode.USER_NOT_FOUND,
      'User not found in database. Please log in again.',
      { username }
    );
  }

  log.debug('Retrieved user ID', { userId: user.id });
  return user.id;
}

/**
 * Get the currently authenticated user (full user object)
 *
 * Use this when you need access to user properties beyond just the ID.
 *
 * @throws {AuthenticationError} If no user is authenticated or user not found
 * @returns The full user record
 *
 * @example
 * const user = await getCurrentUser();
 * console.log(user.username, user.id, user.createdAt);
 */
export async function getCurrentUser(): Promise<UserRow> {
  const username = await getStoredUsername();

  if (!username) {
    log.error('No stored username found');
    throw new AuthenticationError(
      AuthErrorCode.NO_STORED_USERNAME,
      'No authenticated user found. Please log in.'
    );
  }

  const user = await getUserByUsername(username);

  if (!user) {
    log.error('User not found in database', { username });
    throw new AuthenticationError(
      AuthErrorCode.USER_NOT_FOUND,
      'User not found in database. Please log in again.',
      { username }
    );
  }

  log.debug('Retrieved user', { userId: user.id, username: user.username });
  return user;
}

/**
 * Get the currently authenticated user with both username and ID
 *
 * Use this when you need both the username and user ID, avoiding
 * multiple lookups.
 *
 * @throws {AuthenticationError} If no user is authenticated or user not found
 * @returns Object containing username, userId, and full user record
 *
 * @example
 * const { username, userId } = await getAuthenticatedUser();
 * log.info('Starting session', { username, userId });
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const username = await getStoredUsername();

  if (!username) {
    log.error('No stored username found');
    throw new AuthenticationError(
      AuthErrorCode.NO_STORED_USERNAME,
      'No authenticated user found. Please log in.'
    );
  }

  const user = await getUserByUsername(username);

  if (!user?.id) {
    log.error('User not found in database', { username });
    throw new AuthenticationError(
      AuthErrorCode.USER_NOT_FOUND,
      'User not found in database. Please log in again.',
      { username }
    );
  }

  log.debug('Retrieved authenticated user', {
    userId: user.id,
    username,
  });

  return {
    username,
    userId: user.id,
    user,
  };
}

/**
 * Try to get the current user ID without throwing
 *
 * Returns null if no user is authenticated, useful for optional
 * authentication scenarios.
 *
 * @returns The user ID or null if not authenticated
 *
 * @example
 * const userId = await tryGetCurrentUserId();
 * if (userId) {
 *   // Do something with authenticated user
 * } else {
 *   // Handle unauthenticated case
 * }
 */
export async function tryGetCurrentUserId(): Promise<string | null> {
  try {
    return await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      log.debug('No authenticated user', { code: error.code });
      return null;
    }
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Check if a user is currently authenticated
 *
 * @returns True if a user is authenticated, false otherwise
 *
 * @example
 * if (await isUserAuthenticated()) {
 *   // Proceed with authenticated flow
 * }
 */
export async function isUserAuthenticated(): Promise<boolean> {
  const userId = await tryGetCurrentUserId();
  return userId !== null;
}

/**
 * Validate that a user ID matches the currently authenticated user
 *
 * Useful for security checks to ensure operations are performed
 * by the correct user.
 *
 * @param userId - The user ID to validate
 * @throws {AuthenticationError} If the user ID doesn't match the authenticated user
 *
 * @example
 * await validateCurrentUser(session.userId);
 * // Proceeds if valid, throws if mismatch
 */
export async function validateCurrentUser(userId: string): Promise<void> {
  const currentUserId = await getCurrentUserId();

  if (currentUserId !== userId) {
    log.error('User ID mismatch', {
      expected: currentUserId,
      received: userId,
    });
    throw new AuthenticationError(
      AuthErrorCode.INVALID_USER_DATA,
      'User ID does not match authenticated user',
      { expected: currentUserId, received: userId }
    );
  }
}
```

---

## Step 4: Export Helpers

**File:** `src/lib/authHelpers/index.ts`

```typescript
export * from './types';
export * from './userHelpers';

// Re-export commonly used functions for convenience
export {
  getCurrentUserId,
  getCurrentUser,
  getAuthenticatedUser,
  tryGetCurrentUserId,
  isUserAuthenticated,
  validateCurrentUser,
} from './userHelpers';
```

---

## Step 5: Comprehensive Testing

**File:** `src/lib/authHelpers/__tests__/userHelpers.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from '@jest/globals';
import {
  getCurrentUserId,
  getCurrentUser,
  getAuthenticatedUser,
  tryGetCurrentUserId,
  isUserAuthenticated,
  validateCurrentUser,
  AuthenticationError,
  AuthErrorCode,
} from '../userHelpers';
import { getStoredUsername } from '@/lib/utils/asyncStorage';
import { getUserByUsername } from '@/db/helpers/users';

// Mock dependencies
vi.mock('@/lib/utils/asyncStorage');
vi.mock('@/db/helpers/users');

describe('User Authentication Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentUserId', () => {
    it('should return user ID when authenticated', async () => {
      (getStoredUsername as any).mockResolvedValue('testuser');
      (getUserByUsername as any).mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
      });

      const userId = await getCurrentUserId();

      expect(userId).toBe('user-123');
      expect(getStoredUsername).toHaveBeenCalled();
      expect(getUserByUsername).toHaveBeenCalledWith('testuser');
    });

    it('should throw when no stored username', async () => {
      (getStoredUsername as any).mockResolvedValue(null);

      await expect(getCurrentUserId()).rejects.toThrow(AuthenticationError);
      await expect(getCurrentUserId()).rejects.toThrow(
        'No authenticated user found'
      );

      try {
        await getCurrentUserId();
      } catch (error) {
        expect((error as AuthenticationError).code).toBe(
          AuthErrorCode.NO_STORED_USERNAME
        );
      }
    });

    it('should throw when user not found in database', async () => {
      (getStoredUsername as any).mockResolvedValue('testuser');
      (getUserByUsername as any).mockResolvedValue(null);

      await expect(getCurrentUserId()).rejects.toThrow(AuthenticationError);
      await expect(getCurrentUserId()).rejects.toThrow(
        'User not found in database'
      );

      try {
        await getCurrentUserId();
      } catch (error) {
        expect((error as AuthenticationError).code).toBe(
          AuthErrorCode.USER_NOT_FOUND
        );
      }
    });

    it('should throw when user has no ID', async () => {
      (getStoredUsername as any).mockResolvedValue('testuser');
      (getUserByUsername as any).mockResolvedValue({ username: 'testuser' });

      await expect(getCurrentUserId()).rejects.toThrow(AuthenticationError);
    });
  });

  describe('getCurrentUser', () => {
    it('should return full user object when authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        createdAt: new Date(),
      };

      (getStoredUsername as any).mockResolvedValue('testuser');
      (getUserByUsername as any).mockResolvedValue(mockUser);

      const user = await getCurrentUser();

      expect(user).toEqual(mockUser);
    });

    it('should throw when no stored username', async () => {
      (getStoredUsername as any).mockResolvedValue(null);

      await expect(getCurrentUser()).rejects.toThrow(AuthenticationError);
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should return username, userId, and user object', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        createdAt: new Date(),
      };

      (getStoredUsername as any).mockResolvedValue('testuser');
      (getUserByUsername as any).mockResolvedValue(mockUser);

      const result = await getAuthenticatedUser();

      expect(result).toEqual({
        username: 'testuser',
        userId: 'user-123',
        user: mockUser,
      });
    });
  });

  describe('tryGetCurrentUserId', () => {
    it('should return user ID when authenticated', async () => {
      (getStoredUsername as any).mockResolvedValue('testuser');
      (getUserByUsername as any).mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
      });

      const userId = await tryGetCurrentUserId();

      expect(userId).toBe('user-123');
    });

    it('should return null when not authenticated', async () => {
      (getStoredUsername as any).mockResolvedValue(null);

      const userId = await tryGetCurrentUserId();

      expect(userId).toBeNull();
    });

    it('should re-throw non-authentication errors', async () => {
      const unexpectedError = new Error('Database error');
      (getStoredUsername as any).mockRejectedValue(unexpectedError);

      await expect(tryGetCurrentUserId()).rejects.toThrow('Database error');
    });
  });

  describe('isUserAuthenticated', () => {
    it('should return true when user is authenticated', async () => {
      (getStoredUsername as any).mockResolvedValue('testuser');
      (getUserByUsername as any).mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
      });

      const isAuth = await isUserAuthenticated();

      expect(isAuth).toBe(true);
    });

    it('should return false when user is not authenticated', async () => {
      (getStoredUsername as any).mockResolvedValue(null);

      const isAuth = await isUserAuthenticated();

      expect(isAuth).toBe(false);
    });
  });

  describe('validateCurrentUser', () => {
    it('should not throw when user ID matches', async () => {
      (getStoredUsername as any).mockResolvedValue('testuser');
      (getUserByUsername as any).mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
      });

      await expect(validateCurrentUser('user-123')).resolves.toBeUndefined();
    });

    it('should throw when user ID does not match', async () => {
      (getStoredUsername as any).mockResolvedValue('testuser');
      (getUserByUsername as any).mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
      });

      await expect(validateCurrentUser('user-456')).rejects.toThrow(
        AuthenticationError
      );

      try {
        await validateCurrentUser('user-456');
      } catch (error) {
        expect((error as AuthenticationError).code).toBe(
          AuthErrorCode.INVALID_USER_DATA
        );
      }
    });
  });
});
```

---

## Step 6: Update Services to Use Helpers

### Before: PlayerService.ts

```typescript
// Lines 213-222 (BEFORE)
const username = await getStoredUsername();
if (!username) {
    log.error('No stored username found');
    throw new Error('No stored username found');
}

const user = await getUserByUsername(username);
if (!user?.id) {
    log.error('User not found in database', { username });
    throw new Error('User not found in database');
}

const userId = user.id;
```

### After: PlayerService.ts

```typescript
// Import at top of file
import { getCurrentUserId } from '@/lib/authHelpers';

// Usage (single line!)
const userId = await getCurrentUserId();
```

### Full Example Refactoring: PlayerService.playTrack()

**Before (Lines 205-385):**
```typescript
async playTrack(libraryItemId: string): Promise<void> {
    log.info('playTrack called', { libraryItemId });

    // Authenticate user
    const username = await getStoredUsername();
    if (!username) {
        log.error('No stored username found');
        throw new Error('No stored username found');
    }

    const user = await getUserByUsername(username);
    if (!user?.id) {
        log.error('User not found in database', { username });
        throw new Error('User not found in database');
    }

    const userId = user.id;

    // ... rest of function (165 more lines)
}
```

**After:**
```typescript
import { getCurrentUserId } from '@/lib/authHelpers';

async playTrack(libraryItemId: string): Promise<void> {
    log.info('playTrack called', { libraryItemId });

    // Authenticate user
    const userId = await getCurrentUserId();

    // ... rest of function (same, but 8 lines shorter)
}
```

---

## Step 7: Bulk Replacement Strategy

### Files to Update

1. **PlayerService.ts** (4 occurrences)
   - Lines 213-222 in `playTrack()`
   - Lines 599-607 in `determineResumePosition()`
   - Lines 920-929 in `_buildTrackMetadata()`
   - Lines 1278-1289 in `reconnectBackgroundService()`

2. **ProgressService.ts** (4 occurrences)
   - Lines 244-248 in `startSession()`
   - Lines 530-531 in `updateProgress()`
   - Lines 599-607 in `closeSession()`
   - Lines 734-737 in `getOrCreateSession()`

3. **PlayerBackgroundService.ts** (5 occurrences)
   - Lines 110-120 in `onTaskRemoved()`
   - Lines 245-248 in `handleRemotePlay()`
   - Lines 299-300 in `handleRemotePause()`
   - Lines 649-650 in `handleActiveTrackChanged()`
   - Lines 695-696 in `getCurrentPlaybackState()`

### Search & Replace Pattern

**Find:**
```typescript
const username = await getStoredUsername();
if (!username) {
    // ... error handling
}

const user = await getUserByUsername(username);
if (!user?.id) {
    // ... error handling
}
```

**Replace with:**
```typescript
const userId = await getCurrentUserId();
```

---

## Step 8: Migration Checklist

### Pre-Migration
- [ ] Create feature branch: `feature/auth-helpers`
- [ ] Review all occurrences of the pattern
- [ ] Ensure tests exist for affected functions

### Implementation
- [ ] Create `src/lib/authHelpers/` directory
- [ ] Implement type definitions
- [ ] Implement user helper functions
- [ ] Write comprehensive unit tests
- [ ] Ensure 90%+ test coverage

### Service Updates (Do one at a time)
- [ ] Update PlayerBackgroundService.ts (lowest risk)
  - [ ] Replace all 5 occurrences
  - [ ] Run tests
  - [ ] Manual testing
- [ ] Update ProgressService.ts
  - [ ] Replace all 4 occurrences
  - [ ] Run tests
  - [ ] Manual testing
- [ ] Update PlayerService.ts (highest risk)
  - [ ] Replace all 4 occurrences
  - [ ] Run tests
  - [ ] Manual testing

### Post-Migration
- [ ] Run full test suite
- [ ] Manual end-to-end testing
- [ ] Performance testing
- [ ] Code review
- [ ] Update documentation

---

## Step 9: Testing Strategy

### Unit Tests
- [x] Test `getCurrentUserId()` success case
- [x] Test `getCurrentUserId()` no username
- [x] Test `getCurrentUserId()` user not found
- [x] Test `getCurrentUser()` success case
- [x] Test `getAuthenticatedUser()` success case
- [x] Test `tryGetCurrentUserId()` success case
- [x] Test `tryGetCurrentUserId()` returns null
- [x] Test `isUserAuthenticated()` true/false
- [x] Test `validateCurrentUser()` match/mismatch

### Integration Tests
Test each refactored service function:
- [ ] PlayerService.playTrack() with auth helper
- [ ] ProgressService.startSession() with auth helper
- [ ] PlayerBackgroundService handlers with auth helper

### Manual Testing
- [ ] Login flow
- [ ] Play a track
- [ ] Start/stop sessions
- [ ] Background playback
- [ ] App restart with user logged in
- [ ] Logout/login cycle

---

## Step 10: Error Handling Improvements

### Standardized Error Messages

**Before (Inconsistent):**
```typescript
// PlayerService
throw new Error('No stored username found');

// ProgressService
throw new Error('No authenticated user found');

// PlayerBackgroundService
throw new Error('Username not found');
```

**After (Consistent):**
```typescript
// All services use the same error from AuthenticationError
throw new AuthenticationError(
  AuthErrorCode.NO_STORED_USERNAME,
  'No authenticated user found. Please log in.'
);
```

### Benefits
- Consistent error messages across app
- Structured error codes for handling
- Better error context with details object
- Easier to add error analytics

---

## Step 11: Performance Considerations

### No Performance Impact Expected

1. **Same number of async calls:**
   - Before: `getStoredUsername()` + `getUserByUsername()` = 2 calls
   - After: `getCurrentUserId()` → same 2 calls internally

2. **No additional abstraction layers:**
   - Helper is a simple wrapper
   - No middleware or complex logic

3. **Better for future optimization:**
   - Can add caching in one place
   - Can add memoization if needed
   - Easier to add performance monitoring

### Potential Future Optimizations

```typescript
// Could add simple caching later
let cachedUserId: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute

export async function getCurrentUserId(): Promise<string> {
  const now = Date.now();

  // Return cached value if still valid
  if (cachedUserId && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedUserId;
  }

  // ... fetch user as normal

  // Cache result
  cachedUserId = userId;
  cacheTimestamp = now;

  return userId;
}
```

---

## Step 12: Documentation Updates

### JSDoc Examples

Add usage examples to service functions:

```typescript
/**
 * Play a library item
 *
 * @param libraryItemId - The library item to play
 * @throws {AuthenticationError} If no user is authenticated
 * @throws {Error} If library item not found
 *
 * @example
 * try {
 *   await playerService.playTrack('item-123');
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     // Handle auth error
 *   }
 * }
 */
async playTrack(libraryItemId: string): Promise<void> {
  const userId = await getCurrentUserId(); // May throw AuthenticationError
  // ...
}
```

### README Update

Add to project README or architecture docs:

```markdown
## User Authentication

The app uses centralized authentication helpers located in `src/lib/authHelpers/`.

### Getting Current User

```typescript
import { getCurrentUserId } from '@/lib/authHelpers';

// Get just the user ID (most common)
const userId = await getCurrentUserId();

// Get full user object
const user = await getCurrentUser();

// Get both username and ID
const { username, userId } = await getAuthenticatedUser();

// Check without throwing
const userId = await tryGetCurrentUserId(); // Returns null if not authenticated
```

### Error Handling

All authentication helpers throw `AuthenticationError` with structured error codes:

```typescript
import { AuthenticationError, AuthErrorCode } from '@/lib/authHelpers';

try {
  const userId = await getCurrentUserId();
} catch (error) {
  if (error instanceof AuthenticationError) {
    switch (error.code) {
      case AuthErrorCode.NO_STORED_USERNAME:
        // Redirect to login
        break;
      case AuthErrorCode.USER_NOT_FOUND:
        // Clear storage and re-login
        break;
    }
  }
}
```
```

---

## Step 13: Success Metrics

### Code Quality
- [ ] Line reduction: 60-75 lines eliminated
- [ ] Test coverage: 95%+ for auth helpers
- [ ] No regressions in existing tests
- [ ] TypeScript compiles without errors

### Consistency
- [ ] All services use same auth pattern
- [ ] All error messages are consistent
- [ ] All error codes are structured

### Maintainability
- [ ] Single place to update auth logic
- [ ] Easier to add features (e.g., caching)
- [ ] Clear documentation

---

## Risks and Mitigation

### Risk 1: Breaking Authentication Flow
**Probability:** Low
**Impact:** Critical
**Mitigation:**
- Comprehensive tests before migration
- Update one service at a time
- Test authentication after each update
- Keep rollback plan ready

### Risk 2: Error Handling Changes
**Probability:** Low
**Impact:** Medium
**Mitigation:**
- New errors are same type (Error)
- Error messages are clear
- Add try-catch where needed
- Test all error paths

### Risk 3: Missing Edge Cases
**Probability:** Very Low
**Impact:** Low
**Mitigation:**
- Review all usages before refactoring
- Test with missing username
- Test with invalid user
- Test with database errors

---

## Timeline

| Task | Duration | Dependencies |
|------|----------|--------------|
| Create auth helpers | 2 hours | None |
| Write tests | 1 hour | Auth helpers |
| Update PlayerBackgroundService | 30 min | Tests passing |
| Update ProgressService | 30 min | Previous update |
| Update PlayerService | 30 min | Previous update |
| Integration testing | 1 hour | All updates |
| Code review & merge | 30 min | Testing complete |
| **Total** | **6 hours** | |

---

## Rollback Plan

If issues are discovered after deployment:

1. **Quick Fix:**
   - If error is minor, fix forward
   - Deploy hotfix

2. **Revert Single Service:**
   ```typescript
   // Temporarily revert to old pattern in one service
   const username = await getStoredUsername();
   // ... old code
   ```

3. **Full Rollback:**
   ```bash
   git revert <commit-hash>
   git push
   ```

---

## Next Steps

1. **Create feature branch**
   ```bash
   git checkout -b feature/auth-helpers
   ```

2. **Implement helpers**
   - Create directory structure
   - Implement all functions
   - Write tests

3. **Update services incrementally**
   - Start with PlayerBackgroundService (lowest risk)
   - Then ProgressService
   - Finally PlayerService (highest usage)

4. **Submit PR**
   - Include before/after examples
   - Show test coverage
   - Document benefits

---

## Benefits Summary

### Immediate Benefits
- **60-75 lines** of code eliminated
- **Consistent** error handling
- **Type-safe** user retrieval
- **Better** error messages

### Long-term Benefits
- Easy to add caching
- Easy to add analytics
- Easy to modify auth logic
- Improved code maintainability

### Developer Experience
- Less boilerplate in services
- Clear, reusable patterns
- Better IntelliSense/autocomplete
- Easier onboarding

---

## References

- Current PlayerService: `src/services/PlayerService.ts`
- Current ProgressService: `src/services/ProgressService.ts`
- Current PlayerBackgroundService: `src/services/PlayerBackgroundService.ts`
- User DB Helper: `src/db/helpers/users.ts`
- AsyncStorage Utils: `src/lib/utils/asyncStorage.ts`
