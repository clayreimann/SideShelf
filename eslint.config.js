// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const reactNativeA11y = require("eslint-plugin-react-native-a11y");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      complexity: ["warn", { max: 10 }],
    },
  },
  {
    // Guards against unlabeled touchables shipping after the a11y remediation.
    // Presence/validity rules are errors; subjective/noisy rules are warn or off.
    files: ["src/**/*.tsx"],
    plugins: { "react-native-a11y": reactNativeA11y },
    rules: {
      // Requiring an accessibilityHint on every touchable is overly prescriptive
      // (a good accessibilityLabel is often sufficient) — keep as a nudge only.
      "react-native-a11y/has-accessibility-hint": "off",
      "react-native-a11y/has-accessibility-props": "error",
      "react-native-a11y/has-valid-accessibility-actions": "error",
      "react-native-a11y/has-valid-accessibility-component-type": "error",
      "react-native-a11y/has-valid-accessibility-descriptors": "warn",
      "react-native-a11y/has-valid-accessibility-ignores-invert-colors": "off",
      "react-native-a11y/has-valid-accessibility-role": "error",
      "react-native-a11y/has-valid-accessibility-state": "error",
      "react-native-a11y/has-valid-accessibility-states": "off",
      "react-native-a11y/has-valid-accessibility-traits": "off",
      "react-native-a11y/has-valid-accessibility-value": "error",
      "react-native-a11y/has-valid-important-for-accessibility": "off",
      // One known pre-existing case in TraceDumps.tsx is tracked separately.
      "react-native-a11y/no-nested-touchables": "warn",
    },
  },
]);
