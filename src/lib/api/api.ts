import { formatBytes } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { redactBody } from "@/lib/api/redact";
import { apiClientService } from "@/services/ApiClientService";
import DeviceInfo from "react-native-device-info";

const DETAILED_LOG_TAG = "api:fetch:detailed";
const log = logger.forTag("api:fetch");
const detailedLog = logger.forTag(DETAILED_LOG_TAG);

let cachedUserAgent: string | null = null;

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function resolveUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  const base = apiClientService.getBaseUrl();
  if (!base) return input;
  const normalized = normalizeBaseUrl(base);
  if (input.startsWith("/")) return `${normalized}${input}`;
  return `${normalized}/${input}`;
}

export type ApiFetchOptions = Omit<RequestInit, "signal"> & {
  auth?: boolean;
  timeout?: number; // Optional timeout in milliseconds
};

export async function apiFetch(pathOrUrl: string, init?: ApiFetchOptions): Promise<Response> {
  return apiFetchWithRetryGuard(pathOrUrl, init, /* isRetry */ false);
}

/**
 * Internal implementation with a one-retry guard on 401s.
 *
 * A 401 triggers at most one refresh + retry cycle. If the retried request
 * also comes back 401 (e.g. a revoked user, a permission-scoped endpoint, or
 * a reverse-proxy auth mismatch where /auth/refresh keeps succeeding but the
 * resource keeps rejecting), that second 401 is returned to the caller as-is
 * instead of recursing again — otherwise a misbehaving server can drive an
 * unbounded refresh/retry loop.
 */
async function apiFetchWithRetryGuard(
  pathOrUrl: string,
  init: ApiFetchOptions | undefined,
  isRetry: boolean
): Promise<Response> {
  const url = resolveUrl(pathOrUrl);
  const { auth = true, timeout, headers, ...rest } = init || {};
  const token = apiClientService.getAccessToken();

  const headerObj: Record<string, string> = { Accept: "application/json" };
  mergeHeaders(headerObj, headers);

  if (auth && token) {
    headerObj["Authorization"] = `Bearer ${token}`;
  }

  const hasUserAgent = Object.keys(headerObj).some((key) => key.toLowerCase() === "user-agent");
  if (!hasUserAgent) {
    headerObj["User-Agent"] = getCustomUserAgent();
  }

  // Apply timeout
  const { controller, timeoutId } = apiClientService.createTimeoutSignal(timeout);

  const method = (rest.method || "GET").toUpperCase();
  const startTime = Date.now();
  log.info(`-> ${method} ${scrubUrl(url)}`);
  logDetailedRequest(method, url, headerObj, rest.body);

  try {
    const res = await fetch(url, { ...rest, headers: headerObj, signal: controller.signal });
    const endTime = Date.now();
    const duration = endTime - startTime;
    log.info(
      `<- ${res.status} ${method} ${scrubUrl(url)} [${formatBytes(Number(res.headers.get("content-length")))}] [${duration}ms] [${res.headers.get("content-type")}]`
    );
    await logDetailedResponse(res, method, url, duration);
    if (res.status === 401 && !isRetry) {
      log.info("access token expired, refreshing token...");
      const success = await apiClientService.handleUnauthorized();
      if (success) {
        // Retry once with fresh token. isRetry=true ensures a second 401 is
        // returned as-is rather than triggering another refresh cycle.
        return await apiFetchWithRetryGuard(pathOrUrl, init, /* isRetry */ true);
      }
    }
    if (!res.ok) {
      try {
        const text = await res.clone().text();
        log.warn(`Response body:\n${redactBody(text)}`);
      } catch {}
    }
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Stringify a request body for logging, redacting credential fields. Only string
 * bodies (the only kind this app sends — always JSON.stringify'd) are inspected;
 * other BodyInit shapes (FormData, Blob, etc.) are never seen by this app but are
 * logged as a placeholder rather than risking an unredacted dump. */
function bodyForLog(body: unknown): string {
  if (typeof body === "string") return redactBody(body);
  if (body == null) return String(body);
  return "<non-string body>";
}

/**
 * Log the outgoing request at the "api:fetch:detailed" tag, if enabled.
 *
 * Guards on logger.isTagEnabled() up front — not just the sublogger's own
 * internal check — so that when the tag is disabled (the default; see
 * DEFAULT_DISABLED_TAGS in src/lib/logger/index.ts) we never even construct
 * the log string, headers, or redacted body.
 */
function logDetailedRequest(
  method: string,
  url: string,
  headerObj: Record<string, string>,
  body: unknown
): void {
  if (!logger.isTagEnabled(DETAILED_LOG_TAG)) return;
  detailedLog.info(
    `-> ${method} ${scrubUrl(url)} headers: ${JSON.stringify(redactHeaders(headerObj))} body: ${bodyForLog(body)}`
  );
}

/**
 * Log the incoming response at the "api:fetch:detailed" tag, if enabled.
 *
 * Guarded the same way as logDetailedRequest — when disabled, this never
 * clones or reads the response body, which otherwise happens on every single
 * API response in the app (see Brief D: this used to run unconditionally,
 * doubling parsing work and briefly holding multi-MB strings during a
 * full-library sync).
 */
async function logDetailedResponse(
  res: Response,
  method: string,
  url: string,
  duration: number
): Promise<void> {
  if (!logger.isTagEnabled(DETAILED_LOG_TAG)) return;
  // res.headers is RN's fetch Headers object — JSON.stringify(res.headers) yields
  // "{}" (a no-op), so iterate it into a plain record before logging/redacting.
  const responseHeaders = redactHeaders(headersToRecord(res.headers));
  const responseBody = await res.clone().text();
  detailedLog.info(
    `<- ${res.status} ${method} ${scrubUrl(url)} headers: ${JSON.stringify(responseHeaders)} body: ${redactBody(responseBody)} [${duration}ms]`
  );
}

function mergeHeaders(target: Record<string, string>, source?: HeadersInit): void {
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

const SENSITIVE_HEADERS = ["authorization", "x-refresh-token"];

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      redacted[key] = "<redacted>";
    } else if (key.toLowerCase() === "user-agent" && value === getCustomUserAgent()) {
      redacted[key] = "STD_USER_AGENT";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/** RN's fetch Headers object doesn't JSON.stringify usefully (yields "{}") — iterate
 * it into a plain record so it can actually be logged (and redacted). */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function scrubUrl(url: string): string {
  const baseUrl = apiClientService.getBaseUrl();
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
