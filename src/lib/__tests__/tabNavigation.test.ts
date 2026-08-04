import * as fs from "node:fs";
import * as path from "node:path";

import {
  getAuthorItemRoute,
  getHomeItemRoute,
  getLibraryItemRoute,
  getMoreTabIndexRoute,
  getSeriesItemRoute,
} from "@/lib/tabNavigation";

describe("tabNavigation", () => {
  it.each([
    ["home", "/more/home"],
    ["library", "/more/library"],
    ["series", "/more/series"],
    ["authors", "/more/authors"],
  ] as const)("maps %s to its More index", (tab, expected) => {
    expect(getMoreTabIndexRoute(tab)).toBe(expected);
  });

  it.each([
    [getHomeItemRoute, "/home", "/home/item/book-1", "/more/home/item/book-1"],
    [getLibraryItemRoute, "/library", "/library/book-1", "/more/library/book-1"],
  ] as const)(
    "builds top-level and More-scoped item routes",
    (builder, topPath, topExpected, moreExpected) => {
      expect(builder(topPath, "book-1")).toBe(topExpected);
      expect(builder(`/more${topPath}`, "book-1")).toBe(moreExpected);
    }
  );

  it("builds top-level and More-scoped Series item routes", () => {
    expect(getSeriesItemRoute("/series/series-1", "series-1", "book-1")).toBe(
      "/series/series-1/item/book-1"
    );
    expect(getSeriesItemRoute("/more/series/series-1", "series-1", "book-1")).toBe(
      "/more/series/series-1/item/book-1"
    );
  });

  it("builds top-level and More-scoped Author item routes", () => {
    expect(getAuthorItemRoute("/authors/author-1", "author-1", "book-1")).toBe(
      "/authors/author-1/item/book-1"
    );
    expect(getAuthorItemRoute("/more/authors/author-1", "author-1", "book-1")).toBe(
      "/more/authors/author-1/item/book-1"
    );
  });

  it("does not treat another More subtree as the current tab's More scope", () => {
    expect(getSeriesItemRoute("/more/authors/author-1", "series-1", "book-1")).toBe(
      "/series/series-1/item/book-1"
    );
  });

  it.each([
    ["src/app/(tabs)/series/[seriesId]/index.tsx", "getSeriesItemRoute"],
    ["src/app/(tabs)/authors/[authorId]/index.tsx", "getAuthorItemRoute"],
  ])("wires %s through %s", (file, builderName) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).toContain(builderName);
  });
});
