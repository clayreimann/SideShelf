/**
 * Toggle Component
 *
 * A reusable toggle switch component with iOS-style design.
 * Used across various settings screens for enabling/disabling features.
 */

import { useThemedStyles } from '@/lib/theme';
import { Pressable, View } from 'react-native';

export interface ToggleProps {
  /** Whether the toggle is currently enabled */
  value: boolean;
  /** Callback when toggle is pressed */
  onValueChange: (value: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
}

export default function Toggle({ value, onValueChange, disabled = false }: ToggleProps) {
  const { isDark } = useThemedStyles();

  const primaryColor = isDark ? '#4A9EFF' : '#007AFF';
  const disabledOpacity = disabled ? 0.5 : 1;

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      style={{ opacity: disabledOpacity }}
    >
      <View
        style={{
          width: 51,
          height: 31,
          borderRadius: 15.5,
          backgroundColor: value ? primaryColor : isDark ? '#3A3A3C' : '#C7C7CC',
          justifyContent: 'center',
          paddingHorizontal: 2,
        }}
      >
        <View
          style={{
            width: 27,
            height: 27,
            borderRadius: 13.5,
            backgroundColor: '#FFFFFF',
            alignSelf: value ? 'flex-end' : 'flex-start',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 3,
            elevation: 3,
          }}
        />
      </View>
    </Pressable>
  );
}
