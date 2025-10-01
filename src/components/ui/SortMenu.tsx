import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

// Generic sort option type
export interface SortOption<T = string> {
  field: T;
  label: string;
}

// Generic sort config type
export interface GenericSortConfig<T = string> {
  field: T;
  direction: 'asc' | 'desc';
}

interface SortMenuProps<T = string> {
  visible: boolean;
  onClose: () => void;
  sortConfig: GenericSortConfig<T>;
  onSortChange: (config: GenericSortConfig<T>) => void;
  sortOptions: SortOption<T>[];
  isDark: boolean;
  title?: string;
}

export default function SortMenu<T = string>({
  visible,
  onClose,
  sortConfig,
  onSortChange,
  sortOptions,
  isDark,
  title = 'Sort by'
}: SortMenuProps<T>) {
  const handleSortChange = (field: T) => {
    const direction: 'asc' | 'desc' =
      sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    onSortChange({ field, direction });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
        onPress={onClose}
      >
        <View
          style={{
            backgroundColor: isDark ? '#333' : '#fff',
            borderRadius: 12,
            padding: 16,
            minWidth: 200,
            maxWidth: 300,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Text style={{
            fontSize: 18,
            fontWeight: 'bold',
            marginBottom: 16,
            color: isDark ? '#fff' : '#000',
            textAlign: 'center',
          }}>
            {title}
          </Text>
          {sortOptions.map((option) => (
            <Pressable
              key={option.field}
              onPress={() => handleSortChange(option.field)}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 8,
                marginBottom: 4,
                backgroundColor: sortConfig.field === option.field
                  ? (isDark ? '#555' : '#f0f0f0')
                  : 'transparent',
              }}
            >
              <Text style={{
                color: isDark ? '#fff' : '#000',
                fontSize: 16,
              }}>
                {option.label}
                {sortConfig.field === option.field && (
                  <Text style={{ color: isDark ? '#aaa' : '#666' }}>
                    {' '}({sortConfig.direction === 'asc' ? 'A-Z' : 'Z-A'})
                  </Text>
                )}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
