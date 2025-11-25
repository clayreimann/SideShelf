/**
 * Expo app configuration (dynamic)
 *
 * This file allows us to configure expo-updates with custom URLs
 * at build time via environment variables.
 */

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

// Custom update URL can be set via environment variable
// Example: EXPO_PUBLIC_UPDATE_URL=https://your-domain.com/updates
const CUSTOM_UPDATE_URL = process.env.EXPO_PUBLIC_UPDATE_URL;

module.exports = ({ config }) => {
  const baseConfig = {
    name: "SideShelf",
    slug: "side-shelf",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "side-shelf",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    jsEngine: "hermes",
    splash: {
      image: "./assets/images/splash-icon.jpeg",
      resizeMode: "cover",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
        NSLocalNetworkUsageDescription:
          "This app needs access to your local network to download files.",
        UIBackgroundModes: ["audio"],
        ITSAppUsesNonExemptEncryption: false,
      },
      bundleIdentifier: "cloud.madtown.sideshelf",
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "cloud.madtown.sideshelf",
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.jpeg",
          resizeMode: "cover",
          imageWidth: 2048,
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      [
        "expo-font",
        {
          fonts: [
            "./node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Regular.ttf",
            "./node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Solid.ttf",
            "./node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Brands.ttf",
            "./node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf",
            "./node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Octicons.ttf",
          ],
        },
      ],
      "expo-web-browser",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    updates: {
      enabled: true,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
      // Use custom update URL if provided, otherwise use EAS
      ...(CUSTOM_UPDATE_URL && { url: CUSTOM_UPDATE_URL }),
      // Enable dynamic URL switching for preview builds (requires SDK 52+)
      // WARNING: This disables embedded update fallback. Use for TestFlight/preview only!
      ...(IS_PREVIEW && { disableAntiBrickingMeasures: true }),
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    extra: {
      router: {},
      eas: {
        projectId: "33b45096-c026-4645-9d7e-645575d1829f",
      },
    },
  };

  return baseConfig;
};
