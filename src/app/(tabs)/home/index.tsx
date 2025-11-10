import CoverItem from "@/components/home/CoverItem";
import Item from "@/components/home/Item";
import type { HomeScreenItem } from "@/db/helpers/homeScreen";
import { getUserByUsername } from "@/db/helpers/users";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { progressService } from "@/services/ProgressService";
import { useHome, useSettings } from "@/stores";
import { useFocusEffect } from "@react-navigation/native";
import { Stack } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from "react-native";

interface HomeSection {
  title: string;
  data: HomeScreenItem[];
  showProgress?: boolean;
}

export default function HomeScreen() {
  const { styles, colors, isDark } = useThemedStyles();
  const { username, isAuthenticated } = useAuth();
  const floatingPlayerPadding = useFloatingPlayerPadding();
  const { continueListening, downloaded, listenAgain, isLoadingHome, refreshHome } = useHome();
  const { homeLayout, updateHomeLayout } = useSettings();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Toggle between list and cover layout
  const toggleLayout = useCallback(() => {
    const newLayout = homeLayout === "list" ? "cover" : "list";
    updateHomeLayout(newLayout);
  }, [homeLayout, updateHomeLayout]);

  // Build sections array from home store data
  // For list layout: limit to 3 items per section
  // For cover layout: show all items with horizontal scrolling (up to 20 items per section for performance)
  const sections = useMemo<HomeSection[]>(() => {
    const newSections: HomeSection[] = [];
    const isCoverLayout = homeLayout === "cover";
    const MAX_COVER_ITEMS = 20; // Reasonable limit for performance
    const MAX_LIST_ITEMS = 3;

    if (continueListening.length > 0) {
      newSections.push({
        title: translate("home.sections.continueListening"),
        data: isCoverLayout
          ? continueListening.slice(0, MAX_COVER_ITEMS)
          : continueListening.slice(0, MAX_LIST_ITEMS),
        showProgress: true,
      });
    }

    if (downloaded.length > 0) {
      newSections.push({
        title: translate("home.sections.downloaded"),
        data: isCoverLayout
          ? downloaded.slice(0, MAX_COVER_ITEMS)
          : downloaded.slice(0, MAX_LIST_ITEMS),
        showProgress: false,
      });
    }

    if (listenAgain.length > 0) {
      newSections.push({
        title: translate("home.sections.listenAgain"),
        data: isCoverLayout
          ? listenAgain.slice(0, MAX_COVER_ITEMS)
          : listenAgain.slice(0, MAX_LIST_ITEMS),
        showProgress: false,
      });
    }

    return newSections;
  }, [continueListening, downloaded, listenAgain, homeLayout]);

  // Refresh home data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const refreshData = async () => {
        if (!username || !isAuthenticated) return;

        try {
          const user = await getUserByUsername(username);
          if (!user?.id) {
            console.error("[HomeScreen] No user found for username:", username);
            return;
          }

          // Fetch server progress before refreshing home data
          await progressService.fetchServerProgress();

          // Refresh home data (uses cache if still valid)
          await refreshHome(user.id);
        } catch (error) {
          console.error("[HomeScreen] Error refreshing home data:", error);
          Alert.alert(translate("common.error"), translate("home.errors.loadHomeData"));
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
        console.error("[HomeScreen] No user found for username:", username);
        return;
      }

      // Fetch server progress before refreshing
      await progressService.fetchServerProgress();

      // Force refresh home data
      await refreshHome(user.id, true);
    } catch (error) {
      console.error("[HomeScreen] Error refreshing:", error);
      Alert.alert(translate("common.error"), translate("home.errors.loadHomeData"));
    } finally {
      setIsRefreshing(false);
    }
  }, [username, isAuthenticated, refreshHome]);

  const renderSectionHeader = ({ section }: { section: HomeSection }) => (
    <View style={{ marginBottom: 12, marginTop: 20, paddingHorizontal: 16 }}>
      <Text
        style={[
          styles.text,
          {
            fontSize: 20,
            fontWeight: "700",
            backgroundColor: colors.background,
          },
        ]}
      >
        {section.title}
      </Text>
    </View>
  );

  // Memoize horizontal section container style
  const horizontalContentContainerStyle = useMemo(
    () => ({
      paddingHorizontal: 16,
    }),
    []
  );

  // Render horizontal scrolling section for cover layout
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

  // Header right control for layout toggle
  const headerRight = useCallback(() => {
    const buttonStyle = {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      marginRight: 8,
    };

    const textStyle = {
      color: isDark ? "#fff" : "#000",
      fontSize: 14,
    };

    return (
      <Pressable onPress={toggleLayout} style={buttonStyle}>
        <Text style={textStyle}>
          {homeLayout === "list" ? translate("common.cover") : translate("common.list")}
        </Text>
      </Pressable>
    );
  }, [homeLayout, toggleLayout, isDark]);

  if (isLoadingHome && sections.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.link} />
        <Text style={[styles.text, { marginTop: 12, opacity: 0.7 }]}>
          {translate("home.loading")}
        </Text>
      </View>
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
      <>
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
        <Stack.Screen options={{ headerRight }} />
      </>
    );
  }

  // Render cover layout with horizontal scrolling sections using SectionList
  if (homeLayout === "cover") {
    return (
      <>
        <ScrollView
          contentContainerStyle={[styles.flatListContainer, floatingPlayerPadding]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.link}
            />
          }
        >
          {sections.map((section) => (
            <View key={section.title}>
              {renderSectionHeader({ section })}
              {renderCoverSection({ section })}
            </View>
          ))}
        </ScrollView>
        <Stack.Screen options={{ headerRight }} />
      </>
    );
  }

  // Render default list layout
  return (
    <>
      <SectionList
        sections={sections}
        renderItem={Item}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.flatListContainer, floatingPlayerPadding]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.link} />
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
      <Stack.Screen options={{ headerRight }} />
    </>
  );
}
