/**
 * Test setup file for Jest
 * This file is run before all tests
 */

import '@testing-library/jest-native/extend-expect';

// expo-sqlite is now mocked by expo-sqlite-mock package

// Mock the database client to use test database instances
// This will be overridden in individual test files when they set up their test databases
let mockDb: any = null;
let mockSQLiteDb: any = null;

jest.mock('@/db/client', () => ({
  getSQLiteDb: jest.fn(() => mockSQLiteDb),
  get db() {
    return mockDb;
  },
  set db(value) {
    mockDb = value;
  },
}));

// Export functions to set the mock database instances
(global as any).setMockDb = (db: any) => {
  mockDb = db;
};

(global as any).setMockSQLiteDb = (sqliteDb: any) => {
  mockSQLiteDb = sqliteDb;
};

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file://test-documents/',
  cacheDirectory: 'file://test-cache/',
  downloadAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock third-party native modules
jest.mock('@kesha-antonov/react-native-background-downloader', () => ({
  download: jest.fn(),
  checkForExistingDownloads: jest.fn(() => Promise.resolve([])),
}));

jest.mock('react-native-track-player', () => ({
  setupPlayer: jest.fn(),
  add: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
}));

// Setup test timeout
jest.setTimeout(10000);
