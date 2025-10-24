import { useThemedStyles } from "@/lib/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform, TouchableOpacity } from "react-native";

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
    size = 24
}: DownloadButtonProps) {
    const { colors } = useThemedStyles();

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            style={{
                alignContent: "center",
                padding: 8,
                opacity: disabled ? 0.5 : 1,
            }}
        >
            {Platform.OS === 'ios' ? (
                <SymbolView
                    name={isDownloaded ? 'trash' : 'arrow.down.circle'}
                    size={size}
                    tintColor={colors.textPrimary}
                    type="hierarchical"
                />
            ) : (
                <MaterialIcons
                    name={isDownloaded ? 'delete' : 'download'}
                    size={size}
                    color={colors.textPrimary}
                />
            )}
        </TouchableOpacity>
    );
}
