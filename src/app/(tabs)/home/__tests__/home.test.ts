/**
 * Test stubs for HomeScreen
 *
 * PERF-05: TTI mark — HomeScreen calls performance.mark('screenInteractive')
 * from react-native-performance when content is ready, enabling RN performance
 * timeline tracking of time-to-interactive
 *
 * These are TDD "red" stubs. Wave 1 plans implement the passing versions.
 */

import { describe, it } from "@jest/globals";

describe("HomeScreen", () => {
  describe("PERF-05: TTI mark", () => {
    it("calls performance.mark('screenInteractive') when content is ready", () => {
      throw new Error("not yet implemented");
    });

    it("does not call performance.mark while still loading", () => {
      throw new Error("not yet implemented");
    });
  });
});
