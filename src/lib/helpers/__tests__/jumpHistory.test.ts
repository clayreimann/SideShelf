import type { JumpHistorySession, JumpRecordInput } from "@/types/player";
import {
  dismissPendingJump,
  getPendingJump,
  recordJump,
  validateJumpHistorySession,
} from "@/lib/helpers/jumpHistory";

const firstSkip: JumpRecordInput = {
  id: "jump-1",
  sessionId: "session-1",
  libraryItemId: "item-1",
  surface: "full_screen",
  category: "skip_forward",
  fromPosition: 100,
  toPosition: 130,
  createdAt: 1_000,
  updatedAt: 1_000,
};

describe("jumpHistory", () => {
  it("aggregates a same-surface forward skip while the prior toast is pending", () => {
    const first = recordJump(null, firstSkip);
    const aggregated = recordJump(first, {
      ...firstSkip,
      id: "jump-2",
      fromPosition: 130,
      toPosition: 220,
      createdAt: 2_000,
      updatedAt: 2_000,
    });

    expect(aggregated.entries).toEqual([
      expect.objectContaining({
        id: "jump-1",
        fromPosition: 100,
        toPosition: 220,
        createdAt: 1_000,
        updatedAt: 2_000,
        toastPending: true,
      }),
    ]);
  });

  it("starts a new entry after the toast is dismissed", () => {
    const dismissed = dismissPendingJump(recordJump(null, firstSkip));
    const next = recordJump(dismissed, {
      ...firstSkip,
      id: "jump-2",
      fromPosition: 130,
      toPosition: 160,
      createdAt: 2_000,
      updatedAt: 2_000,
    });

    expect(next.entries.map((entry) => entry.id)).toEqual(["jump-2", "jump-1"]);
  });

  it("does not aggregate an opposite skip direction", () => {
    const session = recordJump(recordJump(null, firstSkip), {
      ...firstSkip,
      id: "jump-2",
      category: "skip_backward",
      fromPosition: 130,
      toPosition: 100,
      createdAt: 2_000,
      updatedAt: 2_000,
    });

    expect(session.entries).toEqual([
      expect.objectContaining({ id: "jump-2", toastPending: true }),
      expect.objectContaining({ id: "jump-1", toastPending: false }),
    ]);
  });

  it("does not aggregate skips from different surfaces", () => {
    const session = recordJump(recordJump(null, firstSkip), {
      ...firstSkip,
      id: "jump-2",
      surface: "lock_screen",
      fromPosition: 130,
      toPosition: 160,
      createdAt: 2_000,
      updatedAt: 2_000,
    });

    expect(session.entries.map((entry) => entry.id)).toEqual(["jump-2", "jump-1"]);
  });

  it("does not aggregate non-skip categories", () => {
    const firstScrub = { ...firstSkip, category: "scrub" as const };
    const session = recordJump(recordJump(null, firstScrub), {
      ...firstScrub,
      id: "jump-2",
      fromPosition: 130,
      toPosition: 160,
      createdAt: 2_000,
      updatedAt: 2_000,
    });

    expect(session.entries).toEqual([
      expect.objectContaining({ id: "jump-2", toastPending: true }),
      expect.objectContaining({ id: "jump-1", toastPending: false }),
    ]);
  });

  it("starts an independent ledger when the library item changes", () => {
    const session = recordJump(recordJump(null, firstSkip), {
      ...firstSkip,
      id: "jump-2",
      libraryItemId: "item-2",
      fromPosition: 10,
      toPosition: 40,
      createdAt: 2_000,
      updatedAt: 2_000,
    });

    expect(session).toEqual({
      version: 1,
      libraryItemId: "item-2",
      entries: [
        expect.objectContaining({ id: "jump-2", libraryItemId: "item-2", toastPending: true }),
      ],
    });
  });

  it("returns the newest pending jump and clears it when dismissed", () => {
    const recorded = recordJump(null, firstSkip);

    expect(getPendingJump(recorded)).toEqual(expect.objectContaining({ id: "jump-1" }));
    expect(getPendingJump(dismissPendingJump(recorded))).toBeNull();
    expect(dismissPendingJump(null)).toBeNull();
  });

  it("stores non-aggregated entries newest first", () => {
    const firstChapter = { ...firstSkip, category: "chapter" as const };
    const session = recordJump(recordJump(null, firstChapter), {
      ...firstChapter,
      id: "jump-2",
      fromPosition: 130,
      toPosition: 260,
      createdAt: 2_000,
      updatedAt: 2_000,
    });

    expect(session.entries.map((entry) => entry.id)).toEqual(["jump-2", "jump-1"]);
  });

  it("keeps only the 100 newest entries", () => {
    let session: JumpHistorySession | null = null;

    for (let index = 1; index <= 101; index += 1) {
      session = recordJump(session, {
        ...firstSkip,
        id: `jump-${index}`,
        category: "chapter",
        fromPosition: index,
        toPosition: index + 1,
        createdAt: index,
        updatedAt: index,
      });
    }

    expect(session.entries).toHaveLength(100);
    expect(session.entries[0].id).toBe("jump-101");
    expect(session.entries[99].id).toBe("jump-2");
  });

  it("accepts a structurally valid restored snapshot for its library item", () => {
    const restored = {
      version: 1,
      libraryItemId: "item-1",
      entries: [{ ...firstSkip, toastPending: true }],
    };

    expect(validateJumpHistorySession(restored, "item-1")).toEqual(restored);
  });

  it("rejects restored snapshots with malformed entries", () => {
    const malformed = {
      version: 1,
      libraryItemId: "item-1",
      entries: [{ ...firstSkip, category: "teleport", toastPending: true }],
    };

    expect(validateJumpHistorySession(malformed, "item-1")).toBeNull();
  });

  it("rejects a restored snapshot for a different library item", () => {
    const restored = {
      version: 1,
      libraryItemId: "item-1",
      entries: [{ ...firstSkip, toastPending: true }],
    };

    expect(validateJumpHistorySession(restored, "item-2")).toBeNull();
  });
});
