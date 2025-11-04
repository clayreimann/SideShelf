import { useThemedStyles } from "@/lib/theme";
import { usePlayerState } from "@/stores";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";

/**
 * PlayPauseButton component
 *
 * Displays a play or pause button with platform-specific icons:
 * - iOS: Uses SF Symbols (play.circle, pause.circle)
 * - Android: Uses Material Icons (play-arrow, pause)
 *
 * Shows an activity indicator while a track is loading.
 */
export interface PlayPauseButtonProps {
    hitBoxSize?: number;
    iconSize?: number;
    onPress: () => void;
}

export default function PlayPauseButton({ onPress, hitBoxSize = 44, iconSize = 24 }: PlayPauseButtonProps) {
    const { colors } = useThemedStyles();
    const isLoadingTrack = usePlayerState(state => state.player.loading.isLoadingTrack);
    const isPlaying = usePlayerState(state => state.player.isPlaying);

    if (isLoadingTrack) {
        return (
            <View style={{width: hitBoxSize, height: hitBoxSize, justifyContent: 'center', alignItems: 'center'}}>
                <ActivityIndicator size="small" color={colors.textPrimary} />
            </View>
        );
    }

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
                    name={isPlaying ? 'pause.circle.fill' : 'play.circle.fill'}
                    size={iconSize}
                    tintColor={colors.textPrimary}
                />
            ) : (
                <MaterialIcons
                    name={isPlaying ? 'pause' : 'play-arrow'}
                    size={iconSize}
                    color={colors.textPrimary}
                />
            )}
        </Pressable>
    );
}
