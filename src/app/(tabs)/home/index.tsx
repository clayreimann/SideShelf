import CoverItem from "@/components/home/CoverItem";
import { SkeletonSection } from "@/components/home/SkeletonSection";
import type { HomeScreenItem } from "@/db/helpers/homeScreen";
import { getUserByUsername } from "@/db/helpers/users";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { getLastHomeSectionCount, setLastHomeSectionCount } from "@/lib/appSettings";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { progressService } from "@/services/ProgressService";
import { useHome, useNetwork } from "@/stores";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import performance from "react-native-performance";

interface HomeSection {
  title: string;
  data: HomeScreenItem[];
  showProgress?: boolean;
}

const MAX_COVER_ITEMS = 20;

export default function HomeScreen() {
  const { styles, colors, isDark } = useThemedStyles();
  const { username, isAuthenticated } = useAuth();
  const floatingPlayerPadding = useFloatingPlayerPadding();
  const { continueListening, downloaded, listenAgain, isLoadingHome, initialized, refreshHome } =
    useHome();
  const { serverReachable } = useNetwork();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [skeletonSectionCount, setSkeletonSectionCount] = useState(3);
  // Debounced "empty confirmed" gate — prevents the empty state from flashing
  // during brief windows where sections=[] but a load is about to start or
  // a concurrent load will shortly populate data. Only flips true after
  // sections=[], isLoadingHome=false, and initialized=true have all been
  // stable for 500ms with no new load starting to cancel the timer.
  const [emptyConfirmed, setEmptyConfirmed] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;

  const sections = useMemo<HomeSection[]>(() => {
    const newSections: HomeSection[] = [];

    if (continueListening.length > 0) {
      newSections.push({
        title: translate("home.sections.continueListening"),
        data: continueListening.slice(0, MAX_COVER_ITEMS),
        showProgress: true,
      });
    }

    if (downloaded.length > 0) {
      newSections.push({
        title: translate("home.sections.downloaded"),
        data: downloaded.slice(0, MAX_COVER_ITEMS),
        showProgress: false,
      });
    }

    if (listenAgain.length > 0) {
      newSections.push({
        title: translate("home.sections.listenAgain"),
        data: listenAgain.slice(0, MAX_COVER_ITEMS),
        showProgress: false,
      });
    }

    return newSections;
  }, [continueListening, downloaded, listenAgain]);

  // Load cached section count on mount so skeleton has the right number of rows
  useEffect(() => {
    getLastHomeSectionCount()
      .then(setSkeletonSectionCount)
      .catch(() => {});
  }, []);

  // Persist section count after real data arrives
  useEffect(() => {
    if (sections.length > 0) {
      setLastHomeSectionCount(sections.length).catch(() => {});
    }
  }, [sections.length]);

  // Fade real content in when loading completes and sections are present
  useEffect(() => {
    if (!isLoadingHome && sections.length > 0) {
      performance.mark("screenInteractive");
      contentOpacity.setValue(0);
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoadingHome, sections.length]);

  // Transition to empty state only after sections=[], !isLoadingHome, initialized
  // have all been stable for 500ms. Any new load (isLoadingHome→true) or data
  // arrival (sections.length>0) cancels the timer and resets to skeleton.
  useEffect(() => {
    if (sections.length > 0 || isLoadingHome || !initialized) {
      setEmptyConfirmed(false);
      return;
    }
    const t = setTimeout(() => setEmptyConfirmed(true), 500);
    return () => clearTimeout(t);
  }, [sections.length, isLoadingHome, initialized]);

  // Refresh home data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setEmptyConfirmed(false);

      const refreshData = async () => {
        if (!username || !isAuthenticated || !serverReachable) return;

        try {
          const user = await getUserByUsername(username);
          if (!user?.id) {
            console.error("[HomeScreen] No user found for username:", username);
            return;
          }

          await progressService.fetchServerProgress();
          await refreshHome(user.id);
        } catch (error) {
          console.error("[HomeScreen] Error refreshing home data:", error);
          Alert.alert(translate("common.error"), translate("home.errors.loadHomeData"));
        }
      };

      refreshData();
    }, [username, isAuthenticated, serverReachable, refreshHome])
  );

  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    if (!username || !isAuthenticated || !serverReachable) return;

    setIsRefreshing(true);

    try {
      const user = await getUserByUsername(username);
      if (!user?.id) {
        console.error("[HomeScreen] No user found for username:", username);
        return;
      }

      await progressService.fetchServerProgress();
      await refreshHome(user.id, true);
    } catch (error) {
      console.error("[HomeScreen] Error refreshing:", error);
      Alert.alert(translate("common.error"), translate("home.errors.loadHomeData"));
    } finally {
      setIsRefreshing(false);
    }
  }, [username, isAuthenticated, serverReachable, refreshHome]);

  const renderSectionHeader = ({ section }: { section: HomeSection }) => (
    <View style={{ marginBottom: 12, marginTop: 20, paddingHorizontal: 16 }}>
      <Text
        style={[
          styles.text,
          { fontSize: 20, fontWeight: "700", backgroundColor: colors.background },
        ]}
      >
        {section.title}
      </Text>
    </View>
  );

  const horizontalContentContainerStyle = useMemo(() => ({ paddingHorizontal: 16 }), []);

  const renderCoverSection = useCallback(
    ({ section }: { section: HomeSection }) => {
      try {
        return (
          <FlatList
            data={section.data}
            renderItem={({ item }) => <CoverItem item={item} showProgress={section.showProgress} />}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={horizontalContentContainerStyle}
          />
        );
      } catch (error) {
        console.error("[HomeScreen] Error rendering cover section:", error);
        return null;
      }
    },
    [horizontalContentContainerStyle]
  );

  if (sections.length === 0 && !emptyConfirmed) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        scrollEnabled={false}
        contentContainerStyle={floatingPlayerPadding}
      >
        {Array.from({ length: skeletonSectionCount }).map((_, i) => (
          <SkeletonSection key={i} isDark={isDark} />
        ))}
      </ScrollView>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.text}>{translate("home.requireLogin")}</Text>
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text
          style={[
            styles.text,
            { fontSize: 18, textAlign: "center", opacity: 0.7, paddingHorizontal: 16 },
          ]}
        >
          {translate("home.emptyState")}
        </Text>
      </View>
    );
  }

  return (
    <Animated.View style={{ flex: 1, opacity: contentOpacity }}>
      <ScrollView
        contentContainerStyle={[styles.flatListContainer, floatingPlayerPadding]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.link} />
        }
      >
        {sections.map((section) => (
          <View key={section.title}>
            {renderSectionHeader({ section })}
            {renderCoverSection({ section })}
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}
