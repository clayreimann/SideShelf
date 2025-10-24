import { useThemedStyles } from "@/lib/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

/**
 * NarratorIcon component
 *
 * Displays a narrator/microphone icon with platform-specific symbols:
 * - iOS: Uses SF Symbols (mic.fill)
 * - Android: Uses Material Icons (mic)
 *
 * Used to indicate narrator information in library item details.
 */
export interface NarratorIconProps {
    /** Size of the icon */
    size?: number;
    /** Color override (defaults to theme primary text color) */
    color?: string;
    /** Style override for margins/positioning */
    style?: object;
}

export default function NarratorIcon({
    size = 16,
    color,
    style
}: NarratorIconProps) {
    const { colors } = useThemedStyles();
    const iconColor = color || colors.textPrimary;

    return Platform.OS === 'ios' ? (
        <SymbolView
            name="mic.fill"
            size={size}
            tintColor={iconColor}
            type="hierarchical"
            style={style}
        />
    ) : (
        <MaterialIcons
            name="mic"
            size={size}
            color={iconColor}
            style={style}
        />
    );
}
