import { useThemedStyles } from "@/lib/theme";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Pressable } from "react-native";


export interface JumpTrackButtonProps {
    direction: 'forward' | 'backward';
    hitBoxSize?: number;
    iconSize?: number;
    onPress: () => void;
}

export default function JumpTrackButton({ direction, hitBoxSize = 44, iconSize = 24, onPress }: JumpTrackButtonProps) {
    const { colors } = useThemedStyles();
    return (
        <Pressable onPress={onPress} style={({pressed}) => ({width: hitBoxSize, height: hitBoxSize, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.5 : 1,})}>
            <FontAwesome6 name={direction === 'forward' ? 'chevron-right' : 'chevron-left'} size={iconSize} color={colors.textPrimary} />
        </Pressable>
    );
}
