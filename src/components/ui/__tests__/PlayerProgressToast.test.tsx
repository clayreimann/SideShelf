import PlayerProgressToast from "@/components/ui/PlayerProgressToast";
import type { JumpHistoryEntry, JumpHistorySession } from "@/types/player";
import { act, fireEvent, render } from "@testing-library/react-native";
import { AppState, type AppStateEvent, type AppStateStatus } from "react-native";

const mockDismissJumpToast = jest.fn();
const mockRestoreJumpHistory = jest.fn<Promise<void>, []>();
const mockSetJumpHistoryModalVisible = jest.fn();
const mockRouterPush = jest.fn();
const mockAppStateSubscription = { remove: jest.fn() };

let mockPathname = "/(tabs)/home";
let mockAppStateListener: ((nextState: AppStateStatus) => void | Promise<void>) | undefined;
let mockStoreState: {
  player: { jumpHistory: JumpHistorySession | null };
  restoreJumpHistory: typeof mockRestoreJumpHistory;
  _dismissJumpToast: typeof mockDismissJumpToast;
  setJumpHistoryModalVisible: typeof mockSetJumpHistoryModalVisible;
};

jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

function makePendingJump(overrides: Partial<JumpHistoryEntry> = {}): JumpHistoryEntry {
  return {
    id: "jump-1",
    sessionId: "session-1",
    libraryItemId: "item-1",
    surface: "lock_screen",
    category: "skip_forward",
    fromPosition: 100,
    toPosition: 220,
    createdAt: 1_000,
    updatedAt: 1_000,
    toastPending: true,
    ...overrides,
  };
}

function makeHistory(entry: JumpHistoryEntry): JumpHistorySession {
  return {
    version: 1,
    libraryItemId: entry.libraryItemId,
    entries: [entry],
  };
}

describe("PlayerProgressToast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockPathname = "/(tabs)/home";
    mockAppStateListener = undefined;
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "active",
      writable: true,
    });

    const pendingJump = makePendingJump();
    mockStoreState = {
      player: { jumpHistory: makeHistory(pendingJump) },
      restoreJumpHistory: mockRestoreJumpHistory,
      _dismissJumpToast: mockDismissJumpToast,
      setJumpHistoryModalVisible: mockSetJumpHistoryModalVisible,
    };
    mockRestoreJumpHistory.mockResolvedValue();
    mockDismissJumpToast.mockImplementation(() => {
      const jumpHistory = mockStoreState.player.jumpHistory;
      mockStoreState.player.jumpHistory = jumpHistory && {
        ...jumpHistory,
        entries: jumpHistory.entries.map((entry) => ({ ...entry, toastPending: false })),
      };
    });
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((event: AppStateEvent, listener: (nextState: AppStateStatus) => void) => {
        if (event === "change") {
          mockAppStateListener = listener;
        }
        return mockAppStateSubscription;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("renders the net delta for an aggregated pending jump", () => {
    const { getByText } = render(<PlayerProgressToast />);

    expect(getByText("Jumped to 3:40 (+2:00)")).toBeTruthy();
  });

  it("does not expire a pending jump while backgrounded and starts the timer on foreground", async () => {
    AppState.currentState = "background";
    render(<PlayerProgressToast />);

    act(() => jest.advanceTimersByTime(10_000));
    expect(mockDismissJumpToast).not.toHaveBeenCalled();

    await act(async () => {
      await mockAppStateListener?.("active");
    });
    expect(mockRestoreJumpHistory).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(7_000));
    expect(mockDismissJumpToast).toHaveBeenCalledTimes(1);
  });

  it("waits for jump-history restoration before beginning the foreground timer", async () => {
    let resolveRestore: (() => void) | undefined;
    mockRestoreJumpHistory.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRestore = resolve;
      })
    );
    AppState.currentState = "background";
    render(<PlayerProgressToast />);

    act(() => {
      void mockAppStateListener?.("active");
    });
    act(() => jest.advanceTimersByTime(10_000));
    expect(mockDismissJumpToast).not.toHaveBeenCalled();

    await act(async () => {
      resolveRestore?.();
    });
    act(() => jest.advanceTimersByTime(7_000));
    expect(mockDismissJumpToast).toHaveBeenCalledTimes(1);
  });

  it("does not let a stale active restoration resume the toast after a newer background event", async () => {
    let resolveRestore: (() => void) | undefined;
    mockRestoreJumpHistory.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRestore = resolve;
      })
    );
    AppState.currentState = "background";
    const view = render(<PlayerProgressToast />);

    act(() => {
      void mockAppStateListener?.("active");
    });
    await act(async () => {
      await mockAppStateListener?.("background");
    });
    await act(async () => {
      resolveRestore?.();
    });

    expect(view.queryByText("Jumped to 3:40 (+2:00)")).toBeNull();
    act(() => jest.advanceTimersByTime(7_000));
    expect(mockDismissJumpToast).not.toHaveBeenCalled();
  });

  it("keeps the toast hidden while backgrounded or restoring and shows it after restoration", async () => {
    let resolveRestore: (() => void) | undefined;
    mockRestoreJumpHistory.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRestore = resolve;
      })
    );
    AppState.currentState = "background";
    const view = render(<PlayerProgressToast />);

    expect(view.queryByText("Jumped to 3:40 (+2:00)")).toBeNull();
    act(() => {
      void mockAppStateListener?.("active");
    });
    expect(view.queryByText("Jumped to 3:40 (+2:00)")).toBeNull();

    await act(async () => {
      resolveRestore?.();
    });
    expect(view.getByText("Jumped to 3:40 (+2:00)")).toBeTruthy();
  });

  it("restarts the visible interval when an additive skip updates the pending jump", () => {
    const pendingJump = makePendingJump();
    const view = render(<PlayerProgressToast />);

    act(() => jest.advanceTimersByTime(6_000));
    mockStoreState.player.jumpHistory = makeHistory({
      ...pendingJump,
      toPosition: 250,
      updatedAt: 2_000,
    });
    view.rerender(<PlayerProgressToast />);

    act(() => jest.advanceTimersByTime(6_000));
    expect(mockDismissJumpToast).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1_000));
    expect(mockDismissJumpToast).toHaveBeenCalledTimes(1);
  });

  it("opens the full-screen history modal from outside the player", () => {
    const { getByText } = render(<PlayerProgressToast />);

    fireEvent.press(getByText("View Jump History"));

    expect(mockSetJumpHistoryModalVisible).toHaveBeenCalledWith(true);
    expect(mockRouterPush).toHaveBeenCalledWith("/FullScreenPlayer");
  });

  it("opens the history modal without pushing when already on the full-screen player", () => {
    mockPathname = "/FullScreenPlayer";
    const { getByText } = render(<PlayerProgressToast />);

    fireEvent.press(getByText("View Jump History"));

    expect(mockSetJumpHistoryModalVisible).toHaveBeenCalledWith(true);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("dismisses the toast while retaining the ledger entry", () => {
    const pendingJump = makePendingJump();
    const view = render(<PlayerProgressToast />);

    fireEvent.press(view.getByLabelText("Dismiss"));
    view.rerender(<PlayerProgressToast />);

    expect(mockDismissJumpToast).toHaveBeenCalledTimes(1);
    expect(mockStoreState.player.jumpHistory).toEqual(
      makeHistory({ ...pendingJump, toastPending: false })
    );
    expect(view.queryByText("Jumped to 3:40 (+2:00)")).toBeNull();
  });

  it("removes its AppState listener and visible timer when unmounted", () => {
    const { unmount } = render(<PlayerProgressToast />);

    unmount();
    act(() => jest.advanceTimersByTime(7_000));

    expect(mockAppStateSubscription.remove).toHaveBeenCalledTimes(1);
    expect(mockDismissJumpToast).not.toHaveBeenCalled();
  });
});
