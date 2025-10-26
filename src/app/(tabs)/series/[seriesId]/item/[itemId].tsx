import { LibraryItemDetail } from '@/components/library';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function SeriesItemDetailScreen() {
  const params = useLocalSearchParams<{ itemId?: string | string[] }>();
  const itemId = Array.isArray(params.itemId) ? params.itemId[0] : params.itemId;

  if (!itemId) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ headerTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <LibraryItemDetail itemId={itemId} />
    </>
  );
}
