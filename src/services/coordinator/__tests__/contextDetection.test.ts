import { getContextId, isHeadlessContext } from "../contextDetection";

describe("Context Detection", () => {
  const originalWindow = (global as any).window;
  const originalBatchedBridge = (global as any).__fbBatchedBridge;

  afterEach(() => {
    // Restore globals
    if (originalWindow) (global as any).window = originalWindow;
    else delete (global as any).window;

    if (originalBatchedBridge) (global as any).__fbBatchedBridge = originalBatchedBridge;
    else delete (global as any).__fbBatchedBridge;
  });

  it("should detect UI context when window is defined", () => {
    (global as any).window = {};
    expect(isHeadlessContext()).toBe(false);
    expect(getContextId()).toBe("UI");
  });

  it("should detect Headless context when window is undefined and __fbBatchedBridge exists", () => {
    delete (global as any).window;
    (global as any).__fbBatchedBridge = {};
    expect(isHeadlessContext()).toBe(true);
    expect(getContextId()).toBe("HEADLESS");
  });

  it("should default to UI context (false) if neither condition is met", () => {
    delete (global as any).window;
    delete (global as any).__fbBatchedBridge;
    expect(isHeadlessContext()).toBe(false);
    expect(getContextId()).toBe("UI");
  });
});
