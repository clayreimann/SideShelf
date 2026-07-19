import { translate } from "@/i18n";
import { doPing } from "@/lib/api/endpoints";
import { getPostLoginNavigation } from "@/lib/authNavigation";
import { isInsecureLoginUrl } from "@/lib/helpers/networkAddress";
import { useThemedStyles } from "@/lib/theme";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../providers/AuthProvider";

export default function LoginModal() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { colors } = useThemedStyles();
  const {
    initialized,
    isAuthenticated,
    serverUrl,
    username: usernameFromAuth,
    authStatus,
    login,
  } = useAuth();
  const [didPing, setDidPing] = useState(false);
  const [baseUrl, setBaseUrl] = useState(serverUrl ?? "");
  const [username, setUsername] = useState(usernameFromAuth ?? "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateBaseUrl = useCallback(
    (url: string) => {
      if (url === baseUrl) return;
      if (`${url}:13378` === baseUrl) {
        setBaseUrl(url);
      } else {
        setBaseUrl(url);
        setDidPing(false);
      }
    },
    [baseUrl]
  );

  const tryPing = useCallback(async () => {
    if (baseUrl) {
      console.log("[login] Pinging", baseUrl);
      const ping = await doPing({ baseUrl });
      if (ping) {
        setDidPing(true);
        return;
      }

      // Don't append default port if URL already contains a port number
      if (/:\d+$/.test(baseUrl)) return;
      const withPort = `${baseUrl}:13378`;
      const pingWithPort = await doPing({ baseUrl: withPort });
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
      if (getPostLoginNavigation(mode) === "dismiss") {
        console.log("[login] Authenticated via modal, dismissing sheet");
        router.back();
      } else {
        console.log("[login] Authenticated, navigating to tabs");
        router.replace("/");
      }
    }
  }, [initialized, isAuthenticated, mode, router]);

  const canSubmit = useMemo(() => {
    return !!baseUrl && !!username && !!password && !submitting && didPing;
  }, [baseUrl, username, password, submitting, didPing]);

  async function performLogin() {
    setSubmitting(true);
    setError(null);
    try {
      console.log("[login] Submitting login", {
        baseUrl,
        username: username ? "<provided>" : "<empty>",
      });
      await login({ serverUrl: baseUrl, username, password });
      console.log("[login] Success");
      // Navigation is handled by the useEffect below reacting to isAuthenticated becoming true.
      // Do not call router.replace here — it races with that effect and causes a double-navigation
      // that triggers "Maximum update depth exceeded" via Stack.Screen setOptions.
    } catch (e: any) {
      console.log("[login] Error", e);
      const message = e?.message || translate("auth.loginFailed");
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit() {
    if (!canSubmit) return;

    if (isInsecureLoginUrl(baseUrl)) {
      Alert.alert(translate("auth.insecureLogin.title"), translate("auth.insecureLogin.message"), [
        { text: translate("common.cancel"), style: "cancel" },
        {
          text: translate("auth.insecureLogin.continue"),
          style: "destructive",
          onPress: () => {
            void performLogin();
          },
        },
      ]);
      return;
    }

    void performLogin();
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <Stack.Screen options={{ headerTitle: translate("auth.signIn") }} />
      <View style={styles.content}>
        <Text style={{ ...styles.title, color: colors.textPrimary }}>
          {authStatus === "reauthRequired"
            ? translate("auth.sessionExpired")
            : translate("auth.connectToAudiobookshelf")}
        </Text>
        <TextInput
          testID="login-server-url-input"
          placeholder={translate("auth.serverUrlPlaceholder")}
          accessibilityLabel={translate("accessibility.serverUrl")}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ ...styles.input, color: colors.textPrimary, borderColor: colors.separator }}
          value={baseUrl}
          onChangeText={setBaseUrl}
          onBlur={tryPing}
          keyboardType="url"
          textContentType="URL"
        />
        <TextInput
          testID="login-username-input"
          placeholder={translate("auth.usernamePlaceholder")}
          accessibilityLabel={translate("accessibility.username")}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ ...styles.input, color: colors.textPrimary, borderColor: colors.separator }}
          value={username}
          onChangeText={setUsername}
          textContentType="username"
        />
        <TextInput
          testID="login-password-input"
          placeholder={translate("auth.passwordPlaceholder")}
          accessibilityLabel={translate("accessibility.password")}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{ ...styles.input, color: colors.textPrimary, borderColor: colors.separator }}
          value={password}
          onSubmitEditing={onSubmit}
          onChangeText={setPassword}
          textContentType="password"
        />
        {error ? (
          <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {baseUrl ? (
          <Text style={{ color: colors.textPrimary, textAlign: "center" }}>
            {didPing ? translate("auth.connectedToServer") : translate("auth.searchingForServer")}
          </Text>
        ) : null}
        <TouchableOpacity
          testID="login-button"
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={translate("auth.signIn")}
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{translate("auth.signIn")}</Text>
          )}
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
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: "#007bff",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  error: {
    color: "red",
  },
});
