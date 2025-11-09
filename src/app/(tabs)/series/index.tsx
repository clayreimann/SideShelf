import { HeaderControls, SortMenu } from "@/components/ui";
import { SeriesListRow } from "@/db/helpers/series";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { SeriesSortField, useSeries } from "@/stores";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import CoverImage from "@/components/ui/CoverImange";

export default function SeriesScreen() {
  const { styles, isDark, colors } = useThemedStyles();
  const { items, isInitializing, ready, refetchSeries, sortConfig, setSortConfig } = useSeries();
  const [showSortMenu, setShowSortMenu] = useState(false);
  const router = useRouter();

  // Load series when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (ready && items.length === 0 && !isInitializing) {
        refetchSeries();
      }
    }, [ready, items.length, isInitializing, refetchSeries])
  );

  const controls = useCallback(
    () => (
      <HeaderControls isDark={isDark} onSort={() => setShowSortMenu(true)} showViewToggle={false} />
    ),
    [isDark]
  );

  // Series sort options
  const seriesSortOptions = [
    { field: "name" as SeriesSortField, label: translate("series.sortOptions.name") },
    { field: "bookCount" as SeriesSortField, label: translate("series.sortOptions.length") },
    { field: "addedAt" as SeriesSortField, label: translate("series.sortOptions.dateAdded") },
    { field: "updatedAt" as SeriesSortField, label: translate("series.sortOptions.lastUpdated") },
  ];

  const renderSeries = React.useCallback(
    ({ item }: { item: SeriesListRow }) => {
      const bookCountLabel =
        item.bookCount === 1
          ? translate("series.bookCount.one")
          : translate("series.bookCount.other", { count: item.bookCount });
      return (
        <TouchableOpacity
          onPress={() => router.push(`/series/${item.id}`)}
          style={{
            flexDirection: "row",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: styles.text.color + "20",
            alignItems: "center",
          }}
          accessibilityRole="button"
          accessibilityHint={`View books in ${item.name}`}
        >
          {item.firstBookCoverUrl && (
            <View
              style={{
                width: 56,
                height: 84,
                borderRadius: 6,
                overflow: "hidden",
                marginRight: 12,
                backgroundColor: colors.coverBackground,
              }}
            >
              <CoverImage uri={item.firstBookCoverUrl} title={item.name} fontSize={10} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.text, { fontSize: 16, fontWeight: "600" }]}>{item.name}</Text>
            <Text style={[styles.text, { fontSize: 12, opacity: 0.7, marginTop: 4 }]}>
              {bookCountLabel}
            </Text>
            {item.description && (
              <Text
                style={[styles.text, { fontSize: 14, opacity: 0.7, marginTop: 4 }]}
                numberOfLines={2}
              >
                {item.description}
              </Text>
            )}
            {item.updatedAt && (
              <Text style={[styles.text, { fontSize: 12, opacity: 0.5, marginTop: 4 }]}>
                {translate("series.updated", {
                  date: new Date(item.updatedAt).toLocaleDateString(),
                })}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [router, styles.text, colors.coverBackground]
  );

  if (!ready || (isInitializing && items.length === 0)) {
    return (
      <>
        <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
          <ActivityIndicator size="large" />
          <Text style={[styles.text, { marginTop: 16 }]}>{translate("series.loading")}</Text>
          <Stack.Screen
            options={{
              title: translate("series.title"),
              headerTitle: translate("series.title"),
              headerRight: controls,
            }}
          />
        </View>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
          <Text style={styles.text}>{translate("series.empty")}</Text>
          <Text style={[styles.text, { fontSize: 12, marginTop: 8, opacity: 0.7 }]}>
            {translate("series.emptyState")}
          </Text>
          <Stack.Screen
            options={{
              title: translate("series.title"),
              headerTitle: translate("series.title"),
              headerRight: controls,
            }}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <FlatList
          data={items}
          renderItem={renderSeries}
          keyExtractor={(item) => item.id}
          style={styles.flatListContainer}
        />
        <SortMenu
          visible={showSortMenu}
          onClose={() => setShowSortMenu(false)}
          sortConfig={sortConfig}
          onSortChange={setSortConfig}
          sortOptions={seriesSortOptions}
          isDark={isDark}
        />
        <Stack.Screen
          options={{
            title: translate("series.title"),
            headerTitle: translate("series.title"),
            headerRight: controls,
          }}
        />
      </View>
    </>
  );
}
