/**
 * Test stubs for ChapterList component
 *
 * PERF-02: getItemLayout — eliminates FlatList's layout measurement pass
 * PERF-09: setTimeout cleanup — prevents state updates on unmounted component
 *
 * These are TDD "red" stubs. Wave 1 plans implement the passing versions.
 */

import { describe, it } from "@jest/globals";

describe("ChapterList", () => {
  describe("PERF-02: getItemLayout", () => {
    it("returns correct layout for index 0", () => {
      throw new Error("not yet implemented");
    });

    it("returns correct offset for index N", () => {
      throw new Error("not yet implemented");
    });

    it("renderItem is wrapped in useCallback", () => {
      throw new Error("not yet implemented");
    });
  });

  describe("PERF-09: setTimeout cleanup", () => {
    it("first useEffect returns clearTimeout cleanup", () => {
      throw new Error("not yet implemented");
    });

    it("second useEffect returns clearTimeout cleanup", () => {
      throw new Error("not yet implemented");
    });
  });
});
