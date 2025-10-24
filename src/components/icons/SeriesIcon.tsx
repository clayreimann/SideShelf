import { useThemedStyles } from "@/lib/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

/**
 * SeriesIcon component
 *
 * Displays a series/bookshelf icon with platform-specific symbols:
 * - iOS: Uses SF Symbols (books.vertical.fill)
 * - Android: Uses Material Icons (menu-book)
 *
 * Used to indicate series information in library item details.
 */
export interface SeriesIconProps {
    /** Size of the icon */
    size?: number;
    /** Color override (defaults to theme primary text color) */
    color?: string;
    /** Style override for margins/positioning */
    style?: object;
}

export default function SeriesIcon({
    size = 24,
    color,
    style
}: SeriesIconProps) {
    const { colors } = useThemedStyles();
    const iconColor = color || colors.textPrimary;

    return Platform.OS === 'ios' ? (
        <SymbolView
            name="books.vertical.fill"
            size={size}
            tintColor={iconColor}
            type="hierarchical"
            style={style}
        />
    ) : (
        <MaterialIcons
            name="menu-book"
            size={size}
            color={iconColor}
            style={style}
        />
    );
}
