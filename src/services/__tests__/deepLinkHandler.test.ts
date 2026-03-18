/**
 * Tests for handleDeepLinkUrl (NAVIGATION-03)
 *
 * Mocking strategy:
 *  - expo-router: mock router.push, router.navigate, router.back, router.canGoBack
 *  - @/services/ApiClientService: mock apiClientService.isAuthenticated
 *  - @/stores/appStore: mock useAppStore.getState() with controllable player + settings state
 *  - @/services/coordinator/eventBus: mock dispatchPlayerEvent as jest.fn()
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// --- Mocks ---

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(),
  },
}));

jest.mock("@/services/ApiClientService", () => ({
  apiClientService: {
    isAuthenticated: jest.fn(),
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

function buildStoreState(overrides: {
  currentTrack?: object | null;
  isPlaying?: boolean;
  hiddenTabs?: string[];
}) {
  const { currentTrack = null, isPlaying = false, hiddenTabs = [] } = overrides;

  return {
    player: { currentTrack, isPlaying },
    settings: { hiddenTabs },
  };
}

describe("handleDeepLinkUrl", () => {
  let mockRouter: {
    push: ReturnType<typeof jest.fn>;
    navigate: ReturnType<typeof jest.fn>;
    back: ReturnType<typeof jest.fn>;
    canGoBack: ReturnType<typeof jest.fn>;
  };
  let mockDispatchPlayerEvent: ReturnType<typeof jest.fn>;
  let mockUseAppStore: ReturnType<typeof jest.fn>;
  let handleDeepLinkUrl: (url: string) => Promise<void> | void;

  beforeEach(() => {
    jest.clearAllMocks();

    const { router } = require("expo-router");
    const { dispatchPlayerEvent } = require("@/services/coordinator/eventBus");
    const { useAppStore } = require("@/stores/appStore");
    const { apiClientService } = require("@/services/ApiClientService");

    mockRouter = router;
    mockDispatchPlayerEvent = dispatchPlayerEvent;
    mockUseAppStore = useAppStore.getState;

    // Default: authenticated, no current track, paused, no hidden tabs
    apiClientService.isAuthenticated.mockReturnValue(true);
    mockUseAppStore.mockReturnValue(buildStoreState({}));
    // Default: can go back
    mockRouter.canGoBack.mockReturnValue(true);

    const module = require("@/lib/deepLinkHandler");
    handleDeepLinkUrl = module.handleDeepLinkUrl;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("test 1 (unauthenticated): router.push('/login') called, no navigation", async () => {
    const { apiClientService } = require("@/services/ApiClientService");
    apiClientService.isAuthenticated.mockReturnValue(false);

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://home");

    expect(mockRouter.push).toHaveBeenCalledWith("/login");
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockDispatchPlayerEvent).not.toHaveBeenCalled();
  });

  it("test 2 (sideshelf://home): navigates to /(tabs)/home", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://home");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("test 3 (sideshelf://library): navigates to /(tabs)/library", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://library");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/library");
  });

  it("test 4 (sideshelf://series, visible tab): navigates to /(tabs)/series", async () => {
    mockUseAppStore.mockReturnValue(buildStoreState({ hiddenTabs: [] }));

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://series");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/series");
  });

  it("test 4b (sideshelf://series, hidden tab): navigates to /(tabs)/more/series", async () => {
    mockUseAppStore.mockReturnValue(buildStoreState({ hiddenTabs: ["series"] }));

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://series");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/more/series");
  });

  it("test 5 (sideshelf://authors, visible tab): navigates to /(tabs)/authors", async () => {
    mockUseAppStore.mockReturnValue(buildStoreState({ hiddenTabs: [] }));

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://authors");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/authors");
  });

  it("test 5b (sideshelf://authors, hidden tab): navigates to /(tabs)/more/authors", async () => {
    mockUseAppStore.mockReturnValue(buildStoreState({ hiddenTabs: ["authors"] }));

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://authors");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/more/authors");
  });

  it("test 6 (sideshelf://more): navigates to /(tabs)/more", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://more");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/more");
  });

  it("test 7 (sideshelf://item/ABC123): navigates to /(tabs)/library/ABC123", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://item/ABC123");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/library/ABC123");
  });

  it("test 8 (sideshelf://item/ABC123?action=play): navigates to item path", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://item/ABC123?action=play");

    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/library/ABC123");
  });

  it("test 9 (sideshelf://resume with currentTrack): PLAY dispatched, router.back() called", async () => {
    mockUseAppStore.mockReturnValue(
      buildStoreState({
        currentTrack: { libraryItemId: "item-1", title: "My Book" },
        isPlaying: false,
      })
    );

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://resume");

    expect(mockDispatchPlayerEvent).toHaveBeenCalledWith({ type: "PLAY" });
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it("test 10 (sideshelf://resume with no track): no dispatch, router.back() called", async () => {
    mockUseAppStore.mockReturnValue(buildStoreState({ currentTrack: null }));

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://resume");

    expect(mockDispatchPlayerEvent).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("test 10b (sideshelf://resume, cannot go back): navigates to home", async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    mockUseAppStore.mockReturnValue(buildStoreState({ currentTrack: null }));

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://resume");

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("test 11 (sideshelf://play-pause while playing): PAUSE dispatched, router.back() called", async () => {
    mockUseAppStore.mockReturnValue(
      buildStoreState({ currentTrack: { libraryItemId: "item-1" }, isPlaying: true })
    );

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://play-pause");

    expect(mockDispatchPlayerEvent).toHaveBeenCalledWith({ type: "PAUSE" });
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it("test 12 (sideshelf://play-pause while paused): PLAY dispatched, router.back() called", async () => {
    mockUseAppStore.mockReturnValue(
      buildStoreState({ currentTrack: { libraryItemId: "item-1" }, isPlaying: false })
    );

    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("sideshelf://play-pause");

    expect(mockDispatchPlayerEvent).toHaveBeenCalledWith({ type: "PLAY" });
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it("test 13 (unknown scheme): no navigation, no dispatch", async () => {
    expect(handleDeepLinkUrl).toBeDefined();
    await handleDeepLinkUrl("unknown://some-action");

    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockDispatchPlayerEvent).not.toHaveBeenCalled();
  });
});
