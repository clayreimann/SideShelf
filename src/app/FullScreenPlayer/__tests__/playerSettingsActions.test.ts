import { buildPlayerSettingsActions } from "@/app/FullScreenPlayer/playerSettingsActions";

describe("buildPlayerSettingsActions", () => {
  it("adds Jump History while preserving the current state of every existing settings group", () => {
    const actions = buildPlayerSettingsActions({
      progressFormat: "percent",
      bookmarkTitleMode: "prompt",
      chapterBarShowRemaining: true,
      keepScreenAwake: true,
    });

    expect(actions).toHaveLength(5);
    expect(actions).toContainEqual({ id: "jumpHistory", title: "Jump History" });

    expect(actions.find((action) => action.id === "progressFormat")?.subactions).toEqual([
      { id: "progressFormat-remaining", title: "Time Remaining", state: "off" },
      { id: "progressFormat-elapsed", title: "Elapsed", state: "off" },
      { id: "progressFormat-percent", title: "Percent Complete", state: "on" },
    ]);
    expect(actions.find((action) => action.id === "bookmarkTitleMode")?.subactions).toEqual([
      { id: "bookmarkTitleMode-auto", title: "Auto-create", state: "off" },
      { id: "bookmarkTitleMode-prompt", title: "Always Prompt", state: "on" },
    ]);
    expect(actions.find((action) => action.id === "chapterBarTime")?.subactions).toEqual([
      { id: "chapterBar-total", title: "Show Total Duration", state: "off" },
      { id: "chapterBar-remaining", title: "Show Time Remaining", state: "on" },
    ]);
    expect(actions.find((action) => action.id === "keepAwake")).toMatchObject({ state: "on" });
  });
});
