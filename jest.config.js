module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/src/__tests__/setup-before.js"],
  setupFilesAfterEnv: ["expo-sqlite-mock/src/setup.ts", "<rootDir>/src/__tests__/setup.ts"],
  testTimeout: 10000,
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)",
    "<rootDir>/src/**/?(*.)(test|spec).(ts|tsx|js|jsx)",
  ],
  testPathIgnorePatterns: [
    "<rootDir>/src/__tests__/setup.ts",
    "<rootDir>/src/__tests__/fixtures/",
    "<rootDir>/src/__tests__/utils/",
  ],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|zustand|@kesha-antonov/react-native-background-downloader|uuid)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**/*",
    "!src/**/types.ts",
    "!src/app/**/*",
    "!src/components/**/*",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html", "json", "json-summary"],
  reporters: [
    "default",
    [
      "jest-html-reporter",
      {
        pageTitle: "Test Report",
        outputPath: "test-report.html",
        includeFailureMsg: true,
        includeConsoleLog: true,
        theme: "defaultTheme",
      },
    ],
  ],
};
