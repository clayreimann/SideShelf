import { useThemedStyles } from '@/lib/theme';
import { useLibrary, type LibraryItemListRow, type SortConfig, type SortDirection, type SortField } from '@/providers/LibraryProvider';
import { Link, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TouchableOpacity, View } from 'react-native';

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
      gap: 8,
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

interface SortMenuProps {
  visible: boolean;
  onClose: () => void;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  isDark: boolean;
}

function SortMenu({ visible, onClose, sortConfig, onSortChange, isDark }: SortMenuProps) {
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


export default function AboutScreen() {
  const { styles, isDark } = useThemedStyles();
  const { libraries, items, selectLibrary, selectedLibrary, isLoadingItems, refetchItems, sortConfig, setSortConfig } = useLibrary();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetchItems();
    setIsRefreshing(false);
  }, [refetchItems]);

  if (!libraries.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No libraries found, are you sure you are signed in?</Text>
      </View>
    );
  }

  let title = selectedLibrary?.name || 'Library';
  const sortButton = (
    <TouchableOpacity
      onPress={() => setShowSortMenu(true)}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: isDark ? '#333' : '#f0f0f0',
        marginLeft: 12,
      }}
    >
      <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 14 }}>
        Sort
      </Text>
    </TouchableOpacity>
  );
  return (
    <>
      <View>
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}>
          <View style={{ flex: 1 }}>
            <LibraryPicker
              libraries={libraries}
              selectLibrary={selectLibrary}
              selectedLibrary={selectedLibrary}
              isDark={isDark}
            />
          </View>

        </View>
        <FlatList
          data={items}
          numColumns={3}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 12 }}
          renderItem={({ item }: { item: LibraryItemListRow }) => (
            <Link
              href={{ pathname: '/(tabs)/library/[item]', params: { item: item.id } }}
              asChild
            >
              <TouchableOpacity style={{ width: '30%', aspectRatio: 1, marginBottom: 12 }}>
                <View style={{ flex: 1, borderRadius: 6, backgroundColor: isDark ? '#222' : '#eee', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: isDark ? '#bbb' : '#444', fontSize: 12, textAlign: 'center', paddingHorizontal: 6 }} numberOfLines={3}>
                    {item.title || 'Untitled'}
                  </Text>
                </View>
              </TouchableOpacity>
            </Link>
          )}
          refreshControl={<RefreshControl refreshing={isRefreshing || isLoadingItems} onRefresh={onRefresh} tintColor={isDark ? '#fff' : '#000'} />}
          contentContainerStyle={[styles.flatListContainer, { paddingTop: 8, paddingBottom: 24 }]}
          indicatorStyle={isDark ? 'white' : 'black'}
        />
        <SortMenu
          visible={showSortMenu}
          onClose={() => setShowSortMenu(false)}
          sortConfig={sortConfig}
          onSortChange={setSortConfig}
          isDark={isDark}
        />
        <Stack.Screen options={{ title, headerTitle: title, headerRight: () => sortButton }} />
      </View>
    </>
  );
}
