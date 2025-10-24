import { useThemedStyles } from "@/lib/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform, Pressable } from "react-native";

/**
 * SkipButton component
 *
 * Displays a skip forward or backward button with platform-specific icons:
 * - iOS: Uses SF Symbols (goforward.30, gobackward.15)
 * - Android: Uses Material Icons (forward-30, replay-30)
 *
 * Used for skipping 15 seconds backward or 30 seconds forward in playback.
 */
export interface SkipButtonProps {
    direction: 'forward' | 'backward';
    hitBoxSize?: number;
    iconSize?: number;
    onPress: () => void;
}

export default function SkipButton({ direction, hitBoxSize = 44, iconSize = 24, onPress }: SkipButtonProps) {
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
                    name={direction === 'forward' ? 'goforward.30' : 'gobackward.15'}
                    size={iconSize}
                    tintColor={colors.textPrimary}
                    type="hierarchical"
                />
            ) : (
                <MaterialIcons
                    name={direction === 'forward' ? 'forward-30' : 'replay-10'}
                    size={iconSize}
                    color={colors.textPrimary}
                />
            )}
        </Pressable>
    );
}
