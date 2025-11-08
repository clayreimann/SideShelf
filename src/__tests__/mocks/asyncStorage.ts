/**
 * Mock factory for @react-native-async-storage/async-storage
 *
 * This factory provides a consistent mock structure to eliminate
 * duplication and resolve the `default` vs direct export inconsistency.
 */

export interface MockAsyncStorage {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  clear: jest.Mock;
  getAllKeys: jest.Mock;
  multiGet: jest.Mock;
  multiSet: jest.Mock;
  multiRemove: jest.Mock;
}

/**
 * Create a mock AsyncStorage with all common methods
 *
 * Note: AsyncStorage uses a `default` export in the actual module,
 * but tests import it as a named import. This factory handles both cases.
 *
 * @example
 * // Use in test file (module-level mock)
 * const mockAsyncStorage = createMockAsyncStorage();
 * jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
 *
 * // Then access in tests via:
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * expect(AsyncStorage.getItem).toHaveBeenCalled();
 */
export function createMockAsyncStorage(): MockAsyncStorage {
  return {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([]),
    multiGet: jest.fn().mockResolvedValue([]),
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock AsyncStorage with default export wrapper
 *
 * Use this for global setup.ts where the module mock needs
 * to match the actual module structure with a default export.
 *
 * @example
 * // In setup.ts
 * jest.mock('@react-native-async-storage/async-storage', () =>
 *   createMockAsyncStorageWithDefault()
 * );
 */
export function createMockAsyncStorageWithDefault() {
  return {
    default: createMockAsyncStorage(),
  };
}
