/**
 * Shared Mock Library
 *
 * This module provides reusable mock factories for common dependencies
 * used across test files. Using these factories eliminates duplication,
 * ensures consistency, and makes tests easier to write and maintain.
 *
 * @example
 * // Import specific mocks
 * import { createMockTrackPlayer, createMockPlayerSlice } from '@/__tests__/mocks';
 *
 * // Use in test file
 * const mockTrackPlayer = createMockTrackPlayer({ initialState: State.Playing });
 * jest.mock('react-native-track-player', () => mockTrackPlayer);
 */

// TrackPlayer mocks
export {
  createMockTrackPlayer,
  createMinimalMockTrackPlayer,
  State,
  type MockTrackPlayer,
  type MockTrackPlayerOptions,
} from "./trackPlayer";

// AsyncStorage mocks
export {
  createMockAsyncStorage,
  createMockAsyncStorageWithDefault,
  type MockAsyncStorage,
} from "./asyncStorage";

// Store slice mocks
export {
  createMockPlayerSlice,
  createMockLibrarySlice,
  createMockSettingsSlice,
  type MockPlayerSlice,
  type MockPlayerSliceOptions,
  type MockLibrarySlice,
  type MockLibrarySliceOptions,
  type MockSettingsSlice,
  type MockSettingsSliceOptions,
} from "./stores";

// Service mocks
export {
  createMockProgressService,
  createMockPlayerService,
  type MockProgressService,
  type MockPlayerService,
} from "./services";

// Database helper mocks
export {
  createMockFileSystemHelpers,
  createMockLocalDataHelpers,
  createMockCombinedQueriesHelpers,
  createMockMediaMetadataHelpers,
  createMockMediaProgressHelpers,
  createMockICloudBackupHelpers,
  createFileLifecycleMocks,
  type MockFileSystemHelpers,
  type MockLocalDataHelpers,
  type MockCombinedQueriesHelpers,
  type MockMediaMetadataHelpers,
  type MockMediaProgressHelpers,
  type MockICloudBackupHelpers,
  type FileLifecycleMocks,
} from "./database";
