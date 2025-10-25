import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, Text } from 'react-native';

type ActionItem = {
  label: string;
  onPress?: () => void;
};

export default function MoreScreen() {
  const { styles } = useThemedStyles();
  const router = useRouter();
  const { logout } = useAuth();


  const data = useMemo(() => {
    return [
      { label: 'Collections', onPress: () => router.push('/more/collections') },
      { label: 'About Me', onPress: () => router.push('/more/me') },
      { label: 'Settings', onPress: () => router.push('/more/settings') },
      { label: 'Advanced', onPress: () => router.push('/more/advanced') },
      { label: 'Logs', onPress: () => router.push('/more/logs') },
      { label: 'Log out', onPress: async () => { await logout(); router.replace('/login'); } },
    ];
  }, [router, logout]);
  return (
    <>
      <FlatList style={[styles.flatListContainer]}
        data={data}
        renderItem={({ item }) => (
        <Pressable style={styles.listItem} onPress={item.onPress}>
          <Text style={styles.text}>{item.label}</Text>
        </Pressable>
        )}
      />

      < Stack.Screen options={{ title: 'More' }} />
    </>
  );
}
