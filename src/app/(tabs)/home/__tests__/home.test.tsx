/**
 * Tests for HomeScreen
 *
 * PERF-05: TTI mark — HomeScreen calls performance.mark('screenInteractive')
 * from react-native-performance when content is ready, enabling RN performance
 * timeline tracking of time-to-interactive
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import HomeScreen from "@/app/(tabs)/home/index";
import type { AuthStatus } from "@/types/auth";
import { ScrollView } from "react-native";
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

let mockAuthState: {
  username: string | null;
  isAuthenticated: boolean;
  authStatus: AuthStatus;
} = {
  username: "alice",
  isAuthenticated: true,
  authStatus: "authenticated",
};

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockAuthState,
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

jest.mock("@/components/home/CoverItem", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return function MockCoverItem({ item }: { item: { id: string } }) {
    return <Text testID={`home-cover-${item.id}`}>{item.id}</Text>;
  };
});
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

function getHomeScrollView(result: ReturnType<typeof render>) {
  const homeScrollView = result
    .UNSAFE_getAllByType(ScrollView)
    .find((scrollView) => scrollView.props.testID === "home-scroll-view");

  expect(homeScrollView).toBeDefined();
  return homeScrollView!;
}

// --- Tests ---

describe("HomeScreen", () => {
  beforeEach(() => {
    mockAuthState = {
      username: "alice",
      isAuthenticated: true,
      authStatus: "authenticated",
    };
    mockHomeState = {
      continueListening: [],
      downloaded: [],
      listenAgain: [],
      isLoadingHome: false,
      initialized: true,
      refreshHome: jest.fn(),
    };
    jest.mocked(performance.mark).mockClear();
  });

  it("shows local downloads and stale messages while reauthentication is required", () => {
    mockAuthState = {
      username: "alice",
      isAuthenticated: false,
      authStatus: "reauthRequired",
    };
    mockHomeState = {
      continueListening: [{ id: "continue-1" }],
      downloaded: [{ id: "downloaded-1" }],
      listenAgain: [{ id: "again-1" }],
      isLoadingHome: false,
      initialized: true,
      refreshHome: jest.fn(),
    };

    const result = render(<HomeScreen />);
    const { getAllByText, getByTestId, queryByTestId } = result;

    expect(getAllByText("home.reauthRequired")).toHaveLength(2);
    expect(getByTestId("home-cover-downloaded-1")).toBeTruthy();
    expect(queryByTestId("home-cover-continue-1")).toBeNull();
    expect(queryByTestId("home-cover-again-1")).toBeNull();
    expect(getHomeScrollView(result).props.refreshControl).toBeUndefined();
  });

  it("shows a shelf-local empty state when reauthentication is required without downloads", () => {
    mockAuthState = {
      username: "alice",
      isAuthenticated: false,
      authStatus: "reauthRequired",
    };
    mockHomeState = {
      continueListening: [],
      downloaded: [],
      listenAgain: [],
      isLoadingHome: false,
      initialized: true,
      refreshHome: jest.fn(),
    };

    const { getByText } = render(<HomeScreen />);

    expect(getByText("home.noDownloads")).toBeTruthy();
  });

  it("retains the blocking login message after explicit sign-out", () => {
    mockAuthState = {
      username: null,
      isAuthenticated: false,
      authStatus: "signedOut",
    };
    mockHomeState = {
      continueListening: [],
      downloaded: [{ id: "old-download" }],
      listenAgain: [],
      isLoadingHome: false,
      initialized: true,
      refreshHome: jest.fn(),
    };

    const { getByText, queryByTestId } = render(<HomeScreen />);

    expect(getByText("home.requireLogin")).toBeTruthy();
    expect(queryByTestId("home-cover-old-download")).toBeNull();
  });

  it("preserves all shelves and pull-to-refresh while authenticated", () => {
    mockHomeState = {
      continueListening: [{ id: "continue-1" }],
      downloaded: [{ id: "downloaded-1" }],
      listenAgain: [{ id: "again-1" }],
      isLoadingHome: false,
      initialized: true,
      refreshHome: jest.fn(),
    };

    const result = render(<HomeScreen />);
    const { getByTestId } = result;

    expect(getByTestId("home-cover-continue-1")).toBeTruthy();
    expect(getByTestId("home-cover-downloaded-1")).toBeTruthy();
    expect(getByTestId("home-cover-again-1")).toBeTruthy();
    expect(getHomeScrollView(result).props.refreshControl).toBeTruthy();
  });

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
