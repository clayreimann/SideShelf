import type {
  ApiError,
  ApiLibrariesResponse,
  ApiLibraryItem,
  ApiLibraryItemResponse,
  ApiLibraryItemsResponse,
  ApiLibraryResponse,
  ApiLibraryResponseWithFilterData,
  ApiLoginResponse,
  ApiMeResponse
} from '@/types/api';
import { apiFetch } from './api';

export async function fetchMe(): Promise<ApiMeResponse> {
  const response = await apiFetch('/api/me');
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch user data');
  }
  return response.json();
}

export async function fetchLibraries(): Promise<ApiLibrariesResponse> {
  const response = await apiFetch('/api/libraries');
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch libraries');
  }
  return response.json();
}

export async function fetchLibrary(libraryId: string): Promise<ApiLibraryResponse> {
  const url = `/api/libraries/${libraryId}`

  const response = await apiFetch(url);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch library');
  }
  return response.json();
}

export async function fetchLibraryWithFilterData(libraryId: string): Promise<ApiLibraryResponseWithFilterData> {
  const response = await apiFetch(`/api/libraries/${libraryId}?include=filterdata`);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch library with filterdata');
  }
  return response.json();
}

export async function fetchLibraryItems(libraryId: string): Promise<ApiLibraryItemsResponse> {
  const response = await apiFetch(`/api/libraries/${libraryId}/items`);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch library items');
  }
  return response.json();
}

export async function fetchLibraryItem(libraryItemId: string): Promise<ApiLibraryItemResponse> {
  const response = await apiFetch(`/api/items/${libraryItemId}`);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch library item');
  }
  return response.json();
}

// HEAD request to get the resolved cover URL; caller can use response.url
export async function fetchLibraryItemCoverHead(libraryItemId: string): Promise<Response> {
  return await apiFetch(`/api/items/${libraryItemId}/cover`, { method: 'HEAD' });
}

// Batch fetch library items with full details (includes authors, series, audioFiles, chapters, libraryFiles)
export async function fetchLibraryItemsBatch(libraryItemIds: string[]): Promise<ApiLibraryItem[]> {
  const response = await apiFetch('/api/items/batch/get', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ libraryItemIds }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to batch fetch library items');
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
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
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
    throw new Error(error.message || error.error || 'Failed to update media progress');
  }
}

export async function login(baseUrl: string, username: string, password: string): Promise<ApiLoginResponse> {
  const base = baseUrl.trim().replace(/\/$/, '');
  const url = `${base}/login`;
  console.log('[auth] Login URL:', url);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-return-tokens': 'true',
    },
    body: JSON.stringify({ username, password }),
  });
  console.log('[auth] Login response:', response.status, response.statusText);

  if (!response.ok) {
    const text = await response.clone().text();
    console.log('[auth] Login error body:', text);
    let message = 'Login failed';
    try {
      const err = JSON.parse(text);
      message = err?.error || err?.message || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
