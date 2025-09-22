import { SortConfig, SortDirection, SortField } from '@/providers/LibraryProvider';
import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';

interface SortMenuProps {
  visible: boolean;
  onClose: () => void;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  isDark: boolean;
}

export default function SortMenu({ visible, onClose, sortConfig, onSortChange, isDark }: SortMenuProps) {
  const sortOptions: { field: SortField; label: string }[] = [
    { field: 'title', label: 'Title' },
    { field: 'author', label: 'Author' },
    { field: 'publishedYear', label: 'Published Year' },
    { field: 'addedAt', label: 'Date Added' },
  ];

  const handleSortChange = (field: SortField) => {
    const direction: SortDirection =
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
            Sort by
          </Text>
          {sortOptions.map((option) => (
            <TouchableOpacity
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
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
