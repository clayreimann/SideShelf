import { HeaderControls, SortMenu } from '@/components/ui';
import { getAuthorInitials } from '@/lib/authorImages';
import { useThemedStyles } from '@/lib/theme';
import { AuthorSortField, useAuthors } from '@/stores';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from 'react-native';

export default function AuthorsScreen() {
  const { styles, isDark, colors } = useThemedStyles();
  const { items, isInitializing, ready, refetchAuthors, sortConfig, setSortConfig } = useAuthors();
  const [showSortMenu, setShowSortMenu] = useState(false);
  const router = useRouter();

  // Load authors when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (ready && items.length === 0 && !isInitializing) {
        refetchAuthors();
      }
    }, [ready, items.length, isInitializing, refetchAuthors])
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
    { field: 'nameLF' as AuthorSortField, label: 'Name (Last Name)' },
    { field: 'numBooks' as AuthorSortField, label: 'Number of Books' },
  ];

  const renderAuthor = React.useCallback(({ item }: { item: any }) => {
    const initials = getAuthorInitials(item.name);
    const hasImage = !!item.cachedImageUri

    return (
      <TouchableOpacity
        onPress={() => router.push(`/authors/${item.id}`)}
        style={{
          flexDirection: 'row',
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: styles.text.color + '20',
          alignItems: 'center',
        }}
        accessibilityRole="button"
        accessibilityHint={`View books by ${item.name}`}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: hasImage ? 'transparent' : (isDark ? '#444' : '#ddd'),
            marginRight: 12,
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          {hasImage ? (
            <Image
              source={{ uri: item.cachedImageUri }}
              style={{ width: 56, height: 56 }}
              resizeMode="cover"
            />
          ) : (
            <Text style={[styles.text, { fontSize: 18, fontWeight: '600' }]}>
              {initials}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.text, { fontSize: 16, fontWeight: '600' }]}>
            {item.name}
          </Text>
          <Text style={[styles.text, { fontSize: 14, opacity: 0.7, marginTop: 4 }]}>
            {item.numBooks} book{item.numBooks !== 1 ? 's' : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [styles, router, isDark]);

  if (!ready || (isInitializing && items.length === 0)) {
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
      <Stack.Screen options={{ headerTitle: 'Authors', headerRight: controls }} />
    </>
  );
}
