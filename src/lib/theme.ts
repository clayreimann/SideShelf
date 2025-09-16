import { StyleSheet, useColorScheme } from 'react-native';

export type ThemedStyles = ReturnType<typeof createThemedStyles>;

export function useThemedStyles() {
  const colorScheme = useColorScheme();
  return createThemedStyles(colorScheme === 'dark');
}

function createThemedStyles(isDark: boolean) {
  const colors = {
    background: isDark ? '#121212' : '#ffffff',
    textPrimary: isDark ? '#ffffff' : '#000000',
    separator: isDark ? 'rgba(255,255,255,0.15)' : '#ccc',
    link: isDark ? '#9CDCFE' : '#0066CC',
  } as const;

  const tabs = {
    backgroundColor: colors.background,
    iconColor: colors.textPrimary,
    labelColor: colors.textPrimary,
    badgeTextColor: colors.textPrimary,
    shadowColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.1)',
  } as const;

  return {
    isDark,
    colors,
    tabs,
    styles: StyleSheet.create({
      flatListContainer: {
        backgroundColor: colors.background,
      },
      container: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
      },
      text: {
        color: colors.textPrimary,
      },
      listItem: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
      },
      link: {
        color: colors.link,
        textDecorationLine: 'underline',
        fontSize: 20,
      },
    }),
  };
}
