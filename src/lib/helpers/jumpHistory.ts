import type {
  JumpCategory,
  JumpHistoryEntry,
  JumpHistorySession,
  JumpRecordInput,
  JumpSurface,
} from "@/types/player";

export const MAX_JUMP_HISTORY_ENTRIES = 100;

const JUMP_SURFACES: readonly JumpSurface[] = [
  "full_screen",
  "item_detail",
  "lock_screen",
  "native_player",
];

const JUMP_CATEGORIES: readonly JumpCategory[] = [
  "scrub",
  "skip_forward",
  "skip_backward",
  "chapter",
  "bookmark",
  "unexpected_native",
];

function canAggregate(previous: JumpHistoryEntry, next: JumpRecordInput): boolean {
  return (
    previous.toastPending &&
    previous.libraryItemId === next.libraryItemId &&
    previous.sessionId === next.sessionId &&
    previous.surface === next.surface &&
    previous.category === next.category &&
    (next.category === "skip_forward" || next.category === "skip_backward")
  );
}

export function recordJump(
  session: JumpHistorySession | null,
  input: JumpRecordInput
): JumpHistorySession {
  const active =
    session?.libraryItemId === input.libraryItemId
      ? session
      : { version: 1 as const, libraryItemId: input.libraryItemId, entries: [] };
  const [latest, ...older] = active.entries;

  if (latest && canAggregate(latest, input)) {
    return {
      ...active,
      entries: [
        { ...latest, toPosition: input.toPosition, updatedAt: input.updatedAt },
        ...older,
      ].slice(0, MAX_JUMP_HISTORY_ENTRIES),
    };
  }

  const cleared = active.entries.map((entry) =>
    entry.toastPending ? { ...entry, toastPending: false } : entry
  );
  return {
    ...active,
    entries: [{ ...input, toastPending: true }, ...cleared].slice(0, MAX_JUMP_HISTORY_ENTRIES),
  };
}

export function dismissPendingJump(session: JumpHistorySession | null): JumpHistorySession | null {
  if (!session) {
    return null;
  }

  return {
    ...session,
    entries: session.entries.map((entry) =>
      entry.toastPending ? { ...entry, toastPending: false } : entry
    ),
  };
}

export function getPendingJump(session: JumpHistorySession | null): JumpHistoryEntry | null {
  return session?.entries.find((entry) => entry.toastPending) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJumpSurface(value: unknown): value is JumpSurface {
  return typeof value === "string" && JUMP_SURFACES.includes(value as JumpSurface);
}

function isJumpCategory(value: unknown): value is JumpCategory {
  return typeof value === "string" && JUMP_CATEGORIES.includes(value as JumpCategory);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isJumpHistoryEntry(value: unknown): value is JumpHistoryEntry {
  if (!isRecord(value)) {
    return false;
  }

  return [
    typeof value.id === "string",
    typeof value.sessionId === "string" || value.sessionId === null,
    typeof value.libraryItemId === "string",
    isJumpSurface(value.surface),
    isJumpCategory(value.category),
    isFiniteNumber(value.fromPosition),
    isFiniteNumber(value.toPosition),
    isFiniteNumber(value.createdAt),
    isFiniteNumber(value.updatedAt),
    typeof value.toastPending === "boolean",
  ].every(Boolean);
}

export function validateJumpHistorySession(
  value: unknown,
  libraryItemId: string
): JumpHistorySession | null {
  if (!isRecord(value) || value.version !== 1 || value.libraryItemId !== libraryItemId) {
    return null;
  }

  if (!Array.isArray(value.entries) || value.entries.length > MAX_JUMP_HISTORY_ENTRIES) {
    return null;
  }

  const entries: JumpHistoryEntry[] = [];
  for (const entry of value.entries) {
    if (!isJumpHistoryEntry(entry) || entry.libraryItemId !== libraryItemId) {
      return null;
    }
    entries.push(entry);
  }

  return {
    version: 1,
    libraryItemId,
    entries,
  };
}
