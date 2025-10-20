import { doPing } from '@/lib/api/endpoints';
import { useThemedStyles } from '@/lib/theme';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../providers/AuthProvider';

export default function LoginModal() {
  const router = useRouter();
  const { colors } = useThemedStyles();
  const { initialized, isAuthenticated, serverUrl, username: usernameFromAuth, loginMessage, login } = useAuth();
  const [didPing, setDidPing] = useState(false);
  const [baseUrl, setBaseUrl] = useState(serverUrl ?? '');
  const [username, setUsername] = useState(usernameFromAuth ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateBaseUrl = useCallback((url: string) => {
    if (url === baseUrl) return;
    if (`${url}:13378` === baseUrl) {
      setBaseUrl(url);
    } else {
      setBaseUrl(url);
      setDidPing(false);
    }
  }, [baseUrl]);

  const tryPing = useCallback(async () => {
    if (baseUrl) {
      console.log('[login] Pinging', baseUrl);
      const ping = await doPing({baseUrl});
      if (ping) {
        setDidPing(true);
        return;
      }

      const withPort = `${baseUrl}:13378`;
      const pingWithPort = await doPing({baseUrl: withPort});
      if (pingWithPort) {
        setBaseUrl(withPort);
        setDidPing(true);
        return;
      }
    }
  }, [baseUrl]);

  useEffect(() => {
    tryPing();
    if (serverUrl && !baseUrl) {
      updateBaseUrl(serverUrl);
    }
  }, [serverUrl]);

  useEffect(() => {
    if (initialized && isAuthenticated) {
      console.log('[login] Authenticated, redirecting to back');
      router.replace('/');
    }
  }, [initialized, isAuthenticated]);

  const canSubmit = useMemo(() => {
    return !!baseUrl && !!username && !!password && !submitting && didPing;
  }, [baseUrl, username, password, submitting, didPing]);

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      console.log('[login] Submitting login', { baseUrl, username: username ? '<provided>' : '<empty>' });
      await login({ serverUrl: baseUrl, username, password });
      console.log('[login] Success');
      router.replace('/');
    } catch (e: any) {
      console.log('[login] Error', e);
      setError(e?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <Stack.Screen options={{ headerTitle: 'Sign in' }} />
      <View style={styles.content}>
        <Text style={{...styles.title, color: colors.textPrimary }}>{loginMessage ?? 'Connect to Audiobookshelf'}</Text>
        <TextInput
          placeholder="Server URL (e.g. https://abs.example.com)"
          autoCapitalize="none"
          autoCorrect={false}
          style={{...styles.input, color: colors.textPrimary, borderColor: colors.separator }}
          value={baseUrl}
          onChangeText={setBaseUrl}
          onBlur={tryPing}
          keyboardType="url"
          textContentType="URL"
        />
        <TextInput
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect={false}
          style={{...styles.input, color: colors.textPrimary, borderColor: colors.separator }}
          value={username}
          onChangeText={setUsername}
          textContentType="username"
        />
        <TextInput
          placeholder="Password"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{...styles.input, color: colors.textPrimary, borderColor: colors.separator }}
          value={password}
          onSubmitEditing={onSubmit}
          onChangeText={setPassword}
          textContentType="password"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {baseUrl ? (
          <Text style={{ color: colors.textPrimary, textAlign: 'center' }}>{didPing ? 'Connected to server' : 'Searching for server…'}</Text>
        ) : null}
        <TouchableOpacity style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={onSubmit} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    gap: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: 'red',
  },
});
