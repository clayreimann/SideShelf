import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { Link, Stack, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export default function MoreScreen() {
  const { styles } = useThemedStyles();
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <>
      <View style={[styles.flatListContainer, { gap: 16 }]}>
        <Link href="/more/collections" asChild>
          <Pressable style={styles.listItem}><Text style={styles.text}>Collections</Text></Pressable>
        </Link>
        <Link href="/more/settings" asChild>
          <Pressable style={styles.listItem}><Text style={styles.text}>Settings</Text></Pressable>
        </Link>
        <Link href="/more/advanced" asChild>
          <Pressable style={styles.listItem}><Text style={styles.text}>Advanced</Text></Pressable>
        </Link>
        <Pressable style={styles.listItem} onPress={async () => { await logout(); router.replace('/login'); }}>
          <Text style={styles.text}>Log out</Text>
        </Pressable>
      </View>
      <Stack.Screen options={{ title: 'More' }} />
    </>
  );
}
