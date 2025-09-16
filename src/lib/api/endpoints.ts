import { apiFetch } from './api';

export async function fetchMe(): Promise<Response> {
  return apiFetch('/api/me');
}

export async function fetchLibraries(): Promise<Response> {
  return apiFetch('/api/libraries');
}

export async function fetchLibraryItems(libraryId: string): Promise<Response> {
  return await apiFetch(`/api/libraries/${libraryId}/items`);
}

export async function login(baseUrl: string, username: string, password: string): Promise<Response> {
  const base = baseUrl.trim().replace(/\/$/, '');
  async function tryPath(path: string) {
    const url = `${base}${path}`;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-return-tokens': 'true',
      },
      body: JSON.stringify({ username, password }),
    });
  }
  let res = await tryPath('/login');
  if (!res.ok) {
    res = await tryPath('/api/login');
  }
  return res;
}
