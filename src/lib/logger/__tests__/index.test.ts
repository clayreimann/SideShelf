/**
 * Tests for the Logger's purge-subscription API (subscribeToPurge / notifyPurge).
 *
 * This exists to invert the logger's former dependency on src/stores/appStore: instead
 * of the logger lazily require()-ing the store to reset error-acknowledgment state after
 * a purge, the logger now exposes subscribeToPurge() and the store (via src/index.ts's
 * bootstrap wiring) subscribes to it. See src/lib/logger/index.ts's manualTrim() and
 * sqliteTransport's periodic-purge branch, and src/index.ts's initializeApp().
 *
 * "@/lib/logger" is globally mocked in src/__tests__/setup.ts for every other test file,
 * so we unmock it here to exercise the real implementation.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "fs";
import path from "path";

jest.unmock("@/lib/logger");

const ONE_HOUR_MS = 60 * 60 * 1000;

describe("Logger purge subscriptions", () => {
  let logger: typeof import("@/lib/logger").logger;

  beforeEach(() => {
    jest.resetModules();
    // Re-require after resetModules so each test gets a fresh Logger singleton
    // (subLoggers/callbacks state must not leak between tests).
    ({ logger } = require("@/lib/logger"));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("does not import from src/stores", () => {
    // Static guard, mirrors what `npm run check:circular` verifies at the module-graph
    // level: this module must stay free of any @/stores dependency.
    const source = fs.readFileSync(path.resolve(__dirname, "../index.ts"), "utf8");
    expect(source).not.toMatch(/@\/stores/);
  });

  it("notifies a subscriber with the cutoff timestamp after manualTrim()", () => {
    const callback = jest.fn();
    logger.subscribeToPurge(callback);

    logger.manualTrim();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(typeof callback.mock.calls[0][0]).toBe("number");
  });

  it("passes a cutoff timestamp consistent with the current retention window", () => {
    const callback = jest.fn();
    logger.subscribeToPurge(callback);

    const before = Date.now();
    logger.manualTrim();
    const after = Date.now();

    const cutoffTimestamp = callback.mock.calls[0][0] as number;
    // Default retention is 1 hour, so cutoff = now - 1h at the moment of the call.
    expect(cutoffTimestamp).toBeLessThanOrEqual(after - ONE_HOUR_MS);
    expect(cutoffTimestamp).toBeGreaterThanOrEqual(before - ONE_HOUR_MS - 1000);
  });

  it("notifies multiple subscribers", () => {
    const callbackA = jest.fn();
    const callbackB = jest.fn();
    logger.subscribeToPurge(callbackA);
    logger.subscribeToPurge(callbackB);

    logger.manualTrim();

    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackB).toHaveBeenCalledTimes(1);
  });

  it("stops notifying a subscriber after it unsubscribes", () => {
    const callback = jest.fn();
    const unsubscribe = logger.subscribeToPurge(callback);

    logger.manualTrim();
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    logger.manualTrim();

    // No additional calls after unsubscribing
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("unsubscribing one callback does not affect other subscribers", () => {
    const callbackA = jest.fn();
    const callbackB = jest.fn();
    const unsubscribeA = logger.subscribeToPurge(callbackA);
    logger.subscribeToPurge(callbackB);

    unsubscribeA();
    logger.manualTrim();

    expect(callbackA).not.toHaveBeenCalled();
    expect(callbackB).toHaveBeenCalledTimes(1);
  });

  it("a throwing subscriber does not prevent other subscribers from being notified", () => {
    const throwing = jest.fn(() => {
      throw new Error("boom");
    });
    const callback = jest.fn();
    logger.subscribeToPurge(throwing);
    logger.subscribeToPurge(callback);

    expect(() => logger.manualTrim()).not.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("a throwing subscriber does not prevent manualTrim from completing", () => {
    const throwing = jest.fn(() => {
      throw new Error("boom");
    });
    logger.subscribeToPurge(throwing);

    expect(() => logger.manualTrim()).not.toThrow();
  });
});
