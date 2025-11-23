/**
 * Database Helper Mocks
 *
 * Provides mock factories for database helper modules to eliminate duplication
 * across tests that need to mock database operations.
 */

import { jest } from "@jest/globals";

/**
 * Mock for file system helpers
 */
export interface MockFileSystemHelpers {
  getDownloadPath: jest.Mock;
  moveAudioFile: jest.Mock;
  getAudioFileLocation: jest.Mock;
  ensureDownloadsDirectory: jest.Mock;
  verifyFileExists: jest.Mock;
  getDocumentsDirectory: jest.Mock;
  getCachesDirectory: jest.Mock;
  getDownloadsDirectory: jest.Mock;
  downloadFileExists: jest.Mock;
  verifyDownloadedFileExists: jest.Mock;
}

/**
 * Mock for local data helpers
 */
export interface MockLocalDataHelpers {
  updateAudioFileStorageLocation: jest.Mock;
  clearAudioFileDownloadStatus: jest.Mock;
  getAllDownloadedAudioFiles: jest.Mock;
  markAudioFileAsDownloaded: jest.Mock;
  getAudioFileDownloadInfo: jest.Mock;
  updateAudioFileLastAccessed: jest.Mock;
  updateAudioFileDownloadPath: jest.Mock;
}

/**
 * Mock for combined queries helpers
 */
export interface MockCombinedQueriesHelpers {
  getAudioFilesWithDownloadInfo: jest.Mock;
}

/**
 * Mock for media metadata helpers
 */
export interface MockMediaMetadataHelpers {
  getMediaMetadataByLibraryItemId: jest.Mock;
}

/**
 * Mock for media progress helpers
 */
export interface MockMediaProgressHelpers {
  getMediaProgressForLibraryItem: jest.Mock;
}

/**
 * Mock for iCloud backup exclusion
 */
export interface MockICloudBackupHelpers {
  setExcludeFromBackup: jest.Mock;
  isExcludedFromBackup: jest.Mock;
  isICloudBackupExclusionAvailable: jest.Mock;
}

/**
 * Creates a mock for file system helpers
 */
export function createMockFileSystemHelpers(): MockFileSystemHelpers {
  return {
    getDownloadPath: jest.fn(
      (id, filename, location = "caches") => `${location}/downloads/${id}/${filename}`
    ),
    moveAudioFile: jest.fn().mockResolvedValue(true),
    getAudioFileLocation: jest.fn((id, filename) => {
      // Default: files exist in caches
      return "caches";
    }),
    ensureDownloadsDirectory: jest.fn().mockResolvedValue(undefined),
    verifyFileExists: jest.fn().mockResolvedValue(true),
    getDocumentsDirectory: jest.fn(),
    getCachesDirectory: jest.fn(),
    getDownloadsDirectory: jest.fn(),
    // Default: files exist in caches location
    downloadFileExists: jest.fn((id, filename, location = "caches") => location === "caches"),
    verifyDownloadedFileExists: jest.fn().mockReturnValue(true),
  };
}

/**
 * Creates a mock for local data helpers
 */
export function createMockLocalDataHelpers(): MockLocalDataHelpers {
  return {
    updateAudioFileStorageLocation: jest.fn().mockResolvedValue(undefined),
    clearAudioFileDownloadStatus: jest.fn().mockResolvedValue(undefined),
    getAllDownloadedAudioFiles: jest.fn().mockResolvedValue([]),
    markAudioFileAsDownloaded: jest.fn().mockResolvedValue(undefined),
    getAudioFileDownloadInfo: jest.fn().mockResolvedValue(null),
    updateAudioFileLastAccessed: jest.fn().mockResolvedValue(undefined),
    updateAudioFileDownloadPath: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock for combined queries helpers
 */
export function createMockCombinedQueriesHelpers(): MockCombinedQueriesHelpers {
  return {
    getAudioFilesWithDownloadInfo: jest.fn().mockResolvedValue([]),
  };
}

/**
 * Creates a mock for media metadata helpers
 */
export function createMockMediaMetadataHelpers(): MockMediaMetadataHelpers {
  return {
    getMediaMetadataByLibraryItemId: jest.fn().mockResolvedValue(null),
  };
}

/**
 * Creates a mock for media progress helpers
 */
export function createMockMediaProgressHelpers(): MockMediaProgressHelpers {
  return {
    getMediaProgressForLibraryItem: jest.fn().mockResolvedValue(null),
  };
}

/**
 * Creates a mock for iCloud backup exclusion
 */
export function createMockICloudBackupHelpers(): MockICloudBackupHelpers {
  return {
    setExcludeFromBackup: jest.fn().mockResolvedValue({ success: true, path: "" }),
    isExcludedFromBackup: jest.fn().mockResolvedValue({ excluded: false, path: "" }),
    isICloudBackupExclusionAvailable: jest.fn().mockReturnValue(true),
  };
}

/**
 * Combined mock for all database/file helpers needed by file lifecycle tests
 *
 * @example
 * ```typescript
 * import { createFileLifecycleMocks } from '@/__tests__/mocks';
 *
 * const mocks = createFileLifecycleMocks();
 *
 * jest.mock('@/lib/fileSystem', () => mocks.fileSystem);
 * jest.mock('@/db/helpers/localData', () => mocks.localData);
 * // ... etc
 *
 * // Customize behavior in tests
 * mocks.fileSystem.moveAudioFile.mockResolvedValue(false);
 * ```
 */
export function createFileLifecycleMocks() {
  return {
    fileSystem: createMockFileSystemHelpers(),
    localData: createMockLocalDataHelpers(),
    combinedQueries: createMockCombinedQueriesHelpers(),
    mediaMetadata: createMockMediaMetadataHelpers(),
    mediaProgress: createMockMediaProgressHelpers(),
    iCloudBackup: createMockICloudBackupHelpers(),
  };
}

export type FileLifecycleMocks = ReturnType<typeof createFileLifecycleMocks>;
