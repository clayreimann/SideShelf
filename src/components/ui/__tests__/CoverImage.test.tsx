/**
 * Tests for CoverImage component
 *
 * PERF-08: expo-image migration — replaces RN Image with expo-image for
 * memory-disk caching, recyclingKey support, and consistent dim overlay
 */

import CoverImage from "@/components/ui/CoverImage";
import { render } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";

// Mock expo-image
jest.mock("expo-image", () => ({
  Image: jest.fn((props) => {
    const { View } = require("react-native");
    return <View testID="expo-image" {...props} />;
  }),
}));

// Mock stores used by CoverImage
jest.mock("@/stores", () => ({
  useNetwork: jest.fn(() => ({
    isConnected: true,
    isInternetReachable: true,
  })),
  useDownloads: jest.fn(() => ({
    isItemDownloaded: jest.fn(() => false),
    isItemPartiallyDownloaded: jest.fn(() => false),
  })),
}));

// Mock theme
jest.mock("@/lib/theme", () => ({
  useThemedStyles: jest.fn(() => ({
    colors: { textPrimary: "#000" },
  })),
}));

// Mock icons
jest.mock("@/components/icons", () => ({
  OfflineIcon: () => null,
}));

const { useDownloads } = require("@/stores");

describe("CoverImage", () => {
  describe("PERF-08: expo-image migration", () => {
    it("renders expo-image Image component instead of RN Image", () => {
      const { getByTestId } = render(
        <CoverImage uri="https://example.com/cover.jpg" title="Test Book" fontSize={14} />
      );
      expect(getByTestId("expo-image")).toBeTruthy();
    });

    it("passes cachePolicy memory-disk", () => {
      const { Image } = require("expo-image");
      Image.mockClear();
      render(<CoverImage uri="https://example.com/cover.jpg" title="Test Book" fontSize={14} />);
      const [lastProps] = Image.mock.lastCall;
      expect(lastProps).toMatchObject({ cachePolicy: "memory-disk" });
    });

    it("passes recyclingKey when libraryItemId provided", () => {
      const { Image } = require("expo-image");
      Image.mockClear();
      render(
        <CoverImage
          uri="https://example.com/cover.jpg"
          title="Test Book"
          fontSize={14}
          libraryItemId="lib-item-123"
        />
      );
      const [lastProps] = Image.mock.lastCall;
      expect(lastProps).toMatchObject({ recyclingKey: "lib-item-123" });
    });

    it("shows dim overlay when item has libraryItemId and is not downloaded", () => {
      (useDownloads as jest.Mock).mockReturnValue({
        isItemDownloaded: jest.fn(() => false),
        isItemPartiallyDownloaded: jest.fn(() => false),
      });

      const { getByTestId } = render(
        <CoverImage
          uri="https://example.com/cover.jpg"
          title="Test Book"
          fontSize={14}
          libraryItemId="lib-item-123"
        />
      );
      expect(getByTestId("dim-overlay")).toBeTruthy();
    });

    it("does not show dim overlay when item is downloaded", () => {
      (useDownloads as jest.Mock).mockReturnValue({
        isItemDownloaded: jest.fn(() => true),
        isItemPartiallyDownloaded: jest.fn(() => false),
      });

      const { queryByTestId } = render(
        <CoverImage
          uri="https://example.com/cover.jpg"
          title="Test Book"
          fontSize={14}
          libraryItemId="lib-item-123"
        />
      );
      expect(queryByTestId("dim-overlay")).toBeNull();
    });

    it("shows title fallback text when uri is null", () => {
      const { getByText } = render(<CoverImage uri={null} title="My Audiobook" fontSize={14} />);
      expect(getByText("My Audiobook")).toBeTruthy();
    });
  });
});
