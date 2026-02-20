/**
 * Mock factories for service classes
 *
 * These factories provide reusable mock implementations for services
 * used across the application.
 */

export interface MockProgressService {
  getCurrentSession: jest.Mock;
  startSession: jest.Mock;
  updateProgress: jest.Mock;
  endSession: jest.Mock;
  syncProgress: jest.Mock;
}

/**
 * Create a mock ProgressService with sensible defaults
 *
 * @example
 * const mockProgressService = createMockProgressService();
 * jest.mock('@/services/ProgressService', () => ({
 *   progressService: mockProgressService
 * }));
 *
 * @example
 * // With custom getCurrentSession behavior
 * const mockProgressService = createMockProgressService();
 * mockProgressService.getCurrentSession.mockResolvedValue({
 *   id: 'session-1',
 *   libraryItemId: 'item-1',
 *   currentTime: 300
 * });
 */
export function createMockProgressService(): MockProgressService {
  return {
    getCurrentSession: jest.fn().mockResolvedValue(null),
    startSession: jest.fn().mockResolvedValue({ id: "new-session" }),
    updateProgress: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
    syncProgress: jest.fn().mockResolvedValue(undefined),
  };
}

export interface MockPlayerService {
  initialize: jest.Mock;
  playTrack: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  stop: jest.Mock;
  togglePlayPause: jest.Mock;
  seekTo: jest.Mock;
  setRate: jest.Mock;
  setVolume: jest.Mock;
  verifyConnection: jest.Mock;
  restorePlayerServiceFromSession: jest.Mock;
}

/**
 * Create a mock PlayerService with sensible defaults
 *
 * @example
 * const mockPlayerService = createMockPlayerService();
 */
export function createMockPlayerService(): MockPlayerService {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    playTrack: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    togglePlayPause: jest.fn().mockResolvedValue(undefined),
    seekTo: jest.fn().mockResolvedValue(undefined),
    setRate: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),
    verifyConnection: jest.fn().mockResolvedValue(true),
    restorePlayerServiceFromSession: jest.fn().mockResolvedValue(undefined),
  };
}
