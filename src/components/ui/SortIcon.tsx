import type { SortConfig } from '@/types/store';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Platform } from 'react-native';

export interface SortIconProps {
  sortConfig?: SortConfig;
  color?: string;
  size?: number;
}

export default function SortIcon({ sortConfig, color = '#000', size = 20 }: SortIconProps) {
  const isAscending = sortConfig?.direction === 'asc';

  if (Platform.OS === 'android') {
    return (
      <MaterialCommunityIcons
        name={isAscending ? 'sort-ascending' : 'sort-descending'}
        size={size}
        color={color}
      />
    );
  } else {
    // iOS: SF Symbol rightTriangle mirrored left-to-right
    return (
      <SymbolView
        name="righttriangle"
        size={size}
        tintColor={color}
        style={{
          transform: [{ scaleX: -1 }], // Mirror horizontally
        }}
      />
    );
  }
}
