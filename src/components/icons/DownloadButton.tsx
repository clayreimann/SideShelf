import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import IconButton from "@/components/ui/IconButton";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

/**
 * DownloadButton component
 *
 * Displays a download or trash button with platform-specific icons:
 * - iOS: Uses SF Symbols (arrow.down.circle, trash)
 * - Android: Uses Material Icons (download, delete)
 *
 * Used in the LibraryItemDetail header to download or delete library items.
 */
export interface DownloadButtonProps {
  /** Whether the item is downloaded (shows trash icon) or not (shows download icon) */
  isDownloaded: boolean;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Size of the icon */
  size?: number;
}

export default function DownloadButton({
  isDownloaded,
  onPress,
  disabled = false,
  size = 24,
}: DownloadButtonProps) {
  const { colors } = useThemedStyles();

  return (
    <IconButton
      onPress={onPress}
      disabled={disabled}
      hitBoxSize={size + 16}
      accessibilityLabel={translate(
        isDownloaded ? "accessibility.deleteDownload" : "accessibility.download"
      )}
    >
      {Platform.OS === "ios" ? (
        <SymbolView
          name={isDownloaded ? "trash" : "arrow.down.circle"}
          size={size}
          tintColor={colors.textPrimary}
          type="hierarchical"
        />
      ) : (
        <MaterialIcons
          name={isDownloaded ? "delete" : "download"}
          size={size}
          color={colors.textPrimary}
        />
      )}
    </IconButton>
  );
}
