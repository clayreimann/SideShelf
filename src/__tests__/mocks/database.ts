/**
 * Database Helper Mocks
 *
 * Provides mock factories for database helper modules to eliminate duplication
 * across tests that need to mock database operations.
 */

import { jest } from "@jest/globals";
import type {
  downloadFileExists,
  ensureDownloadsDirectory,
  getAudioFileLocation,
  getCachesDirectory,
  getDocumentsDirectory,
  getDownloadPath,
  getDownloadsDirectory,
  moveAudioFile,
  verifyDownloadedFileExists,
  verifyFileExists,
} from "@/lib/fileSystem";
import type {
  clearAudioFileDownloadStatus,
  getAllDownloadedAudioFiles,
  getAudioFileDownloadInfo,
  markAudioFileAsDownloaded,
  updateAudioFileDownloadPath,
  updateAudioFileLastAccessed,
  updateAudioFileStorageLocation,
} from "@/db/helpers/localData";
import type { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import type { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import type { getMediaProgressForLibraryItem } from "@/db/helpers/mediaProgress";
import type {
  isExcludedFromBackup,
  isICloudBackupExclusionAvailable,
  setExcludeFromBackup,
} from "@/lib/iCloudBackupExclusion";

/**
 * Mock for file system helpers
 */
export interface MockFileSystemHelpers {
  getDownloadPath: jest.MockedFunction<typeof getDownloadPath>;
  moveAudioFile: jest.MockedFunction<typeof moveAudioFile>;
  getAudioFileLocation: jest.MockedFunction<typeof getAudioFileLocation>;
  ensureDownloadsDirectory: jest.MockedFunction<typeof ensureDownloadsDirectory>;
  verifyFileExists: jest.MockedFunction<typeof verifyFileExists>;
  getDocumentsDirectory: jest.MockedFunction<typeof getDocumentsDirectory>;
  getCachesDirectory: jest.MockedFunction<typeof getCachesDirectory>;
  getDownloadsDirectory: jest.MockedFunction<typeof getDownloadsDirectory>;
  downloadFileExists: jest.MockedFunction<typeof downloadFileExists>;
  verifyDownloadedFileExists: jest.MockedFunction<typeof verifyDownloadedFileExists>;
}

/**
 * Mock for local data helpers
 */
export interface MockLocalDataHelpers {
  updateAudioFileStorageLocation: jest.MockedFunction<typeof updateAudioFileStorageLocation>;
  clearAudioFileDownloadStatus: jest.MockedFunction<typeof clearAudioFileDownloadStatus>;
  getAllDownloadedAudioFiles: jest.MockedFunction<typeof getAllDownloadedAudioFiles>;
  markAudioFileAsDownloaded: jest.MockedFunction<typeof markAudioFileAsDownloaded>;
  getAudioFileDownloadInfo: jest.MockedFunction<typeof getAudioFileDownloadInfo>;
  updateAudioFileLastAccessed: jest.MockedFunction<typeof updateAudioFileLastAccessed>;
  updateAudioFileDownloadPath: jest.MockedFunction<typeof updateAudioFileDownloadPath>;
}

/**
 * Mock for combined queries helpers
 */
export interface MockCombinedQueriesHelpers {
  getAudioFilesWithDownloadInfo: jest.MockedFunction<typeof getAudioFilesWithDownloadInfo>;
}

/**
 * Mock for media metadata helpers
 */
export interface MockMediaMetadataHelpers {
  getMediaMetadataByLibraryItemId: jest.MockedFunction<typeof getMediaMetadataByLibraryItemId>;
}

/**
 * Mock for media progress helpers
 */
export interface MockMediaProgressHelpers {
  getMediaProgressForLibraryItem: jest.MockedFunction<typeof getMediaProgressForLibraryItem>;
}

/**
 * Mock for iCloud backup exclusion
 */
export interface MockICloudBackupHelpers {
  setExcludeFromBackup: jest.MockedFunction<typeof setExcludeFromBackup>;
  isExcludedFromBackup: jest.MockedFunction<typeof isExcludedFromBackup>;
  isICloudBackupExclusionAvailable: jest.MockedFunction<typeof isICloudBackupExclusionAvailable>;
}

/**
 * Creates a mock for file system helpers
 */
export function createMockFileSystemHelpers(): MockFileSystemHelpers {
  return {
    getDownloadPath: jest.fn<typeof getDownloadPath>(
      (id, filename, location = "caches") => `${location}/downloads/${id}/${filename}`
    ),
    moveAudioFile: jest.fn<typeof moveAudioFile>().mockResolvedValue(true),
    getAudioFileLocation: jest.fn<typeof getAudioFileLocation>((_id, _filename) => {
      // Default: files exist in caches
      return "caches";
    }),
    ensureDownloadsDirectory: jest
      .fn<typeof ensureDownloadsDirectory>()
      .mockResolvedValue(undefined),
    verifyFileExists: jest.fn<typeof verifyFileExists>().mockResolvedValue(true),
    getDocumentsDirectory: jest.fn<typeof getDocumentsDirectory>(),
    getCachesDirectory: jest.fn<typeof getCachesDirectory>(),
    getDownloadsDirectory: jest.fn<typeof getDownloadsDirectory>(),
    // Default: files exist in caches location
    downloadFileExists: jest.fn<typeof downloadFileExists>(
      (_id, _filename, location = "caches") => location === "caches"
    ),
    verifyDownloadedFileExists: jest.fn<typeof verifyDownloadedFileExists>().mockReturnValue(true),
  };
}

/**
 * Creates a mock for local data helpers
 */
export function createMockLocalDataHelpers(): MockLocalDataHelpers {
  return {
    updateAudioFileStorageLocation: jest
      .fn<typeof updateAudioFileStorageLocation>()
      .mockResolvedValue(undefined),
    clearAudioFileDownloadStatus: jest
      .fn<typeof clearAudioFileDownloadStatus>()
      .mockResolvedValue(undefined),
    getAllDownloadedAudioFiles: jest.fn<typeof getAllDownloadedAudioFiles>().mockResolvedValue([]),
    markAudioFileAsDownloaded: jest
      .fn<typeof markAudioFileAsDownloaded>()
      .mockResolvedValue(undefined),
    getAudioFileDownloadInfo: jest.fn<typeof getAudioFileDownloadInfo>().mockResolvedValue(null),
    updateAudioFileLastAccessed: jest
      .fn<typeof updateAudioFileLastAccessed>()
      .mockResolvedValue(undefined),
    updateAudioFileDownloadPath: jest
      .fn<typeof updateAudioFileDownloadPath>()
      .mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock for combined queries helpers
 */
export function createMockCombinedQueriesHelpers(): MockCombinedQueriesHelpers {
  return {
    getAudioFilesWithDownloadInfo: jest
      .fn<typeof getAudioFilesWithDownloadInfo>()
      .mockResolvedValue([]),
  };
}

/**
 * Creates a mock for media metadata helpers
 */
export function createMockMediaMetadataHelpers(): MockMediaMetadataHelpers {
  return {
    getMediaMetadataByLibraryItemId: jest
      .fn<typeof getMediaMetadataByLibraryItemId>()
      .mockResolvedValue(null),
  };
}

/**
 * Creates a mock for media progress helpers
 */
export function createMockMediaProgressHelpers(): MockMediaProgressHelpers {
  return {
    getMediaProgressForLibraryItem: jest
      .fn<typeof getMediaProgressForLibraryItem>()
      .mockResolvedValue(null),
  };
}

/**
 * Creates a mock for iCloud backup exclusion
 */
export function createMockICloudBackupHelpers(): MockICloudBackupHelpers {
  return {
    setExcludeFromBackup: jest
      .fn<typeof setExcludeFromBackup>()
      .mockResolvedValue({ success: true, path: "" }),
    isExcludedFromBackup: jest
      .fn<typeof isExcludedFromBackup>()
      .mockResolvedValue({ excluded: false, path: "" }),
    isICloudBackupExclusionAvailable: jest
      .fn<typeof isICloudBackupExclusionAvailable>()
      .mockReturnValue(true),
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
