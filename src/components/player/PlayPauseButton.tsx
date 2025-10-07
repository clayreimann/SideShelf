import { useThemedStyles } from "@/lib/theme";
import { usePlayerState } from "@/stores";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { ActivityIndicator, Pressable, View } from "react-native";


export interface PlayPauseButtonProps {
    hitBoxSize?: number;
    iconSize?: number;
    onPress: () => void;
}

export default function PlayPauseButton({ onPress, hitBoxSize: size = 44, iconSize = 24 }: PlayPauseButtonProps) {
    const { colors } = useThemedStyles();
    const isLoadingTrack = usePlayerState(state => state.player.loading.isLoadingTrack);
    const isPlaying = usePlayerState(state => state.player.isPlaying);
    return isLoadingTrack ? (
        <View style={{width: size, height: size, justifyContent: 'center', alignItems: 'center'}}>
            <ActivityIndicator size="small" color={colors.textPrimary} />
        </View>
    ) : (
        <Pressable onPress={onPress} style={({pressed}) => ({width: size, height: size, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.5 : 1,})}>
            <FontAwesome6 name={isPlaying ? 'pause' : 'play'} size={iconSize} color={colors.textPrimary} />
        </Pressable>
    );
}
