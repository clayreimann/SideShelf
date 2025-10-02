import { useThemedStyles } from "@/lib/theme";
import { Image, Text, View } from "react-native";

export interface CoverImageProps {
    uri: string | null;
    title: string | null;
    fontSize: number;
}

export default function CoverImage({ uri, title, fontSize }: CoverImageProps) {
    const { colors } = useThemedStyles();
    return <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        {uri ? (
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
            <Text style={{ color: colors.textPrimary, fontSize, textAlign: 'center', paddingHorizontal: 6 }} numberOfLines={3}>
                {title || 'Untitled'}
            </Text>
        )}
    </View>;
}
