import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useUserProfile } from '@/stores';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, Text, View } from 'react-native';

type Section = {
  title: string;
  data: { label: string; value?: string }[];
};

export default function AboutMeScreen() {
  const { styles } = useThemedStyles();
  const { username, serverUrl } = useAuth();
  const { deviceInfo } = useUserProfile();

  const sections = useMemo<Section[]>(() => [
    {
      title: 'Account',
      data: [
        { label: 'User', value: username || undefined },
        { label: 'Server', value: serverUrl || undefined },
      ],
    },
    {
      title: 'Device Info',
      data: [
        { label: 'Device', value: deviceInfo?.deviceName ?? 'N/A' },
        { label: 'OS', value: `${deviceInfo?.osName ?? 'Unknown'} ${deviceInfo?.osVersion ?? 'v?.?'}` },
        { label: 'Type', value: deviceInfo?.deviceType ?? 'N/A' },
        { label: 'Manufacturer', value: deviceInfo?.manufacturer ?? 'N/A' },
        { label: 'Model', value: deviceInfo?.model ?? 'N/A' },
        { label: 'SDK Version', value: String(deviceInfo?.sdkVersion ?? 'N/A') },
        { label: 'Client', value: `${deviceInfo?.clientName ?? 'Unknown'} ${deviceInfo?.clientVersion ?? 'v?.?'}` },
        { label: 'Device ID', value: deviceInfo?.deviceId ?? 'N/A' },
      ],
    },
  ], [username, serverUrl, deviceInfo]);

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
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Text style={styles.text}>{item.label}: {item.value}</Text>
          </View>
        )}
        contentContainerStyle={[styles.flatListContainer, { paddingBottom: 80 }]}
        stickySectionHeadersEnabled={false}
      />
      <Stack.Screen options={{ title: 'About Me' }} />
    </>
  );
}
