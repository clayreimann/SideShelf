/**
 * Redaction helpers for logging API request/response bodies.
 *
 * Centralizes credential scrubbing so nothing resembling an access token,
 * refresh token, or password ever reaches the SQLite-persisted (and
 * exportable-via-Share) log store. `/login` request bodies contain a
 * password; `/login` and `/api/me` response bodies contain access and
 * refresh tokens — both must come out clean before hitting a log line.
 *
 * Used by src/lib/api/api.ts (detailed request/response logging) and
 * src/lib/api/endpoints.ts (error-response logging).
 */

const REDACTED = "<redacted>";

/** JSON field names (case-insensitive) that must never be logged verbatim. */
const SENSITIVE_BODY_FIELDS = ["token", "accesstoken", "refreshtoken", "password"];

function isSensitiveField(key: string): boolean {
  return SENSITIVE_BODY_FIELDS.includes(key.toLowerCase());
}

function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactJsonValue);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveField(key) ? REDACTED : redactJsonValue(val);
    }
    return result;
  }
  return value;
}

/**
 * Regex-based fallback for bodies that aren't valid JSON (e.g. form-encoded
 * or plain text). Matches `"field":"value"` (JSON-ish, in case of partial/
 * malformed JSON) and `field=value` (form-encoded) shapes for each sensitive
 * field name.
 */
function redactBodyText(text: string): string {
  let result = text;
  for (const field of SENSITIVE_BODY_FIELDS) {
    const jsonShape = new RegExp(`(["']?${field}["']?\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, "gi");
    result = result.replace(jsonShape, `$1"${REDACTED}"`);
    const formShape = new RegExp(`\\b(${field}=)[^&\\s]*`, "gi");
    result = result.replace(formShape, `$1${REDACTED}`);
  }
  return result;
}

/**
 * Redact known credential fields (token, accessToken, refreshToken,
 * password) from a request/response body before it is logged.
 *
 * JSON bodies are parsed and rebuilt with sensitive fields replaced, which
 * also catches nested objects/arrays. Anything that isn't valid JSON falls
 * back to a regex-based scrub so a raw password or token is never logged
 * just because the body wasn't JSON (or was empty/truncated JSON).
 */
export function redactBody(text: string | null | undefined): string {
  if (text == null) return String(text);
  if (text === "") return text;
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(redactJsonValue(parsed));
  } catch {
    return redactBodyText(text);
  }
}
