import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface LibraryPickerProps {
  libraries: any[] | null;
  selectLibrary: (id: string) => void;
  selectedLibrary: any | null;
  isDark: boolean;
}

export default function LibraryPicker({ libraries, selectLibrary, selectedLibrary, isDark }: LibraryPickerProps) {
  if (!libraries?.length) return null;

  return (
    <View style={{
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      backgroundColor: isDark ? '#222' : '#eee',
      borderColor: isDark ? '#222' : '#eee',
      overflow: 'hidden',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    }}>
      {libraries.map((lib) => (
        <TouchableOpacity key={lib.id} onPress={() => selectLibrary(lib.id)}>
          <Text style={{ backgroundColor: selectedLibrary?.id === lib.id ? (isDark ? '#222' : '#eee') : 'transparent', color: selectedLibrary?.id === lib.id ? (isDark ? '#fff' : '#000') : '#888' }}>
            {lib.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
