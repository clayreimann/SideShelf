/** Shared PR-size thresholds, evaluation and advisory comment text (advisory only, never blocks). */

export const LIMITS = { lines: 1000, commits: 10 };
export const MARKER = "<!-- pr-size-advisory -->";
const STATUS_PREFIX = "<!-- pr-size-advisory:status=";
const fmt = (n) => n.toLocaleString("en-US");

/** Sums `git diff --numstat` output; binary rows (`-\t-`) are counted, not dropped. */
export function parseNumstat(text) {
  const out = { additions: 0, deletions: 0, binaryFiles: 0 };
  for (const line of text.split("\n")) {
    const [add, del] = line.split("\t");
    if (!line) continue;
    if (add === "-" && del === "-") out.binaryFiles++;
    else {
      out.additions += Number(add);
      out.deletions += Number(del);
    }
  }
  return out;
}

/** `binaryFiles` (local numstat) and `unlinedFiles` (GitHub API) are reported, never excluded. */
export function evaluate({ additions, deletions, commits, binaryFiles = 0, unlinedFiles = 0 }) {
  const lines = additions + deletions;
  const over = [lines > LIMITS.lines && "lines", commits > LIMITS.commits && "commits"].filter(
    Boolean
  );
  const status = over.length ? `over:${over.join("+")}` : "under";
  return { additions, deletions, lines, commits, binaryFiles, unlinedFiles, status };
}

/** Notify on a new over-limit status only; dropping to "under" rearms silently. */
export function shouldNotify(previous, status) {
  return status !== "under" && status !== previous;
}

export function summarize(r) {
  const binary = r.binaryFiles
    ? `; ${fmt(r.binaryFiles)} binary file(s) changed (no line counts, so not in the line total)`
    : "";
  return (
    `${fmt(r.lines)} changed lines (limit ${fmt(LIMITS.lines)}), ` +
    `${fmt(r.commits)} commits (limit ${LIMITS.commits})${binary}`
  );
}

export function findAdvisoryComment(comments) {
  return comments.find(
    (c) =>
      c.user?.type === "Bot" &&
      c.user?.login === "github-actions[bot]" &&
      c.body?.startsWith(MARKER)
  );
}

function commentBody(r) {
  const head = `${MARKER}\n${STATUS_PREFIX}${r.status} -->\n`;
  const unlined =
    `| Files without reported line counts | ${fmt(r.unlinedFiles)} | may include binary, empty or mode-only ` +
    `files; they cannot add to the line total but are still part of the PR (nothing is excluded) |`;
  if (r.status === "under") {
    return (
      `${head}### ✅ PR size advisory resolved\n\n` +
      `Now within guidelines: ${fmt(r.lines)} changed lines, ${fmt(r.commits)} commits.`
    );
  }
  return (
    `${head}### ⚠️ PR size advisory\n\n` +
    `This PR exceeds the review-size guideline. Advisory only — nothing is blocked.\n\n` +
    `| Measure | Value | Guideline |\n|---|---|---|\n` +
    `| Changed lines (additions + deletions) | ${fmt(r.lines)} | ≤ ${fmt(LIMITS.lines)} |\n` +
    `| Commits | ${fmt(r.commits)} | ≤ ${LIMITS.commits} |\n` +
    `${unlined}\n\n` +
    `Consider splitting into smaller, stacked PRs. This comment updates in place.`
  );
}

/** Decides create/update/none for the single advisory comment; never comments on an under-limit PR first. */
export function planComment(existing, result) {
  if (!existing) {
    return result.status === "under"
      ? { action: "none" }
      : { action: "create", body: commentBody(result) };
  }
  if (result.status === "under" && existing.body.includes(`${STATUS_PREFIX}under -->`))
    return { action: "none" };
  const body = commentBody(result);
  return body === existing.body ? { action: "none" } : { action: "update", body };
}
