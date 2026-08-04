import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import IconButton from "@/components/ui/IconButton";

describe("IconButton", () => {
  it("renders role 'button' with the given label and children", () => {
    const { getByRole, getByText } = render(
      <IconButton accessibilityLabel="Play" onPress={jest.fn()}>
        <Text>icon</Text>
      </IconButton>
    );
    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toBe("Play");
    expect(getByText("icon")).toBeTruthy();
  });

  it("fires onPress when pressed", () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <IconButton accessibilityLabel="Play" onPress={onPress}>
        <Text>icon</Text>
      </IconButton>
    );
    fireEvent.press(getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("fires onLongPress when long-pressed", () => {
    const onLongPress = jest.fn();
    const { getByRole } = render(
      <IconButton accessibilityLabel="Play" onPress={jest.fn()} onLongPress={onLongPress}>
        <Text>icon</Text>
      </IconButton>
    );
    fireEvent(getByRole("button"), "longPress");
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("reflects disabled/busy/selected in accessibilityState", () => {
    const { getByRole } = render(
      <IconButton accessibilityLabel="Bookmark" onPress={jest.fn()} disabled busy selected>
        <Text>icon</Text>
      </IconButton>
    );
    const button = getByRole("button");
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
      selected: true,
    });
  });

  it("passes through accessibilityHint", () => {
    const { getByRole } = render(
      <IconButton accessibilityLabel="Skip" accessibilityHint="Opens menu" onPress={jest.fn()}>
        <Text>icon</Text>
      </IconButton>
    );
    expect(getByRole("button").props.accessibilityHint).toBe("Opens menu");
  });
});
