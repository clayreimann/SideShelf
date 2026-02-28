import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

const COVER_SIZE = 140; // matches CoverItem.tsx coverSize = 140
const CARD_COUNT = 4; // visible cards before horizontal scroll
const CARD_GAP = 16;
const HORIZONTAL_PADDING = 16;

type Props = {
  isDark: boolean;
};

export function SkeletonSection({ isDark }: Props) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const bgColor = isDark ? "#3A3A3C" : "#E0E0E0";

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={{ opacity: pulseAnim }}>
      {/* Section header placeholder */}
      <View
        style={{
          height: 24,
          width: 180,
          borderRadius: 6,
          backgroundColor: bgColor,
          marginTop: 20,
          marginBottom: 12,
          marginHorizontal: HORIZONTAL_PADDING,
        }}
      />

      {/* Horizontal row of card placeholders */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: HORIZONTAL_PADDING,
          gap: CARD_GAP,
        }}
      >
        {Array.from({ length: CARD_COUNT }).map((_, i) => (
          <View key={i}>
            {/* Cover image placeholder */}
            <View
              style={{
                width: COVER_SIZE,
                height: COVER_SIZE,
                borderRadius: 8,
                backgroundColor: bgColor,
              }}
            />
            {/* Title line placeholder */}
            <View
              style={{
                height: 14,
                width: 100,
                borderRadius: 4,
                backgroundColor: bgColor,
                marginTop: 8,
              }}
            />
            {/* Subtitle line placeholder */}
            <View
              style={{
                height: 12,
                width: 70,
                borderRadius: 4,
                backgroundColor: bgColor,
                marginTop: 4,
              }}
            />
          </View>
        ))}
      </View>
    </Animated.View>
  );
}
