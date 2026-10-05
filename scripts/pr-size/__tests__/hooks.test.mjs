import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { codexHooksConfig, hookDigest } from "../digest.mjs";
import { GIT_ENV, commit, fakeGhPath, git, repo } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SRC = join(ROOT, "scripts/pr-size");
const hookCommand = (file) =>
  JSON.parse(readFileSync(join(ROOT, file), "utf8")).hooks.PostToolUse[0].hooks[0].command;
const CLAUDE = hookCommand(".claude/settings.json");
const CODEX = hookCommand(".codex/hooks.json");

function run(command, cwd, env = {}) {
  const input = JSON.stringify({ tool_input: { command: "git push" }, cwd });
  return spawnSync("sh", ["-c", command], {
    cwd,
    input,
    env: { ...GIT_ENV, ...env },
    encoding: "utf8",
  });
}

/** Over-limit feature branch in a repo carrying copies of the checker. */
function project() {
  const dir = repo();
  mkdirSync(join(dir, "scripts/pr-size"), { recursive: true });
  for (const f of ["local.mjs", "core.mjs"])
    copyFileSync(join(SRC, f), join(dir, "scripts/pr-size", f));
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "checker");
  const mainSha = git(dir, "rev-parse", "main");
  git(dir, "checkout", "-q", "-b", "feature");
  commit(dir, "big.txt", 1500);
  return { dir, PATH: fakeGhPath(mainSha) };
}

/** Repo whose own scripts/pr-size/local.mjs would drop a marker file if executed. */
function malicious() {
  const dir = repo();
  const marker = join(dir, "PWNED");
  mkdirSync(join(dir, "scripts/pr-size"), { recursive: true });
  const evil = `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "x");\n`;
  writeFileSync(join(dir, "scripts/pr-size/local.mjs"), evil);
  writeFileSync(join(dir, "scripts/pr-size/core.mjs"), evil);
  return { dir, marker };
}

test("committed Codex config pins the current local.mjs + core.mjs digest", () => {
  assert.deepEqual(
    JSON.parse(readFileSync(join(ROOT, ".codex/hooks.json"), "utf8")),
    codexHooksConfig(hookDigest())
  );
  assert.ok(CODEX.includes(hookDigest()));
});

test("Codex hook runs pinned code and reports", () => {
  const { dir, PATH } = project();
  const res = run(CODEX, dir, { PATH });
  assert.equal(res.status, 0);
  assert.match(JSON.parse(res.stdout).systemMessage, /1,500/);
});

test("Codex hook silently skips when pinned code differs", () => {
  const { dir, PATH } = project();
  appendFileSync(join(dir, "scripts/pr-size/core.mjs"), "\n// changed\n");
  const res = run(CODEX, dir, { PATH });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
});

test("Codex hook never executes a checker script from an untrusted cwd", () => {
  const { dir, marker } = malicious();
  const res = run(CODEX, dir);
  assert.equal(res.status, 0);
  assert.equal(existsSync(marker), false);
});

test("Claude hook is anchored to CLAUDE_PROJECT_DIR, never the cwd repo", () => {
  const { dir, marker } = malicious();
  const { dir: projectDir, PATH } = project();

  const anchored = run(CLAUDE, dir, { PATH, CLAUDE_PROJECT_DIR: projectDir });
  assert.equal(anchored.status, 0);
  assert.equal(anchored.stdout, "", "other repos are not assessed");
  const unset = run(CLAUDE, dir, { PATH, CLAUDE_PROJECT_DIR: "" });
  assert.equal(unset.status, 0);
  assert.equal(existsSync(marker), false);

  const own = run(CLAUDE, projectDir, { PATH, CLAUDE_PROJECT_DIR: projectDir });
  assert.match(JSON.parse(own.stdout).systemMessage, /1,500/);
});
