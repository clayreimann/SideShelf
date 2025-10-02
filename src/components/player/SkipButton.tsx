import { useThemedStyles } from "@/lib/theme";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Pressable } from "react-native";

export interface SkipButtonProps {
    direction: 'forward' | 'backward';
    hitBoxSize?: number;
    iconSize?: number;
    onPress: () => void;
}

export default function SkipButton({ direction, hitBoxSize = 44, iconSize = 24, onPress }: SkipButtonProps) {
    const { colors } = useThemedStyles();
    return (
        <Pressable onPress={onPress} style={({pressed}) => ({width: hitBoxSize, height: hitBoxSize, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.5 : 1,})}>
            <FontAwesome6 name={direction === 'forward' ? 'arrow-rotate-right' : 'arrow-rotate-left'} size={iconSize} color={colors.textPrimary} />
        </Pressable>
    );
}
