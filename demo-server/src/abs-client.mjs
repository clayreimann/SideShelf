// abs-client.mjs — minimal Audiobookshelf HTTP client for the seed script.
//
// Endpoints and payload shapes below are taken from the (self-described as
// "out of date but the only reference") official API docs at
// https://api.audiobookshelf.org/ , fetched and cross-checked on 2026-07-31
// against POST /init, GET /status, POST /login, POST /api/libraries,
// POST /api/libraries/:id/scan, GET /api/libraries/:id/items,
// GET /api/items/:id, PATCH /api/items/:id/media, POST /api/users, and
// PATCH /api/me/progress/:id. This has NOT been exercised against a live
// server in this environment (no Docker daemon available here) — see
// demo-server/README.md's verification notes.
//
// Node 20+ built-ins only (global fetch).

/**
 * @typedef {{ baseUrl: string, token?: string }} AbsClientOptions
 */

/**
 * Small wrapper error carrying the HTTP status and parsed/raw body so
 * callers can print something actionable instead of "fetch failed".
 */
export class AbsApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {unknown} body
   */
  constructor(message, status, body) {
    super(message);
    this.name = "AbsApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * @param {string} baseUrl
 * @param {string} pathName
 * @param {RequestInit & { token?: string }} [init]
 */
async function absFetch(baseUrl, pathName, init = {}) {
  const { token, headers, ...rest } = init;
  const url = new URL(pathName, baseUrl).toString();
  const response = await fetch(url, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new AbsApiError(
      `${init.method ?? "GET"} ${pathName} failed: HTTP ${response.status}`,
      response.status,
      body
    );
  }

  return body;
}

/**
 * GET /status — reports whether the server has completed initial setup.
 * @param {string} baseUrl
 * @returns {Promise<{ isInit: boolean, language?: string }>}
 */
export async function getStatus(baseUrl) {
  return absFetch(baseUrl, "/status");
}

/**
 * Poll GET /status until the server answers or the timeout elapses.
 * @param {string} baseUrl
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<{ isInit: boolean }>}
 */
export async function waitForServer(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await getStatus(baseUrl);
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for Audiobookshelf at ${baseUrl} to respond to GET /status. ` +
      `Last error: ${lastError?.message ?? "unknown"}`
  );
}

/**
 * POST /init — creates the root user. No-op-safe: callers should check
 * getStatus().isInit first, since a second call 500s.
 * @param {string} baseUrl
 * @param {string} username
 * @param {string} password
 */
export async function initServer(baseUrl, username, password) {
  return absFetch(baseUrl, "/init", {
    method: "POST",
    body: JSON.stringify({ newRoot: { username, password } }),
  });
}

/**
 * POST /login
 * @param {string} baseUrl
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ user: { id: string, token: string, type: string } }>}
 */
export async function login(baseUrl, username, password) {
  return absFetch(baseUrl, "/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

/**
 * GET /api/libraries
 * @param {string} baseUrl
 * @param {string} token
 * @returns {Promise<{ libraries: Array<{ id: string, name: string, folders: Array<{ fullPath: string }> }> }>}
 */
export async function getLibraries(baseUrl, token) {
  return absFetch(baseUrl, "/api/libraries", { token });
}

/**
 * POST /api/libraries — create a library if one doesn't already exist
 * pointed at the same folder. Idempotent: returns the existing library
 * when a library with a folder matching `folderFullPath` is found.
 *
 * @param {string} baseUrl
 * @param {string} token
 * @param {{ name: string, folderFullPath: string, mediaType?: string }} params
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function ensureLibrary(baseUrl, token, { name, folderFullPath, mediaType = "book" }) {
  const existing = await getLibraries(baseUrl, token);
  const match = existing.libraries?.find((lib) =>
    lib.folders?.some((f) => f.fullPath === folderFullPath)
  );
  if (match) return match;

  return absFetch(baseUrl, "/api/libraries", {
    method: "POST",
    token,
    body: JSON.stringify({ name, folders: [{ fullPath: folderFullPath }], mediaType }),
  });
}

/**
 * POST /api/libraries/:id/scan — triggers an async scan. Audiobookshelf
 * signals completion over socket.io (scan_complete), which this
 * dependency-free client cannot subscribe to. Use waitForScanToSettle()
 * below for a bounded, HTTP-polling approximation of "scan finished".
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} libraryId
 */
export async function triggerScan(baseUrl, token, libraryId) {
  return absFetch(baseUrl, `/api/libraries/${libraryId}/scan`, { method: "POST", token });
}

/**
 * GET /api/libraries/:id/items?limit=0 (minified list, all items)
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} libraryId
 * @returns {Promise<{ results: Array<Record<string, unknown>>, total: number }>}
 */
export async function getLibraryItems(baseUrl, token, libraryId) {
  return absFetch(baseUrl, `/api/libraries/${libraryId}/items?limit=0`, { token });
}

/**
 * Bounded poll: waits until GET /api/libraries/:id/items reports the same
 * item count across `stableChecksRequired` consecutive polls, or throws
 * once `timeoutMs` elapses. This is a heuristic stand-in for a real
 * "scan finished" signal (see triggerScan's doc comment) — it cannot
 * detect a scan that finishes with the same item count it started with
 * (e.g. a metadata-only rescan of an unchanged library), so callers doing
 * an initial seed (empty -> N items) are the supported case.
 *
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} libraryId
 * @param {{ timeoutMs?: number, intervalMs?: number, stableChecksRequired?: number, expectAtLeast?: number }} [options]
 * @returns {Promise<number>} final item count
 */
export async function waitForScanToSettle(baseUrl, token, libraryId, options = {}) {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const stableChecksRequired = options.stableChecksRequired ?? 3;
  const expectAtLeast = options.expectAtLeast ?? 1;

  const deadline = Date.now() + timeoutMs;
  let previousCount = -1;
  let stableChecks = 0;

  while (Date.now() < deadline) {
    const { total } = await getLibraryItems(baseUrl, token, libraryId);
    if (total === previousCount && total >= expectAtLeast) {
      stableChecks += 1;
      if (stableChecks >= stableChecksRequired) {
        return total;
      }
    } else {
      stableChecks = 0;
    }
    previousCount = total;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for library ${libraryId} scan to settle ` +
      `(last observed item count: ${previousCount}, expected at least ${expectAtLeast}).`
  );
}

/**
 * GET /api/items/:id?expanded=1 — full expanded media metadata, used to
 * verify the scanner's folder-name parse. Also the source of an item's
 * current `media.audioFiles` and `media.chapters` — there is no separate
 * "get chapters" endpoint, so callers that need chapters use this too.
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} itemId
 */
export async function getLibraryItem(baseUrl, token, itemId) {
  return absFetch(baseUrl, `/api/items/${itemId}?expanded=1`, { token });
}

/**
 * Bounded poll: waits until GET /api/items/:id?expanded=1 reports at least
 * `expectedCount` audio files, or throws once `timeoutMs` elapses.
 *
 * Adding files to an EXISTING item's folder does not change the library's
 * item COUNT, so waitForScanToSettle (which polls item count) returns
 * immediately and cannot detect this kind of rescan — see its doc comment's
 * "one known blind spot". This is the targeted follow-up for exactly that
 * gap: after downloading additional chapter files into an already-scanned
 * item's folder and re-triggering a scan, callers must wait for THIS before
 * reading `media.chapters` / `media.audioFiles`, or they will observe the
 * stale pre-rescan list.
 *
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} itemId
 * @param {number} expectedCount
 * @param {{ timeoutMs?: number, intervalMs?: number, itemLabel?: string }} [options]
 * @returns {Promise<Record<string, unknown>>} the expanded item once settled
 */
export async function waitForItemAudioFileCount(baseUrl, token, itemId, expectedCount, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const label = options.itemLabel ?? itemId;
  const deadline = Date.now() + timeoutMs;
  let lastCount = -1;

  while (Date.now() < deadline) {
    const expanded = await getLibraryItem(baseUrl, token, itemId);
    lastCount = expanded.media?.audioFiles?.length ?? 0;
    if (lastCount >= expectedCount) {
      return expanded;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for "${label}" to report ${expectedCount} audio file(s) ` +
      `(last observed: ${lastCount}). The rescan may not have picked up newly downloaded files yet.`
  );
}

/**
 * PATCH /api/items/:id/media — partial metadata patch; only send the
 * fields that need correcting.
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} itemId
 * @param {Record<string, unknown>} metadataPatch
 */
export async function patchItemMetadata(baseUrl, token, itemId, metadataPatch) {
  return absFetch(baseUrl, `/api/items/${itemId}/media`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ metadata: metadataPatch }),
  });
}

/**
 * POST /api/items/:id/chapters — replaces an item's entire chapter list.
 * Audiobookshelf does not support a partial chapter patch, so callers must
 * send the full desired list (typically the item's existing chapters with
 * only `title` changed — see demo-server/src/chapters.mjs).
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} itemId
 * @param {Array<{ id: number, start: number, end: number, title: string }>} chapters
 */
export async function updateChapters(baseUrl, token, itemId, chapters) {
  return absFetch(baseUrl, `/api/items/${itemId}/chapters`, {
    method: "POST",
    token,
    body: JSON.stringify({ chapters }),
  });
}

/**
 * GET /api/users (admin only) — used to make user creation idempotent.
 * @param {string} baseUrl
 * @param {string} token
 */
export async function getUsers(baseUrl, token) {
  return absFetch(baseUrl, "/api/users", { token });
}

/**
 * POST /api/users — create a non-root user.
 *
 * `isActive: true` is REQUIRED and must be sent explicitly. Audiobookshelf
 * creates users **inactive by default**, and an inactive user cannot log in —
 * POST /login returns 401 with no hint that the account merely needs
 * activating. This cost a full debugging cycle on the first live seed.
 *
 * @param {string} baseUrl
 * @param {string} adminToken
 * @param {{ username: string, password: string, type?: "user" | "admin" | "guest" }} params
 */
export async function createUser(baseUrl, adminToken, { username, password, type = "user" }) {
  return absFetch(baseUrl, "/api/users", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ username, password, type, isActive: true }),
  });
}

/**
 * PATCH /api/users/:id — used to repair an existing user (e.g. reactivating
 * one created before `isActive` was sent, or resetting its password so the
 * account matches demo-server/.env after those values change).
 * @param {string} baseUrl
 * @param {string} adminToken
 * @param {string} userId
 * @param {Record<string, unknown>} patch
 */
export async function updateUser(baseUrl, adminToken, userId, patch) {
  return absFetch(baseUrl, `/api/users/${userId}`, {
    method: "PATCH",
    token: adminToken,
    body: JSON.stringify(patch),
  });
}

/**
 * Idempotently ensure an ACTIVE demo user exists, returning a freshly
 * logged-in token for it.
 *
 * Two Audiobookshelf behaviors make this less trivial than it looks:
 *
 * 1. Users are created **inactive** unless `isActive: true` is sent, and an
 *    inactive user's POST /login returns a bare 401 — indistinguishable from
 *    a wrong password. So an existing user is reactivated here rather than
 *    assumed good, which also repairs servers seeded before this was fixed.
 * 2. The token embedded in a user record from POST /api/users or
 *    GET /api/users is not a reliable session token to act as that user.
 *    Logging in explicitly is the one path that behaves the same whether the
 *    account was just created or already existed.
 *
 * @param {string} baseUrl
 * @param {string} adminToken
 * @param {{ username: string, password: string }} params
 * @returns {Promise<{ id: string, token: string }>}
 */
export async function ensureDemoUser(baseUrl, adminToken, { username, password }) {
  const { users } = await getUsers(baseUrl, adminToken);
  const existing = users?.find((u) => u.username === username);

  if (!existing) {
    await createUser(baseUrl, adminToken, { username, password, type: "user" });
  } else if (!existing.isActive) {
    console.warn(`  demo user "${username}" exists but is inactive — reactivating.`);
    await updateUser(baseUrl, adminToken, existing.id, { isActive: true });
  }

  const { user } = await login(baseUrl, username, password);
  if (!user?.token) {
    throw new Error(
      `Logged in as demo user "${username}" but the response carried no token. ` +
        `Check that POST /login still returns { user: { token } } on this Audiobookshelf version.`
    );
  }
  return user;
}

/**
 * PATCH /api/me/progress/:libraryItemId — matches the shape SideShelf's own
 * client uses (src/lib/api/endpoints.ts updateMediaProgress).
 * @param {string} baseUrl
 * @param {string} userToken
 * @param {string} libraryItemId
 * @param {{ currentTime: number, duration: number, progress: number, isFinished: boolean }} progress
 */
export async function updateMediaProgress(baseUrl, userToken, libraryItemId, progress) {
  return absFetch(baseUrl, `/api/me/progress/${libraryItemId}`, {
    method: "PATCH",
    token: userToken,
    body: JSON.stringify(progress),
  });
}
