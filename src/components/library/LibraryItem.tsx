import CoverImage from "@/components/ui/CoverImange";
import { borderRadius, spacing } from "@/lib/styles";
import { useThemedStyles } from "@/lib/theme";
import { LibraryItemDisplayRow } from "@/types/components";
import { Link } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AuthorIcon from "../icons/AuthorIcon";
import NarratorIcon from "../icons/NarratorIcon";
interface LibraryItemProps {
  item: LibraryItemDisplayRow;
  variant?: "grid" | "list";
}

export function GridItem({ item }: { item: LibraryItemDisplayRow }) {
  const { colors } = useThemedStyles();
  return (
    <Link
      href={{ pathname: "/(tabs)/library/[item]", params: { item: item.id } }}
      asChild
    >
      <Pressable style={styles.gridItemContainer}>
        <View
          style={[
            styles.gridCoverContainer,
            { backgroundColor: colors.coverBackground },
          ]}
        >
          <CoverImage uri={item.coverUri} title={item.title} fontSize={12} libraryItemId={item.id} />
        </View>
      </Pressable>
    </Link>
  );
}

export function ListItem({ item }: { item: LibraryItemDisplayRow }) {
  const { colors } = useThemedStyles();
  return (
    <Link
      href={{ pathname: "/(tabs)/library/[item]", params: { item: item.id } }}
      asChild
    >
      <Pressable
        style={[
          styles.listItemContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <View style={styles.listItemContent}>
          <View
            style={[
              styles.listCoverContainer,
              { backgroundColor: colors.coverBackground },
            ]}
          >
            <CoverImage uri={item.coverUri} title={item.title} fontSize={24} libraryItemId={item.id} />
          </View>
          <View style={styles.listItemInfo}>
            <Text
              style={[styles.listItemTitle, { color: colors.textPrimary }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <View style={styles.listItemDetails}>
              <View style={styles.listItemMetadata}>
                <View style={styles.metadataRow}>
                  <AuthorIcon style={styles.metadataIcon} />
                  <Text
                    style={[styles.metadataText, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.author}
                  </Text>
                </View>
                {item.narrator && (
                  <View style={styles.metadataRow}>
                    <NarratorIcon style={styles.metadataIcon} />
                    <Text
                      style={[styles.metadataText, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {item.narrator}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.listItemStats}>
                <Text style={[styles.statsText, { color: colors.textSecondary }]}>
                  {item.publishedYear}
                </Text>
                <Text style={[styles.statsText, { color: colors.textSecondary }]}>
                  {item.duration && item.duration > 0
                    ? formatDuration(item.duration)
                    : ""}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default function ApiLibraryItem({
  item,
  variant = "grid",
}: LibraryItemProps) {
  return variant === "grid" ? (
    <GridItem item={item} />
  ) : (
    <ListItem item={item} />
  );
}

const styles = StyleSheet.create({
  // Grid item styles
  gridItemContainer: {
    width: "30%",
    aspectRatio: 1,
    marginBottom: spacing.md,
  },
  gridCoverContainer: {
    flex: 1,
    borderRadius: borderRadius.sm,
    overflow: "hidden",
  },

  // List item styles
  listItemContainer: {
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  listItemContent: {
    flexDirection: "row",
    width: "100%",
    padding: spacing.sm,
  },
  listCoverContainer: {
    width: 70,
    height: 70,
    borderRadius: borderRadius.xs,
    overflow: "hidden",
    marginRight: spacing.md,
  },
  listItemInfo: {
    flex: 1,
    justifyContent: "center",
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  listItemDetails: {
    flexDirection: "row",
    alignItems: "center",
  },
  listItemMetadata: {
    flexDirection: "column",
    flex: 1,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metadataIcon: {
    marginRight: spacing.xs,
  },
  metadataText: {
    fontSize: 12,
    marginBottom: 2,
  },
  listItemStats: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  statsText: {
    fontSize: 12,
  },
});
