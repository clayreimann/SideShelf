import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import IconButton from "@/components/ui/IconButton";
import { Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

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
    <IconButton
      onPress={onPress}
      disabled={disabled}
      hitBoxSize={hitBoxSize}
      accessibilityLabel={translate("accessibility.openFullPlayer")}
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
    </IconButton>
  );
}
