import { render, fireEvent } from "@testing-library/react-native";
import Toggle from "@/components/ui/Toggle";

// Mock theme
jest.mock("@/lib/theme", () => ({
  useThemedStyles: jest.fn(() => ({
    isDark: false,
    colors: { textPrimary: "#000" },
  })),
}));

describe("Toggle", () => {
  it("renders an accessible switch with checked state", () => {
    const { getByRole } = render(
      <Toggle value={true} onValueChange={jest.fn()} accessibilityLabel="Dark mode" />
    );
    const toggle = getByRole("switch");
    expect(toggle.props.accessibilityLabel).toBe("Dark mode");
    expect(toggle.props.value).toBe(true);
  });

  it("calls onValueChange with the flipped value", () => {
    const onValueChange = jest.fn();
    const { getByRole } = render(
      <Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Dark mode" />
    );
    fireEvent(getByRole("switch"), "valueChange", true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("does not fire when disabled", () => {
    const onValueChange = jest.fn();
    const { getByRole } = render(
      <Toggle value={false} onValueChange={onValueChange} disabled accessibilityLabel="Dark mode" />
    );
    expect(getByRole("switch").props.disabled).toBe(true);
  });
});
