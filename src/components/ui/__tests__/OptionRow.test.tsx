import { render, fireEvent } from "@testing-library/react-native";
import OptionRow from "@/components/ui/OptionRow";

// Mock theme
jest.mock("@/lib/theme", () => ({
  useThemedStyles: jest.fn(() => ({
    isDark: false,
    colors: { textPrimary: "#000" },
  })),
}));

describe("OptionRow", () => {
  it("renders role button with accessibilityLabel = label when no description", () => {
    const { getByRole } = render(
      <OptionRow label="Time Remaining" selected={false} onPress={jest.fn()} />
    );
    const row = getByRole("button");
    expect(row.props.accessibilityLabel).toBe("Time Remaining");
  });

  it("sets accessibilityLabel to 'label. description' when description present", () => {
    const { getByRole } = render(
      <OptionRow
        label="Auto-create"
        description="Use the chapter title and current timestamp without asking each time."
        selected={false}
        onPress={jest.fn()}
      />
    );
    const row = getByRole("button");
    expect(row.props.accessibilityLabel).toBe(
      "Auto-create. Use the chapter title and current timestamp without asking each time."
    );
  });

  it("sets accessibilityState.selected to true when selected", () => {
    const { getByRole } = render(
      <OptionRow label="% Complete" selected={true} onPress={jest.fn()} />
    );
    expect(getByRole("button").props.accessibilityState.selected).toBe(true);
  });

  it("sets accessibilityState.selected to false when not selected", () => {
    const { getByRole } = render(
      <OptionRow label="% Complete" selected={false} onPress={jest.fn()} />
    );
    expect(getByRole("button").props.accessibilityState.selected).toBe(false);
  });

  it("shows the checkmark icon only when selected", () => {
    const { queryByTestId, rerender } = render(
      <OptionRow label="Elapsed / Total" selected={false} onPress={jest.fn()} />
    );
    expect(queryByTestId("option-row-checkmark", { includeHiddenElements: true })).toBeNull();

    rerender(<OptionRow label="Elapsed / Total" selected={true} onPress={jest.fn()} />);
    expect(queryByTestId("option-row-checkmark", { includeHiddenElements: true })).not.toBeNull();
  });

  it("fires onPress", () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <OptionRow label="Time Remaining" selected={false} onPress={onPress} />
    );
    fireEvent.press(getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
