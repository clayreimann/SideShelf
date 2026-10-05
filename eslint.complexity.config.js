// Complexity rules enforced in CI by scripts/check-complexity.js.
// Violations that existed when the check was introduced are recorded in
// .github/quality/complexity-baseline.json; CI fails only on new or worse ones.
const { defineConfig } = require("eslint/config");
const tsParser = require("@typescript-eslint/parser");
const sonarjs = require("eslint-plugin-sonarjs");

const COMPLEXITY_RULES = {
  complexity: ["error", { max: 15 }],
  "sonarjs/cognitive-complexity": ["error", 15],
  "max-depth": ["error", 4],
  "max-params": ["error", 4],
  "max-lines-per-function": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
  "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
};

module.exports = defineConfig([
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "src/db/migrations/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { sonarjs },
    // Only complexity rules run here; ignore disable comments for other rules.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: COMPLEXITY_RULES,
  },
]);
