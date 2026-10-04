import { render } from "@testing-library/react-native";
import SkipButton from "@/components/player/SkipButton";
import JumpTrackButton from "@/components/player/JumpTrackButton";

jest.mock("@/lib/theme", () => ({
  useThemedStyles: () => ({ colors: { textPrimary: "#000" } }),
}));

describe("player button accessibility", () => {
  it("SkipButton announces direction and interval", () => {
    const { getByRole } = render(
      <SkipButton direction="forward" interval={30} onPress={jest.fn()} />
    );
    expect(getByRole("button").props.accessibilityLabel).toBe("Skip forward 30 seconds");
  });

  it("SkipButton backward announces back interval", () => {
    const { getByRole } = render(
      <SkipButton direction="backward" interval={15} onPress={jest.fn()} />
    );
    expect(getByRole("button").props.accessibilityLabel).toBe("Skip back 15 seconds");
  });

  it("JumpTrackButton announces chapter navigation", () => {
    const { getByRole } = render(<JumpTrackButton direction="forward" onPress={jest.fn()} />);
    expect(getByRole("button").props.accessibilityLabel).toBe("Next chapter");
  });
});
