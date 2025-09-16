import { Stack } from 'expo-router';
import React from 'react';
import { Text, View } from "react-native";
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { useThemedStyles } from '../../lib/theme';
import { useAuth } from '../../providers/AuthProvider';


export default function Index() {
  const { styles } = useThemedStyles();
  const { username: usernameFromAuth } = useAuth();
  const [username, setUsername] = React.useState<string | null>(usernameFromAuth ?? null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // If we have a username in auth, try to read the user row; else keep the auth username
        const result = await db.select().from(users).limit(1);
        if (!cancelled && result?.length) {
          setUsername(result[0].username);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <View style={styles.container}>
      {username ? (
        <Text style={styles.text}>Hello {username}</Text>
      ) : (
        <Text style={styles.text}>Welcome</Text>
      )}
      <Stack.Screen options={{ title: "Home" }} />
    </View>
  );
}
