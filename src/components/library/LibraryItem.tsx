import { LibraryItemListRow } from '@/stores';
import { Link } from 'expo-router';
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';

interface LibraryItemProps {
  item: LibraryItemListRow;
  isDark: boolean;
  variant?: 'grid' | 'list';
}

export function GridItem({ item, isDark }: { item: LibraryItemListRow; isDark: boolean }) {
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

export function ListItem({ item, isDark }: { item: LibraryItemListRow; isDark: boolean }) {
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

export default function ApiLibraryItem({ item, isDark, variant = 'grid' }: LibraryItemProps) {
  return variant === 'grid' ?
    <GridItem item={item} isDark={isDark} /> :
    <ListItem item={item} isDark={isDark} />;
}
