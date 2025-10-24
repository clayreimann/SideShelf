import { useThemedStyles } from "@/lib/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

/**
 * AuthorIcon component
 *
 * Displays an author/writer icon with platform-specific symbols:
 * - iOS: Uses SF Symbols (pencil.and.scribble)
 * - Android: Uses Material Icons (edit)
 *
 * Used to indicate author information in library item details.
 */
export interface AuthorIconProps {
    /** Size of the icon */
    size?: number;
    /** Color override (defaults to theme primary text color) */
    color?: string;
    /** Style override for margins/positioning */
    style?: object;
}

export default function AuthorIcon({
    size = 16,
    color,
    style
}: AuthorIconProps) {
    const { colors } = useThemedStyles();
    const iconColor = color || colors.textPrimary;

    return Platform.OS === 'ios' ? (
        <SymbolView
            name="pencil.and.scribble"
            size={size}
            tintColor={iconColor}
            type="hierarchical"
            style={style}
        />
    ) : (
        <MaterialIcons
            name="edit"
            size={size}
            color={iconColor}
            style={style}
        />
    );
}
