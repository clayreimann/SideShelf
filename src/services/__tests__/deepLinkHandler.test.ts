/**
 * TDD RED stubs — Deep Link Handler (NAVIGATION-03)
 *
 * Tests the handleDeepLinkUrl function that will be extracted from _layout.tsx
 * into a standalone testable file at src/lib/deepLinkHandler.ts.
 *
 * These tests FAIL in RED state because src/lib/deepLinkHandler.ts does not
 * exist yet. Plan 04 will create the file and make these tests GREEN.
 *
 * Mocking strategy:
 *  - expo-router: mock router.push and router.navigate as jest.fn()
 *  - @/stores/appStore: mock useAppStore.getState() with controllable auth + player state
 *  - @/services/coordinator/eventBus: mock dispatchPlayerEvent as jest.fn()
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// --- Mocks ---

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
  },
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock("@/services/coordinator/eventBus", () => ({
  dispatchPlayerEvent: jest.fn(),
}));

// --- Helpers ---

/**
 * Build a mock store state with the given auth and player settings.
 */
function buildStoreState(overrides: {
  isAuthenticated?: boolean;
  currentTrack?: object | null;
  isPlaying?: boolean;
}) {
  const { isAuthenticated = true, currentTrack = null, isPlaying = false } = overrides;

  return {
    auth: {
      isAuthenticated,
    },
    player: {
      currentTrack,
      isPlaying,
    },
  };
}

describe("handleDeepLinkUrl", () => {
  let mockRouter: { push: ReturnType<typeof jest.fn>; navigate: ReturnType<typeof jest.fn> };
  let mockDispatchPlayerEvent: ReturnType<typeof jest.fn>;
  let mockUseAppStore: ReturnType<typeof jest.fn>;
  let handleDeepLinkUrl: (url: string) => Promise<void> | void;

  beforeEach(() => {
    jest.clearAllMocks();

    const { router } = require("expo-router");
    const { dispatchPlayerEvent } = require("@/services/coordinator/eventBus");
    const { useAppStore } = require("@/stores/appStore");

    mockRouter = router;
    mockDispatchPlayerEvent = dispatchPlayerEvent;
    mockUseAppStore = useAppStore.getState;

    // Default: authenticated, no current track, paused
    mockUseAppStore.mockReturnValue(buildStoreState({ isAuthenticated: true }));

    // Import the function under test — will fail until deepLinkHandler.ts is created
    const module = require("@/lib/deepLinkHandler");
    handleDeepLinkUrl = module.handleDeepLinkUrl;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("test 1 (unauthenticated): when not authenticated, router.push('/login') is called and no navigation occurs", async () => {
    mockUseAppStore.mockReturnValue(buildStoreState({ isAuthenticated: false }));

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://home");

    expect(mockRouter.push).toHaveBeenCalledWith("/login");
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockDispatchPlayerEvent).not.toHaveBeenCalled();
  });

  it("test 2 (sideshelf://home): router.navigate('/(tabs)') is called", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://home");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)");
  });

  it("test 3 (sideshelf://library): router.navigate('/(tabs)/library') is called", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://library");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/library");
  });

  it("test 4 (sideshelf://series): router.navigate('/(tabs)/series') is called", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://series");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/series");
  });

  it("test 5 (sideshelf://authors): router.navigate('/(tabs)/authors') is called", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://authors");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/authors");
  });

  it("test 6 (sideshelf://more): router.navigate('/(tabs)/more') is called", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://more");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/more");
  });

  it("test 7 (sideshelf://item/ABC123): router.push('/(tabs)/library/item/ABC123') is called", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://item/ABC123");

    expect(mockRouter.push).toHaveBeenCalledWith("/(tabs)/library/item/ABC123");
  });

  it("test 8 (sideshelf://item/ABC123?action=play): router.push called with item path (action=play noted)", async () => {
    // Per RESEARCH.md open question: action=play navigates to item detail for Phase 18
    // Auto-play implementation deferred to follow-up
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://item/ABC123?action=play");

    expect(mockRouter.push).toHaveBeenCalledWith("/(tabs)/library/item/ABC123");
  });

  it("test 9 (sideshelf://resume with currentTrack): dispatchPlayerEvent({ type: 'PLAY' }) is called", async () => {
    mockUseAppStore.mockReturnValue(
      buildStoreState({
        isAuthenticated: true,
        currentTrack: { libraryItemId: "item-1", title: "My Book" },
        isPlaying: false,
      })
    );

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://resume");

    expect(mockDispatchPlayerEvent).toHaveBeenCalledWith({ type: "PLAY" });
    // No navigation when resuming
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it("test 10 (sideshelf://resume with no track): no dispatch, no navigation", async () => {
    mockUseAppStore.mockReturnValue(
      buildStoreState({
        isAuthenticated: true,
        currentTrack: null,
      })
    );

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://resume");

    expect(mockDispatchPlayerEvent).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.stringContaining("(tabs)"));
  });

  it("test 11 (sideshelf://play-pause while playing): dispatchPlayerEvent({ type: 'PAUSE' }) is called", async () => {
    mockUseAppStore.mockReturnValue(
      buildStoreState({
        isAuthenticated: true,
        currentTrack: { libraryItemId: "item-1" },
        isPlaying: true,
      })
    );

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://play-pause");

    expect(mockDispatchPlayerEvent).toHaveBeenCalledWith({ type: "PAUSE" });
  });

  it("test 12 (sideshelf://play-pause while paused): dispatchPlayerEvent({ type: 'PLAY' }) is called", async () => {
    mockUseAppStore.mockReturnValue(
      buildStoreState({
        isAuthenticated: true,
        currentTrack: { libraryItemId: "item-1" },
        isPlaying: false,
      })
    );

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://play-pause");

    expect(mockDispatchPlayerEvent).toHaveBeenCalledWith({ type: "PLAY" });
  });

  it("test 13 (unknown scheme): no navigation, no dispatch", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("unknown://some-action");

    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockDispatchPlayerEvent).not.toHaveBeenCalled();
  });
});
