import { useThemedStyles } from '@/lib/theme';
import { useLibrary } from '@/providers/LibraryProvider';
import { Stack } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';

interface LibraryPickerProps {
  libraries: any[] | null;
  selectLibrary: (id: string) => void;
  selectedLibrary: any | null;
  isDark: boolean;
}

function LibraryPicker({ libraries, selectLibrary, selectedLibrary, isDark }: LibraryPickerProps) {
  if (!libraries?.length) return null;

  return (
    <View style={{
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? '#222' : '#eee',
      overflow: 'hidden',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8
    }}>
      {libraries.map((lib) => (
        <TouchableOpacity key={lib.id} onPress={() => selectLibrary(lib.id)}>
          <Text style={{ color: selectedLibrary?.id === lib.id ? (isDark ? '#fff' : '#000') : '#888' }}>
            {lib.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}


export default function AboutScreen() {
  const { styles, isDark } = useThemedStyles();
  const { libraries, selectLibrary, selectedLibrary } = useLibrary();

  return (
    <>
      <View style={styles.container}>
        <LibraryPicker
          libraries={libraries}
          selectLibrary={selectLibrary}
          selectedLibrary={selectedLibrary}
          isDark={isDark}
        />
        <Text style={styles.text}>Library screen</Text>
        <Stack.Screen options={{ headerTitle: 'Library' }} />
      </View>
    </>
  );
}
