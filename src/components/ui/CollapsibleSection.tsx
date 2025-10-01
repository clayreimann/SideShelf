import { useThemedStyles } from '@/lib/theme';
import React, { useEffect, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  icon?: string;
}

export function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
  icon = '▶'
}: CollapsibleSectionProps) {
  const { styles, isDark } = useThemedStyles();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [animation] = useState(new Animated.Value(defaultExpanded ? 1 : 0));

  // Ensure animation value matches initial expanded state
  useEffect(() => {
    animation.setValue(defaultExpanded ? 1 : 0);
  }, [defaultExpanded, animation]);

  const toggleExpanded = () => {
    const toValue = isExpanded ? 0 : 1;
    setIsExpanded(!isExpanded);

    Animated.timing(animation, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const rotateInterpolate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  const heightInterpolate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={{ marginBottom: 16 }}>
      <Pressable
        onPress={toggleExpanded}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: isDark ? '#333' : '#f5f5f5',
          borderRadius: 8,
          marginBottom: isExpanded ? 8 : 0,
        }}
      >
        <Animated.Text
          style={{
            transform: [{ rotate: rotateInterpolate }],
            marginRight: 12,
            fontSize: 16,
            color: styles.text.color,
          }}
        >
          {icon}
        </Animated.Text>
        <Text style={[styles.text, { fontSize: 18, fontWeight: '600', flex: 1 }]}>
          {title}
        </Text>
      </Pressable >

      <Animated.View
        style={{
          overflow: 'hidden',
          opacity: heightInterpolate,
        }}
      >
        {isExpanded && (
          <View style={{ paddingHorizontal: 16 }}>
            {children}
          </View>
        )}
      </Animated.View>
    </View>
  );
}
