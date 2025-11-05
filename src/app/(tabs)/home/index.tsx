import Item from '@/components/home/Item';
import type { HomeScreenItem } from '@/db/helpers/homeScreen';
import { getUserByUsername } from '@/db/helpers/users';
import { useFloatingPlayerPadding } from '@/hooks/useFloatingPlayerPadding';
import { translate } from '@/i18n';
import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { progressService } from '@/services/ProgressService';
import { useHome } from '@/stores';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    SectionList,
    Text,
    View
} from "react-native";

interface HomeSection {
  title: string;
  data: HomeScreenItem[];
}

export default function HomeScreen() {
  const { styles, colors } = useThemedStyles();
  const { username, isAuthenticated } = useAuth();
  const floatingPlayerPadding = useFloatingPlayerPadding();
  const { continueListening, downloaded, listenAgain, isLoadingHome, refreshHome } = useHome();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Build sections array from home store data
  const sections = useMemo<HomeSection[]>(() => {
    const newSections: HomeSection[] = [];

    if (continueListening.length > 0) {
      newSections.push({
        title: translate('home.sections.continueListening'),
        data: continueListening.slice(0, 3),
      });
    }

    if (downloaded.length > 0) {
      newSections.push({
        title: translate('home.sections.downloaded'),
        data: downloaded.slice(0, 3),
      });
    }

    if (listenAgain.length > 0) {
      newSections.push({
        title: translate('home.sections.listenAgain'),
        data: listenAgain.slice(0, 3),
      });
    }

    return newSections;
  }, [continueListening, downloaded, listenAgain]);

  // Refresh home data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const refreshData = async () => {
        if (!username || !isAuthenticated) return;

        try {
          const user = await getUserByUsername(username);
          if (!user?.id) {
            console.error('[HomeScreen] No user found for username:', username);
            return;
          }

          // Fetch server progress before refreshing home data
          await progressService.fetchServerProgress();

          // Refresh home data (uses cache if still valid)
          await refreshHome(user.id);
        } catch (error) {
          console.error('[HomeScreen] Error refreshing home data:', error);
          Alert.alert(
            translate('common.error'),
            translate('home.errors.loadHomeData')
          );
        }
      };

      refreshData();
    }, [username, isAuthenticated, refreshHome])
  );


  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    if (!username || !isAuthenticated) return;

    setIsRefreshing(true);

    try {
      const user = await getUserByUsername(username);
      if (!user?.id) {
        console.error('[HomeScreen] No user found for username:', username);
        return;
      }

      // Fetch server progress before refreshing
      await progressService.fetchServerProgress();

      // Force refresh home data
      await refreshHome(user.id, true);
    } catch (error) {
      console.error('[HomeScreen] Error refreshing:', error);
      Alert.alert(
        translate('common.error'),
        translate('home.errors.loadHomeData')
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [username, isAuthenticated, refreshHome]);

  const renderSectionHeader = ({ section }: { section: HomeSection }) => (
    <View style={{ marginBottom: 12, marginTop: 20, paddingHorizontal: 16 }}>
      <Text style={[styles.text, {
        fontSize: 20,
        fontWeight: '700',
        backgroundColor: colors.background
      }]}>
        {section.title}
      </Text>
    </View>
  );

  if (isLoadingHome && sections.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.link} />
        <Text style={[styles.text, { marginTop: 12, opacity: 0.7 }]}>
          {translate('home.loading')}
        </Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.text}>{translate('home.requireLogin')}</Text>
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.text, { fontSize: 18, textAlign: 'center', opacity: 0.7, paddingHorizontal: 16 }]}>
          {translate('home.emptyState')}
        </Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      renderItem={Item}
      renderSectionHeader={renderSectionHeader}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.flatListContainer, floatingPlayerPadding]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.link}
        />
      }
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
    />
  );
}
