import { useThemedStyles } from "@/lib/theme";
import React, { useState } from "react";
import {
    GestureResponderEvent,
    LayoutChangeEvent,
    PanResponder,
    Text,
    TextStyle,
    View,
    ViewStyle,
} from "react-native";

/**
 * Common progress bar component used throughout the app
 */

interface ProgressBarProps {
  /** Progress value between 0 and 1 */
  progress: number;
  /** Height of the progress bar in pixels */
  height?: number;
  /** Color of the progress fill */
  progressColor?: string;
  /** Color of the background track */
  backgroundColor?: string;
  /** Border radius of the progress bar */
  borderRadius?: number;
  /** Whether to show percentage text */
  showPercentage?: boolean;
  /** Whether to show time labels (requires currentTime and duration) */
  showTimeLabels?: boolean;
  /** Current time in seconds (for time labels) */
  currentTime?: number;
  /** Total duration in seconds (for time labels) */
  duration?: number;
  /** Custom percentage text (overrides default percentage calculation) */
  customPercentageText?: string;
  /** Additional styles for the container */
  containerStyle?: ViewStyle;
  /** Text style for labels */
  textStyle?: TextStyle;
  /** Size variant for different use cases */
  variant?: "small" | "medium" | "large";
  /** Whether the progress bar is interactive (seekable) */
  interactive?: boolean;
  /** Callback when seeking starts */
  onSeekStart?: (value: number) => void;
  /** Callback when seeking value changes */
  onSeekChange?: (value: number) => void;
  /** Callback when seeking completes */
  onSeekComplete?: (value: number) => void;
  /** Maximum value for seeking (defaults to duration or 1) */
  maxValue?: number;
  /** Minimum value for seeking (defaults to 0) */
  minValue?: number;
}

// Helper function to format time in seconds to HH:MM:SS or MM:SS
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}

export default function ProgressBar({
  progress,
  height,
  progressColor,
  backgroundColor,
  borderRadius,
  showPercentage = false,
  showTimeLabels = false,
  currentTime,
  duration,
  customPercentageText,
  containerStyle,
  textStyle,
  variant = "medium",
  interactive = false,
  onSeekStart,
  onSeekChange,
  onSeekComplete,
  maxValue,
  minValue = 0,
}: ProgressBarProps) {
  const { styles, colors, isDark } = useThemedStyles();
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [seekValue, setSeekValue] = useState(0);

  // Variant-based defaults
  const variantDefaults = {
    small: {
      height: 3,
      borderRadius: 1.5,
      fontSize: 11,
      marginTop: 2,
    },
    medium: {
      height: 4,
      borderRadius: 2,
      fontSize: 12,
      marginTop: 4,
    },
    large: {
      height: 6,
      borderRadius: 3,
      fontSize: 14,
      marginTop: 8,
    },
  };

  const defaults = variantDefaults[variant];

  // Calculate seek range and values
  const seekMaxValue = maxValue || duration || 1;
  const seekRange = seekMaxValue - minValue;

  // When seeking, use seekValue; otherwise use progress
  const currentValue =
    seekValue > 0
      ? seekValue
      : currentTime !== undefined
      ? currentTime
      : progress * seekMaxValue;

  // For time display, show relative time within the range (seekValue - minValue) when seeking
  const displayTime =
    seekValue > 0
      ? seekValue - minValue
      : currentTime !== undefined
      ? currentTime
      : progress * seekMaxValue;

  // Calculate progress as a percentage (0-1) for display
  const progressPercentage =
    seekValue > 0
      ? Math.max(0, Math.min(1, (seekValue - minValue) / seekRange))
      : Math.max(0, Math.min(1, progress));

  // Default colors
  const defaultProgressColor = progressColor || colors.link || "#007AFF";
  const defaultBackgroundColor =
    backgroundColor || colors.separator || (isDark ? "#555" : "#ddd");
  const defaultBorderRadius =
    borderRadius !== undefined ? borderRadius : defaults.borderRadius;
  const defaultHeight = height !== undefined ? height : defaults.height;

  // Handle layout changes to get the progress bar width
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setProgressBarWidth(width);
  };

  // Pan responder for interactive seeking
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => interactive,
    onMoveShouldSetPanResponder: () => interactive,
    onPanResponderGrant: (evt: GestureResponderEvent) => {
      if (!interactive || progressBarWidth === 0) return;
      const { locationX } = evt.nativeEvent;
      const seekValue = Math.max(
        minValue,
        Math.min(
          seekMaxValue,
          minValue + (locationX / progressBarWidth) * seekRange
        )
      );
      setSeekValue(seekValue);
      onSeekStart?.(seekValue);
    },
    onPanResponderMove: (evt: GestureResponderEvent) => {
      if (!interactive || progressBarWidth === 0) return;
      const { locationX } = evt.nativeEvent;
      const seekValue = Math.max(
        minValue,
        Math.min(
          seekMaxValue,
          minValue + (locationX / progressBarWidth) * seekRange
        )
      );
      setSeekValue(seekValue);
      onSeekChange?.(seekValue);
    },
    onPanResponderRelease: (evt: GestureResponderEvent) => {
      if (!interactive || progressBarWidth === 0) return;
      const { locationX } = evt.nativeEvent;
      const seekValue = Math.max(
        minValue,
        Math.min(
          seekMaxValue,
          minValue + (locationX / progressBarWidth) * seekRange
        )
      );
      onSeekComplete?.(seekValue);
      setSeekValue(0);
    },
  });

  return (
    <View style={[{ marginTop: defaults.marginTop }, containerStyle]}>
      <View
        style={{
          paddingVertical: interactive ? 8 : 0, // Add touch area for interactive bars
        }}
        {...(interactive ? panResponder.panHandlers : {})}
      >
        <View
          style={{
            height: defaultHeight,
            position: "relative",
            backgroundColor: defaultBackgroundColor,
            borderRadius: defaultBorderRadius,
            overflow: "hidden",
          }}
          onLayout={handleLayout}
        >
          <View
            style={{
              height: "100%",
              width: `${Math.round(progressPercentage * 100)}%`,
              backgroundColor: defaultProgressColor,
              borderRadius: defaultBorderRadius,
            }}
          />
          {/* Thumb for interactive progress bars */}
          {interactive && (
            <View
              style={{
                position: "absolute",
                top: -4,
                left: `${Math.round(progressPercentage * 100)}%`,
                marginLeft: -8,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: defaultProgressColor,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 2,
                elevation: 4,
              }}
            />
          )}
        </View>
      </View>

      {/* Labels */}
      {(showPercentage || showTimeLabels || customPercentageText) && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: showTimeLabels ? "space-between" : "flex-start",
            marginTop: 8,
          }}
        >
          {/* Time labels */}
          {showTimeLabels &&
            currentTime !== undefined &&
            duration !== undefined && (
              <>
                <Text
                  style={[
                    styles.text,
                    {
                      opacity: 0.7,
                      fontSize: defaults.fontSize,
                      fontVariant: ['tabular-nums'] 
                    },
                    textStyle,
                  ]}
                >
                  {formatTime(displayTime)}
                </Text>
                {/* Percentage or custom text */}
                {(showPercentage || customPercentageText) && (
                  <Text
                    style={[
                      styles.text,
                      {
                        opacity: 0.6,
                        fontSize: defaults.fontSize,
                        fontVariant: ['tabular-nums'],
                      },
                      textStyle,
                    ]}
                  >
                    {customPercentageText ||
                      `${Math.round(progressPercentage * 100)}% finished`}
                  </Text>
                )}

                <Text
                  style={[
                    styles.text,
                    {
                      opacity: 0.7,
                      fontSize: defaults.fontSize,
                      fontVariant: ['tabular-nums'],
                    },
                    textStyle,
                  ]}
                >
                  {formatTime(duration)}
                </Text>
              </>
            )}
        </View>
      )}
    </View>
  );
}
