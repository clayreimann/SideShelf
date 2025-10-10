import React from 'react';
import { Pressable, Text, View } from 'react-native';

export interface HeaderControlsProps {
  isDark: boolean;
  viewMode?: 'grid' | 'list';
  onToggleViewMode?: () => void;
  onSort: () => void;
  showViewToggle?: boolean;
  sortLabel?: string;
  viewToggleLabel?: string;
}

export default function HeaderControls({
  isDark,
  viewMode,
  onToggleViewMode,
  onSort,
  showViewToggle = true,
  sortLabel = 'Sort',
  viewToggleLabel,
}: HeaderControlsProps) {
  const buttonStyle = {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    // backgroundColor: isDark ? '#333' : '#f0f0f0',
    marginRight: 8,
  };

  const textStyle = {
    color: isDark ? '#fff' : '#000',
    fontSize: 14,
  };

  const computedViewToggleLabel = viewToggleLabel || (viewMode === 'grid' ? 'List' : 'Grid');

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {showViewToggle && onToggleViewMode && (
        <Pressable onPress={onToggleViewMode} style={buttonStyle}>
          <Text style={textStyle}>{computedViewToggleLabel}</Text>
        </Pressable>
      )}
      <Pressable onPress={onSort} style={[buttonStyle, { marginRight: 0 }]}>
        <Text style={textStyle}>{sortLabel}</Text>
      </Pressable>
    </View>
  );
}
