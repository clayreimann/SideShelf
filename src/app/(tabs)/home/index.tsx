import Item from '@/components/home/Item';
import { getHomeScreenData, getItemsWithProgressNeedingFullRefresh, type HomeScreenItem } from '@/db/helpers/homeScreen';
import { getUserByUsername } from '@/db/helpers/users';
import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { libraryItemBatchService } from '@/services/libraryItemBatchService';
import { unifiedProgressService } from '@/services/UnifiedProgressService';
import { usePlayer } from '@/stores';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
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
  const { currentTrack } = usePlayer();
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadHomeData = useCallback(async (showLoading = true) => {
    if (!username || !isAuthenticated) return;

    if (showLoading) setIsLoading(true);

    try {
      // Get current user from database
      const user = await getUserByUsername(username);
      if (!user?.id) {
        console.error('[HomeScreen] No user found for username:', username);
        return;
      }

      await unifiedProgressService.fetchServerProgress();

      // Get home screen data
      const data = await getHomeScreenData(user.id);

      // Build sections array
      const newSections: HomeSection[] = [];

      if (data.continueListening.length > 0) {
        newSections.push({
          title: 'Continue Listening',
          data: data.continueListening,
        });
      }

      if (data.downloaded.length > 0) {
        newSections.push({
          title: 'Downloaded',
          data: data.downloaded,
        });
      }

      if (data.listenAgain.length > 0) {
        newSections.push({
          title: 'Listen Again',
          data: data.listenAgain,
        });
      }

      setSections(newSections);

      // Process items with progress in the background
      const itemsNeedingRefresh = await getItemsWithProgressNeedingFullRefresh(user.id);
      if (itemsNeedingRefresh.length > 0) {
        console.log(`[HomeScreen] Found ${itemsNeedingRefresh.length} items needing full refresh`);
        libraryItemBatchService.processItemsWithProgress(user.id, itemsNeedingRefresh)
          .catch(error => {
            console.error('[HomeScreen] Error processing items with progress:', error);
          });
      }

    } catch (error) {
      console.error('[HomeScreen] Error loading home data:', error);
      Alert.alert('Error', 'Failed to load home screen data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [username, isAuthenticated]);

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [loadHomeData])
  );

  // Start background processing when component mounts
  useEffect(() => {
    const startBackgroundProcessing = async () => {
      if (username && isAuthenticated) {
        const user = await getUserByUsername(username);
        if (user?.id) {
          libraryItemBatchService.startBackgroundProcessing(user.id);
        }
      }
    };
    startBackgroundProcessing();
  }, [username, isAuthenticated]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadHomeData(false);
  }, [loadHomeData]);

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

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.link} />
        <Text style={[styles.text, { marginTop: 12, opacity: 0.7 }]}>
          Loading your library...
        </Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.text}>Please log in to view your library</Text>
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.text, { fontSize: 18, textAlign: 'center', opacity: 0.7 }]}>
          Welcome to your library!{'\n\n'}
          Your books will appear here as you start listening to them.
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
      contentContainerStyle={[styles.flatListContainer, { paddingBottom: currentTrack ? 160 : 100 } ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.link}
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}
