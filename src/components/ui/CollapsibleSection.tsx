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

  const [layoutMeasured, setLayoutMeasured] = useState(false);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const measuredHeight = useSharedValue(0);
  // heightSV drives the clip container height — withTiming called once per toggle, not per frame
  const heightSV = useSharedValue(PEEK_HEIGHT);
  // constrainedSV: 0 = no clip (during initial measurement), 1 = apply height + overflow:hidden
  const constrainedSV = useSharedValue(0);
  const chevronSV = useSharedValue(defaultExpanded ? 1 : 0);

  const toggle = () => {
    const nowExpanding = !isExpanded;
    setIsExpanded(nowExpanding);
    heightSV.value = withTiming(nowExpanding ? measuredHeight.value : PEEK_HEIGHT, {
      duration: ANIMATION_DURATION,
    });
    chevronSV.value = withTiming(nowExpanding ? 1 : 0, {
      duration: ANIMATION_DURATION,
    });
  };

  // Clip container: no constraint before measurement (children render at natural height).
  // After measurement: apply height + overflow:hidden so animation only moves the clip boundary.
  // The inner content layout is stable throughout — Yoga skips subtree re-layout on every frame.
  const containerStyle = useAnimatedStyle(() => {
    if (constrainedSV.value === 0) return {};
    return { height: heightSV.value, overflow: "hidden" as const };
  });

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronSV.value * 90}deg` }],
  }));

  const handleLayout = (event: { nativeEvent: { layout: { height: number } } }) => {
    const height = event.nativeEvent.layout.height;
    if (height <= 0) return;

    const prevHeight = measuredHeight.value;
    measuredHeight.value = height;

    if (!layoutMeasured) {
      const collapsible = height > PEEK_HEIGHT;
      setIsCollapsible(collapsible);
      setLayoutMeasured(true);

      if (!collapsible) {
        // Short content: show fully, disable toggle
        heightSV.value = height;
        setIsExpanded(true);
        chevronSV.value = 1;
      } else if (defaultExpanded) {
        // Long content starting expanded: clip container starts at full height (no visible snap)
        heightSV.value = height;
      } else {
        // Long content starting collapsed: clip container snaps to PEEK_HEIGHT
        heightSV.value = PEEK_HEIGHT;
      }

      // Apply the clip constraint now that we have the correct target height.
      // Since heightSV is already at the target, this causes at most a one-frame snap.
      constrainedSV.value = 1;
    } else if (height !== prevHeight) {
      // Height changed after initial measurement — re-evaluate collapsibility.
      // Handles async renderers like RenderHtml that report a near-zero placeholder height
      // on first pass, then fire onLayout again once the real content is measured.
      const collapsible = height > PEEK_HEIGHT;
      if (collapsible !== isCollapsible) {
        setIsCollapsible(collapsible);
      }
      if (!collapsible) {
        heightSV.value = height;
        setIsExpanded(true);
        chevronSV.value = 1;
      } else if (isExpanded) {
        heightSV.value = withTiming(height, { duration: ANIMATION_DURATION });
      } else {
        // Collapsed — ensure clip height is at PEEK_HEIGHT (not a stale small value)
        heightSV.value = PEEK_HEIGHT;
      }
    }
  };

  const showGradient = layoutMeasured && isCollapsible && !isExpanded;

  // Children are always mounted inside the same Animated.View — no remounting.
  // Before measurement (constrainedSV=0): Animated.View has no style, children render at
  // full natural height so onLayout captures the true measurement.
  // After measurement (constrainedSV=1): height+overflow:hidden applied; children stay mounted
  // and their layout is stable, so RenderHtml doesn't re-render during animation.
  const innerContent = (
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

  if (title) {
    const headerContent = (
      <>
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
      </>
    );

    // Collapsed: entire section is tap target — children non-interactive
    if (isCollapsible && !isExpanded) {
      return (
        <Pressable testID="collapsible-header" onPress={toggle} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
            {headerContent}
          </View>
          <View pointerEvents="none">{innerContent}</View>
        </Pressable>
      );
    }

    // Expanded or pre-measurement: header-only toggle, children interactive
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
          {headerContent}
        </Pressable>
        {innerContent}
      </View>
    );
  }

  // Without title AND collapsible: entire section is tap target
  if (layoutMeasured && isCollapsible) {
    return (
      <View style={{ marginBottom: 16 }}>
        <Pressable onPress={toggle}>{innerContent}</Pressable>
      </View>
    );
  }

  return <View style={{ marginBottom: 16 }}>{innerContent}</View>;
}
