/**
 * Session Reconciliation Types
 *
 * Types for timestamp-based session reconciliation across multiple devices.
 * See: docs/architecture/timestamp-based-session-reconciliation.md
 */

/**
 * Result of reconciling local session with server progress
 */
export interface SessionReconciliationResult {
  /** Action to take based on reconciliation */
  action: "use_server" | "use_local" | "no_change";
  /** Position before reconciliation (seconds) */
  previousPosition: number;
  /** Position after reconciliation (seconds) */
  newPosition: number;
  /** Reason for the reconciliation decision */
  reason: "newer_server_progress" | "newer_local_session" | "no_conflict";
  /** Whether to show undo toast notification */
  shouldShowUndo: boolean;
  /** Local session ID if it was ended during reconciliation */
  sessionEndedLocally?: string;
  /** Server session information if using server position */
  serverSessionInfo?: {
    updatedAt: Date;
    sessionId: string;
  };
}

/**
 * Information about a position jump between devices
 */
export interface PositionJumpInfo {
  /** Starting position (seconds) */
  from: number;
  /** Ending position (seconds) */
  to: number;
  /** Absolute difference in seconds */
  delta: number;
  /** Direction of the jump */
  direction: "forward" | "backward";
  /** When the server position was updated */
  serverTimestamp: Date;
  /** When the local position was updated */
  localTimestamp: Date;
}

/**
 * Unified session history item (local or server)
 */
export interface SessionHistoryItem {
  /** Session ID (local UUID or server ID) */
  id: string;
  /** When the session started (wall-clock) */
  sessionStart: Date;
  /** When the session ended (null if still active) */
  sessionEnd: Date | null;
  /** Starting position in media (seconds) */
  startTime: number;
  /** Current or final position in media (seconds) */
  currentTime: number;
  /** Total listening duration (seconds of wall-clock time) */
  timeListening: number;
  /** Last update timestamp */
  updatedAt: Date;
  /** Device information (from mediaPlayer field) */
  deviceInfo?: string;
  /** Whether this session came from local DB or server */
  source: "local" | "server";
  /** Whether local session has been synced (only for local sessions) */
  isSynced?: boolean;
}

/**
 * API response from GET /api/me/listening-sessions
 */
export interface ApiListeningSessionsResponse {
  sessions: ApiListeningSession[];
  total: number;
  page: number;
  itemsPerPage: number;
}

/**
 * Individual listening session from server
 */
export interface ApiListeningSession {
  id: string;
  userId: string;
  libraryId: string;
  libraryItemId: string;
  episodeId?: string;
  mediaType: string;
  displayTitle: string;
  displayAuthor: string;
  coverPath: string;
  duration: number;
  playMethod: number;
  mediaPlayer: string;
  startTime: number;
  currentTime: number;
  startedAt: number; // Unix timestamp (ms)
  updatedAt: number; // Unix timestamp (ms)
  timeListening: number;
  dayOfWeek: string;
  date: string;
}

/**
 * Undo position jump state
 */
export interface UndoPositionJumpState {
  /** Previous position to restore (seconds) */
  previousPosition: number;
  /** Session ID that was ended (if any) */
  previousSessionId: string | null;
  /** When the undo option expires (Unix timestamp ms) */
  expiresAt: number;
}
