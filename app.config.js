/**
 * Expo app configuration (dynamic)
 *
 * This file allows us to configure expo-updates with custom URLs
 * at build time via environment variables.
 *
 * Expo automatically reads app.json first and passes it as the `config` parameter.
 */

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

// Custom update URL can be set via environment variable
// Example: EXPO_PUBLIC_UPDATE_URL=https://your-domain.com/updates
const CUSTOM_UPDATE_URL = process.env.EXPO_PUBLIC_UPDATE_URL;

module.exports = ({ config }) => {
  // Expo passes app.json content as `config` parameter
  // We only need to extend the parts that require dynamic values

  return {
    ...config,
    updates: {
      ...config.updates,
      // Use custom update URL if provided, otherwise use EAS
      ...(CUSTOM_UPDATE_URL && { url: CUSTOM_UPDATE_URL }),
      // Enable dynamic URL switching for preview builds (requires SDK 52+)
      // WARNING: This disables embedded update fallback. Use for TestFlight/preview only!
      ...(IS_PREVIEW && { disableAntiBrickingMeasures: true }),
    },
  };
};
