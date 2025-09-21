import { useThemedStyles } from '@/lib/theme';
import { useLibrary, type LibraryItemListRow, type SortConfig, type SortDirection, type SortField } from '@/providers/LibraryProvider';
import { Link, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Image, Modal, Pressable, RefreshControl, Text, TouchableOpacity, View } from 'react-native';

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


type ViewMode = 'grid' | 'list';

interface GridItemProps {
  item: LibraryItemListRow;
  isDark: boolean;
}

function GridItem({ item, isDark }: GridItemProps) {
  return (
    <Link
      href={{ pathname: '/(tabs)/library/[item]', params: { item: item.id } }}
      asChild
    >
      <TouchableOpacity style={{ width: '30%', aspectRatio: 1, marginBottom: 12 }}>
        <View style={{ flex: 1, borderRadius: 6, backgroundColor: isDark ? '#222' : '#eee', overflow: 'hidden' }}>
          {item.coverUri ? (
            <Image
              source={{ uri: item.coverUri }}
              style={{ flex: 1, width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: isDark ? '#bbb' : '#444', fontSize: 12, textAlign: 'center', paddingHorizontal: 6 }} numberOfLines={3}>
                {item.title || 'Untitled'}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Link>
  );
}

interface ListItemProps {
  item: LibraryItemListRow;
  isDark: boolean;
}

function ListItem({ item, isDark }: ListItemProps) {
  return (
    <Link
      href={{ pathname: '/(tabs)/library/[item]', params: { item: item.id } }}
      asChild
    >
      <TouchableOpacity style={{
        flexDirection: 'row',
        padding: 12,
        backgroundColor: isDark ? '#1a1a1a' : '#fff',
        marginHorizontal: 12,
        marginBottom: 8,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      }}>
        <View style={{
          width: 60,
          height: 60,
          borderRadius: 4,
          backgroundColor: isDark ? '#333' : '#f0f0f0',
          overflow: 'hidden',
          marginRight: 12,
        }}>
          {item.coverUri ? (
            <Image
              source={{ uri: item.coverUri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: isDark ? '#666' : '#999', fontSize: 10 }}>
                No Cover
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{
            color: isDark ? '#fff' : '#000',
            fontSize: 16,
            fontWeight: '600',
            marginBottom: 4,
          }} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={{
            color: isDark ? '#aaa' : '#666',
            fontSize: 14,
            marginBottom: 2,
          }} numberOfLines={1}>
            {item.author}
          </Text>
          {item.narrator && (
            <Text style={{
              color: isDark ? '#888' : '#888',
              fontSize: 12,
            }} numberOfLines={1}>
              Narrated by {item.narrator}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Link>
  );
}

export default function AboutScreen() {
  const { styles, isDark } = useThemedStyles();
  const { libraries, items, selectLibrary, selectedLibrary, isLoadingItems, refetchItems, sortConfig, setSortConfig } = useLibrary();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
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

  const headerButtons = (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity
        onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 6,
          backgroundColor: isDark ? '#333' : '#f0f0f0',
          marginRight: 8,
        }}
      >
        <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 14 }}>
          {viewMode === 'grid' ? 'List' : 'Grid'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowSortMenu(true)}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 6,
          backgroundColor: isDark ? '#333' : '#f0f0f0',
        }}
      >
        <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 14 }}>
          Sort
        </Text>
      </TouchableOpacity>
    </View>
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
          numColumns={viewMode === 'grid' ? 3 : 1}
          key={viewMode} // Force re-render when view mode changes
          columnWrapperStyle={viewMode === 'grid' ? { gap: 12, paddingHorizontal: 12 } : undefined}
          renderItem={({ item }: { item: LibraryItemListRow }) =>
            viewMode === 'grid' ?
              <GridItem item={item} isDark={isDark} /> :
              <ListItem item={item} isDark={isDark} />
          }
          refreshControl={<RefreshControl refreshing={isRefreshing || isLoadingItems} onRefresh={onRefresh} tintColor={isDark ? '#fff' : '#000'} />}
          contentContainerStyle={[
            styles.flatListContainer,
            {
              paddingTop: 8,
              paddingBottom: 24,
              ...(viewMode === 'list' && { paddingHorizontal: 0 })
            }
          ]}
          indicatorStyle={isDark ? 'white' : 'black'}
        />
        <SortMenu
          visible={showSortMenu}
          onClose={() => setShowSortMenu(false)}
          sortConfig={sortConfig}
          onSortChange={setSortConfig}
          isDark={isDark}
        />
        <Stack.Screen options={{ title, headerTitle: title, headerRight: () => headerButtons }} />
      </View>
    </>
  );
}
