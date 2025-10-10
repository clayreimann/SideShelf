import { StyleSheet, useColorScheme } from 'react-native';

export type ThemedStyles = ReturnType<typeof createThemedStyles>;

export function useThemedStyles() {
  const colorScheme = useColorScheme();
  return createThemedStyles(colorScheme === 'dark');
}

function createThemedStyles(isDark: boolean) {
  const colors = {
    background: isDark ? '#222' : '#ffffff',
    coverBackground: isDark ? '#222' : '#eee',
    textPrimary: isDark ? '#ffffff' : '#000000',
    separator: isDark ? 'rgba(255,255,255,0.15)' : '#ccc',
    link: isDark ? '#9CDCFE' : '#0066CC',
    headerBackground: isDark ? '#333' : '#ffffff',
    headerText: isDark ? '#ffffff' : '#000000',
    headerBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
  } as const;

  const tabs = {
    backgroundColor: colors.background,
    opacity: isDark ? 0.8 : 1,
    iconColor: colors.textPrimary,
    labelColor: colors.textPrimary,
    badgeTextColor: colors.textPrimary,
    shadowColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.1)',
  } as const;

  const header = {
    backgroundColor: colors.headerBackground,
    titleColor: colors.headerText,
    tintColor: colors.headerText,
    borderBottomColor: colors.headerBorder,
    borderBottomWidth: isDark ? 0.5 : 1,
  } as const;

  return {
    isDark,
    colors,
    tabs,
    header,
    styles: StyleSheet.create({
      flatListContainer: {
        backgroundColor: colors.background,
        width: '100%',
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
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
        width: '100%',
      },
      link: {
        color: colors.link,
        textDecorationLine: 'underline',
        fontSize: 20,
      },
    }),
  };
}
