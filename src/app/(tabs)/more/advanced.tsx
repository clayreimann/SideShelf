import { statisticsHelpers } from "@/db/helpers";
import { clearAllLocalCovers } from "@/db/helpers/localData";
import { getDeviceInfo } from "@/lib/api/endpoints";
import { clearAllCoverCache } from "@/lib/covers";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useDb } from "@/providers/DbProvider";
import { useLibrary } from "@/stores";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";

type Section = {
  title: string;
  data: ActionItem[];
};

type ActionItem = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function AdvancedScreen() {
  const { styles, isDark } = useThemedStyles();
  const { accessToken, logout } = useAuth();
  const { refresh, selectedLibrary, libraries } = useLibrary();
  const { resetDatabase } = useDb();
  const [counts, setCounts] = useState({
    authors: 0,
    genres: 0,
    languages: 0,
    narrators: 0,
    series: 0,
    tags: 0,
  });
  const [deviceInfo, setDeviceInfo] = useState<{
    osName: string;
    osVersion: string;
    deviceName: string;
    deviceType: string;
    manufacturer: string;
    model: string;
    sdkVersion: number | undefined;
    clientName: string;
    clientVersion: string;
    deviceId: string;
  } | null>(null);

  const refreshCounts = useCallback(async () => {
    try {
      const newCounts = await statisticsHelpers.getAllCounts();
      setCounts(newCounts);
    } catch (error) {
      console.error("Failed to fetch counts:", error);
    }
  }, []);

  const clearCoverCache = useCallback(async () => {
    try {
      await clearAllCoverCache();
      await clearAllLocalCovers();
      console.log("Cover cache and database imageUrls cleared successfully");
    } catch (error) {
      console.error("Failed to clear cover cache:", error);
    }
  }, []);

  const refreshDeviceInfo = useCallback(async () => {
    try {
      const info = await getDeviceInfo();
      setDeviceInfo(info);
    } catch (error) {
      console.error("Failed to fetch device info:", error);
    }
  }, []);

  useEffect(() => {
    refreshCounts();
    refreshDeviceInfo();
  }, [refreshCounts, refreshDeviceInfo]);

  const sections = useMemo<Section[]>(() => {
    const infoSection: Section = {
      title: "DB Info",
      data: [
        {
          label: `Libraries found: ${libraries.length}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Selected library: ${selectedLibrary?.name}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Authors: ${counts.authors}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Genres: ${counts.genres}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Languages: ${counts.languages}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Narrators: ${counts.narrators}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Series: ${counts.series}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Tags: ${counts.tags}`,
          onPress: () => {},
          disabled: true,
        },
      ],
    };
    const deviceInfoSection: Section = {
      title: "Device Info",
      data: [
        {
          label: `Device: ${deviceInfo?.deviceName ?? "N/A"}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `OS: ${deviceInfo?.osName ?? "Unknown"} ${
            deviceInfo?.osVersion ?? "v?.?"
          }`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Type: ${deviceInfo?.deviceType ?? "N/A"}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Manufacturer: ${deviceInfo?.manufacturer ?? "N/A"}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Model: ${deviceInfo?.model ?? "N/A"}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `SDK Version: ${deviceInfo?.sdkVersion ?? "N/A"}`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Client: ${deviceInfo?.clientName ?? "Unknown"} ${
            deviceInfo?.clientVersion ?? "v?.?"
          }`,
          onPress: () => {},
          disabled: true,
        },
        {
          label: `Device ID: ${deviceInfo?.deviceId}`,
          onPress: async () => {
            const { setStringAsync } = await import("expo-clipboard");
            await setStringAsync(deviceInfo?.deviceId ?? "");
          },
          disabled: false,
        },
      ],
    };
    const actionsSection: Section = {
      title: "Actions",
      data: [
        {
          label: "Copy access token to clipboard",
          onPress: async () => {
            const { setStringAsync } = await import("expo-clipboard");
            if (accessToken) {
              await setStringAsync(accessToken);
            }
          },
          disabled: !accessToken,
        },
        {
          label: "Refresh libraries and items",
          onPress: refresh,
          disabled: false,
        },
        {
          label: "Refresh counts",
          onPress: refreshCounts,
          disabled: false,
        },
        {
          label: "Clear cover cache",
          onPress: clearCoverCache,
          disabled: false,
        },
        {
          label: "Reset app",
          onPress: async () => {
            resetDatabase()
            await clearCoverCache()
            // await clearAllDownloads()
            await logout()
          },
          disabled: false,
        },
      ],
    };
    return [actionsSection, infoSection, deviceInfoSection];
  }, [
    selectedLibrary,
    libraries,
    counts,
    deviceInfo,
    refresh,
    refreshCounts,
    resetDatabase,
    accessToken,
    clearCoverCache,
  ]);

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item.label + index}
        renderSectionHeader={({ section: { title } }) => (
          <View style={{marginBottom: 12, marginTop: 20, paddingHorizontal: 16}}>
            <Text style={{...styles.text, fontWeight: 'bold', fontSize: 18}}>{title}</Text>
          </View>
        )}
        renderItem={({ item }: { item: ActionItem }) => (
          <View style={styles.listItem}>
            <Pressable onPress={item.onPress} disabled={item.disabled}>
              <Text style={styles.text}>{item.label}</Text>
            </Pressable>
          </View>
        )}
        contentContainerStyle={styles.flatListContainer}
        indicatorStyle={isDark ? "white" : "black"}
      />
      <Stack.Screen options={{ title: "Advanced" }} />
    </>
  );
}
