import { afterEach, beforeEach } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import JumpHistorySection from "@/components/library/LibraryItemDetail/JumpHistorySection";
import { playerService } from "@/services/PlayerService";
import { usePlayerState } from "@/stores";
import type { JumpHistoryEntry } from "@/types/player";

jest.mock("@/components/ui", () => ({
  CollapsibleSection: ({ children }: { children: React.ReactNode }) => children,
}));

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

function setJumpHistory(entries: JumpHistoryEntry[], libraryItemId = "item-1") {
  mockUsePlayerState.mockImplementation((selector) =>
    selector({ player: { jumpHistory: { version: 1, libraryItemId, entries } } } as never)
  );
}

describe("JumpHistorySection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(1_000);
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
});
