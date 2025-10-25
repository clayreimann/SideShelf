import { apiFetch } from "@/lib/api/api";
import { logger } from "@/lib/logger";
import type {
  ApiError,
  ApiLibrariesResponse,
  ApiLibraryItem,
  ApiLibraryItemResponse,
  ApiLibraryItemsResponse,
  ApiLibraryResponse,
  ApiLibraryResponseWithFilterData,
  ApiLoginResponse,
  ApiMediaProgress,
  ApiMeResponse,
  ApiPlaySessionResponse,
} from "@/types/api";
import DeviceInfo from "react-native-device-info";

const log = logger.forTag("api:endpoints");

async function handleResponseError(response: Response, defaultMessage: string) {
  if (!response.ok) {
    const text = await response.clone().text();
    log.error(`${defaultMessage}: ${text}`);
    try {
      const error: ApiError = JSON.parse(text);
      throw new Error(error.message || error.error || defaultMessage);
    } catch (parseError) {
      // If JSON parsing fails, the server returned plain text (e.g., "OK", "Offline")
      // Use the raw text as the error message instead of exposing the parse error
      const errorMessage = text?.trim() || defaultMessage;
      log.warn(`Server returned non-JSON error response: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }
}

export async function fetchMe(): Promise<ApiMeResponse> {
  const response = await apiFetch("/api/me");
  await handleResponseError(response, "Failed to fetch user data");
  return response.json();
}

export async function fetchLibraries(): Promise<ApiLibrariesResponse> {
  const response = await apiFetch("/api/libraries");
  await handleResponseError(response, "Failed to fetch libraries");
  return response.json();
}

export async function fetchLibrary(
  libraryId: string
): Promise<ApiLibraryResponse> {
  const url = `/api/libraries/${libraryId}`;

  const response = await apiFetch(url);
  await handleResponseError(response, "Failed to fetch library");
  return response.json();
}

export async function fetchLibraryWithFilterData(
  libraryId: string
): Promise<ApiLibraryResponseWithFilterData> {
  const response = await apiFetch(
    `/api/libraries/${libraryId}?include=filterdata`
  );
  await handleResponseError(
    response,
    "Failed to fetch library with filterdata"
  );
  return response.json();
}

export async function fetchLibraryItems(
  libraryId: string
): Promise<ApiLibraryItemsResponse> {
  const response = await apiFetch(`/api/libraries/${libraryId}/items`);
  await handleResponseError(response, "Failed to fetch library items");
  return response.json();
}

export async function fetchLibraryItem(
  libraryItemId: string
): Promise<ApiLibraryItemResponse> {
  const response = await apiFetch(`/api/items/${libraryItemId}`);
  await handleResponseError(response, "Failed to fetch library item");
  return response.json();
}

// HEAD request to get the resolved cover URL; caller can use response.url
export async function fetchLibraryItemCoverHead(
  libraryItemId: string
): Promise<Response> {
  return await apiFetch(`/api/items/${libraryItemId}/cover`, {
    method: "HEAD",
  });
}

// Batch fetch library items with full details (includes authors, series, audioFiles, chapters, libraryFiles)
export async function fetchLibraryItemsBatch(
  libraryItemIds: string[]
): Promise<ApiLibraryItem[]> {
  const response = await apiFetch("/api/items/batch/get", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ libraryItemIds }),
  });

  await handleResponseError(response, "Failed to batch fetch library items");

  const data = await response.json();
  return data.libraryItems || [];
}

/**
 * Update media progress on the server
 */
export async function updateMediaProgress(
  libraryItemId: string,
  currentTime: number,
  duration: number,
  progress: number,
  isFinished: boolean = false
): Promise<void> {
  const response = await apiFetch(`/api/me/progress/${libraryItemId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      currentTime,
      duration,
      progress,
      isFinished,
    }),
  });

  await handleResponseError(response, "Failed to update media progress");
}

const PLAY_METHOD = {
  Direct_Play: 0,
  Direct_Stream: 1,
  Transcode: 2,
  Local: 3,
};

type DeviceInfo = {
  osName: string;
  osVersion: string;
  deviceName: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  sdkVersion: number | undefined;
  clientName: string;
  clientVersion: string;
  deviceId: string;
};

let CACHED_DEVICE_INFO: DeviceInfo | null = null;

export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (CACHED_DEVICE_INFO) {
    return CACHED_DEVICE_INFO;
  }
  const osName = DeviceInfo.getSystemName();
  const osVersion = DeviceInfo.getSystemVersion();
  const deviceName = await DeviceInfo.getDeviceName();
  const deviceType = DeviceInfo.getDeviceType();
  const manufacturer = await DeviceInfo.getManufacturer();
  const model = DeviceInfo.getModel();
  const sdkVersion =
    osName === "iOS" ? undefined : await DeviceInfo.getApiLevel();
  const clientName = "SideShelf";
  const clientVersion = `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`;
  const deviceId = DeviceInfo.getDeviceId();
  const deviceInfo = {
    osName,
    osVersion,
    deviceName,
    deviceType,
    manufacturer,
    model,
    sdkVersion,
    clientName,
    clientVersion,
    deviceId,
  };
  CACHED_DEVICE_INFO = deviceInfo;
  return deviceInfo;
}
/**
 * Create a new local session on the server
 * @param sessionId - UUIDv4 identifier for the local session
 * @param userId - The user ID
 * @param libraryId - The library ID
 * @param libraryItemId - The library item to create a session for
 * @param currentTime - Current playback position in seconds
 * @param timeListened - Total time listened in this session (usually 0 for new sessions)
 * @returns The created session object with ID
 */
export async function createLocalSession(
  sessionId: string,
  userId: string,
  libraryId: string,
  libraryItemId: string,
  startTime: number,
  currentTime: number,
  timeListened: number = 0
): Promise<{ id: string }> {
  const deviceInfo = await getDeviceInfo();
  const body = {
    id: sessionId,
    userId,
    libraryId,
    libraryItemId,
    startTime,
    currentTime,
    timeListened,
    playMethod: PLAY_METHOD.Local,
    deviceInfo,
    mediaPlayer: "react-native-track-player",
  };
  const bodyText = JSON.stringify(body);
  log.info(
    `Creating local session localId=${sessionId} libraryItem=${libraryItemId} body=${bodyText}`
  );
  const response = await apiFetch("/api/session/local", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: bodyText,
  });

  await handleResponseError(response, "Failed to create local session");

  // Try to parse JSON response, but handle non-JSON responses gracefully
  let result: any = {};
  try {
    const text = await response.text();
    if (text && text.trim()) {
      try {
        result = JSON.parse(text);
        log.info(
          `Created local session serverId=${
            result.id || sessionId
          } libraryItem=${libraryItemId} response=${JSON.stringify(result)}`
        );
      } catch (parseError) {
        // Server returned non-JSON response (e.g., "OK"), which is fine for this endpoint
        log.info(
          `Created local session localId=${sessionId} libraryItem=${libraryItemId} (server response: ${text.substring(0, 50)})`
        );
      }
    }
  } catch (error) {
    log.warn(`Failed to read response body: ${error}`);
  }

  return { id: sessionId };
}

/**
 * Sync an existing session's progress to the server
 * @param sessionId - The server session ID
 * @param currentTime - Current playback position in seconds
 * @param timeListened - Total time listened in this session
 * @param duration - Total duration of the media (optional, for validation)
 */
export async function syncSession(
  sessionId: string,
  currentTime: number,
  timeListened: number,
  duration?: number
): Promise<void> {
  let body: any = {
    currentTime,
    timeListened,
  };

  // Include duration if provided (matches iOS implementation)
  if (duration !== undefined) {
    body.duration = duration;
  }

  body = JSON.stringify(body);

  log.info(`Syncing session id=${sessionId} body=${body}`);
  const response = await apiFetch(`/api/session/${sessionId}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  await handleResponseError(response, `Failed to sync session id=${sessionId}`);
}

/**
 * Close a session on the server
 * @param sessionId - The server session ID to close
 */
export async function closeSession(sessionId: string): Promise<void> {
  const response = await apiFetch(`/api/session/${sessionId}/close`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  await handleResponseError(
    response,
    `Failed to close session id=${sessionId}`
  );
}

/**
 * Start a play session and get streaming URLs
 * @param libraryItemId - The library item to start playing
 * @returns The play session response with streaming URLs
 */
export async function startPlaySession(
  libraryItemId: string
): Promise<ApiPlaySessionResponse> {
  const response = await apiFetch(`/api/items/${libraryItemId}/play`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deviceInfo: await getDeviceInfo(),
      supportedMimeTypes: [
        "audio/mpeg",
        "audio/mp4",
        "audio/aac",
        "audio/flac",
        "audio/ogg",
        "audio/wav",
      ],
      mediaPlayer: "react-native-track-player",
      forceDirectPlay: true, // Prefer direct streaming over transcoding
    }),
  });

  await handleResponseError(response, `Failed to play item=${libraryItemId}`);

  return response.json();
}

/**
 * Fetch media progress for a library item from the server
 * @param libraryItemId - The library item ID
 * @param episodeId - Optional episode ID for podcast episodes
 * @returns The media progress data from the server
 */
export async function fetchMediaProgress(
  libraryItemId: string,
  episodeId?: string
): Promise<ApiMediaProgress> {
  const url = episodeId
    ? `/api/me/progress/${libraryItemId}/${episodeId}`
    : `/api/me/progress/${libraryItemId}`;

  const response = await apiFetch(url);
  await handleResponseError(response, "Failed to fetch media progress");
  return response.json();
}

export async function doPing(params: { baseUrl: string }): Promise<boolean> {
  try {
    const { baseUrl } = params;
    const base = baseUrl.trim().replace(/\/$/, "");

    log.info(`Pinging server at ${base}`);
    const response = await Promise.race([
      fetch(`${base}/ping`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }),
      new Promise<Response>((_, r) =>
        setTimeout(() => r(new Error("Ping timeout")), 5000)
      ),
    ]);
    if (!response.ok) {
      log.info(
        `Ping failed status=${response.status} text=${response.statusText}`
      );
      return false;
    }
    const data = await response.json();
    log.info(`Ping response: ${JSON.stringify(data)}`);
    return data?.success;
  } catch (e) {
    log.error("Ping error:", e as Error);
    return false;
  }
}

export async function login(
  baseUrl: string,
  username: string,
  password: string
): Promise<ApiLoginResponse> {
  const base = baseUrl.trim().replace(/\/$/, "");
  const url = `${base}/login`;
  log.info(`Login URL: ${url}`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-return-tokens": "true",
    },
    body: JSON.stringify({ username, password }),
  });
  log.info(
    `Login response: status=${response.status} text=${response.statusText}`
  );

  await handleResponseError(response, "Login failed");
  return response.json();
}
