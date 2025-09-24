/**
 * Setup file that runs before all imports to mock problematic Expo modules
 */

// Mock global objects that might be expected by Expo
global.__ExpoImportMetaRegistry = {};
global.structuredClone = global.structuredClone || ((obj) => JSON.parse(JSON.stringify(obj)));

// Mock the problematic Expo winter modules before they can be imported
jest.mock('expo/src/winter/runtime.native', () => ({}));
jest.mock('expo/src/winter/installGlobal', () => ({
  getValue: jest.fn(() => ({})),
  get: jest.fn(() => ({})),
}));
