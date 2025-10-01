import { LibraryItemDetail } from '@/components/library';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function LibraryItemDetailScreen() {
  const { item: itemId } = useLocalSearchParams();

  return (
    <>
      <Stack.Screen options={{ headerTitle: '', headerBackTitle: 'Back' }} />
      <LibraryItemDetail itemId={itemId as string} />
    </>
  );
}
