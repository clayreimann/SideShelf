/**
 * Tests for PlayPauseButton
 *
 * Covers:
 * 1. Backward compatibility: renders without crashing when onLongPress is not provided
 * 2. onLongPress wiring: calls handler on long press
 * 3. Optimistic state: icon flips immediately on press (before store updates)
 * 4. Optimistic state: icon flips immediately to play on press while paused
 * 5. Reconciliation: pending state clears once store catches up
 * 6. Flicker prevention: icon does not revert during LOADING/BUFFERING (isLoadingTrack=true)
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import PlayPauseButton from "@/components/player/PlayPauseButton";
import { usePlayerState } from "@/stores";

jest.mock("@/lib/theme", () => ({
  useThemedStyles: () => ({ colors: { textPrimary: "#000" } }),
}));

jest.mock("@/stores", () => ({
  usePlayerState: jest.fn(),
}));

jest.mock("expo-symbols", () => ({ SymbolView: "SymbolView" }));

jest.mock("@expo/vector-icons/MaterialIcons", () => "MaterialIcons");

const mockUsePlayerState = jest.mocked(usePlayerState);

type MockState = { player: { isPlaying: boolean; loading: { isLoadingTrack: boolean } } };

function setMockState(isPlaying: boolean, isLoadingTrack: boolean) {
  const state: MockState = { player: { isPlaying, loading: { isLoadingTrack } } };
  mockUsePlayerState.mockImplementation((selector) => selector(state as never));
}

describe("PlayPauseButton", () => {
  beforeEach(() => {
    setMockState(false, false);
  });

  it("renders without crashing when onLongPress is not provided (backward compatibility)", () => {
    expect(() => {
      render(<PlayPauseButton onPress={jest.fn()} />);
    }).not.toThrow();
  });

  it("calls onLongPress when the Pressable receives a long press event", () => {
    const handler = jest.fn();
    const { getByRole } = render(<PlayPauseButton onPress={jest.fn()} onLongPress={handler} />);

    fireEvent(getByRole("button"), "longPress");
    expect(handler).toHaveBeenCalled();
  });

  it("icon immediately shows pause when pressed while showing play (optimistic update)", () => {
    setMockState(false, false);
    const { getByRole, UNSAFE_getByType } = render(<PlayPauseButton onPress={jest.fn()} />);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SymbolView = require("expo-symbols").SymbolView;
    const getSymbol = () => UNSAFE_getByType(SymbolView).props.name as string;

    expect(getSymbol()).toBe("play.circle.fill");

    // Press: icon should flip to pause immediately (optimistic)
    act(() => {
      fireEvent.press(getByRole("button"));
    });

    expect(getSymbol()).toBe("pause.circle.fill");
  });

  it("icon immediately shows play when pressed while showing pause (optimistic update)", () => {
    setMockState(true, false);
    const { getByRole, UNSAFE_getByType } = render(<PlayPauseButton onPress={jest.fn()} />);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SymbolView = require("expo-symbols").SymbolView;
    const getSymbol = () => UNSAFE_getByType(SymbolView).props.name as string;

    expect(getSymbol()).toBe("pause.circle.fill");

    act(() => {
      fireEvent.press(getByRole("button"));
    });

    expect(getSymbol()).toBe("play.circle.fill");
  });

  it("pending state clears once store isPlaying matches pending value", () => {
    setMockState(false, false);
    const { getByRole, UNSAFE_getByType, rerender } = render(
      <PlayPauseButton onPress={jest.fn()} />
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SymbolView = require("expo-symbols").SymbolView;
    const getSymbol = () => UNSAFE_getByType(SymbolView).props.name as string;

    // Press to set optimistic pending=true
    act(() => {
      fireEvent.press(getByRole("button"));
    });
    expect(getSymbol()).toBe("pause.circle.fill");

    // Store catches up: isPlaying=true, isLoadingTrack=false
    act(() => {
      setMockState(true, false);
      rerender(<PlayPauseButton onPress={jest.fn()} />);
    });

    // Pending clears, but display stays on pause (store now driving it)
    expect(getSymbol()).toBe("pause.circle.fill");
  });

  it("icon does not flicker back to play during LOADING/BUFFERING (isLoadingTrack=true)", () => {
    setMockState(false, false);
    const { getByRole, UNSAFE_getByType, rerender } = render(
      <PlayPauseButton onPress={jest.fn()} />
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SymbolView = require("expo-symbols").SymbolView;
    const getSymbol = () => UNSAFE_getByType(SymbolView).props.name as string;

    // Press to go optimistic: pendingIsPlaying=true
    act(() => {
      fireEvent.press(getByRole("button"));
    });
    expect(getSymbol()).toBe("pause.circle.fill");

    // Coordinator enters LOADING state: isPlaying=false, isLoadingTrack=true
    // The pending state should NOT clear yet (isLoadingTrack guards the reconciliation)
    act(() => {
      setMockState(false, true);
      rerender(<PlayPauseButton onPress={jest.fn()} />);
    });

    // Icon must NOT revert to play during loading
    expect(getSymbol()).toBe("pause.circle.fill");
  });

  it("accessibilityLabel is 'Pause' when isPlaying=true", () => {
    setMockState(true, false);
    const { getByRole } = render(<PlayPauseButton onPress={jest.fn()} />);
    expect(getByRole("button").props.accessibilityLabel).toBe("Pause");
  });

  it("accessibilityLabel is 'Play' when isPlaying=false", () => {
    setMockState(false, false);
    const { getByRole } = render(<PlayPauseButton onPress={jest.fn()} />);
    expect(getByRole("button").props.accessibilityLabel).toBe("Play");
  });
});
