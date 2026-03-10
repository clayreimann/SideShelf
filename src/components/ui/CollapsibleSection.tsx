import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useThemedStyles } from "@/lib/theme";

interface CollapsibleSectionProps {
  title?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const PEEK_HEIGHT = 100;
const ANIMATION_DURATION = 280;
const GRADIENT_HEIGHT = 48;

export function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
}: CollapsibleSectionProps) {
  const { colors } = useThemedStyles();

  // layoutMeasured: true after first onLayout fires
  const [layoutMeasured, setLayoutMeasured] = useState(false);
  // isCollapsible: true only when measured height > PEEK_HEIGHT
  const [isCollapsible, setIsCollapsible] = useState(false);
  // isExpanded: React state drives gradient conditional render
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Reanimated shared values for animation
  const measuredHeight = useSharedValue(0);
  const isExpandedSV = useSharedValue(defaultExpanded ? 1 : 0);

  const toggle = () => {
    const nowExpanding = !isExpanded;
    setIsExpanded(nowExpanding);
    isExpandedSV.value = withTiming(nowExpanding ? 1 : 0, {
      duration: ANIMATION_DURATION,
    });
  };

  const containerStyle = useAnimatedStyle(() => ({
    height: withTiming(isExpandedSV.value >= 0.5 ? measuredHeight.value : PEEK_HEIGHT, {
      duration: ANIMATION_DURATION,
    }),
    overflow: "hidden" as const,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: withTiming(isExpandedSV.value >= 0.5 ? "90deg" : "0deg", {
          duration: ANIMATION_DURATION,
        }),
      },
    ],
  }));

  const handleLayout = (event: { nativeEvent: { layout: { height: number } } }) => {
    if (layoutMeasured) return;
    const height = event.nativeEvent.layout.height;
    measuredHeight.value = height;
    const collapsible = height > PEEK_HEIGHT;
    setIsCollapsible(collapsible);
    setLayoutMeasured(true);

    if (!collapsible) {
      // Short content: auto-expand, disable collapsing
      isExpandedSV.value = 1;
      setIsExpanded(true);
    }
  };

  // Gradient renders when: section is collapsible AND currently collapsed
  const showGradient = layoutMeasured && isCollapsible && !isExpanded;

  // The inner content area — always mounts children (never conditional unmount)
  // Pre-measurement: plain View so onLayout captures natural height
  // Post-measurement + collapsible: Animated.View with height constraint
  // Post-measurement + non-collapsible: plain View
  const innerContent =
    !layoutMeasured || !isCollapsible ? (
      <View testID="collapsible-content" onLayout={handleLayout}>
        {children}
      </View>
    ) : (
      <Animated.View style={containerStyle}>
        <View testID="collapsible-content" onLayout={handleLayout}>
          {children}
        </View>
        {showGradient && (
          <Animated.View
            testID="collapsible-gradient"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: GRADIENT_HEIGHT,
            }}
            pointerEvents="none"
          >
            <LinearGradient
              colors={["transparent", colors.background]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        )}
      </Animated.View>
    );

  // With title: only the header row is the tap target
  if (title) {
    return (
      <View style={{ marginBottom: 16 }}>
        <Pressable
          testID="collapsible-header"
          onPress={isCollapsible ? toggle : undefined}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "500",
              flex: 1,
              color: colors.textPrimary,
            }}
          >
            {title}
          </Text>
          {isCollapsible && (
            <Animated.View style={chevronStyle}>
              <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
            </Animated.View>
          )}
        </Pressable>
        {innerContent}
      </View>
    );
  }

  // Without title AND collapsible: entire section is a tap target
  // We wrap the Animated container in a Pressable
  if (layoutMeasured && isCollapsible) {
    return (
      <View style={{ marginBottom: 16 }}>
        <Pressable onPress={toggle}>{innerContent}</Pressable>
      </View>
    );
  }

  // Without title, not yet collapsible (pre-measurement or short content)
  return <View style={{ marginBottom: 16 }}>{innerContent}</View>;
}
