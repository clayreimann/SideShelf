import { useThemedStyles } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { Platform, Pressable } from "react-native";

/**
 * FullScreenButton component
 *
 * Displays a button to open the full screen player with platform-specific icons:
 * - iOS: Uses SF Symbols (arrow.up.left.and.arrow.down.right)
 * - Android: Uses Ionicons (expand)
 */
export interface FullScreenButtonProps {
  /** Size of the hit box for touch targets */
  hitBoxSize?: number;
  /** Size of the icon */
  iconSize?: number;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
}

export default function FullScreenButton({
  hitBoxSize = 44,
  iconSize = 24,
  onPress,
  disabled = false,
}: FullScreenButtonProps) {
  const { colors } = useThemedStyles();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: hitBoxSize,
        height: hitBoxSize,
        justifyContent: "center",
        alignItems: "center",
        opacity: pressed ? 0.5 : disabled ? 0.5 : 1,
      })}
    >
      {Platform.OS === "ios" ? (
        <SymbolView
          name="arrow.down.left.and.arrow.up.right"
          size={iconSize}
          tintColor={colors.textPrimary}
          type="hierarchical"
        />
      ) : (
        <Ionicons name="expand" size={iconSize} color={colors.textPrimary} />
      )}
    </Pressable>
  );
}
