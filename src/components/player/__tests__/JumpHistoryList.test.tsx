import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import JumpHistoryList from "@/components/player/JumpHistoryList";
import type { JumpHistoryEntry } from "@/types/player";

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

const newest: JumpHistoryEntry = {
  id: "jump-newest",
  sessionId: "session-1",
  libraryItemId: "item-1",
  surface: "full_screen",
  category: "scrub",
  fromPosition: 300,
  toPosition: 500,
  createdAt: 9_999,
  updatedAt: 9_999,
  toastPending: false,
};

const oldest: JumpHistoryEntry = {
  id: "jump-oldest",
  sessionId: "session-1",
  libraryItemId: "item-1",
  surface: "item_detail",
  category: "skip_backward",
  fromPosition: 150,
  toPosition: 120,
  createdAt: 8_000,
  updatedAt: 8_000,
  toastPending: false,
};

describe("JumpHistoryList", () => {
  it("renders newest first and selects the requested entry", () => {
    const onSelect = jest.fn();
    const view = render(
      <JumpHistoryList entries={[newest, oldest]} onSelect={onSelect} now={10_000} />
    );

    expect(view.getAllByRole("button")[0]).toHaveTextContent(/8:20/);
    fireEvent.press(view.getAllByRole("button")[1]);
    expect(onSelect).toHaveBeenCalledWith(oldest);
  });

  it("announces and displays the source, category, positions, delta, and occurrence time", () => {
    const view = render(<JumpHistoryList entries={[newest]} onSelect={jest.fn()} now={10_000} />);

    const row = view.getByRole("button", {
      name: "Full-screen player, Scrub, from 5:00 to 8:20, +3:20, just now",
    });

    expect(row).toHaveTextContent(/Full-screen player/);
    expect(row).toHaveTextContent(/Scrub/);
    expect(row).toHaveTextContent(/5:00 → 8:20/);
    expect(row).toHaveTextContent(/\+3:20/);
    expect(row).toHaveTextContent(/just now/);
  });
});
