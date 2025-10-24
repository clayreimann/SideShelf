import { useThemedStyles } from "@/lib/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform, Pressable } from "react-native";

/**
 * JumpTrackButton component
 *
 * Displays a jump to previous/next chapter button with platform-specific icons:
 * - iOS: Uses SF Symbols (forward.end, backward.end)
 * - Android: Uses Material Icons (skip-next, skip-previous)
 *
 * Used for navigating between chapters in an audiobook.
 */
export interface JumpTrackButtonProps {
    direction: 'forward' | 'backward';
    hitBoxSize?: number;
    iconSize?: number;
    onPress: () => void;
}

export default function JumpTrackButton({ direction, hitBoxSize = 44, iconSize = 24, onPress }: JumpTrackButtonProps) {
    const { colors } = useThemedStyles();

    return (
        <Pressable
            onPress={onPress}
            style={({pressed}) => ({
                width: hitBoxSize,
                height: hitBoxSize,
                justifyContent: 'center',
                alignItems: 'center',
                opacity: pressed ? 0.5 : 1,
            })}
        >
            {Platform.OS === 'ios' ? (
                <SymbolView
                    name={direction === 'forward' ? 'forward.end.fill' : 'backward.end.fill'}
                    size={iconSize}
                    tintColor={colors.textPrimary}
                    type="hierarchical"
                />
            ) : (
                <MaterialIcons
                    name={direction === 'forward' ? 'skip-next' : 'skip-previous'}
                    size={iconSize}
                    color={colors.textPrimary}
                />
            )}
        </Pressable>
    );
}
