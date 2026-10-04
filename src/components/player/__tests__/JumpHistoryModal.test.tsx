import { afterEach, beforeEach } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { FlatList } from "react-native";

import JumpHistoryModal from "@/components/player/JumpHistoryModal";
import type { JumpHistoryEntry } from "@/types/player";

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

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

const entry: JumpHistoryEntry = {
  id: "jump-1",
  sessionId: "session-1",
  libraryItemId: "item-1",
  surface: "lock_screen",
  category: "skip_forward",
  fromPosition: 60,
  toPosition: 90,
  createdAt: 1_000,
  updatedAt: 1_000,
  toastPending: false,
};

describe("JumpHistoryModal", () => {
  let dateNowSpy: jest.SpiedFunction<typeof Date.now>;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows a translated empty state and closes only when the close control is pressed", () => {
    const onClose = jest.fn();
    const view = render(
      <JumpHistoryModal visible entries={[]} onClose={onClose} onSelect={jest.fn()} />
    );

    expect(view.getByRole("header")).toHaveTextContent("Jump History");
    expect(view.getByText("No jumps in this session yet.")).toBeTruthy();

    fireEvent.press(view.getByRole("button", { name: "Close jump history" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("forwards the selected history entry without closing the modal", () => {
    const onClose = jest.fn();
    const onSelect = jest.fn();
    const view = render(
      <JumpHistoryModal visible entries={[entry]} onClose={onClose} onSelect={onSelect} />
    );

    expect(view.UNSAFE_getByType(FlatList)).toBeTruthy();

    fireEvent.press(
      view.getByRole("button", {
        name: "Lock screen, Skip forward, from 1:00 to 1:30, +0:30, just now",
      })
    );

    expect(onSelect).toHaveBeenCalledWith(entry);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps relative-time rows stable when its parent rerenders", () => {
    const onClose = jest.fn();
    const onSelect = jest.fn();
    const view = render(
      <JumpHistoryModal visible entries={[entry]} onClose={onClose} onSelect={onSelect} />
    );

    dateNowSpy.mockReturnValue(61_000);
    view.rerender(
      <JumpHistoryModal visible entries={[entry]} onClose={onClose} onSelect={onSelect} />
    );

    expect(
      view.getByRole("button", {
        name: "Lock screen, Skip forward, from 1:00 to 1:30, +0:30, just now",
      })
    ).toBeTruthy();
  });
});
