import { HeaderControls, SortMenu } from '@/components/ui';
import { useThemedStyles } from '@/lib/theme';
import { AuthorSortField, useAuthors } from '@/stores';
import { useFocusEffect } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';

export default function AuthorsScreen() {
  const { styles, isDark } = useThemedStyles();
  const { items, isLoadingItems, isInitializing, ready, refetchAuthors, sortConfig, setSortConfig } = useAuthors();
  const [showSortMenu, setShowSortMenu] = useState(false);

  const onRefresh = useCallback(async () => {
    await refetchAuthors();
  }, [refetchAuthors]);

  // Load authors when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (ready && items.length === 0) {
        refetchAuthors();
      }
    }, [ready, items.length, refetchAuthors])
  );

  const controls = useCallback(() => (
    <HeaderControls
      isDark={isDark}
      onSort={() => setShowSortMenu(true)}
      showViewToggle={false}
    />
  ), [isDark]);

  // Authors sort options
  const authorsSortOptions = [
    { field: 'name' as AuthorSortField, label: 'Name' },
    { field: 'numBooks' as AuthorSortField, label: 'Number of Books' },
  ];

  const renderAuthor = React.useCallback(({ item }: { item: any }) => (
    <View style={{
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: styles.text.color + '20',
    }}>
      <Text style={[styles.text, { fontSize: 16, fontWeight: '600' }]}>
        {item.name}
      </Text>
      <Text style={[styles.text, { fontSize: 14, opacity: 0.7, marginTop: 4 }]}>
        {item.numBooks} book{item.numBooks !== 1 ? 's' : ''}
      </Text>
    </View>
  ), [styles]);

  if (!ready || isInitializing) {
    return (
      <>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" />
          <Text style={[styles.text, { marginTop: 16 }]}>Loading authors...</Text>
          <Stack.Screen options={{ headerTitle: 'Authors' }} />
        </View>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={styles.text}>No authors found</Text>
          <Text style={[styles.text, { fontSize: 12, marginTop: 8, opacity: 0.7 }]}>
            Authors will appear here once you have books in your library
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            style={{
              marginTop: 20,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 6,
              backgroundColor: isDark ? '#333' : '#f0f0f0',
            }}
          >
            <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16 }}>
              Reload Authors
            </Text>
          </TouchableOpacity>
          <Stack.Screen options={{ headerTitle: 'Authors' }} />
        </View>
      </>
    );
  }

  return (
    <>
      <FlatList
        data={items}
        renderItem={renderAuthor}
        keyExtractor={(item) => item.id}
        refreshing={isLoadingItems}
        onRefresh={onRefresh}
        contentContainerStyle={styles.flatListContainer}
      />
      <SortMenu
        visible={showSortMenu}
        onClose={() => setShowSortMenu(false)}
        sortConfig={sortConfig}
        onSortChange={setSortConfig}
        sortOptions={authorsSortOptions}
        isDark={isDark}
      />
      <Stack.Screen options={{ headerTitle: `Authors (${items.length})`, headerRight: controls }} />
    </>
  );
}
