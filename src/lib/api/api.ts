import { formatBytes } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import DeviceInfo from "react-native-device-info";

type ApiConfig = {
  getBaseUrl: () => string | null;
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<boolean>;
};

const log = logger.forTag("api:fetch");
const detailedLog = logger.forTag("api:fetch:detailed");

let config: ApiConfig | null = null;

let cachedUserAgent: string | null = null;

export function setApiConfig(next: ApiConfig) {
  config = next;
}

export function getApiConfig(): ApiConfig | null {
  return config;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function resolveUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  const base = config?.getBaseUrl();
  if (!base) return input;
  const normalized = normalizeBaseUrl(base);
  if (input.startsWith("/")) return `${normalized}${input}`;
  return `${normalized}/${input}`;
}

export type ApiFetchOptions = RequestInit & {
  auth?: boolean;
};

export async function apiFetch(
  pathOrUrl: string,
  init?: ApiFetchOptions
): Promise<Response> {
  const url = resolveUrl(pathOrUrl);
  const { auth = true, headers, ...rest } = init || {};
  const token = config?.getAccessToken();

  const headerObj: Record<string, string> = { Accept: "application/json" };
  mergeHeaders(headerObj, headers);

  if (auth && token) {
    headerObj["Authorization"] = `Bearer ${token}`;
  }

  const hasUserAgent = Object.keys(headerObj).some(
    (key) => key.toLowerCase() === "user-agent"
  );
  if (!hasUserAgent) {
    headerObj["User-Agent"] = getCustomUserAgent();
  }

  const method = (rest.method || "GET").toUpperCase();
  const startTime = Date.now();
  log.info(`-> ${method} ${scrubUrl(url)}`);
  detailedLog.info(`-> ${method} ${scrubUrl(url)} headers: ${JSON.stringify(redactHeaders(headerObj))} body: ${rest.body}`);

  const res = await fetch(url, { ...rest, headers: headerObj });
  const endTime = Date.now();
  const duration = endTime - startTime;
  log.info(`<- ${res.status} ${method} ${scrubUrl(url)} ${res.headers.get("content-type")} ${formatBytes(Number(res.headers.get("content-length")))} [${duration}ms]`);
  detailedLog.info(`<- ${res.status} ${method} ${scrubUrl(url)} headers: ${JSON.stringify(res.headers)} body: ${await res.clone().text()} [${duration}ms]`);
  if (res.status === 401) {
    log.info("access token expired, refreshing token...");
    const success = await config?.refreshAccessToken();
    if (success) {
      // Recursive call will have its own timing
      return await apiFetch(pathOrUrl, { ...init, headers: headerObj });
    }
  }
  if (!res.ok) {
    try {
      const text = await res.clone().text();
      log.warn(`Response body:\n${text}`);
    } catch {}
  }
  return res;
}

function mergeHeaders(
  target: Record<string, string>,
  source?: HeadersInit
): void {
  if (!source) return;
  if (source instanceof Headers) {
    source.forEach((value, key) => {
      target[key] = value;
    });
    return;
  }
  if (Array.isArray(source)) {
    for (const [key, value] of source) {
      target[key] = value;
    }
    return;
  }
  Object.assign(target, source as Record<string, string>);
}

function redactHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      redacted[key] = "<redacted>";
    } else if (key.toLowerCase() === "user-agent" && value === getCustomUserAgent()) {
      redacted[key] = "STD_USER_AGENT";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function scrubUrl(url: string): string {
  const baseUrl = config?.getBaseUrl();
  return url.replace(baseUrl?.split("://")[1] || "SKIP", "<base-url>");
}

function getCustomUserAgent(): string {
  if (cachedUserAgent) return cachedUserAgent;

  const systemName = DeviceInfo.getSystemName();
  const systemVersion = DeviceInfo.getSystemVersion();
  const model = DeviceInfo.getModel();
  const deviceType = DeviceInfo.getDeviceType();
  const appVersion = DeviceInfo.getVersion();
  const appName =
    (typeof DeviceInfo.getApplicationName === "function"
      ? DeviceInfo.getApplicationName()
      : undefined) || "SideShelf";

  let userAgent: string;

  if (systemName === "iOS") {
    const deviceToken = deviceType === "Tablet" ? "iPad" : "iPhone";
    const versionUnderscore = systemVersion?.replace(/\./g, "_") || "16_0";
    const majorVersion = systemVersion?.split(".")[0] || systemVersion || "16";
    userAgent = `Mozilla/5.0 (${deviceToken}; CPU ${deviceToken} OS ${versionUnderscore} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${majorVersion}.0 Mobile/15E148 Safari/604.1 ${appName}/${appVersion}`;
  } else if (systemName === "Android") {
    const sanitizedModel = model?.replace(/\s+/g, " ") || "Android";
    userAgent = `Mozilla/5.0 (Linux; Android ${systemVersion}; ${sanitizedModel}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 ${appName}/${appVersion}`;
  } else {
    const platform = `${systemName || "Unknown"} ${systemVersion || ""}`.trim();
    const sanitizedModel = model || "Device";
    userAgent = `Mozilla/5.0 (${platform}; ${sanitizedModel}) AppleWebKit/537.36 (KHTML, like Gecko) ${appName}/${appVersion}`;
  }

  cachedUserAgent = userAgent;
  return userAgent;
}
