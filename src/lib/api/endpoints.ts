import type {
  ApiError,
  ApiLibrariesResponse,
  ApiLibraryItem,
  ApiLibraryItemResponse,
  ApiLibraryItemsResponse,
  ApiLibraryResponse,
  ApiLibraryResponseWithFilterData,
  ApiLoginResponse,
  ApiMeResponse,
  ApiPlaySessionResponse,
} from "@/types/api";
import DeviceInfo from "react-native-device-info";
import { apiFetch } from "./api";

export async function fetchMe(): Promise<ApiMeResponse> {
  const response = await apiFetch("/api/me");
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      error.message || error.error || "Failed to fetch user data"
    );
  }
  return response.json();
}

export async function fetchLibraries(): Promise<ApiLibrariesResponse> {
  const response = await apiFetch("/api/libraries");
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      error.message || error.error || "Failed to fetch libraries"
    );
  }
  return response.json();
}

export async function fetchLibrary(
  libraryId: string
): Promise<ApiLibraryResponse> {
  const url = `/api/libraries/${libraryId}`;

  const response = await apiFetch(url);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || "Failed to fetch library");
  }
  return response.json();
}

export async function fetchLibraryWithFilterData(
  libraryId: string
): Promise<ApiLibraryResponseWithFilterData> {
  const response = await apiFetch(
    `/api/libraries/${libraryId}?include=filterdata`
  );
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      error.message || error.error || "Failed to fetch library with filterdata"
    );
  }
  return response.json();
}

export async function fetchLibraryItems(
  libraryId: string
): Promise<ApiLibraryItemsResponse> {
  const response = await apiFetch(`/api/libraries/${libraryId}/items`);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      error.message || error.error || "Failed to fetch library items"
    );
  }
  return response.json();
}

export async function fetchLibraryItem(
  libraryItemId: string
): Promise<ApiLibraryItemResponse> {
  const response = await apiFetch(`/api/items/${libraryItemId}`);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      error.message || error.error || "Failed to fetch library item"
    );
  }
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

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      error.message || error.error || "Failed to batch fetch library items"
    );
  }

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

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      error.message || error.error || "Failed to update media progress"
    );
  }
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
  const clientVersion = DeviceInfo.getVersion();
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
  currentTime: number,
  timeListened: number = 0
): Promise<{ id: string }> {
  const deviceInfo = await getDeviceInfo();
  const body = JSON.stringify({
    id: sessionId,
    userId,
    libraryId,
    libraryItemId,
    currentTime,
    timeListened,
    playMethod: PLAY_METHOD.Local,
    deviceInfo,
    mediaPlayer: "react-native-track-player",
  });
  const response = await apiFetch("/api/session/local", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    // Get the response text first, then try to parse as JSON
    const responseText = await response.text();
    let errorMessage = "Failed to create local session";

    try {
      const error: ApiError = JSON.parse(responseText);
      errorMessage = error.message || error.error || errorMessage;
    } catch {
      // If JSON parsing fails, use the raw text response
      if (responseText.includes("Media item not found")) {
        errorMessage = "Media item not found";
      } else {
        errorMessage = responseText || errorMessage;
      }
    }

    console.error(
      `[createLocalSession] Error for library item ${libraryItemId}: ${errorMessage}`
    );
    throw new Error(errorMessage);
  }

  return {id: sessionId};
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

  const response = await apiFetch(`/api/session/${sessionId}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || "Failed to sync session");
  }
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

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || "Failed to close session");
  }
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

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      error.message || error.error || "Failed to start play session"
    );
  }

  return response.json();
}

export async function doPing(params: { baseUrl: string }): Promise<boolean> {
  try {
    const { baseUrl } = params;
    const base = baseUrl.trim().replace(/\/$/, "");

    console.log("[ping] Pinging server at:", base);
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
      console.log("[ping] Ping failed:", response.status, response.statusText);
      return false;
    }
    const data = await response.json();
    console.log("[ping] Ping response:", data);
    return data?.success;
  } catch (e) {
    console.log("[ping] Ping error:", e);
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
  console.log("[auth] Login URL:", url);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-return-tokens": "true",
    },
    body: JSON.stringify({ username, password }),
  });
  console.log("[auth] Login response:", response.status, response.statusText);

  if (!response.ok) {
    const text = await response.clone().text();
    console.log("[auth] Login error body:", text);
    let message = "Login failed";
    try {
      const err = JSON.parse(text);
      message = err?.error || err?.message || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
