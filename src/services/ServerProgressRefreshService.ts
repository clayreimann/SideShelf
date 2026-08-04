import {
  getActiveSession,
  reconcileSessionPositionFromServer,
} from "@/db/helpers/localListeningSessions";
import {
  marshalMediaProgressFromApi,
  marshalMediaProgressFromAuthResponse,
  upsertMediaProgress,
} from "@/db/helpers/mediaProgress";
import { fetchMe, fetchMediaProgress } from "@/lib/api/endpoints";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { apiClientService } from "@/services/ApiClientService";

const log = logger.forTag("ServerProgressRefreshService");

/** Owns authenticated server-to-local progress reconciliation. */
export class ServerProgressRefreshService {
  async refreshAll(canCommit: () => boolean = () => true): Promise<void> {
    if (!apiClientService.isAuthenticated()) {
      log.info("[refreshAll] Skipping refresh without active authentication");
      return;
    }
    const authGeneration = apiClientService.getAuthGeneration();
    log.info("[refreshAll] Fetching latest progress from server");
    const response = await fetchMe();
    const progress = marshalMediaProgressFromAuthResponse(response);

    if (progress.length === 0) {
      log.info("[refreshAll] No progress data to refresh");
      return;
    }

    // Authentication can change while fetchMe is in flight. Guard the mutation boundary
    // so a late response cannot repopulate data after logout or an account/server switch.
    if (!this._canCommit(authGeneration, canCommit)) {
      log.info("[refreshAll] Discarding response for stale authenticated identity");
      return;
    }

    await upsertMediaProgress(progress);
    log.info(`[refreshAll] Refreshed ${progress.length} progress entries`);
  }

  /** Reconcile one server position without marking the outbound outbox dirty. */
  async forceResyncPosition(userId: string, libraryItemId: string): Promise<void> {
    if (!apiClientService.isAuthenticated()) {
      log.info("[forceResyncPosition] Skipping refresh without active authentication");
      return;
    }
    const authGeneration = apiClientService.getAuthGeneration();
    log.info(
      `[forceResyncPosition] Fetching server position userId=${userId} libraryItemId=${libraryItemId}`
    );
    const response = await fetchMediaProgress(libraryItemId);
    if (!this._canCommit(authGeneration)) return;
    await upsertMediaProgress([marshalMediaProgressFromApi(response, userId)]);

    if (!this._canCommit(authGeneration)) return;
    const session = await getActiveSession(userId, libraryItemId);
    if (!this._canCommit(authGeneration)) return;
    if (!session) {
      log.info(`[forceResyncPosition] No active session for item=${libraryItemId}`);
      return;
    }

    await reconcileSessionPositionFromServer(session.id, response.currentTime);
    log.info(
      `[forceResyncPosition] Reconciled ${formatTime(response.currentTime)}s session=${session.id} item=${libraryItemId}`
    );
  }

  private _canCommit(authGeneration: number, callerGuard: () => boolean = () => true): boolean {
    const current = apiClientService.getAuthGeneration() === authGeneration && callerGuard();
    if (!current) log.info("[refresh] Discarding response for stale authenticated identity");
    return current;
  }
}

export const serverProgressRefreshService = new ServerProgressRefreshService();
