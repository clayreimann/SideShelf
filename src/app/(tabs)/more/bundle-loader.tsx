/**
 * Bundle Loader Screen
 *
 * Allows TestFlight users to load custom JavaScript bundles from PR builds
 * for faster testing without requiring a full app rebuild.
 */

import { bundleService } from "@/services/BundleService";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { useSettings } from "@/stores";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

const log = logger.forTag("BundleLoader");

export default function BundleLoaderScreen() {
  const { colors, isDark } = useThemedStyles();
  const floatingPlayerPadding = useFloatingPlayerPadding();
  const { customUpdateUrl, updateCustomUpdateUrl } = useSettings();
  const localParams = useLocalSearchParams<{ url?: string }>();

  const [urlInput, setUrlInput] = useState(customUpdateUrl || "");
  const [isLoading, setIsLoading] = useState(false);
  const [bundleInfo, setBundleInfo] = useState<{
    updateId: string | null;
    channel: string | null;
    runtimeVersion: string;
    isEmbeddedLaunch: boolean;
  } | null>(null);
  const [updatesEnabled, setUpdatesEnabled] = useState(false);

  const textSecondary = isDark ? "#999999" : "#666666";
  const primaryColor = isDark ? "#4A9EFF" : "#007AFF";
  const errorColor = "#FF3B30";
  const successColor = "#34C759";

  // Handle deep link URL parameter
  useEffect(() => {
    const deepLinkUrl = localParams.url;

    if (deepLinkUrl && typeof deepLinkUrl === "string") {
      log.info(`Bundle Loader opened via deep link with URL: ${deepLinkUrl}`);

      // Pre-fill the URL input
      setUrlInput(deepLinkUrl);

      // Show confirmation dialog
      Alert.alert(
        "Load Bundle from Link?",
        `Would you like to configure this PR bundle?\n\n${deepLinkUrl}`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              log.info("User cancelled deep link bundle configuration");
            },
          },
          {
            text: "Save URL",
            onPress: async () => {
              try {
                await updateCustomUpdateUrl(deepLinkUrl);
                log.info(`Bundle URL saved from deep link: ${deepLinkUrl}`);
                Alert.alert(
                  "URL Saved",
                  "The bundle URL has been saved. Tap 'Check for Updates' to download the PR bundle."
                );
              } catch (error) {
                log.error("Failed to save bundle URL from deep link", error as Error);
                Alert.alert(
                  "Error",
                  "Failed to save the bundle URL. Please try entering it manually."
                );
              }
            },
          },
        ]
      );
    }
  }, [localParams.url, updateCustomUpdateUrl]);

  // Load bundle info on mount
  useEffect(() => {
    loadBundleInfo();
  }, []);

  const loadBundleInfo = async () => {
    try {
      const enabled = await bundleService.isUpdatesAvailable();
      setUpdatesEnabled(enabled);

      const info = await bundleService.getCurrentBundleInfo();
      setBundleInfo(info);
    } catch (error) {
      console.error("Failed to load bundle info", error);
    }
  };

  const handleSaveUrl = useCallback(async () => {
    try {
      // Basic URL validation
      if (urlInput && !urlInput.match(/^https?:\/\/.+/)) {
        Alert.alert("Invalid URL", "Please enter a valid HTTP or HTTPS URL");
        return;
      }

      await updateCustomUpdateUrl(urlInput || null);
      Alert.alert(
        "URL Saved",
        "The update URL has been saved to settings for reference. " +
          "To use this URL for updates, tap 'Switch to This URL' below."
      );
    } catch (error) {
      console.error("Failed to save URL", error);
      Alert.alert("Error", "Failed to save update URL");
    }
  }, [urlInput, updateCustomUpdateUrl]);

  const handleSwitchUrl = useCallback(async () => {
    if (!updatesEnabled) {
      Alert.alert(
        "Updates Disabled",
        "expo-updates is not enabled in this build. Dynamic URL switching requires a production build with updates configured."
      );
      return;
    }

    if (!urlInput || !urlInput.match(/^https?:\/\/.+/)) {
      Alert.alert("Invalid URL", "Please enter a valid HTTP or HTTPS URL");
      return;
    }

    Alert.alert(
      "Switch Update URL?",
      `This will configure the app to fetch updates from:\n\n${urlInput}\n\n` +
        "IMPORTANT: The app must be completely closed and relaunched for this to take effect. " +
        "Simply reloading is not sufficient.\n\n" +
        "Note: This requires disableAntiBrickingMeasures to be enabled in the build.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch URL",
          style: "destructive",
          onPress: async () => {
            try {
              setIsLoading(true);
              await bundleService.setUpdateURL(urlInput);
              await updateCustomUpdateUrl(urlInput);
              log.info(`Update URL switched to: ${urlInput}`);

              Alert.alert(
                "URL Switched",
                "The update URL has been changed. You MUST completely close and relaunch the app " +
                  "(kill it from the app switcher, then reopen it). After relaunching, tap 'Check for Updates'.",
                [{ text: "OK" }]
              );
            } catch (error) {
              log.error("Failed to switch update URL", error as Error);
              Alert.alert(
                "Error",
                `Failed to switch update URL: ${error}\n\n` +
                  "This feature requires the build to have 'disableAntiBrickingMeasures: true' enabled."
              );
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  }, [urlInput, updatesEnabled, updateCustomUpdateUrl]);

  const handleCheckForUpdate = useCallback(async () => {
    if (!updatesEnabled) {
      Alert.alert(
        "Updates Disabled",
        "expo-updates is not enabled in this build. Updates can only be loaded in production builds with updates configured."
      );
      return;
    }

    setIsLoading(true);
    try {
      const result = await bundleService.checkForUpdate();

      if (result.isAvailable && result.manifest) {
        Alert.alert(
          "Update Available",
          `A new update is available (ID: ${result.manifest.id}). Would you like to download it?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Download", onPress: handleDownloadUpdate },
          ]
        );
      } else {
        Alert.alert("No Updates", "No updates are currently available");
      }
    } catch (error) {
      console.error("Failed to check for update", error);
      Alert.alert("Error", `Failed to check for updates: ${error}`);
    } finally {
      setIsLoading(false);
    }
  }, [updatesEnabled]);

  const handleDownloadUpdate = async () => {
    setIsLoading(true);
    try {
      const result = await bundleService.fetchAndApplyUpdate();

      if (result.needsReload) {
        Alert.alert(
          "Update Downloaded",
          "A new update has been downloaded. The app will now reload to apply it.",
          [{ text: "Reload", onPress: handleReload }]
        );
      } else {
        Alert.alert("Already Updated", "The latest update is already installed");
      }
    } catch (error) {
      console.error("Failed to download update", error);
      Alert.alert("Error", `Failed to download update: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReload = async () => {
    try {
      await bundleService.reloadApp();
    } catch (error) {
      console.error("Failed to reload app", error);
      Alert.alert("Error", `Failed to reload app: ${error}`);
    }
  };

  const handleClearUrl = useCallback(async () => {
    setUrlInput("");
    await updateCustomUpdateUrl(null);
  }, [updateCustomUpdateUrl]);

  return (
    <>
      <Stack.Screen options={{ title: "Bundle Loader" }} />

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={floatingPlayerPadding}
      >
        {/* Info Section */}
        <View style={{ padding: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textSecondary,
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            Current Bundle Info
          </Text>

          <View
            style={{
              backgroundColor: isDark ? "#1C1C1E" : "#F5F5F5",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <InfoRow
              label="Updates Enabled"
              value={updatesEnabled ? "Yes" : "No"}
              valueColor={updatesEnabled ? successColor : errorColor}
            />
            <InfoRow label="Runtime Version" value={bundleInfo?.runtimeVersion || "Unknown"} />
            <InfoRow label="Update ID" value={bundleInfo?.updateId || "Embedded"} />
            <InfoRow label="Channel" value={bundleInfo?.channel || "None"} />
            <InfoRow
              label="Launch Type"
              value={bundleInfo?.isEmbeddedLaunch ? "Embedded" : "Update"}
            />
          </View>
        </View>

        {/* Update URL Section */}
        <View style={{ padding: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textSecondary,
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            Custom Update URL
          </Text>

          <Text
            style={{
              fontSize: 13,
              color: textSecondary,
              marginBottom: 12,
              lineHeight: 18,
            }}
          >
            You can now dynamically switch the update URL at runtime without rebuilding. Enter a PR
            bundle URL and tap "Switch to This URL" to load updates from that source.
            {"\n\n"}
            Note: Requires disableAntiBrickingMeasures enabled in the build. You must completely
            close and relaunch the app after switching.
          </Text>

          <TextInput
            style={{
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 10,
              padding: 12,
              color: colors.textPrimary,
              fontSize: 15,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: isDark ? "#3A3A3C" : "#C7C7CC",
            }}
            placeholder="https://example.com/bundles/pr-123"
            placeholderTextColor={textSecondary}
            value={urlInput}
            onChangeText={setUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={handleSaveUrl}
              style={{
                flex: 1,
                backgroundColor: primaryColor,
                borderRadius: 10,
                padding: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>Save URL</Text>
            </Pressable>

            <Pressable
              onPress={handleClearUrl}
              style={{
                backgroundColor: isDark ? "#1C1C1E" : "#F5F5F5",
                borderRadius: 10,
                padding: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: isDark ? "#3A3A3C" : "#C7C7CC",
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
                Clear
              </Text>
            </Pressable>
          </View>

          <Text
            style={{
              fontSize: 13,
              color: textSecondary,
              marginTop: 16,
              marginBottom: 8,
              lineHeight: 18,
            }}
          >
            Dynamic URL Switching (SDK 52+)
          </Text>

          <Pressable
            onPress={handleSwitchUrl}
            disabled={isLoading || !updatesEnabled}
            style={{
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 10,
              padding: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: primaryColor,
              opacity: isLoading || !updatesEnabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: primaryColor, fontSize: 15, fontWeight: "600" }}>
              Switch to This URL
            </Text>
          </Pressable>
        </View>

        {/* Actions Section */}
        <View style={{ padding: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textSecondary,
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            Actions
          </Text>

          <Pressable
            onPress={handleCheckForUpdate}
            disabled={isLoading}
            style={{
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 10,
              padding: 16,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: isDark ? "#3A3A3C" : "#C7C7CC",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {isLoading && (
                <ActivityIndicator size="small" color={primaryColor} style={{ marginRight: 12 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
                  Check for Updates
                </Text>
                <Text style={{ color: textSecondary, fontSize: 13, marginTop: 4 }}>
                  Check if a new bundle is available
                </Text>
              </View>
            </View>
          </Pressable>

          <Pressable
            onPress={handleReload}
            disabled={isLoading || !updatesEnabled}
            style={{
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 10,
              padding: 16,
              borderWidth: 1,
              borderColor: isDark ? "#3A3A3C" : "#C7C7CC",
              opacity: isLoading || !updatesEnabled ? 0.5 : 1,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
                Reload App
              </Text>
              <Text style={{ color: textSecondary, fontSize: 13, marginTop: 4 }}>
                Restart the app to apply downloaded updates
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Help Section */}
        <View style={{ padding: 16, paddingBottom: 32 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textSecondary,
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            Requirements
          </Text>

          <View
            style={{
              backgroundColor: isDark ? "#1C1C1E" : "#F5F5F5",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <Text style={{ color: textSecondary, fontSize: 13, lineHeight: 20 }}>
              How Dynamic URL Switching Works:
              {"\n\n"}
              1. Enter a PR bundle URL (e.g., GitHub Pages)
              {"\n"}
              2. Tap "Switch to This URL" to configure runtime override
              {"\n"}
              3. Close app completely and relaunch (kill from app switcher)
              {"\n"}
              4. Tap "Check for Updates" to fetch from new URL
              {"\n"}
              5. Runtime version must match exactly
              {"\n"}
              6. Updates download in background, apply on reload
              {"\n\n"}
              Requirements:
              {"\n"}- Build must have disableAntiBrickingMeasures: true
              {"\n"}- Intended for preview/TestFlight builds only
              {"\n"}- Not recommended for production (no embedded fallback)
              {"\n\n"}
              See docs/architecture/OTA_UPDATES.md for details.
            </Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { colors } = useThemedStyles();

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{label}</Text>
      <Text
        style={{
          color: valueColor || colors.textSecondary,
          fontSize: 14,
          fontWeight: valueColor ? "600" : "400",
        }}
      >
        {value}
      </Text>
    </View>
  );
}
