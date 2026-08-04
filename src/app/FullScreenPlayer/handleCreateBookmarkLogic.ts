/**
 * Pure logic functions extracted from FullScreenPlayer handleCreateBookmark
 * for testability.
 */

import { Alert } from "react-native";

export interface HandleCreateBookmarkLogicParams {
  bookmarkTitleMode: "auto" | "prompt" | null;
  createBookmark: (title: string) => void;
  autoTitle: string;
  showPromptInput: (prefill: string, onConfirm: (title: string) => void) => void;
  updateBookmarkTitleMode: (mode: "auto" | "prompt") => void;
}

/**
 * Core branching logic for handleCreateBookmark.
 *
 * - null: first tap — shows Alert to choose preference, then proceeds with chosen mode
 * - 'auto': creates bookmark immediately with auto-title
 * - 'prompt': shows input prompt pre-filled with auto-title
 */
export function handleCreateBookmarkLogic({
  bookmarkTitleMode,
  createBookmark,
  autoTitle,
  showPromptInput,
  updateBookmarkTitleMode,
}: HandleCreateBookmarkLogicParams): void {
  if (bookmarkTitleMode === null) {
    // First tap — show one-time preference alert
    Alert.alert(
      "Bookmark Style",
      "How would you like to create bookmarks?",
      [
        {
          text: "Auto-create",
          onPress: () => {
            updateBookmarkTitleMode("auto");
            createBookmark(autoTitle);
          },
        },
        {
          text: "Always Prompt",
          onPress: () => {
            updateBookmarkTitleMode("prompt");
            showPromptInput(autoTitle, createBookmark);
          },
        },
      ],
      { cancelable: true }
    );
    return;
  }

  if (bookmarkTitleMode === "prompt") {
    showPromptInput(autoTitle, createBookmark);
    return;
  }

  // auto mode — create immediately
  createBookmark(autoTitle);
}

export interface HandleLongPressBookmarkLogicParams {
  bookmarkTitleMode: "auto" | "prompt" | null;
  autoTitle: string;
  showPromptInput: (prefill: string, onConfirm: (title: string) => void) => void;
}

/**
 * Long-press bookmark logic — only overrides in auto mode.
 * In prompt mode or null mode, long-press is a no-op.
 */
export function handleLongPressBookmarkLogic({
  bookmarkTitleMode,
  autoTitle,
  showPromptInput,
}: HandleLongPressBookmarkLogicParams): void {
  if (bookmarkTitleMode !== "auto") {
    return;
  }
  showPromptInput(autoTitle, (_title: string) => {
    // onConfirm will be provided by the caller in the component
  });
}
