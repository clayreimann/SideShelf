/**
 * Phase 17 Plan 04 — Task 1
 * Tests for handleCreateBookmark branching logic in FullScreenPlayer
 *
 * Tests pure logic extracted from the component:
 * handleCreateBookmarkLogic({ bookmarkTitleMode, createBookmark, autoTitle, showPromptInput, updateBookmarkTitleMode })
 */

import {
  handleCreateBookmarkLogic,
  handleLongPressBookmarkLogic,
} from "../handleCreateBookmarkLogic";

// Mock react-native Alert only — avoid spreading requireActual which triggers native module init
jest.mock("react-native", () => ({
  Alert: {
    alert: jest.fn(),
    prompt: jest.fn(),
  },
  Platform: {
    OS: "ios",
    select: jest.fn((obj: Record<string, unknown>) => obj.ios ?? obj.default),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Alert } = require("react-native") as { Alert: { alert: jest.Mock; prompt: jest.Mock } };

describe("handleCreateBookmarkLogic", () => {
  const mockCreateBookmark = jest.fn().mockResolvedValue(undefined);
  const mockShowPromptInput = jest.fn();
  const mockUpdateBookmarkTitleMode = jest.fn().mockResolvedValue(undefined);
  const autoTitle = "Chapter 1 \u2014 1m 23s";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("when bookmarkTitleMode is null, shows Alert.alert (first-tap preference)", () => {
    handleCreateBookmarkLogic({
      bookmarkTitleMode: null,
      createBookmark: mockCreateBookmark,
      autoTitle,
      showPromptInput: mockShowPromptInput,
      updateBookmarkTitleMode: mockUpdateBookmarkTitleMode,
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cancelable: true })
    );
    expect(mockCreateBookmark).not.toHaveBeenCalled();
    expect(mockShowPromptInput).not.toHaveBeenCalled();
  });

  it("when bookmarkTitleMode is 'auto', calls createBookmark immediately (no Alert, no prompt)", () => {
    handleCreateBookmarkLogic({
      bookmarkTitleMode: "auto",
      createBookmark: mockCreateBookmark,
      autoTitle,
      showPromptInput: mockShowPromptInput,
      updateBookmarkTitleMode: mockUpdateBookmarkTitleMode,
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockShowPromptInput).not.toHaveBeenCalled();
    expect(mockCreateBookmark).toHaveBeenCalledTimes(1);
    expect(mockCreateBookmark).toHaveBeenCalledWith(autoTitle);
  });

  it("when bookmarkTitleMode is 'prompt', shows prompt input (not createBookmark directly)", () => {
    handleCreateBookmarkLogic({
      bookmarkTitleMode: "prompt",
      createBookmark: mockCreateBookmark,
      autoTitle,
      showPromptInput: mockShowPromptInput,
      updateBookmarkTitleMode: mockUpdateBookmarkTitleMode,
    });

    expect(mockShowPromptInput).toHaveBeenCalledTimes(1);
    expect(mockShowPromptInput).toHaveBeenCalledWith(autoTitle, expect.any(Function));
    expect(mockCreateBookmark).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("null mode — pressing 'Auto-create' in Alert calls updateBookmarkTitleMode('auto') and createBookmark", async () => {
    handleCreateBookmarkLogic({
      bookmarkTitleMode: null,
      createBookmark: mockCreateBookmark,
      autoTitle,
      showPromptInput: mockShowPromptInput,
      updateBookmarkTitleMode: mockUpdateBookmarkTitleMode,
    });

    // Get the Alert buttons array
    const alertCall = Alert.alert.mock.calls[0];
    const buttons = alertCall[2] as Array<{ text: string; onPress?: () => void }>;
    const autoCreateButton = buttons.find((b) => b.text === "Auto-create");
    expect(autoCreateButton).toBeDefined();

    // Simulate pressing the Auto-create button
    autoCreateButton!.onPress?.();

    expect(mockUpdateBookmarkTitleMode).toHaveBeenCalledWith("auto");
    expect(mockCreateBookmark).toHaveBeenCalledWith(autoTitle);
  });
});

describe("handleLongPressBookmarkLogic", () => {
  const mockShowPromptInput = jest.fn();
  const autoTitle = "Chapter 1 \u2014 1m 23s";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("with bookmarkTitleMode='auto', shows prompt input (one-time override)", () => {
    handleLongPressBookmarkLogic({
      bookmarkTitleMode: "auto",
      autoTitle,
      showPromptInput: mockShowPromptInput,
    });

    expect(mockShowPromptInput).toHaveBeenCalledTimes(1);
    expect(mockShowPromptInput).toHaveBeenCalledWith(autoTitle, expect.any(Function));
  });

  it("with bookmarkTitleMode='prompt', is a no-op (long-press only overrides auto mode)", () => {
    handleLongPressBookmarkLogic({
      bookmarkTitleMode: "prompt",
      autoTitle,
      showPromptInput: mockShowPromptInput,
    });

    expect(mockShowPromptInput).not.toHaveBeenCalled();
  });
});
