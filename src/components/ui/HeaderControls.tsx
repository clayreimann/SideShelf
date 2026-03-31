import { translate } from "@/i18n";
import type { SortConfig, SortField } from "@/types/store";
import { MenuAction, MenuView } from "@react-native-menu/menu";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";

export interface HeaderControlsProps {
  isDark: boolean;
  viewMode?: "grid" | "list";
  onToggleViewMode?: () => void;
  onSort: () => void;
  showViewToggle?: boolean;
  sortLabel?: string;
  viewToggleLabel?: string;
  sortConfig?: SortConfig;
  sortMenuActions?: Array<MenuAction>;
  onSortMenuAction?: (field: SortField) => void;
}

export default function HeaderControls({
  isDark,
  viewMode,
  onToggleViewMode,
  onSort,
  showViewToggle = true,
  sortLabel,
  viewToggleLabel,
  sortConfig,
  sortMenuActions,
  onSortMenuAction,
}: HeaderControlsProps) {
  const buttonStyle = {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    // backgroundColor: isDark ? '#333' : '#f0f0f0',
    marginRight: 8,
  };

  const textStyle = {
    color: isDark ? "#fff" : "#000",
    fontSize: 14,
  };

  const iconColor = isDark ? "#fff" : "#000";
  const computedSortLabel = sortLabel || translate("common.sort");
  const computedViewToggleLabel =
    viewToggleLabel || (viewMode === "grid" ? translate("common.list") : translate("common.grid"));

  const sortButton = (
    <Pressable onPress={onSort} style={[buttonStyle, { marginRight: 0 }]}>
      <Text style={textStyle}>{computedSortLabel}</Text>
    </Pressable>
  );

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {showViewToggle && onToggleViewMode && (
        <Pressable
          onPress={onToggleViewMode}
          style={buttonStyle}
          accessibilityRole="button"
          accessibilityLabel={
            viewMode === "grid" ? translate("common.list") : translate("common.grid")
          }
        >
          {Platform.OS === "ios" ? (
            <SymbolView
              name={viewMode === "grid" ? "list.bullet" : "square.grid.2x2"}
              size={18}
              tintColor={iconColor}
              type="monochrome"
            />
          ) : (
            <MaterialCommunityIcons
              name={viewMode === "grid" ? "format-list-bulleted" : "grid"}
              size={18}
              color={iconColor}
            />
          )}
        </Pressable>
      )}
      {sortMenuActions && onSortMenuAction ? (
        <MenuView
          onPressAction={({ nativeEvent }) => {
            onSortMenuAction(nativeEvent.event as SortField);
          }}
          actions={sortMenuActions}
        >
          {sortButton}
        </MenuView>
      ) : (
        sortButton
      )}
    </View>
  );
}
