import * as fs from "node:fs";
import * as path from "node:path";

const repoPath = (...segments: string[]) => path.join(process.cwd(), ...segments);

describe("More movable-tab route coverage", () => {
  it.each([
    "src/app/(tabs)/more/home.tsx",
    "src/app/(tabs)/more/home/item/[itemId].tsx",
    "src/app/(tabs)/more/library.tsx",
    "src/app/(tabs)/more/library/[item]/index.tsx",
    "src/app/(tabs)/more/series.tsx",
    "src/app/(tabs)/more/series/[seriesId]/item/[itemId].tsx",
    "src/app/(tabs)/more/authors.tsx",
    "src/app/(tabs)/more/authors/[authorId]/item/[itemId].tsx",
  ])("provides %s", (routeFile) => {
    expect(fs.existsSync(repoPath(routeFile))).toBe(true);
  });

  it.each([
    'name="home"',
    'name="home/item/[itemId]"',
    'name="library"',
    'name="library/[item]/index"',
  ])("registers %s in the More stack", (screenName) => {
    const layout = fs.readFileSync(repoPath("src/app/(tabs)/more/_layout.tsx"), "utf8");
    expect(layout).toContain(screenName);
  });
});
