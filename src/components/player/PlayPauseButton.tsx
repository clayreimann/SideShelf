import { useThemedStyles } from "@/lib/theme";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Pressable } from "react-native";


export interface PlayPauseButtonProps {
    isPlaying: boolean;
    hitBoxSize?: number;
    iconSize?: number;
    onPress: () => void;
}

export default function PlayPauseButton({ isPlaying, onPress, hitBoxSize: size = 44, iconSize = 24 }: PlayPauseButtonProps) {
    const { colors } = useThemedStyles();
    return (
        <Pressable onPress={onPress} style={({pressed}) => ({width: size, height: size, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.5 : 1,})}>
            <FontAwesome6 name={isPlaying ? 'pause' : 'play'} size={iconSize} color={colors.textPrimary} />
        </Pressable>
    );
}
