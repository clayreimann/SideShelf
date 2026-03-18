/**
 * Test stubs for CoverImage component
 *
 * PERF-08: expo-image migration — replaces RN Image with expo-image for
 * memory-disk caching, recyclingKey support, and consistent dim overlay
 *
 * These are TDD "red" stubs. Wave 1 plans implement the passing versions.
 */

import { describe, it } from "@jest/globals";

describe("CoverImage", () => {
  describe("PERF-08: expo-image migration", () => {
    it("renders expo-image Image component instead of RN Image", () => {
      throw new Error("not yet implemented");
    });

    it("passes cachePolicy memory-disk", () => {
      throw new Error("not yet implemented");
    });

    it("passes recyclingKey when libraryItemId provided", () => {
      throw new Error("not yet implemented");
    });

    it("shows dim overlay when item has libraryItemId and is not downloaded", () => {
      throw new Error("not yet implemented");
    });

    it("does not show dim overlay when item is downloaded", () => {
      throw new Error("not yet implemented");
    });

    it("shows title fallback text when uri is null", () => {
      throw new Error("not yet implemented");
    });
  });
});
