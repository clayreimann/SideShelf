import { users } from '@/db/schema';
import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useDb } from '@/providers/DbProvider';
import { Stack } from 'expo-router';
import React from 'react';
import { Text, View } from "react-native";


export default function Index() {
  const { styles } = useThemedStyles();
  const { username: usernameFromAuth, isAuthenticated, initialized } = useAuth();
  const { initialized: dbInitialized, db } = useDb();
  const [username, setUsername] = React.useState<string | null>(usernameFromAuth ?? null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dbInitialized) return;
      try {
        // If we have a username in auth, try to read the user row; else keep the auth username
        const result = await db.select().from(users).limit(1);
        console.log('[index] select user', result, `dbInitialized: ${dbInitialized} authInitialized: ${initialized} authUsername: ${usernameFromAuth}`);
        if (!cancelled && result?.length) {
          setUsername(result[0].username);
        }
      } catch (error) {
        console.error('[index] error', error, `dbInitialized: ${dbInitialized} authInitialized: ${initialized}`);
      }
    })();
    return () => { cancelled = true; };
  }, [dbInitialized, initialized]);
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Home", headerTitle: "Home" }} />
      {username ? (
        <Text style={styles.text}>Hello {username} ({isAuthenticated ? 'authenticated' : 'not authenticated'})</Text>
      ) : (
        <Text style={styles.text}>Welcome ({isAuthenticated ? 'authenticated' : 'not authenticated'})</Text>
      )}
    </View>
  );
}
