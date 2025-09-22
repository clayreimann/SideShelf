import { LibraryItemDetail } from '@/components/library';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';

export default function LibraryItemDetailScreen() {
  const { item: itemId } = useLocalSearchParams();
  const [title, setTitle] = useState('Loading...');

  return (
    <>
      <Stack.Screen options={{ headerTitle: title }} />
      <LibraryItemDetail
        itemId={itemId as string}
        onTitleChange={setTitle}
      />
    </>
  );
}
