import * as fs from "node:fs";
import * as path from "node:path";

const repoPath = (...segments: string[]) => path.join(process.cwd(), ...segments);

describe("OTA Phase 0 disabled state", () => {
  it.each(["src/app/(tabs)/more/bundle-loader.tsx", "src/services/BundleService.ts"])(
    "removes retired application surface %s",
    (removedPath) => {
      expect(fs.existsSync(repoPath(removedPath))).toBe(false);
    }
  );

  it.each([
    "src/app/(tabs)/more/settings.tsx",
    "src/app/_layout.tsx",
    "src/lib/appSettings.ts",
    "src/stores/slices/settingsSlice.ts",
    "src/stores/appStore.ts",
  ])("contains no custom bundle loader reference in %s", (sourcePath) => {
    const source = fs.readFileSync(repoPath(sourcePath), "utf8");

    expect(source).not.toMatch(
      /BundleService|bundleService|bundle-loader|Bundle Loader|customUpdateUrl|CustomUpdateUrl/
    );
  });

  it.each([
    ".github/workflows/publish-pr-update.yml",
    ".github/workflows/publish-release-update.yml",
    ".github/workflows/cleanup-pr-bundle.yml",
    ".github/workflows/README-cleanup.md",
  ])("removes retired OTA workflow file %s", (removedPath) => {
    expect(fs.existsSync(repoPath(removedPath))).toBe(false);
  });

  it("keeps coverage CI focused on tests and coverage", () => {
    const workflow = fs.readFileSync(repoPath(".github/workflows/test-coverage.yml"), "utf8");

    expect(workflow).not.toMatch(
      /Export JavaScript bundle|Upload bundle artifacts|JavaScript Bundle Available|Bundle Loader/
    );
  });

  it("keeps expo-updates dormant and preserves recovery in preview builds", () => {
    type ResolvedConfig = {
      updates: Record<string, unknown>;
      runtimeVersion: { policy: string };
    };

    const previousVariant = process.env.APP_VARIANT;
    let resolvedConfig: ResolvedConfig | undefined;

    try {
      process.env.APP_VARIANT = "preview";
      jest.resetModules();
      const createConfig = require("../../app.config.js") as (input: {
        config: Record<string, unknown>;
      }) => ResolvedConfig;

      resolvedConfig = createConfig({ config: {} });
    } finally {
      if (previousVariant === undefined) {
        delete process.env.APP_VARIANT;
      } else {
        process.env.APP_VARIANT = previousVariant;
      }
      jest.resetModules();
    }

    expect(resolvedConfig?.updates).toEqual({
      enabled: true,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
    });
    expect(resolvedConfig?.runtimeVersion).toEqual({ policy: "appVersion" });
  });

  it("contains no build-time custom update URL switch", () => {
    const source = fs.readFileSync(repoPath("app.config.js"), "utf8");

    expect(source).not.toMatch(
      /EXPO_PUBLIC_UPDATE_URL|CUSTOM_UPDATE_URL|disableAntiBrickingMeasures/
    );
  });
});
