# Testing Documentation

This directory contains comprehensive tests for the Audiobookshelf React Native application.

## Overview

Our testing strategy covers:
- **Database Helpers**: Marshal functions, CRUD operations, and data transformations
- **Zustand Store Slices**: State management, actions, and persistence
- **Utility Functions**: Sorting, data processing, and helper functions

## Test Structure

```
src/__tests__/
├── README.md              # This file
├── setup.ts               # Jest setup and mocks
├── fixtures/              # Test data fixtures
│   └── index.ts           # Mock API responses and database rows
└── utils/                 # Test utilities
    └── testDb.ts          # In-memory database setup

src/db/helpers/__tests__/  # Database helper tests
├── users.test.ts          # User marshal/upsert operations
├── libraries.test.ts      # Library CRUD operations
└── statistics.test.ts     # Statistics counting functions

src/stores/__tests__/      # Store tests
├── utils.test.ts          # Store utility functions
└── slices/                # Slice-specific tests
    └── librarySlice.test.ts  # Library slice tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testPathPatterns=users.test.ts

# Run tests for specific directory
npm test -- src/db/helpers
```

## Test Database

Tests use an in-memory SQLite database for isolation:
- Each test gets a fresh database instance
- Migrations are applied automatically
- No cleanup required between tests
- Fast execution with full database functionality

## Fixtures

Test fixtures provide realistic data that matches the Audiobookshelf API structure:
- **API Responses**: Complete mock responses from the server
- **Database Rows**: Properly marshaled data for database operations
- **User Data**: Various user types and permission configurations
- **Library Data**: Books and podcasts with metadata
- **Library Items**: Complete media items with files and metadata

## Mocking Strategy

### Database Operations
- Use in-memory SQLite for integration tests
- Mock database client for unit tests
- Test both success and error scenarios

### API Calls
- Mock fetch functions with realistic responses
- Test network error handling
- Verify correct API endpoint usage

### React Native Dependencies
- Mock AsyncStorage for persistence tests
- Mock Expo modules (SQLite, FileSystem, etc.)
- Mock platform-specific functionality

### Store Testing
- Test state changes and persistence
- Verify loading states and error handling
- Test action side effects and async operations

## Writing New Tests

### Database Helper Tests

```typescript
import { TestDatabase, createTestDb } from '../../__tests__/utils/testDb';
import { mockUserRow } from '../../__tests__/fixtures';

describe('MyHelper', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
    // Mock the database client
    jest.doMock('@/db/client', () => ({
      db: testDb.db,
    }));
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('should test marshal function', () => {
    // Test pure marshal functions
  });

  it('should test database operations', async () => {
    // Test CRUD operations with real database
  });
});
```

### Store Tests

```typescript
import { create } from 'zustand';
import { MySlice, createMySlice } from '../mySlice';

describe('MySlice', () => {
  let store: ReturnType<typeof create<MySlice>>;

  beforeEach(() => {
    store = create<MySlice>()((set, get) => ({
      ...createMySlice(set, get),
    }));
    // Setup mocks
  });

  it('should test initial state', () => {
    const state = store.getState();
    expect(state.myProperty).toBe(expectedValue);
  });

  it('should test actions', async () => {
    await store.getState().myAction();
    const state = store.getState();
    expect(state.myProperty).toBe(newValue);
  });
});
```

## Best Practices

1. **Test Isolation**: Each test should be independent and not rely on others
2. **Realistic Data**: Use fixtures that match real API responses
3. **Error Scenarios**: Test both success and failure cases
4. **Async Operations**: Properly handle promises and async/await
5. **Mock Cleanup**: Reset mocks between tests to avoid interference
6. **Database Testing**: Use real database for integration, mocks for units
7. **Coverage Goals**: Aim for high coverage of critical business logic

## Coverage Goals

- **Database Helpers**: 90%+ coverage of marshal and CRUD functions
- **Store Slices**: 85%+ coverage of actions and state changes
- **Utility Functions**: 95%+ coverage of pure functions
- **Error Handling**: Test all error paths and edge cases

## Debugging Tests

### Common Issues

1. **Module Resolution**: Check `moduleNameMapping` in jest.config.js
2. **Mock Conflicts**: Ensure mocks are reset between tests
3. **Database Errors**: Verify migrations are applied correctly
4. **Async Issues**: Use proper async/await patterns
5. **Memory Leaks**: Cleanup database connections and timers

### Debug Commands

```bash
# Run with verbose output
npm test -- --verbose

# Run single test with debugging
npm test -- --testPathPatterns=mytest.test.ts --verbose

# Check test coverage
npm run test:coverage
```

This testing setup ensures comprehensive coverage of the application's core functionality while maintaining fast execution and reliable results.
