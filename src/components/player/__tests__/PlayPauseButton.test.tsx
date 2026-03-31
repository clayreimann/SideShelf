/**
 * Tests for PlayPauseButton
 *
 * RED stubs — the onLongPress prop does not exist on PlayPauseButton yet.
 * Test 2 will fail until PlayPauseButton.tsx is updated to accept onLongPress.
 */

import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import PlayPauseButton from "@/components/player/PlayPauseButton";

jest.mock("@/lib/theme", () => ({
  useThemedStyles: () => ({ colors: { textPrimary: "#000" } }),
}));

jest.mock("@/stores", () => ({
  usePlayerState: jest.fn().mockReturnValue(false),
}));

jest.mock("expo-symbols", () => ({ SymbolView: "SymbolView" }));

jest.mock("@expo/vector-icons/MaterialIcons", () => "MaterialIcons");

describe("PlayPauseButton", () => {
  it("renders without crashing when onLongPress is not provided (backward compatibility)", () => {
    expect(() => {
      render(<PlayPauseButton onPress={jest.fn()} />);
    }).not.toThrow();
  });

  it("calls onLongPress when the Pressable receives a long press event", () => {
    const handler = jest.fn();
    const { getByRole } = render(
      // @ts-expect-error onLongPress prop does not exist yet — RED state
      <PlayPauseButton onPress={jest.fn()} onLongPress={handler} />
    );

    fireEvent(getByRole("button"), "longPress");
    expect(handler).toHaveBeenCalled();
  });
});
