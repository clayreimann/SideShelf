import { translate } from "@/i18n";
import type { ProgressFormat } from "@/lib/helpers/progressFormat";
import type { MenuAction } from "@react-native-menu/menu";

interface PlayerSettingsActionOptions {
  progressFormat: ProgressFormat;
  bookmarkTitleMode: "auto" | "prompt" | null;
  chapterBarShowRemaining: boolean;
  keepScreenAwake: boolean;
}

export function buildPlayerSettingsActions({
  progressFormat,
  bookmarkTitleMode,
  chapterBarShowRemaining,
  keepScreenAwake,
}: PlayerSettingsActionOptions): MenuAction[] {
  return [
    {
      id: "progressFormat",
      title: "Progress Format",
      subactions: [
        {
          id: "progressFormat-remaining",
          title: "Time Remaining",
          state: progressFormat === "remaining" ? "on" : "off",
        },
        {
          id: "progressFormat-elapsed",
          title: "Elapsed",
          state: progressFormat === "elapsed" ? "on" : "off",
        },
        {
          id: "progressFormat-percent",
          title: "Percent Complete",
          state: progressFormat === "percent" ? "on" : "off",
        },
      ],
    },
    {
      id: "bookmarkTitleMode",
      title: "Bookmark Title Mode",
      subactions: [
        {
          id: "bookmarkTitleMode-auto",
          title: "Auto-create",
          state: bookmarkTitleMode !== "prompt" ? "on" : "off",
        },
        {
          id: "bookmarkTitleMode-prompt",
          title: "Always Prompt",
          state: bookmarkTitleMode === "prompt" ? "on" : "off",
        },
      ],
    },
    {
      id: "chapterBarTime",
      title: "Chapter Bar Time",
      subactions: [
        {
          id: "chapterBar-total",
          title: "Show Total Duration",
          state: !chapterBarShowRemaining ? "on" : "off",
        },
        {
          id: "chapterBar-remaining",
          title: "Show Time Remaining",
          state: chapterBarShowRemaining ? "on" : "off",
        },
      ],
    },
    {
      id: "keepAwake",
      title: "Keep Screen Awake",
      state: keepScreenAwake ? "on" : "off",
    },
    {
      id: "jumpHistory",
      title: translate("player.jumpHistory.title"),
    },
  ];
}
