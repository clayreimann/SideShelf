#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { randomUUID } from "node:crypto";

const SENSITIVE_KEY_PATTERN = /(password|token|authorization)/i;

const args = process.argv.slice(2);
const options = parseArgs(args);

if (options.help) {
  printUsage();
  process.exit(0);
}

const baseUrlInput =
  options.baseUrl || process.env.ABN_BASE_URL || options.serverUrl || "";
const normalizedBaseUrl = baseUrlInput ? normalizeBaseUrl(baseUrlInput) : null;

if (!normalizedBaseUrl) {
  printUsage("Missing required --base-url (or ABN_BASE_URL env)");
  process.exit(1);
}

let accessToken = options.accessToken || process.env.ABN_ACCESS_TOKEN || null;
let refreshToken =
  options.refreshToken || process.env.ABN_REFRESH_TOKEN || null;
const username = options.username || process.env.ABN_USERNAME || null;
const password = options.password || process.env.ABN_PASSWORD || null;

const libraryId = options.libraryId || null;
const libraryItemId = options.libraryItemId || null;
const episodeId = options.episodeId || null;
const currentTime = normalizeSessionSeconds(
  toNumber(options.currentTime, 0),
  0
);
const duration = toNumber(options.duration, undefined);
const timeListened = toNumber(options.timeListened, 0);
const baseTimeListening = normalizeSessionSeconds(timeListened, 0);
const startTime = normalizeSessionSeconds(
  toNumber(options.startTime, currentTime),
  currentTime
);
const sessionIdInput = options.sessionId || null;
const checkSessionReuse = toBoolean(options.checkSessionReuse, false);
const recreateSession = toBoolean(options.recreateSession, false);
const skipSync = toBoolean(options.skipSync, false);
const skipClose = toBoolean(options.skipClose, false);
const skipStartPlay = toBoolean(options.skipStartPlay, false);
const fetchProgress = toBoolean(options.fetchProgress, false);
const verbose = toBoolean(options.verbose, false);
const failFast = toBoolean(
  options.failFast,
  options["noFailFast"] === true ? false : true
);
const printJson = toBoolean(options.json ?? options.printJson, false);
const outputPath = options.output
  ? path.resolve(process.cwd(), options.output)
  : null;
const startedAtMs = toNumber(options.startedAt, Date.now());
const updatedAtMs = toNumber(options.updatedAt, startedAtMs);
const serverVersion = options.serverVersion
  ? String(options.serverVersion)
  : null;
const syncMode = normalizeSyncMode(
  options.syncMode,
  options.syncPlayback,
  options.syncMinimal
);
const usePlaybackSync = syncMode === "playback";
const useOpenSessionSync = toBoolean(
  options.openSessionSync ?? options.syncOpen ?? options.openSync,
  false
);

if (!accessToken && (!username || !password)) {
  printUsage(
    "Provide --username/--password (or ABN_USERNAME/ABN_PASSWORD env) when no access token is supplied."
  );
  process.exit(1);
}

const results = [];
let aborted = false;

const authState = {
  baseUrl: normalizedBaseUrl,
  token: accessToken,
};

const deviceInfo = buildDeviceInfo(options.deviceName);
const sessionInfo = {
  localSessionId: sessionIdInput || randomUUID(),
  serverSessionId: null,
};

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: normalizedBaseUrl,
  libraryId,
  libraryItemId,
  episodeId,
  options: {
    currentTime,
    duration,
    timeListened: baseTimeListening,
    startTime,
    checkSessionReuse,
    recreateSession,
    skipSync,
    skipClose,
    skipStartPlay,
    fetchProgress,
    startedAtMs,
    updatedAtMs,
    serverVersion,
    syncMode,
    openSessionSync: useOpenSessionSync,
  },
  deviceInfo,
  steps: results,
};

const context = {
  userId: null,
  libraries: [],
  mediaItem: null,
  mediaProgressBefore: null,
  mediaProgressAfter: null,
  serverVersion: serverVersion,
  playSession: null,
};

async function run() {
  if (!authState.token) {
    const loginStep = await performStep(
      "login",
      () =>
        apiRequest("/login", {
          method: "POST",
          auth: false,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-return-tokens": "true",
          },
          body: {
            username,
            password,
          },
        }),
      { abortOnFailure: true }
    );

    const loginData = loginStep.internal?.json;
    if (!loginData?.user) {
      failWithMessage(
        "Login response missing user object; cannot continue.",
        loginStep.entry
      );
      return;
    }

    const tokens = extractTokens(loginData.user);
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    authState.token = accessToken;
    context.userId = loginData.user.id ?? null;

    report.tokens = {
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
    };
  } else {
    report.tokens = {
      hasAccessToken: true,
      hasRefreshToken: Boolean(refreshToken),
      provided: true,
    };
  }

  if (!authState.token) {
    failWithMessage("Missing access token after login; aborting.");
    return;
  }

  const meStep = await performStep("fetch-me", () =>
    apiRequest("/api/me", { method: "GET" })
  );

  if (meStep.internal?.json?.id) {
    context.userId = meStep.internal.json.id;
  }

  const librariesStep = await performStep("fetch-libraries", () =>
    apiRequest("/api/libraries", { method: "GET" })
  );

  if (librariesStep.internal?.json?.libraries) {
    context.libraries = librariesStep.internal.json.libraries;
  }

  if (libraryId) {
    await performStep("fetch-library", () =>
      apiRequest(`/api/libraries/${libraryId}`, { method: "GET" })
    );
    await performStep("fetch-library-items", () =>
      apiRequest(`/api/libraries/${libraryId}/items`, { method: "GET" })
    );
  }

  if (libraryItemId) {
    const itemStep = await performStep("fetch-library-item", () =>
      apiRequest(`/api/items/${libraryItemId}`, { method: "GET" })
    );
    context.mediaItem = itemStep.internal?.json?.libraryItem ?? null;

    if (fetchProgress) {
      const progressStepBefore = await performStep("fetch-progress-before", () =>
        apiRequest(
          episodeId
            ? `/api/me/progress/${libraryItemId}/${episodeId}`
            : `/api/me/progress/${libraryItemId}`,
          { method: "GET" }
        )
      );
      context.mediaProgressBefore = progressStepBefore.internal?.json ?? null;
    }
  }

  if (libraryItemId && libraryId && context.userId) {
    await handleSessionLifecycle();
  } else if (libraryItemId && (!libraryId || !context.userId)) {
    console.warn(
      "Skipping session lifecycle because libraryId or userId is missing."
    );
  }

  if (libraryItemId && !skipStartPlay) {
    const playStep = await performStep("start-play-session", () =>
      apiRequest(`/api/items/${libraryItemId}/play`, {
        method: "POST",
        body: {
          deviceInfo,
          supportedMimeTypes: [
            "audio/mpeg",
            "audio/mp4",
            "audio/aac",
            "audio/flac",
            "audio/ogg",
            "audio/wav",
          ],
          mediaPlayer: "react-native-track-player",
          forceDirectPlay: true,
        },
      })
    );
    if (playStep.internal?.json) {
      context.playSession = playStep.internal.json;
    }
  }

  if (libraryItemId && fetchProgress) {
    const progressAfter = await performStep("fetch-progress-after", () =>
      apiRequest(
        episodeId
          ? `/api/me/progress/${libraryItemId}/${episodeId}`
          : `/api/me/progress/${libraryItemId}`,
        { method: "GET" }
      )
    );
    context.mediaProgressAfter = progressAfter.internal?.json ?? null;
  }

  report.session = {
    localSessionId: sessionInfo.localSessionId,
    serverSessionId: sessionInfo.serverSessionId,
  };

  if (outputPath) {
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n📄 Saved debug report to ${outputPath}`);
  }

  if (printJson && !outputPath) {
    console.log(JSON.stringify(report, null, 2));
  }

  if (results.some((step) => step.ok === false)) {
    process.exitCode = 1;
  }
}

async function handleSessionLifecycle() {
  sessionInfo.serverSessionId = sessionInfo.localSessionId;

  const creationPayload = buildLocalSessionPayload({
    startedAt: startedAtMs,
    updatedAt: updatedAtMs,
  });
  const createStep = await performStep("create-local-session", () =>
    apiRequest("/api/session/local", {
      method: "POST",
      body: creationPayload,
    })
  );

  sessionInfo.serverSessionId = extractServerSessionId(
    createStep.internal,
    sessionInfo.localSessionId
  );

  if (!sessionInfo.serverSessionId) {
    console.warn(
      "Could not determine server session id; subsequent sync/close steps will be skipped."
    );
    return;
  }

  if (!skipSync) {
    if (useOpenSessionSync) {
      const syncPayload = buildSyncPayload({
        updatedAt: Date.now(),
      });
      await performStep("sync-session", () =>
        apiRequest(`/api/session/${sessionInfo.serverSessionId}/sync`, {
          method: "POST",
          body: syncPayload,
        })
      );
    } else {
      const updatePayload = buildLocalSessionPayload({
        updatedAt: Date.now(),
      });
      await performStep("update-local-session", () =>
        apiRequest("/api/session/local", {
          method: "POST",
          body: updatePayload,
        })
      );
    }
  }

  if (recreateSession) {
    const recreatePayload = buildLocalSessionPayload({
      updatedAt: Date.now(),
    });
    await performStep("recreate-local-session", () =>
      apiRequest("/api/session/local", {
        method: "POST",
        body: recreatePayload,
      })
    );
  }

  if (!skipClose) {
    if (useOpenSessionSync) {
      await performStep("close-session", () =>
        apiRequest(`/api/session/${sessionInfo.serverSessionId}/close`, {
          method: "POST",
        })
      );
    } else {
      const entry = {
        label: "close-session (skipped: local sessions do not expose close endpoint)",
        ok: null,
        skipped: true,
        durationMs: 0,
      };
      results.push(entry);
      logStepResult(entry);
    }
  }

  if (checkSessionReuse) {
    if (useOpenSessionSync) {
      const reusePayload = buildSyncPayload({
        updatedAt: Date.now(),
      });
      await performStep("sync-after-close", () =>
        apiRequest(`/api/session/${sessionInfo.serverSessionId}/sync`, {
          method: "POST",
          body: reusePayload,
        })
      );
    } else {
      const entry = {
        label: "sync-after-close (skipped: local sessions stay closed)",
        ok: null,
        skipped: true,
        durationMs: 0,
      };
      results.push(entry);
      logStepResult(entry);
    }
  }
}

function parseArgs(argv) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith("--")) {
      rest.push(token);
      continue;
    }
    const keyRaw = token.slice(2);
    const key = toCamelCase(keyRaw);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      opts[key] = true;
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  opts._ = rest;
  return opts;
}

function toCamelCase(input) {
  if (!input) return input;
  if (input.startsWith("no-")) {
    const segment = input.slice(3);
    return `no${segment
      .split("-")
      .map((part, index) =>
        index === 0
          ? part.charAt(0).toUpperCase() + part.slice(1)
          : part.charAt(0).toUpperCase() + part.slice(1)
      )
      .join("")}`;
  }
  return input.replace(/-([a-zA-Z0-9])/g, (_, char) => char.toUpperCase());
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeSessionSeconds(value, fallback = 0) {
  const candidate = Number.isFinite(value) ? value : fallback;
  if (!Number.isFinite(candidate)) return 0;
  return Math.abs(candidate) > 1_000_000 ? candidate / 1000 : candidate;
}

function toBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  return fallback;
}

function normalizeBaseUrl(url) {
  return url.trim().replace(/\/$/, "");
}

function normalizeSyncMode(mode, playbackFlag, minimalFlag) {
  if (playbackFlag && !minimalFlag) return "playback";
  if (minimalFlag && !playbackFlag) return "minimal";
  const value = typeof mode === "string" ? mode.trim().toLowerCase() : null;
  if (!value) return "minimal";
  if (["playback", "full", "detailed"].includes(value)) {
    return "playback";
  }
  return "minimal";
}

function buildDeviceInfo(deviceName) {
  const platform = process.platform;
  const osName =
    platform === "darwin"
      ? "macOS"
      : platform === "win32"
      ? "Windows"
      : "Linux";
  return {
    osName,
    osVersion: os.release(),
    deviceName: deviceName || os.hostname(),
    deviceType: "desktop",
    manufacturer: "debug-script",
    model: `${osName}-${os.arch()}`,
    sdkVersion: platform === "darwin" ? undefined : os.release(),
    clientName: "SideShelf Debug Script",
    clientVersion: "1.0.0",
    deviceId: process.env.ABN_DEVICE_ID || randomUUID(),
  };
}

function safeDate(input) {
  const num = Number(input);
  if (!Number.isFinite(num)) return new Date();
  const date = new Date(num);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function formatDayOfWeek(date) {
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
  } catch {
    return "Unknown";
  }
}

function cleanObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return obj;
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    result[key] = value;
  }
  return result;
}

function determineMediaType(playData, mediaItem, episodeIdValue) {
  if (playData && typeof playData.mediaType === "string") {
    return playData.mediaType;
  }
  if (mediaItem && typeof mediaItem.mediaType === "string") {
    return mediaItem.mediaType;
  }
  if (episodeIdValue) {
    return "podcast";
  }
  return "book";
}

function resolveDurationSeconds(overrideDuration, playData, mediaItem) {
  const candidates = [
    overrideDuration,
    Number.isFinite(duration) ? duration : null,
    playData?.duration,
    mediaItem?.media?.duration,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const num = Number(candidate);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return undefined;
}

function extractAuthorFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const { authorName, authors, narrators } = metadata;
  if (typeof authorName === "string" && authorName.trim()) {
    return authorName.trim();
  }
  if (Array.isArray(authors) && authors.length > 0) {
    const first = authors[0];
    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
    if (first && typeof first === "object" && typeof first.name === "string" && first.name.trim()) {
      return first.name.trim();
    }
  }
  if (Array.isArray(narrators) && narrators.length > 0) {
    const narrator = narrators[0];
    if (typeof narrator === "string" && narrator.trim()) {
      return narrator.trim();
    }
  }
  return null;
}

function getDisplayTitle(metadata, playData, mediaItem) {
  if (playData && typeof playData.displayTitle === "string" && playData.displayTitle.trim()) {
    return playData.displayTitle.trim();
  }
  if (metadata && typeof metadata.title === "string" && metadata.title.trim()) {
    return metadata.title.trim();
  }
  const itemMetadata = mediaItem?.media?.metadata;
  if (itemMetadata && typeof itemMetadata.title === "string" && itemMetadata.title.trim()) {
    return itemMetadata.title.trim();
  }
  if (mediaItem && typeof mediaItem.title === "string" && mediaItem.title.trim()) {
    return mediaItem.title.trim();
  }
  return "Unknown Title";
}

function getDisplayAuthor(metadata, playData, mediaItem) {
  if (playData && typeof playData.displayAuthor === "string" && playData.displayAuthor.trim()) {
    return playData.displayAuthor.trim();
  }
  const primary = extractAuthorFromMetadata(metadata);
  if (primary) return primary;
  const itemMetadata = mediaItem?.media?.metadata;
  const fallback = extractAuthorFromMetadata(itemMetadata);
  if (fallback) return fallback;
  return "Unknown Author";
}

function buildSyncPayload(overrides = {}) {
  if (usePlaybackSync) {
    return buildPlaybackSessionPayload(overrides);
  }
  return buildMinimalSyncBody(overrides);
}

function buildMinimalSyncBody(overrides = {}) {
  const resolvedCurrentTime = normalizeSessionSeconds(
    overrides.currentTime,
    currentTime
  );
  const resolvedTimeListening = normalizeSessionSeconds(
    overrides.timeListening ?? overrides.timeListened,
    baseTimeListening
  );

  const durationCandidate =
    overrides.duration !== undefined
      ? overrides.duration
      : Number.isFinite(duration)
      ? duration
      : context.playSession?.duration ?? context.mediaItem?.media?.duration;

  const payload = cleanObject({
    currentTime: resolvedCurrentTime,
    timeListened: resolvedTimeListening,
  });

  const numDuration = Number(durationCandidate);
  if (Number.isFinite(numDuration)) {
    payload.duration = numDuration;
  }

  return payload;
}

function buildLocalSessionPayload(overrides = {}) {
  if (usePlaybackSync) {
    return buildPlaybackSessionPayload(overrides);
  }
  return buildMinimalLocalSessionPayload(overrides);
}

function buildMinimalLocalSessionPayload(overrides = {}) {
  const resolvedStartTime = normalizeSessionSeconds(
    overrides.startTime,
    startTime
  );
  const resolvedCurrentTime = normalizeSessionSeconds(
    overrides.currentTime,
    currentTime
  );
  const resolvedTimeListening = normalizeSessionSeconds(
    overrides.timeListening ?? overrides.timeListened,
    baseTimeListening
  );

  const resolvedStartedAt = Number.isFinite(overrides.startedAt)
    ? Math.round(overrides.startedAt)
    : Number.isFinite(startedAtMs)
    ? Math.round(startedAtMs)
    : Date.now();
  const resolvedUpdatedAt = Number.isFinite(overrides.updatedAt)
    ? Math.round(overrides.updatedAt)
    : Number.isFinite(updatedAtMs)
    ? Math.round(updatedAtMs)
    : resolvedStartedAt;

  const resolvedDuration = resolveDurationSeconds(
    overrides.duration,
    context.playSession,
    context.mediaItem
  );

  const payload = cleanObject({
    id: overrides.id ?? sessionInfo.serverSessionId,
    userId: overrides.userId ?? context.userId,
    libraryId: overrides.libraryId ?? libraryId,
    libraryItemId: overrides.libraryItemId ?? libraryItemId,
    episodeId:
      overrides.episodeId !== undefined
        ? overrides.episodeId
        : episodeId ?? undefined,
    startTime: resolvedStartTime,
    currentTime: resolvedCurrentTime,
    timeListening: resolvedTimeListening,
    timeListened: resolvedTimeListening,
    duration: resolvedDuration,
    playMethod: overrides.playMethod ?? 3,
    mediaPlayer:
      overrides.mediaPlayer ?? "react-native-track-player",
    deviceInfo: overrides.deviceInfo ?? deviceInfo,
    startedAt: resolvedStartedAt,
    updatedAt: resolvedUpdatedAt,
  });

  return payload;
}

function buildPlaybackSessionPayload(overrides = {}) {
  const playData = context.playSession;
  const mediaItem = context.mediaItem;
  const metadataCandidate =
    overrides.mediaMetadata ??
    playData?.mediaMetadata ??
    mediaItem?.media?.metadata ??
    {};
  const metadata =
    metadataCandidate && typeof metadataCandidate === "object"
      ? metadataCandidate
      : {};
  const chapters =
    overrides.chapters ??
    (Array.isArray(playData?.chapters)
      ? playData.chapters
      : Array.isArray(mediaItem?.media?.chapters)
      ? mediaItem.media.chapters
      : []);

  const resolvedStartTime = normalizeSessionSeconds(
    overrides.startTime,
    startTime
  );
  const resolvedCurrentTime = normalizeSessionSeconds(
    overrides.currentTime,
    currentTime
  );
  const resolvedTimeListening = normalizeSessionSeconds(
    overrides.timeListening ?? overrides.timeListened,
    baseTimeListening
  );

  const resolvedStartedAt = Number.isFinite(overrides.startedAt)
    ? Math.round(overrides.startedAt)
    : Number.isFinite(startedAtMs)
    ? Math.round(startedAtMs)
    : Date.now();
  const resolvedUpdatedAt = Number.isFinite(overrides.updatedAt)
    ? Math.round(overrides.updatedAt)
    : Number.isFinite(updatedAtMs)
    ? Math.round(updatedAtMs)
    : resolvedStartedAt;

  const resolvedDuration = resolveDurationSeconds(
    overrides.duration,
    playData,
    mediaItem
  );

  const payload = cleanObject({
    id: overrides.id ?? sessionInfo.serverSessionId,
    userId: overrides.userId ?? context.userId,
    libraryId: overrides.libraryId ?? libraryId,
    libraryItemId: overrides.libraryItemId ?? libraryItemId,
    episodeId:
      overrides.episodeId !== undefined
        ? overrides.episodeId
        : episodeId ?? undefined,
    mediaType:
      overrides.mediaType ??
      determineMediaType(playData, mediaItem, episodeId),
    mediaMetadata: metadata,
    chapters,
    displayTitle:
      overrides.displayTitle ??
      getDisplayTitle(metadata, playData, mediaItem),
    displayAuthor:
      overrides.displayAuthor ??
      getDisplayAuthor(metadata, playData, mediaItem),
    coverPath:
      overrides.coverPath ??
      playData?.coverPath ??
      mediaItem?.media?.coverPath ??
      null,
    duration: resolvedDuration,
    playMethod: overrides.playMethod ?? playData?.playMethod ?? 3,
    mediaPlayer:
      overrides.mediaPlayer ??
      playData?.mediaPlayer ??
      "react-native-track-player",
    deviceInfo: overrides.deviceInfo ?? deviceInfo,
    serverVersion:
      overrides.serverVersion ??
      context.serverVersion ??
      playData?.serverVersion ??
      undefined,
    date: overrides.date ?? formatDate(safeDate(resolvedUpdatedAt)),
    dayOfWeek:
      overrides.dayOfWeek ?? formatDayOfWeek(safeDate(resolvedUpdatedAt)),
    timeListening: resolvedTimeListening,
    timeListened: resolvedTimeListening,
    startTime: resolvedStartTime,
    currentTime: resolvedCurrentTime,
    startedAt: resolvedStartedAt,
    updatedAt: resolvedUpdatedAt,
  });

  return payload;
}

function extractTokens(user) {
  if (!user || typeof user !== "object") {
    return { accessToken: null, refreshToken: null };
  }
  const accessToken =
    user.accessToken || user.token || user.access_token || null;
  const refreshToken = user.refreshToken || user.refresh_token || null;
  return { accessToken, refreshToken };
}

function extractServerSessionId(internal, fallback) {
  if (!internal) return fallback;
  const { json, text } = internal;
  if (json && typeof json === "object" && typeof json.id === "string") {
    return json.id;
  }
  if (typeof text === "string" && text.trim().length > 0) {
    const trimmed = text.trim();
    if (trimmed.toUpperCase() !== "OK") {
      return trimmed;
    }
  }
  return fallback;
}

async function performStep(label, action, options = {}) {
  if (aborted) {
    return { entry: { label, skipped: true, ok: null }, internal: null };
  }

  const startedAt = Date.now();
  try {
    const { record, internal } = await action();
    const durationMs = Date.now() - startedAt;
    const entry = {
      label,
      durationMs,
      ...record,
    };
    results.push(entry);
    logStepResult(entry);
    if (record.ok === false && (failFast || options.abortOnFailure)) {
      aborted = true;
    }
    return { entry, internal };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = errorToString(error);
    const entry = {
      label,
      durationMs,
      ok: false,
      errorMessage: message,
    };
    results.push(entry);
    logStepResult(entry);
    if (failFast || options.abortOnFailure) {
      aborted = true;
    }
    return { entry, internal: null };
  }
}

async function apiRequest(path, options = {}) {
  const method = options.method || "GET";
  const auth = options.auth !== undefined ? options.auth : true;
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  let bodyToSend = options.body ?? null;
  let requestBody = null;

  if (
    bodyToSend &&
    typeof bodyToSend === "object" &&
    !(bodyToSend instanceof URLSearchParams)
  ) {
    requestBody = bodyToSend;
    bodyToSend = JSON.stringify(bodyToSend);
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
  } else if (typeof bodyToSend === "string") {
    requestBody = tryParseJson(bodyToSend) ?? bodyToSend;
  }

  if (auth && authState.token) {
    headers.Authorization = `Bearer ${authState.token}`;
  }

  const url = path.startsWith("http")
    ? path
    : `${authState.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const sanitizedRequestHeaders = sanitizeHeaders(headers);
  const sanitizedRequestBody = sanitizeValue(requestBody ?? bodyToSend ?? null);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: bodyToSend,
    });
    const rawText = await response.text();
    const json = tryParseJson(rawText);
    const sanitizedJson = sanitizeValue(json);
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const sanitizedResponseHeaders = sanitizeHeaders(responseHeaders);
    const errorMessage = response.ok
      ? null
      : deriveErrorMessage(json, rawText, response.status);

    const record = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      request: {
        url,
        method,
        headers: sanitizedRequestHeaders,
        body: sanitizedRequestBody,
      },
      response: {
        headers: sanitizedResponseHeaders,
        json: sanitizedJson,
        text: json === null ? rawText || null : null,
      },
      ...(errorMessage ? { errorMessage } : {}),
    };

    const internal = {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      json,
      text: rawText,
    };

    return { record, internal };
  } catch (error) {
    const message = errorToString(error);
    const record = {
      ok: false,
      status: null,
      statusText: "NetworkError",
      request: {
        url,
        method,
        headers: sanitizedRequestHeaders,
        body: sanitizedRequestBody,
      },
      response: null,
      errorMessage: message,
    };
    return { record, internal: { error } };
  }
}

function sanitizeValue(value, keyPath = []) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const parentKey = keyPath[keyPath.length - 1] || "";
    if (SENSITIVE_KEY_PATTERN.test(parentKey)) {
      return "<redacted>";
    }
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, keyPath));
  }
  const result = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = sanitizeValue(val, [...keyPath, key]);
  }
  return result;
}

function sanitizeHeaders(headers) {
  if (!headers) return headers;
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = "<redacted>";
    } else {
      result[key] = value;
    }
  }
  return result;
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function deriveErrorMessage(json, rawText, status) {
  if (json && typeof json === "object") {
    if (typeof json.message === "string") return json.message;
    if (typeof json.error === "string") return json.error;
  }
  if (typeof json === "string") return json;
  if (rawText && rawText.trim().length > 0) return rawText.trim();
  if (status === 404) return "Not Found";
  return null;
}

function logStepResult(entry) {
  const duration = entry.durationMs != null ? ` (${entry.durationMs}ms)` : "";
  if (entry.ok === false) {
    console.error(
      `✗ ${entry.label}${duration}${
        entry.errorMessage ? ` :: ${entry.errorMessage}` : ""
      }`
    );
  } else if (entry.ok === true || entry.ok === undefined) {
    const statusPart =
      entry.status !== undefined && entry.status !== null
        ? ` :: ${entry.status}${entry.statusText ? ` ${entry.statusText}` : ""}`
        : "";
    console.log(`✓ ${entry.label}${statusPart}${duration}`);
    if (verbose && entry.response) {
      console.log(
        JSON.stringify(
          {
            request: entry.request,
            response: entry.response,
            errorMessage: entry.errorMessage ?? undefined,
          },
          null,
          2
        )
      );
    }
  } else if (entry.skipped) {
    console.log(`- ${entry.label} (skipped)${duration}`);
  }
}

function errorToString(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return JSON.stringify(error);
}

function failWithMessage(message, entry) {
  const failure = {
    label: "fatal",
    ok: false,
    errorMessage: message,
  };
  if (entry) {
    failure.dependencies = { [entry.label]: entry };
  }
  results.push(failure);
  console.error(`✗ ${message}`);
  aborted = true;
}

function printUsage(problem) {
  if (problem) {
    console.error(`Error: ${problem}`);
  }
  console.log(`Usage:
  node scripts/abs-debug.mjs --base-url https://server --username USER --password PASS --library-id LIB --library-item-id ITEM [options]

Options:
  --base-url <url>              Base Audiobookshelf URL (or ABN_BASE_URL env)
  --username <name>             Username for login (or ABN_USERNAME env)
  --password <pass>             Password for login (or ABN_PASSWORD env)
  --access-token <token>        Use an existing access token (skips login)
  --refresh-token <token>       Provide an existing refresh token
  --library-id <id>             Library id for session testing
  --library-item-id <id>        Library item id for session testing
  --episode-id <id>             Episode id when targeting podcast episodes
  --session-id <id>             Local session id to reuse (default: random uuid)
  --current-time <seconds>      Current playback position in seconds (auto converts ms)
  --time-listened <seconds>     Total time listened (default: current time; auto converts ms)
  --duration <seconds>          Total media duration for sync
  --start-time <seconds>        Session start position (default: current time; auto converts ms)
  --started-at <epoch-ms>       Timestamp (ms) when session started (defaults to now)
  --updated-at <epoch-ms>       Timestamp (ms) for last update (defaults to started-at)
  --server-version <string>     Override server version stored in playback payload
  --sync-mode <minimal|playback> Choose sync body shape (default: minimal)
  --sync-playback               Shortcut for --sync-mode playback
  --sync-minimal                Shortcut for --sync-mode minimal
  --open-session-sync           Use /api/session/:id/sync and /close instead of /session/local updates
  --check-session-reuse         After closing, attempt another sync to observe failure
  --recreate-session            Re-run create session with same local id after first sync
  --skip-sync                   Do not call the sync endpoint
  --skip-close                  Skip closing the session
  --skip-start-play             Skip /play endpoint call
  --fetch-progress              Fetch media progress before and after sync
  --output <file>               Write report JSON to the specified file
  --json                        Print the report JSON to stdout
  --verbose                     Print sanitized request/response payloads as steps run
  --fail-fast <true|false>      Stop after first failed step (default: true)
  --help                        Show this message

Environment variables:
  ABN_BASE_URL, ABN_USERNAME, ABN_PASSWORD, ABN_ACCESS_TOKEN, ABN_REFRESH_TOKEN, ABN_DEVICE_ID`);
}

await run().catch((error) => {
  console.error("Unexpected failure:", error);
  process.exitCode = 1;
});
