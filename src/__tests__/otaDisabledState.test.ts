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
});
