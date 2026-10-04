/**
 * AirPlayButton - Wraps AVRoutePickerView (via @douglowder/expo-av-route-picker-view)
 *
 * Renders the native iOS AirPlay route picker button. Tapping opens the system
 * route picker sheet for selecting AirPlay/Bluetooth output devices.
 *
 * Note: Non-functional on Simulator — requires a physical device with AirPlay targets.
 * A build that compiles and renders without crashing is sufficient for CI.
 */

import { ExpoAvRoutePickerView } from "@douglowder/expo-av-route-picker-view";
import { ColorValue, ViewProps } from "react-native";

type AirPlayButtonProps = ViewProps & {
  tintColor?: ColorValue;
  activeTintColor?: ColorValue;
};

export function AirPlayButton(props: AirPlayButtonProps) {
  return <ExpoAvRoutePickerView {...props} />;
}
