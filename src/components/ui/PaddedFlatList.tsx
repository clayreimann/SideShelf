import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import React from "react";
import { FlatList, type FlatListProps, StyleSheet } from "react-native";

/**
 * Drop-in replacement for FlatList that automatically applies floating player
 * bottom padding to contentContainerStyle. Eliminates the need to manually call
 * useFloatingPlayerPadding in every screen that renders a scrollable list.
 */
export default function PaddedFlatList<T>(props: FlatListProps<T>) {
  const floatingPlayerPadding = useFloatingPlayerPadding();
  const { contentContainerStyle, ...rest } = props;

  return (
    <FlatList contentContainerStyle={[contentContainerStyle, floatingPlayerPadding]} {...rest} />
  );
}
