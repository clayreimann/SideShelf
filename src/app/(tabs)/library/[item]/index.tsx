import { useThemedStyles } from '@/lib/theme';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { getLibraryItemById, NewLibraryItemRow } from '@/db/helpers/libraryItems';
import { getMediaGenres, getMediaTags } from '@/db/helpers/mediaJoins';
import { cacheCoverAndUpdateMetadata, getMediaMetadataByLibraryItemId } from '@/db/helpers/mediaMetadata';
import { MediaMetadataRow } from '@/db/schema/mediaMetadata';
import { getCoverUri } from '@/lib/covers';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';


export default function LibraryItemDetailScreen() {
  const { styles, isDark } = useThemedStyles();
  const { item: itemId } = useLocalSearchParams();
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<NewLibraryItemRow | null>(null);
  const [metadata, setMetadata] = useState<MediaMetadataRow | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      try {
        const itemRow = await getLibraryItemById(itemId as string);
        const meta = itemRow ? await getMediaMetadataByLibraryItemId(itemRow.id) : null;
        const genres = meta ? await getMediaGenres(meta.id) : [];
        const tags = meta ? await getMediaTags(meta.id) : [];
        if (isMounted) {
          setItem(itemRow);
          setMetadata(meta);
          setGenres(genres);
          setTags(tags);

          // Cache cover in background if item exists
          if (itemRow) {
            cacheCoverAndUpdateMetadata(itemRow.id).then(wasDownloaded => {
              if (wasDownloaded) {
                console.log('Cover was downloaded for item detail, refreshing metadata');
                // Refresh metadata to show the new cover
                getMediaMetadataByLibraryItemId(itemRow.id).then(updatedMeta => {
                  if (isMounted && updatedMeta) {
                    setMetadata(updatedMeta);
                  }
                });
              }
            }).catch(error => {
              console.error('Failed to cache cover for item detail:', error);
            });
          }
        }
      } catch (e) {
        if (isMounted) {
          setItem(null);
          setMetadata(null);
          setGenres([]);
          setTags([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    if (itemId) fetchData();
    return () => { isMounted = false; };
  }, [itemId]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" />
        <Stack.Screen options={{ headerTitle: 'Loading...' }} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Item not found.</Text>
        <Stack.Screen options={{ headerTitle: 'Item not found' }} />
      </View>
    );
  }

  // Prefer metadata fields, fallback to item fields
  const title = metadata?.title || 'Unknown Title';
  const coverUri = metadata?.imageUrl || (item ? getCoverUri(item.id) : null);
  const description = metadata?.description || '';
  const author = metadata?.authorName || metadata?.author || 'Unknown Author';
  const narrator = metadata?.narratorName || null;
  const series = metadata?.seriesName || null;
  const imageSize = width * 0.8;
  return (
    <>
      <Stack.Screen options={{ headerTitle: title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: styles.container.backgroundColor }}
        contentContainerStyle={{ padding: 16 }}
      >
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          {coverUri ? (
            <Image
              source={{ uri: coverUri }}
              style={{
                width: imageSize,
                height: imageSize,
                borderRadius: 8,
                backgroundColor: isDark ? '#222' : '#eee'
              }}
              resizeMode="contain"
            />
          ) : (
            <View style={{
              width: imageSize,
              height: imageSize,
              borderRadius: 8,
              backgroundColor: isDark ? '#222' : '#eee',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text style={{
                color: isDark ? '#bbb' : '#444',
                fontSize: 14,
                textAlign: 'center',
                paddingHorizontal: 12
              }} numberOfLines={3}>
                {title || 'No Cover'}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.text, { fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' }]}>
          {title}
        </Text>
        {series ? (
          <Text style={[styles.text, { fontStyle: 'italic', marginBottom: 4, textAlign: 'center' }]}>
            Series: {series}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
          <Text style={[styles.text, { marginRight: 8 }]}>Author: {author}</Text>
          {narrator ? <Text style={styles.text}>Narrator: {narrator}</Text> : null}
        </View>
        {genres && genres.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8, justifyContent: 'center' }}>
            {genres.map((g: string, idx: number) => (
              <View key={g + idx} style={{ backgroundColor: isDark ? '#333' : '#eee', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, margin: 2 }}>
                <Text style={{ fontSize: 12, color: isDark ? '#ccc' : '#333' }}>{g}</Text>
              </View>
            ))}
          </View>
        )}
        {tags && tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8, justifyContent: 'center' }}>
            {tags.map((t: string, idx: number) => (
              <View key={t + idx} style={{ backgroundColor: isDark ? '#1a4f6e' : '#d0eaff', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, margin: 2 }}>
                <Text style={{ fontSize: 12, color: isDark ? '#ccc' : '#333' }}>{t}</Text>
              </View>
            ))}
          </View>
        )}
        {description ? (
          <View style={{ marginTop: 16 }}>
            <RenderHtml
              contentWidth={width - 32}
              source={{ html: description }}
              baseStyle={{ color: styles.text.color, fontSize: 16 }}
            />
          </View>
        ) : (
          <Text style={styles.text}>No description available.</Text>
        )}
      </ScrollView>
    </>
  );
}
