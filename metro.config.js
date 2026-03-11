const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("sql");

// .wasm files (used by expo-sqlite's web worker) must be treated as binary
// assets on web, not parsed as JS source.
config.resolver.assetExts.push("wasm");

// Stub out web-only modules on native platforms so Metro doesn't fail to
// resolve them during the iOS/Android bundle.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== "web") {
    if (moduleName.startsWith("shaka-player") || moduleName.includes("expo-sqlite/web/")) {
      return { type: "empty" };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
