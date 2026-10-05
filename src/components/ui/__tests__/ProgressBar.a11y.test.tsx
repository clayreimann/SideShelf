import { render, fireEvent } from "@testing-library/react-native";
import ProgressBar from "@/components/ui/ProgressBar";

jest.mock("@/lib/theme", () => ({
  useThemedStyles: jest.fn(() => ({
    isDark: false,
    colors: { link: "#007AFF", separator: "#ddd", textPrimary: "#000" },
    styles: { text: {} },
  })),
}));

describe("ProgressBar accessibility", () => {
  it("interactive bar is an adjustable element with a value", () => {
    const { getByRole } = render(
      <ProgressBar progress={0.5} interactive currentTime={1800} duration={3600} showTimeLabels />
    );
    const bar = getByRole("adjustable");
    expect(bar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 50,
      text: "30:00 of 1:00:00",
    });
  });

  it("increment action seeks forward 30 seconds", () => {
    const onSeekComplete = jest.fn();
    const { getByRole } = render(
      <ProgressBar
        progress={0.5}
        interactive
        currentTime={1800}
        duration={3600}
        onSeekComplete={onSeekComplete}
      />
    );
    fireEvent(getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(onSeekComplete).toHaveBeenCalledWith(1830);
  });

  it("decrement action seeks back 30 seconds, clamped at minValue", () => {
    const onSeekComplete = jest.fn();
    const { getByRole } = render(
      <ProgressBar
        progress={0}
        interactive
        currentTime={10}
        duration={3600}
        onSeekComplete={onSeekComplete}
      />
    );
    fireEvent(getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(onSeekComplete).toHaveBeenCalledWith(0);
  });

  it("non-interactive bar is not focusable", () => {
    const { queryByRole } = render(<ProgressBar progress={0.5} />);
    expect(queryByRole("adjustable")).toBeNull();
  });
});
