/**
 * Tests for ChapterList component
 *
 * PERF-02: getItemLayout — eliminates FlatList's layout measurement pass
 * PERF-09: setTimeout cleanup — prevents state updates on unmounted component
 */

import React from "react";
import { FlatList } from "react-native";
import { act, render } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import ChapterList from "@/components/player/ChapterList";
import type { ChapterRow } from "@/db/schema/chapters";
import type { CurrentChapter } from "@/types/player";

// --- Mocks ---

jest.mock("@/db/helpers/chapters", () => ({
  getCurrentChapterIndex: jest.fn().mockReturnValue(0),
}));

jest.mock("@/lib/helpers/formatters", () => ({
  formatTime: jest.fn((s: number) => `${s}s`),
}));

jest.mock("@/lib/theme", () => {
  // Stable singleton so useCallback dependency checks see the same references
  const stableStyles = { text: {} };
  const stableResult = { styles: stableStyles, isDark: false };
  return { useThemedStyles: () => stableResult };
});

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

// --- Test data ---

const mockChapter: ChapterRow = {
  id: "ch-1",
  mediaId: "media-1",
  chapterId: 1,
  start: 0,
  end: 300,
  title: "Chapter 1",
};

const mockCurrentChapter: CurrentChapter = {
  chapter: mockChapter,
  positionInChapter: 30,
  chapterDuration: 300,
};

const baseProps = {
  chapters: [mockChapter, { ...mockChapter, id: "ch-2", title: "Chapter 2" }],
  currentChapter: mockCurrentChapter,
  position: 30,
  onChapterPress: jest.fn(),
  showChapterList: true,
  animatedStyle: {},
};

// --- Tests ---

describe("ChapterList", () => {
  describe("PERF-02: getItemLayout", () => {
    it("returns correct layout for index 0", () => {
      const { UNSAFE_getByType } = render(<ChapterList {...baseProps} />);
      const flatList = UNSAFE_getByType(FlatList);
      const result = flatList.props.getItemLayout(null, 0);
      expect(result).toEqual({ length: 64, offset: 0, index: 0 });
    });

    it("returns correct offset for index N", () => {
      const { UNSAFE_getByType } = render(<ChapterList {...baseProps} />);
      const getItemLayout = UNSAFE_getByType(FlatList).props.getItemLayout;

      expect(getItemLayout(null, 1)).toEqual({ length: 64, offset: 64, index: 1 });
      expect(getItemLayout(null, 3)).toEqual({ length: 64, offset: 192, index: 3 });
    });

    it("renderItem is wrapped in useCallback", () => {
      const { UNSAFE_getByType, rerender } = render(<ChapterList {...baseProps} />);
      const renderItem1 = UNSAFE_getByType(FlatList).props.renderItem;

      // Same props — renderItem reference should be stable (useCallback memoization)
      rerender(<ChapterList {...baseProps} />);
      const renderItem2 = UNSAFE_getByType(FlatList).props.renderItem;

      expect(renderItem1).toBe(renderItem2);
    });
  });

  describe("PERF-09: setTimeout cleanup", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("first useEffect returns clearTimeout cleanup", () => {
      const clearSpy = jest.spyOn(global, "clearTimeout");

      // showChapterList=true + chapters + currentChapter → first useEffect creates a 350ms timer
      const { unmount } = render(<ChapterList {...baseProps} />);

      act(() => {
        unmount();
      });

      // Cleanup must call clearTimeout to cancel the pending auto-scroll timer
      expect(clearSpy).toHaveBeenCalled();
    });

    it("second useEffect returns clearTimeout cleanup", () => {
      const clearSpy = jest.spyOn(global, "clearTimeout");

      // On first render previousChapterIdRef is undefined, so currentChapterId !== undefined
      // satisfies the second useEffect condition and creates a 100ms timer
      const { unmount } = render(<ChapterList {...baseProps} />);

      act(() => {
        unmount();
      });

      // Both effect cleanups call clearTimeout
      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
