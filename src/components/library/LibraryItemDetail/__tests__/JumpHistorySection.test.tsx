import { afterEach, beforeEach } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { FlatList } from "react-native";

import JumpHistorySection from "@/components/library/LibraryItemDetail/JumpHistorySection";
import { playerService } from "@/services/PlayerService";
import { usePlayerState } from "@/stores";
import type { JumpHistoryEntry } from "@/types/player";

jest.mock("@/components/ui", () => {
  const { Text: MockText } = require("react-native");
  return {
    CollapsibleSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
      <>
        <MockText>{title}</MockText>
        {children}
      </>
    ),
  };
});

jest.mock("@/lib/theme", () => ({
  useThemedStyles: () => ({
    colors: {
      background: "#fff",
      separator: "#ccc",
      textPrimary: "#000",
      textSecondary: "#666",
    },
  }),
}));

jest.mock("@/services/PlayerService", () => ({
  playerService: { seekTo: jest.fn() },
}));

jest.mock("@/stores", () => ({
  usePlayerState: jest.fn(),
}));

const entry: JumpHistoryEntry = {
  id: "jump-1",
  sessionId: "session-1",
  libraryItemId: "item-1",
  surface: "item_detail",
  category: "bookmark",
  fromPosition: 100,
  toPosition: 500,
  createdAt: 1_000,
  updatedAt: 1_000,
  toastPending: false,
};

const mockUsePlayerState = jest.mocked(usePlayerState);
const mockSeekTo = jest.mocked(playerService.seekTo);

function setJumpHistory(
  entries: JumpHistoryEntry[] | null,
  historyLibraryItemId = "item-1",
  currentLibraryItemId = historyLibraryItemId
) {
  mockUsePlayerState.mockImplementation((selector) =>
    selector({
      player: {
        currentTrack: { libraryItemId: currentLibraryItemId },
        jumpHistory:
          entries === null ? null : { version: 1, libraryItemId: historyLibraryItemId, entries },
      },
    } as never)
  );
}

describe("JumpHistorySection", () => {
  let dateNowSpy: jest.SpiedFunction<typeof Date.now>;

  beforeEach(() => {
    jest.clearAllMocks();
    dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000);
    mockSeekTo.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns null when the active session belongs to a different item", () => {
    setJumpHistory([entry]);

    expect(render(<JumpHistorySection libraryItemId="item-2" />).toJSON()).toBeNull();
  });

  it("shows the translated empty state for the active item with no entries", () => {
    setJumpHistory([]);

    expect(
      render(<JumpHistorySection libraryItemId="item-1" />).getByText(
        "No jumps in this session yet."
      )
    ).toBeTruthy();
  });

  it("shows the localized zero-entry state when the active item has null history", () => {
    setJumpHistory(null, "item-1", "item-1");

    const view = render(<JumpHistorySection libraryItemId="item-1" />);

    expect(view.getByText("Jump History (0)")).toBeTruthy();
    expect(view.getByText("No jumps in this session yet.")).toBeTruthy();
  });

  it("stays hidden for an inactive item even if stale history matches the viewed item", () => {
    setJumpHistory([entry], "item-1", "item-2");

    expect(render(<JumpHistorySection libraryItemId="item-1" />).toJSON()).toBeNull();
  });

  it("seeks to the entry origin while suppressing new history", () => {
    setJumpHistory([entry]);
    const view = render(<JumpHistorySection libraryItemId="item-1" />);

    fireEvent.press(
      view.getByRole("button", {
        name: "Item details, Bookmark, from 1:40 to 8:20, +6:40, just now",
      })
    );

    expect(mockSeekTo).toHaveBeenCalledWith(100, { suppressJumpHistory: true });
  });

  it("embeds shared rows under the page scroll owner instead of owning a nested list", () => {
    setJumpHistory([entry]);
    const view = render(<JumpHistorySection libraryItemId="item-1" />);

    expect(view.UNSAFE_queryByType(FlatList)).toBeNull();
    expect(
      view.getByRole("button", {
        name: "Item details, Bookmark, from 1:40 to 8:20, +6:40, just now",
      })
    ).toBeTruthy();
  });

  it("does not age shared rows when its parent rerenders", () => {
    setJumpHistory([entry]);
    const view = render(<JumpHistorySection libraryItemId="item-1" />);

    dateNowSpy.mockReturnValue(61_000);
    view.rerender(<JumpHistorySection libraryItemId="item-1" />);

    expect(
      view.getByRole("button", {
        name: "Item details, Bookmark, from 1:40 to 8:20, +6:40, just now",
      })
    ).toBeTruthy();
  });
});
