/**
 * Expo app configuration (dynamic)
 */

const withExcludeFromBackup = require("./plugins/excludeFromBackup/withExcludeFromBackup");

// Build number: timestamp-style (YYYYmmDDHHMMSS), e.g. 20260717153045.
// The build script (package.json "build-testflight") exports BUILD_NUMBER once
// so every config evaluation across the build's processes sees the SAME value —
// computing new Date() here per-evaluation would drift between prebuild and
// later steps. The fallback below only applies to ad-hoc local runs.
// Note: this is iOS-only (CFBundleVersion accepts large numerics). Android's
// versionCode is a 32-bit int (max ~2.1e9) and CANNOT hold a 14-digit
// timestamp — if Android builds are added later, derive a shorter code.
function timestampBuildNumber() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}
const BUILD_NUMBER = process.env.BUILD_NUMBER || timestampBuildNumber();

module.exports = ({ config }) => {
  const baseConfig = {
    name: "SideShelf",
    slug: "side-shelf",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "sideshelf",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    jsEngine: "hermes",
    splash: {
      image: "./assets/images/splash-icon.jpeg",
      resizeMode: "cover",
      backgroundColor: "#000000",
    },
    // --- Transport security (cleartext HTTP) decision ---------------------
    // SideShelf talks to self-hosted Audiobookshelf servers, and a real
    // fraction of those are reachable only over plain http:// — LAN IPs
    // without a cert, or DDNS hostnames (e.g. myhome.duckdns.org) that were
    // never put behind TLS. Restricting cleartext to RFC1918/.local hosts
    // only (iOS's NSAllowsLocalNetworking) would silently break that
    // DDNS-over-HTTP case, which is common enough for this kind of app that
    // breaking it outright is too aggressive.
    //
    // Decision: keep cleartext HTTP allowed to ANY host on both platforms
    // (NSAllowsArbitraryLoads on iOS, usesCleartextTraffic on Android —
    // see below), and instead warn the user in the login screen
    // (src/app/login.tsx, via src/lib/helpers/networkAddress.ts) when the
    // server URL is http:// AND the host is not private/LAN, before
    // credentials are submitted. Certificate pinning is deliberately not
    // used (self-hosted servers use arbitrary/self-signed certs).
    //
    // Effective Android behavior before this change: apps targeting API 28+
    // (this app does, via Expo SDK 54) get cleartext traffic BLOCKED by
    // default at the OS level unless usesCleartextTraffic/a network security
    // config says otherwise. Since neither was set here, Android was
    // actually MORE restrictive than iOS — any http:// request (including
    // to LAN servers) would already fail with a network security exception.
    // usesCleartextTraffic: true below restores parity with the iOS
    // decision above (allow cleartext, warn on login instead of blocking).
    ios: {
      supportsTablet: true,
      buildNumber: BUILD_NUMBER,
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
      usesCleartextTraffic: true,
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
      withExcludeFromBackup,
      ["@kesha-antonov/react-native-background-downloader", {}],
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
      // OTA is intentionally dormant until the Worker + R2 service passes
      // docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md.
      enabled: true,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
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
