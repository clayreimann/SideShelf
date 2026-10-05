#!/usr/bin/env node
/** Local PR size nudge for Husky pre-push and Claude/Codex PostToolUse hooks; always exits 0. */
import { execFile, execFileSync } from "node:child_process";
import { readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, parseNumstat, shouldNotify, summarize } from "./core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GH_TIMEOUT_MS = 4000;
const STATE_FILE = "pr-size-advisory.json";
const GIT_SUBCOMMANDS = new Set(["commit", "push", "merge", "rebase", "cherry-pick", "am"]);

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const tryGit = (cwd, ...args) => {
  try {
    return git(cwd, ...args) || null;
  } catch {
    return null;
  }
};
const commonDir = (cwd) => {
  const dir = tryGit(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return dir && realpathSync(dir);
};

function ghCli(cwd) {
  const env = { ...process.env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" };
  return (args) =>
    new Promise((resolve) => {
      execFile("gh", args, { cwd, env, timeout: GH_TIMEOUT_MS }, (err, stdout, stderr) =>
        resolve(err ? { ok: false, stderr: String(stderr || err.message) } : { ok: true, stdout })
      );
    });
}

async function lookupPr(gh, branch) {
  const res = await gh(["pr", "view", branch, "--json", "state,baseRefName,baseRefOid"]);
  if (!res.ok) {
    if (/no (open )?pull requests? found/i.test(res.stderr)) return { none: true };
    return { error: res.stderr.trim().split("\n")[0] || "gh failed" };
  }
  try {
    const pr = JSON.parse(res.stdout);
    return pr.state === "OPEN" ? { pr } : { none: true };
  } catch {
    return { error: "unreadable gh output" };
  }
}

const isCommit = (root, ref) => tryGit(root, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`);

function resolveTarget(root, branch, base, lookup, defaultRef) {
  if (lookup.pr) {
    const { baseRefName, baseRefOid } = lookup.pr;
    const ref = baseRefOid || `origin/${baseRefName}`;
    return isCommit(root, ref)
      ? { target: baseRefName, ref }
      : { unknown: `PR base ${baseRefName} is not available locally (git fetch to update)` };
  }
  const configured = base ?? tryGit(root, "config", "--get", `branch.${branch}.prSizeBase`);
  if (configured) return { target: configured, ref: configured };
  if (lookup.error) {
    const fix = `pass --base or set git config branch.${branch}.prSizeBase`;
    return { unknown: `PR lookup failed (${lookup.error}); ${fix}` };
  }
  const ref = defaultRef ?? "main";
  return { target: ref, ref, guessed: true };
}

/** Measures `head` of `branch` against its PR base: commits in base..head, lines from merge-base. */
export async function assess({ cwd, base, gh, branch, head = "HEAD" }) {
  const root = tryGit(cwd, "rev-parse", "--show-toplevel");
  if (!root) return { skip: "not a git repository" };
  branch ??= tryGit(root, "symbolic-ref", "--quiet", "--short", "HEAD");
  if (!branch) return { skip: "detached HEAD" };
  const defaultRef = tryGit(root, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD");
  if (branch === (defaultRef?.replace(/^origin\//, "") ?? "main"))
    return { skip: "default branch" };

  const lookup = await lookupPr(gh ?? ghCli(root), branch);
  const { target, ref, unknown, guessed } = resolveTarget(root, branch, base, lookup, defaultRef);
  if (unknown) return { root, branch, unknown };
  const mergeBase = tryGit(root, "merge-base", ref, head);
  if (!mergeBase) {
    const shallow = tryGit(root, "rev-parse", "--is-shallow-repository") === "true";
    const why = `${shallow ? "shallow clone has " : ""}no merge base with ${target}`;
    return { root, branch, target, unknown: shallow ? `${why} (git fetch --unshallow)` : why };
  }
  const commits = Number(git(root, "rev-list", "--count", `${ref}..${head}`));
  const numstat = git(root, "diff", "--numstat", "--no-color", mergeBase, head);
  return { root, branch, target, guessed, result: evaluate({ ...parseNumstat(numstat), commits }) };
}

const ADVISORY_ONLY = "Advisory only; nothing is blocked.";

function format(a) {
  if (a.unknown) {
    const message = `PR size advisory: cannot assess ${a.branch} — ${a.unknown}. ${ADVISORY_ONLY}`;
    return { message, context: message };
  }
  const stacked = a.guessed
    ? ` No open PR found, so compared with ${a.target}; if this branch stacks on another, ` +
      `run git config branch.${a.branch}.prSizeBase <base-branch>.`
    : "";
  const message =
    `PR size advisory (${a.branch} → ${a.target}): ${summarize(a.result)}. ` +
    `Consider splitting into smaller stacked PRs.${stacked} ${ADVISORY_ONLY}`;
  const context =
    `${message} Tell the user, and prefer splitting further work into a separate ` +
    `stacked PR over growing this one.`;
  return { message, context };
}

/** Like assess, but messages only when this audience's status changed; state lives in the gitdir. */
export async function advise({ audience, ...opts }) {
  const a = await assess(opts);
  if (a.skip) return null;
  const status = a.unknown ? "unknown" : a.result.status;
  const file = join(git(a.root, "rev-parse", "--absolute-git-dir"), STATE_FILE);
  let state = {};
  try {
    state = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  const repoId = tryGit(a.root, "config", "--get", "remote.origin.url") ?? a.root;
  const key = `${repoId}|${a.branch}|${a.target?.replace(/^origin\//, "") ?? "?"}|${audience}`;
  const notify = shouldNotify(state[key], status);
  if (state[key] !== status) {
    state[key] = status;
    try {
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(state, null, 2));
      renameSync(tmp, file);
    } catch {}
  }
  return notify ? format(a) : null;
}

/** Assesses each branch named in git's pre-push stdin (`<local ref> <sha> <remote ref> <sha>`). */
export async function prePush(stdin, { cwd, gh }) {
  const messages = [];
  const current = tryGit(cwd, "symbolic-ref", "--quiet", "--short", "HEAD");
  const branchOf = (ref) => (ref === "HEAD" ? current : ref.match(/^refs\/heads\/(.+)$/)?.[1]);
  for (const line of stdin.split("\n")) {
    const [localRef, sha] = line.trim().split(/\s+/);
    const branch = sha && !/^0+$/.test(sha) && branchOf(localRef);
    if (!branch) continue;
    const advice = await advise({ cwd, gh, branch, head: sha, audience: "prepush" });
    if (advice) messages.push(advice.message);
  }
  return messages;
}

/** Splits a shell command into word lists per simple command; quotes handled, nothing evaluated. */
function tokenize(command) {
  const segments = [[]];
  let word = null;
  const end = () => {
    if (word !== null) segments.at(-1).push(word);
    word = null;
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" || ch === '"') {
      const close = command.indexOf(ch, i + 1);
      if (close < 0) return [];
      word = (word ?? "") + command.slice(i + 1, close);
      i = close;
    } else if (ch === "\\" && i + 1 < command.length) {
      word = (word ?? "") + command[++i];
    } else if (/[;&|\n]/.test(ch)) {
      end();
      if (segments.at(-1).length) segments.push([]);
    } else if (/\s/.test(ch)) {
      end();
    } else {
      word = (word ?? "") + ch;
    }
  }
  end();
  return segments;
}

const unsafePath = (p) => p === undefined || /[$`]/.test(p) || p.startsWith("~");

/** Resolves `git [-C dir] [-c k=v] [--opt] <subcommand>`; `undefined` = not a watched subcommand. */
function gitTarget(args, dir) {
  for (let j = 0; j < args.length; j++) {
    if (args[j] === "-C") {
      if (unsafePath(args[j + 1])) return null;
      dir = resolve(dir, args[++j]);
    } else if (args[j] === "-c") j++;
    else if (!args[j].startsWith("-")) return GIT_SUBCOMMANDS.has(args[j]) ? dir : undefined;
  }
  return undefined;
}

/** Directory a git commit/push/… or `gh pr` in `command` acts on, or null. */
export function hookTarget(command, cwd) {
  let dir = cwd;
  for (const segment of tokenize(command)) {
    const [cmd, ...rest] = segment.slice(segment.findIndex((w) => !/^[A-Za-z_]\w*=/.test(w)));
    if (cmd === "cd") {
      if (unsafePath(rest[0])) return null;
      dir = resolve(dir, rest[0]);
    } else if (cmd === "gh" && rest[0] === "pr") {
      return dir;
    } else if (cmd === "git" || cmd?.endsWith("/git")) {
      const target = gitTarget(rest, dir);
      if (target !== undefined) return target;
    }
  }
  return null;
}

/** PostToolUse hook for this checker's own repo only: systemMessage for humans, additionalContext for agents. */
export async function runHook(input, { home = HERE, ...deps } = {}) {
  const command = input?.tool_input?.command;
  const cwd = typeof command === "string" ? hookTarget(command, input.cwd ?? process.cwd()) : null;
  const own = commonDir(home);
  if (!cwd || !own || commonDir(cwd) !== own) return null;
  const advice = await advise({ cwd, audience: "agent", ...deps });
  if (!advice) return null;
  return {
    systemMessage: advice.message,
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: advice.context },
  };
}

async function main(argv) {
  if (argv.includes("--hook")) {
    const out = await runHook(JSON.parse(readFileSync(0, "utf8") || "{}"));
    if (out) process.stdout.write(JSON.stringify(out));
    return;
  }
  if (argv.includes("--pre-push")) {
    for (const message of await prePush(readFileSync(0, "utf8"), { cwd: process.cwd() })) {
      process.stderr.write(`${message}\n`);
    }
    return;
  }
  const i = argv.indexOf("--base");
  const a = await assess({ cwd: process.cwd(), base: i >= 0 ? argv[i + 1] : undefined });
  if (a.skip) console.log(`PR size advisory: skipped (${a.skip})`);
  else if (a.unknown) console.log(format(a).message);
  else
    console.log(`PR size (${a.branch} → ${a.target}, ${a.result.status}): ${summarize(a.result)}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .catch((err) => process.stderr.write(`PR size advisory skipped: ${err.message}\n`))
    .finally(() => process.exit(0));
}
