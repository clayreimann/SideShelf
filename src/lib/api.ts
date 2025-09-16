type ApiConfig = {
  getBaseUrl: () => string | null;
  getAccessToken: () => string | null;
};

let config: ApiConfig | null = null;

export function setApiConfig(next: ApiConfig) {
  config = next;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function resolveUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  const base = config?.getBaseUrl();
  if (!base) return input;
  const normalized = normalizeBaseUrl(base);
  if (input.startsWith('/')) return `${normalized}${input}`;
  return `${normalized}/${input}`;
}

export type ApiFetchOptions = RequestInit & {
  auth?: boolean;
};

export async function apiFetch(input: string, init?: ApiFetchOptions): Promise<Response> {
  const url = resolveUrl(input);
  const { auth = true, headers, ...rest } = init || {};
  const token = config?.getAccessToken();

  const mergedHeaders: HeadersInit = {
    Accept: 'application/json',
    ...(headers || {}),
  };
  if (auth && token) {
    (mergedHeaders as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const method = (rest.method || 'GET').toUpperCase();
  console.log(`[apiFetch] ${method} ${url}`);
  const res = await fetch(url, { ...rest, headers: mergedHeaders });
  console.log(`[apiFetch] <- ${res.status} ${res.statusText} for ${method} ${url}`);
  if (!res.ok) {
    try {
      const text = await res.clone().text();
      console.log(`[apiFetch] Response body (truncated):`, text.slice(0, 500));
    } catch {}
  }
  return res;
}
