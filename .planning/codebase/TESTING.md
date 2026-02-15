# Testing Patterns

**Analysis Date:** 2026-02-15

## Test Framework

**Runner:**

- Jest ~29.7.0
- Config: `jest.config.js`

**Assertion Library:**

- Jest built-in matchers
- `@testing-library/jest-native` for React Native assertions

**React Native Testing:**

- `@testing-library/react-native` ^13.3.3
- `jest-expo` ~54.0.13 preset

**Run Commands:**

```bash
npm test                    # Run all tests once
npm run test:watch         # Watch mode (re-run on file changes)
npm run test:coverage      # Generate coverage report
npm run test:report        # Generate HTML report + open in browser
jest path/to/file.test.ts  # Run single test file
jest --findRelatedTests path/to/file.ts  # Run related tests
```

## Test File Organization

**Location:**

- Co-located with source code in `__tests__` subdirectories
- Alternative: same directory as source with `.test.ts` suffix
- Pattern: both patterns exist in codebase (e.g., `src/stores/slices/__tests__/playerSlice.test.ts`)

**Naming:**

- Test file suffix: `.test.ts` for unit tests, `.integration.test.ts` for integration tests
- File names match source file (e.g., `playerSlice.ts` → `playerSlice.test.ts`)
- Integration tests: descriptive names (e.g., `backgroundRestoration.integration.test.ts`)

**Directory Structure:**

```
src/
├── stores/slices/
│   ├── __tests__/
│   │   ├── playerSlice.test.ts
│   │   ├── librarySlice.test.ts
│   │   └── seriesSlice.test.ts
│   └── playerSlice.ts
├── db/helpers/
│   ├── __tests__/
│   │   ├── users.test.ts
│   │   └── libraries.test.ts
│   └── users.ts
├── services/
│   ├── __tests__/
│   │   └── PlayerService.test.ts
│   └── PlayerService.ts
└── __tests__/
    ├── setup.ts                              # Jest setup
    ├── setup-before.js                       # Pre-setup
    ├── fixtures/                             # Test data
    │   └── index.ts
    ├── utils/                                # Test helpers
    │   └── testDb.ts
    ├── backgroundRestoration.integration.test.ts
    └── foregroundPlayingRestoration.integration.test.ts
```

## Test Structure

**Suite Organization:**

```typescript
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("PlayerSlice", () => {
  let store: UseBoundStore<StoreApi<PlayerSlice>>;

  beforeEach(() => {
    store = create<PlayerSlice>()((set, get) => ({
      ...createPlayerSlice(set, get),
    }));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Specific functionality", () => {
    it("should do something", () => {
      // Test
    });
  });
});
```

**Patterns:**

- Describe blocks organize tests hierarchically
- Nested describe blocks for related test groups
- BeforeEach sets up test state and clears mocks
- AfterEach cleans up and resets
- Clear mock state between tests to avoid pollution
- Use `beforeEach` for setup that can error; setup in test for critical initialization

## Mocking

**Framework:** Jest native `jest.mock()` and `jest.fn()`

**Patterns:**

**Module Mocks (at file top):**

```typescript
jest.mock("@/db/client", () => ({
  getSQLiteDb: jest.fn(() => mockSQLiteDb),
  get db() {
    return mockDb;
  },
  set db(value) {
    mockDb = value;
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
```

**Mock Factories:**

```typescript
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;

// In beforeEach:
mockedAsyncStorage.getItem.mockResolvedValue(null);
mockedAsyncStorage.setItem.mockResolvedValue();
mockedTrackPlayer.getQueue.mockResolvedValue([]);
```

**Mock Implementation Overrides:**

```typescript
mockedAsyncStorage.getItem.mockImplementation((key: string) => {
  switch (key) {
    case ASYNC_KEYS.currentTrack:
      return Promise.resolve(JSON.stringify(mockPlayerTrack));
    case ASYNC_KEYS.position:
      return Promise.resolve(JSON.stringify(300));
    default:
      return Promise.resolve(null);
  }
});
```

**Error Scenarios:**

```typescript
// Mock rejection for error testing
mockedTrackPlayer.getActiveTrackIndex.mockRejectedValue(new Error("TrackPlayer error"));

// Test resilience to errors
await expect(store.getState().updateNowPlayingMetadata()).resolves.not.toThrow();
```

**What to Mock:**

- External APIs and services (TrackPlayer, AsyncStorage, file system)
- Database client (with test database in setup)
- Third-party libraries (uuid, react-native-logs, etc.)
- HTTP endpoints (via jest.mock)

**What NOT to Mock:**

- Pure utility functions (formatters, helpers)
- Internal application logic (unless testing error paths)
- State management code being tested (Zustand slices)
- Logic under test (test the real implementation)

## Fixtures and Factories

**Test Data Location:**

- `src/__tests__/fixtures/index.ts` - Centralized test data

**Fixture Pattern:**

```typescript
import type { ApiLoginResponse, ApiMeResponse, ApiUser } from "@/types/api";

export const mockApiUser: ApiUser = {
  id: "user-1",
  username: "testuser",
  type: "admin",
  token: "test-token",
  createdAt: 1640995200000,
  lastSeen: 1672531200000,
  // ... rest of properties
};

export const mockLoginResponse: ApiLoginResponse = {
  user: mockApiUser,
  userDefaultLibraryId: "lib-1",
  serverSettings: {
    /* ... */
  },
};
```

**Usage in Tests:**

```typescript
import {
  mockApiUser,
  mockLoginResponse,
  mockPlayerTrack,
  mockUserRow,
} from "../../../__tests__/fixtures";

// Use directly in tests
const result = marshalUserFromAuthResponse(mockMeResponse);
expect(result).toEqual({
  /* ... */
});
```

**Test Database Factory:**

```typescript
// src/__tests__/utils/testDb.ts
export class TestDatabase {
  constructor() {
    this.dbName = `test_db_${Date.now()}_${++testDbCounter}.sqlite`;
    this.sqliteDb = SQLite.openDatabaseSync(`:memory:`);
    this.drizzleDb = drizzle(this.sqliteDb, { schema });
  }

  async initialize(): Promise<void> {
    await migrate(this.drizzleDb, migrations);
  }

  get db() {
    return this.drizzleDb;
  }

  async cleanup(): Promise<void> {
    // Cleanup handled by garbage collection
  }
}

// In tests:
beforeEach(async () => {
  testDb = await createTestDb();
});

afterEach(async () => {
  await testDb.cleanup();
});
```

## Test Setup

**Global Setup:**

- `jest.config.js`: Main Jest configuration
  - `setupFiles`: `["<rootDir>/src/__tests__/setup-before.js"]` (pre-test setup)
  - `setupFilesAfterEnv`: `["expo-sqlite-mock/src/setup.ts", "<rootDir>/src/__tests__/setup.ts"]` (post-setup)
  - `testTimeout`: 10000ms (10 seconds)

**Setup File (`src/__tests__/setup.ts`):**

- Mocks all external dependencies (TrackPlayer, AsyncStorage, file system, etc.)
- Sets up in-memory file system for file operations
- Exports global functions:
  - `setMockDb(db)`: Set database instance for test
  - `setMockSQLiteDb(sqliteDb)`: Set SQLite instance for test

**Pre-Setup (`src/__tests__/setup-before.js`):**

- Minimal setup before Jest initialization
- Registers test library Jest matchers

**Coverage Configuration:**

```javascript
collectCoverageFrom: [
  "src/**/*.{ts,tsx}",
  "!src/**/*.d.ts",
  "!src/**/__tests__/**/*",
  "!src/**/types.ts",
  "!src/app/**/*",         // Routes not covered
  "!src/components/**/*",  // Components tested separately
],
coverageDirectory: "coverage",
coverageReporters: ["text", "lcov", "html", "json", "json-summary"],
```

## Test Types

**Unit Tests:**

- Test individual functions and slices in isolation
- Mock all external dependencies
- Located: `src/stores/slices/__tests__/`, `src/db/helpers/__tests__/`, `src/services/__tests__/`
- Example: `playerSlice.test.ts` tests state mutations without TrackPlayer

**Integration Tests:**

- Test multiple components working together
- Use real Zustand stores with mocked services
- Limited mocking (mock external APIs only)
- Located: `src/__tests__/` with `.integration.test.ts` suffix
- Examples:
  - `backgroundRestoration.integration.test.ts`: PlayerSlice + ProgressService + TrackPlayer
  - `foregroundPlayingRestoration.integration.test.ts`: Full playback restoration flow

**Database Tests:**

- Test database helpers and queries
- Use test database instance (`TestDatabase` class)
- Located: `src/db/helpers/__tests__/`
- Example: `users.test.ts` tests marshalling and CRUD operations

## Common Patterns

**Async Testing:**

```typescript
it("should restore state from AsyncStorage", async () => {
  mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockPlayerTrack));

  await store.getState().restorePersistedState();

  const state = store.getState();
  expect(state.player.currentTrack).toEqual(expectedTrack);
});

// With promises
it("should handle async errors", () => {
  mockedTrackPlayer.getActiveTrackIndex.mockRejectedValue(new Error("Error"));

  return expect(store.getState().updateNowPlayingMetadata()).resolves.not.toThrow();
});
```

**Error Testing:**

```typescript
it("should return null for invalid user data", () => {
  const invalidResponse = { user: { id: "", username: "" } } as any;
  const result = marshalUserFromAuthResponse(invalidResponse);
  expect(result).toBeNull();
});

it("should handle missing user object", () => {
  const invalidResponse = {} as any;
  const result = marshalUserFromAuthResponse(invalidResponse);
  expect(result).toBeNull();
});
```

**State Snapshot Testing:**

```typescript
it("should have correct initial state", () => {
  const state = store.getState();

  expect(state.player).toEqual({
    currentTrack: null,
    isPlaying: false,
    position: 0,
    currentChapter: null,
    playbackRate: 1.0,
    volume: 1.0,
    // ... rest of initial state
  });
});
```

**Boundary Testing:**

```typescript
it("should clamp volume to 0-1 range", () => {
  store.getState()._setVolume(1.5);
  expect(store.getState().player.volume).toBe(1.0);

  store.getState()._setVolume(-0.5);
  expect(store.getState().player.volume).toBe(0.0);
});
```

**Time-Based Testing:**

```typescript
it("should return remaining time for duration timer", () => {
  const endTime = Date.now() + 60000; // 60 seconds from now
  store.getState().player.sleepTimer = {
    type: "duration",
    endTime,
    chapterTarget: null,
  };

  const remaining = store.getState().getSleepTimerRemaining();
  expect(remaining).toBeGreaterThan(55);
  expect(remaining).toBeLessThanOrEqual(60);
});
```

## Coverage Targets

**Requirements:** No strict enforcement - coverage reports are informational

**View Coverage:**

```bash
npm run test:coverage    # Generate and display coverage
npm run test:report      # Generate HTML report at coverage/lcov-report/index.html
```

**Areas with Coverage:**

- Store slices: `src/stores/slices/__tests__/` (80%+ coverage)
- Database helpers: `src/db/helpers/__tests__/` (tested marshalling and operations)
- Services: `src/services/__tests__/` (core business logic tested)

**Areas Excluded from Coverage:**

- UI components: `src/components/` and `src/app/` (routes)
- Type definitions: `src/**/types.ts`
- Test infrastructure: `src/__tests__/`

---

_Testing analysis: 2026-02-15_
