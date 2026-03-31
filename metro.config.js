const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const TREE_SHAKING_ENABLED = process.env.EXPO_TREE_SHAKING === "true";

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

// Enable Expo SDK 54 tree shaking + inlineRequires (production-only).
// Gated by EXPO_TREE_SHAKING env var for feature-flag control.
// Revert: set EXPO_TREE_SHAKING=false in .env and rebuild.
if (TREE_SHAKING_ENABLED) {
  config.transformer.getTransformOptions = async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  });
}

module.exports = config;
