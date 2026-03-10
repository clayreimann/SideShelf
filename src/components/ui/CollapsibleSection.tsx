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

// Large sentinel used when defaultExpanded=true before real height is measured.
const EXPANDED_MAX = 99999;

export function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
}: CollapsibleSectionProps) {
  const { colors } = useThemedStyles();

  const [layoutMeasured, setLayoutMeasured] = useState(false);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const measuredHeight = useSharedValue(0);
  const heightSV = useSharedValue(defaultExpanded ? EXPANDED_MAX : PEEK_HEIGHT);
  const chevronSV = useSharedValue(defaultExpanded ? 1 : 0);

  const toggle = () => {
    const nowExpanding = !isExpanded;
    setIsExpanded(nowExpanding);
    heightSV.value = withTiming(nowExpanding ? measuredHeight.value : PEEK_HEIGHT, {
      duration: ANIMATION_DURATION,
    });
    chevronSV.value = withTiming(nowExpanding ? 1 : 0, { duration: ANIMATION_DURATION });
  };

  // maxHeight clips the container without constraining child layout in Yoga —
  // but to be safe against Fabric propagation we measure via a separate sizer.
  const containerStyle = useAnimatedStyle(() => ({
    maxHeight: heightSV.value,
    overflow: "hidden" as const,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronSV.value * 90}deg` }],
  }));

  // Sizer is absolutely positioned and invisible — Yoga never applies the clip
  // container's maxHeight to it, so onLayout always reports the real content height.
  // This is the single source of truth for measuredHeight; the visible inner view
  // does not have an onLayout handler.
  const handleSizerLayout = (event: { nativeEvent: { layout: { height: number } } }) => {
    const height = event.nativeEvent.layout.height;
    if (height <= 0) return;

    measuredHeight.value = height;

    if (!layoutMeasured) {
      const collapsible = height > PEEK_HEIGHT;
      setIsCollapsible(collapsible);
      setLayoutMeasured(true);
      if (defaultExpanded && collapsible) {
        // Replace the sentinel with the real measured height.
        heightSV.value = height;
      }
    } else {
      // Subsequent passes (e.g. RenderHtml async completion).
      // Only upgrade isCollapsible — never downgrade on a transient small reading.
      if (height > PEEK_HEIGHT && !isCollapsible) {
        setIsCollapsible(true);
      }
      if (isExpanded) {
        heightSV.value = withTiming(height, { duration: ANIMATION_DURATION });
      }
    }
  };

  const showGradient = layoutMeasured && isCollapsible && !isExpanded;

  // Expand shorthand hex (#abc → #aabbcc00) for a hue-matched transparent stop.
  const bg = colors.background;
  const bgTransparent =
    bg.length === 4 ? `#${bg[1]}${bg[1]}${bg[2]}${bg[2]}${bg[3]}${bg[3]}00` : `${bg}00`;

  // Invisible, unconstrained sizer — measures true natural content height.
  const sizer = (
    <View
      testID="collapsible-sizer"
      style={{ position: "absolute", opacity: 0, left: 0, right: 0 }}
      pointerEvents="none"
      onLayout={handleSizerLayout}
    >
      {children}
    </View>
  );

  // Visible clipped content.
  const clippedContent = (
    <Animated.View style={containerStyle}>
      <View testID="collapsible-content">{children}</View>
      {showGradient && (
        <Animated.View
          testID="collapsible-gradient"
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: GRADIENT_HEIGHT }}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[bgTransparent, colors.background]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </Animated.View>
  );

  if (title) {
    const headerContent = (
      <>
        <Text style={{ fontSize: 16, fontWeight: "500", flex: 1, color: colors.textPrimary }}>
          {title}
        </Text>
        {isCollapsible && (
          <Animated.View style={chevronStyle}>
            <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
          </Animated.View>
        )}
      </>
    );

    // Collapsed: whole section (header + content) is the tap target.
    if (isCollapsible && !isExpanded) {
      return (
        <View style={{ marginBottom: 16 }}>
          {sizer}
          <Pressable testID="collapsible-header" onPress={toggle}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
              {headerContent}
            </View>
            <View pointerEvents="none">{clippedContent}</View>
          </Pressable>
        </View>
      );
    }

    // Expanded or pre-measurement: only the header is the tap target.
    return (
      <View style={{ marginBottom: 16 }}>
        {sizer}
        <Pressable
          testID="collapsible-header"
          onPress={isCollapsible ? toggle : undefined}
          style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}
        >
          {headerContent}
        </Pressable>
        {clippedContent}
      </View>
    );
  }

  // No title: whole section is the tap target when collapsible.
  return (
    <View style={{ marginBottom: 16 }}>
      {sizer}
      {isCollapsible ? <Pressable onPress={toggle}>{clippedContent}</Pressable> : clippedContent}
    </View>
  );
}
