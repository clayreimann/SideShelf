import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import React from 'react';
import { Text, View } from "react-native";

export default function Index() {
  const { styles } = useThemedStyles();
  const { username, isAuthenticated } = useAuth();

  return (
    <View style={styles.container}>
      {username ? (
        <Text style={styles.text}>Hello {username} ({isAuthenticated ? 'authenticated' : 'not authenticated'})</Text>
      ) : (
        <Text style={styles.text}>Welcome ({isAuthenticated ? 'authenticated' : 'not authenticated'})</Text>
      )}
    </View>
  );
}
