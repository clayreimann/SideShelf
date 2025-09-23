import { apiFetch } from './api';
import type {
  ApiError,
  LibrariesResponse,
  LibraryItem,
  LibraryItemResponse,
  LibraryItemsResponse,
  LibraryResponse,
  LibraryResponseWithFilterData,
  LoginResponse,
  MeResponse
} from './types';

export async function fetchMe(): Promise<MeResponse> {
  const response = await apiFetch('/api/me');
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch user data');
  }
  return response.json();
}

export async function fetchLibraries(): Promise<LibrariesResponse> {
  const response = await apiFetch('/api/libraries');
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch libraries');
  }
  return response.json();
}

export async function fetchLibrary(libraryId: string): Promise<LibraryResponse> {
  const url = `/api/libraries/${libraryId}`

  const response = await apiFetch(url);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch library');
  }
  return response.json();
}

export async function fetchLibraryWithFilterData(libraryId: string): Promise<LibraryResponseWithFilterData> {
  const response = await apiFetch(`/api/libraries/${libraryId}?include=filterdata`);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch library with filterdata');
  }
  return response.json();
}

export async function fetchLibraryItems(libraryId: string): Promise<LibraryItemsResponse> {
  const response = await apiFetch(`/api/libraries/${libraryId}/items`);
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || error.error || 'Failed to fetch library items');
  }
  return response.json();
}

export async function fetchLibraryItem(libraryItemId: string): Promise<LibraryItemResponse> {
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
export async function fetchLibraryItemsBatch(libraryItemIds: string[]): Promise<LibraryItem[]> {
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

export async function login(baseUrl: string, username: string, password: string): Promise<LoginResponse> {
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
