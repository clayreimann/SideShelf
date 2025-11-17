import { useThemedStyles } from "@/lib/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

/**
 * OfflineIcon component
 *
 * Displays an icon to denote that the app is offline with platform-specific symbols:
 * - iOS: Uses SF Symbols (antenna.radiowaves.left.and.right.slash)
 * - Android: Uses Material Icons (cloud-off-outline)
 */
export interface OfflineIconProps {
  /** Size of the icon */
  size?: number;
  /** Color override (defaults to theme primary text color) */
  color?: string;
  /** Style override for margins/positioning */
  style?: object;
}

export default function SeriesIcon({ size = 20, color = "white", style }: OfflineIconProps) {
  const { colors } = useThemedStyles();
  const iconColor = color || colors.textPrimary;

  return Platform.OS === "ios" ? (
    <SymbolView
      name="antenna.radiowaves.left.and.right.slash"
      size={size}
      tintColor={iconColor}
      type="hierarchical"
      style={style}
    />
  ) : (
    <MaterialCommunityIcons name="cloud-off-outline" size={size} color={iconColor} style={style} />
  );
}
