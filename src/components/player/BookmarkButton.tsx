import { useThemedStyles } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { Platform, Pressable } from "react-native";

/**
 * BookmarkButton component
 *
 * Displays a bookmark button with platform-specific icons:
 * - iOS: Uses SF Symbols (bookmark)
 * - Android: Uses Ionicons (bookmark-outline)
 *
 * Shows a loading state when creating a bookmark.
 */
export interface BookmarkButtonProps {
  /** Whether the button is in a loading/creating state */
  isCreating?: boolean;
  /** Size of the hit box for touch targets */
  hitBoxSize?: number;
  /** Size of the icon */
  iconSize?: number;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
}

export default function BookmarkButton({
  isCreating = false,
  hitBoxSize = 44,
  iconSize = 24,
  onPress,
  disabled = false,
}: BookmarkButtonProps) {
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
          name={isCreating ? "hourglass" : "bookmark"}
          size={iconSize}
          tintColor={colors.textPrimary}
          type="hierarchical"
        />
      ) : (
        <Ionicons
          name={isCreating ? "hourglass-outline" : "bookmark-outline"}
          size={iconSize}
          color={colors.textPrimary}
        />
      )}
    </Pressable>
  );
}
