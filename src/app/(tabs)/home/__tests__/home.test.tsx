/**
 * Tests for HomeScreen
 *
 * PERF-05: TTI mark — HomeScreen calls performance.mark('screenInteractive')
 * from react-native-performance when content is ready, enabling RN performance
 * timeline tracking of time-to-interactive
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import HomeScreen from "@/app/(tabs)/home/index";
import performance from "react-native-performance";

// --- Mocks ---

jest.mock("react-native-performance", () => ({
  __esModule: true,
  default: { mark: jest.fn() },
}));

jest.mock("@/lib/theme", () => ({
  useThemedStyles: () => ({
    styles: { container: {}, text: {}, flatListContainer: {} },
    colors: { background: "#fff", link: "#007AFF" },
    isDark: false,
  }),
}));

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ username: "alice", isAuthenticated: true }),
}));

jest.mock("@/hooks/useFloatingPlayerPadding", () => ({
  useFloatingPlayerPadding: () => ({ paddingBottom: 0 }),
}));

jest.mock("@/lib/appSettings", () => ({
  getLastHomeSectionCount: jest.fn().mockResolvedValue(3),
  setLastHomeSectionCount: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock("@/db/helpers/users", () => ({
  getUserByUsername: jest.fn().mockResolvedValue({ id: "user-1", username: "alice" }),
}));

jest.mock("@/services/ProgressService", () => ({
  progressService: { fetchServerProgress: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/i18n", () => ({
  translate: (key: string) => key,
}));

jest.mock("@/components/home/CoverItem", () => () => null);
jest.mock("@/components/home/SkeletonSection", () => ({ SkeletonSection: () => null }));

// --- useHome / useNetwork mock factories (set per test) ---

let mockHomeState = {
  continueListening: [] as any[],
  downloaded: [] as any[],
  listenAgain: [] as any[],
  isLoadingHome: false,
  initialized: true,
  refreshHome: jest.fn(),
};

jest.mock("@/stores", () => ({
  useHome: () => mockHomeState,
  useNetwork: () => ({ serverReachable: true }),
}));

// --- Tests ---

describe("HomeScreen", () => {
  describe("PERF-05: TTI mark", () => {
    it("calls performance.mark('screenInteractive') when content is ready", () => {
      mockHomeState = {
        continueListening: [{ id: "item-1" }],
        downloaded: [],
        listenAgain: [],
        isLoadingHome: false,
        initialized: true,
        refreshHome: jest.fn(),
      };
      jest.mocked(performance.mark).mockClear();

      render(<HomeScreen />);

      expect(performance.mark).toHaveBeenCalledWith("screenInteractive");
    });

    it("does not call performance.mark while still loading", () => {
      mockHomeState = {
        continueListening: [],
        downloaded: [],
        listenAgain: [],
        isLoadingHome: true,
        initialized: false,
        refreshHome: jest.fn(),
      };
      jest.mocked(performance.mark).mockClear();

      render(<HomeScreen />);

      expect(performance.mark).not.toHaveBeenCalled();
    });
  });
});
