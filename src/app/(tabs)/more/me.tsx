import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { spacing } from "@/lib/styles";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useUserProfile } from "@/stores";
import { Stack } from "expo-router";
import { useMemo } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";

type Section = {
  title: string;
  data: { label: string; value?: string }[];
};

export default function AboutMeScreen() {
  const { styles } = useThemedStyles();
  const { username, serverUrl } = useAuth();
  const { deviceInfo } = useUserProfile();
  const floatingPlayerPadding = useFloatingPlayerPadding();

  const sections = useMemo<Section[]>(
    () => [
      {
        title: translate("aboutMe.sections.account"),
        data: [
          { label: translate("aboutMe.account.user"), value: username || undefined },
          { label: translate("aboutMe.account.server"), value: serverUrl || undefined },
        ],
      },
      {
        title: translate("aboutMe.sections.deviceInfo"),
        data: [
          {
            label: translate("aboutMe.device.device"),
            value: deviceInfo?.deviceName ?? translate("aboutMe.device.notAvailable"),
          },
          {
            label: translate("aboutMe.device.os"),
            value: `${deviceInfo?.osName ?? translate("aboutMe.device.osUnknown")} ${deviceInfo?.osVersion ?? translate("aboutMe.device.osVersion")}`,
          },
          {
            label: translate("aboutMe.device.type"),
            value: deviceInfo?.deviceType ?? translate("aboutMe.device.notAvailable"),
          },
          {
            label: translate("aboutMe.device.manufacturer"),
            value: deviceInfo?.manufacturer ?? translate("aboutMe.device.notAvailable"),
          },
          {
            label: translate("aboutMe.device.model"),
            value: deviceInfo?.model ?? translate("aboutMe.device.notAvailable"),
          },
          {
            label: translate("aboutMe.device.sdkVersion"),
            value: String(deviceInfo?.sdkVersion ?? translate("aboutMe.device.notAvailable")),
          },
          {
            label: translate("aboutMe.device.client"),
            value: `${deviceInfo?.clientName ?? translate("aboutMe.device.osUnknown")} ${deviceInfo?.clientVersion ?? translate("aboutMe.device.osVersion")}`,
          },
          {
            label: translate("aboutMe.device.deviceId"),
            value: deviceInfo?.deviceId ?? translate("aboutMe.device.notAvailable"),
          },
        ],
      },
    ],
    [username, serverUrl, deviceInfo]
  );

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item.label + index}
        renderSectionHeader={({ section: { title } }) => (
          <View style={componentStyles.sectionHeader}>
            <Text style={[styles.text, componentStyles.sectionHeaderText]}>{title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Text style={styles.text}>
              {item.label}: {item.value}
            </Text>
          </View>
        )}
        contentContainerStyle={[styles.flatListContainer, floatingPlayerPadding]}
        stickySectionHeadersEnabled={false}
      />
      <Stack.Screen options={{ title: translate("aboutMe.title") }} />
    </>
  );
}

const componentStyles = StyleSheet.create({
  sectionHeader: {
    marginBottom: spacing.md,
    marginTop: 20,
    paddingHorizontal: spacing.lg,
  },
  sectionHeaderText: {
    fontWeight: "bold",
    fontSize: 18,
  },
});
