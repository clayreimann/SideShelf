import CoverImage from '@/components/ui/CoverImange';
import { getAuthorById } from '@/db/helpers/authors';
import { getLibraryItemsByAuthor, transformItemsToDisplayFormat } from '@/db/helpers/libraryItems';
import { formatTime } from '@/lib/helpers/formatters';
import { useThemedStyles } from '@/lib/theme';
import { useAuthors, useLibrary } from '@/stores';
import type { LibraryItemDisplayRow } from '@/types/components';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export default function AuthorDetailScreen() {
  const { styles, colors } = useThemedStyles();
  const { items: authorsList } = useAuthors();
  const { selectedLibrary } = useLibrary();
  const router = useRouter();
  const params = useLocalSearchParams<{ authorId?: string | string[] }>();
  const authorId = Array.isArray(params.authorId) ? params.authorId[0] : params.authorId;

  const [books, setBooks] = useState<LibraryItemDisplayRow[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(false);
  const [author, setAuthor] = useState<{ id: string; name: string; imageUrl: string | null; numBooks: number } | null>(null);

  const selectedAuthor = useMemo(
    () => authorsList.find(author => author.id === authorId),
    [authorsList, authorId]
  );

  // Fetch author from DB if not in list
  useEffect(() => {
    if (!selectedAuthor && authorId) {
      getAuthorById(authorId).then(authorFromDb => {
        if (authorFromDb) {
          setAuthor({
            id: authorFromDb.id,
            name: authorFromDb.name || 'Unknown Author',
            imageUrl: authorFromDb.imageUrl,
            numBooks: authorFromDb.numBooks || 0,
          });
        }
      });
    } else if (selectedAuthor) {
      setAuthor(selectedAuthor);
    }
  }, [selectedAuthor, authorId]);

  const loadAuthorBooks = useCallback(async () => {
    if (!authorId || !selectedLibrary?.id) return;

    setIsLoadingBooks(true);
    try {
      // Fetch books from local database
      const dbItems = await getLibraryItemsByAuthor(selectedLibrary.id, authorId);
      const displayItems = transformItemsToDisplayFormat(dbItems);
      setBooks(displayItems);
    } catch (error) {
      console.error('[AuthorDetailScreen] Failed to load author books:', error);
    } finally {
      setIsLoadingBooks(false);
    }
  }, [authorId, selectedLibrary?.id]);

  useFocusEffect(
    useCallback(() => {
      if (authorId && selectedLibrary?.id) {
        loadAuthorBooks();
      }
    }, [authorId, selectedLibrary?.id, loadAuthorBooks])
  );

  const renderBook = useCallback(
    ({ item }: { item: LibraryItemDisplayRow }) => {
      return (
        <TouchableOpacity
          onPress={() => authorId && router.push(`/authors/${authorId}/item/${item.id}`)}
          style={{
            flexDirection: 'row',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: (styles.text.color || '#000000') + '20',
            gap: 12,
          }}
          accessibilityRole="button"
          accessibilityHint={`Open details for ${item.title}`}
        >
          <View style={{ width: 64, height: 96, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.coverBackground }}>
            <CoverImage uri={item.coverUri} title={item.title} fontSize={12} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={[styles.text, { fontSize: 16, fontWeight: '600' }]} numberOfLines={2}>
              {item.title}
            </Text>
            {item.authorName && (
              <Text style={[styles.text, { opacity: 0.7, marginTop: 2 }]} numberOfLines={1}>
                {item.authorName}
              </Text>
            )}
            {item.duration !== null && item.duration !== undefined && (
              <Text style={[styles.text, { opacity: 0.6, fontSize: 12, marginTop: 2 }]}>
                {formatTime(item.duration)}
              </Text>
            )}
            {item.seriesName && (
              <Text style={[styles.text, { opacity: 0.6, fontSize: 12, marginTop: 2, fontStyle: 'italic' }]}>
                {item.seriesName}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [colors.coverBackground, router, styles.text.color, authorId]
  );

  if (!authorId) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.text}>Author not found.</Text>
        <Stack.Screen options={{ title: 'Author' }} />
      </View>
    );
  }

  if (!author) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.link} />
        <Text style={[styles.text, { marginTop: 12, opacity: 0.7 }]}>
          Loading author...
        </Text>
        <Stack.Screen options={{ title: 'Author' }} />
      </View>
    );
  }

  if (!selectedLibrary) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }]}>
        <Text style={[styles.text, { textAlign: 'center', marginBottom: 16 }]}>
          Please select a library to view author's books.
        </Text>
        <Stack.Screen options={{ title: author.name }} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={books}
        keyExtractor={(item) => item.id}
        renderItem={renderBook}
        ListEmptyComponent={
          <View style={{ padding: 24, alignItems: 'center' }}>
            {isLoadingBooks ? (
              <>
                <ActivityIndicator size="small" color={colors.link} />
                <Text style={[styles.text, { marginTop: 12, opacity: 0.7 }]}>
                  Loading books...
                </Text>
              </>
            ) : (
              <Text style={[styles.text, { opacity: 0.7 }]}>No books found for this author.</Text>
            )}
          </View>
        }
        contentContainerStyle={[styles.flatListContainer, { paddingBottom: 40 }]}
      />
      <Stack.Screen
        options={{
          title: author.name || 'Author',
        }}
      />
    </>
  );
}
