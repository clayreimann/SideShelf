import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};
Object.assign(process.env, GIT_ENV);

export const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
export const tmp = (prefix = "pr-size-") => mkdtempSync(join(tmpdir(), prefix));

export function repo(dir = tmp()) {
  git(dir, "init", "-q", "-b", "main");
  commit(dir, "seed.txt", 1);
  return dir;
}

let seq = 0;
export function commit(dir, file, lines) {
  writeFileSync(
    join(dir, file),
    Array.from({ length: lines }, (_, i) => `l${i}-${seq++}`).join("\n") + "\n"
  );
  git(dir, "add", file);
  git(dir, "commit", "-q", "-m", file);
  return git(dir, "rev-parse", "HEAD");
}

export function setOriginHead(dir, branch = "main") {
  git(dir, "update-ref", `refs/remotes/origin/${branch}`, branch);
  git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", `refs/remotes/origin/${branch}`);
}

/** PATH with a fake `gh` reporting an open PR based on `main` at `baseOid`. */
export function fakeGhPath(baseOid) {
  const bin = tmp("pr-size-bin-");
  writeFileSync(
    join(bin, "gh"),
    `#!/bin/sh\necho '{"state":"OPEN","baseRefName":"main","baseRefOid":"${baseOid}"}'\n`
  );
  chmodSync(join(bin, "gh"), 0o755);
  return `${bin}:${process.env.PATH}`;
}

export const prGh =
  (baseRefName, baseRefOid, calls = []) =>
  async (args) => {
    calls.push(args);
    return { ok: true, stdout: JSON.stringify({ state: "OPEN", baseRefName, baseRefOid }) };
  };
export const noPrGh = async () => ({ ok: false, stderr: 'no pull requests found for branch "x"' });
export const brokenGh = async () => ({ ok: false, stderr: "error connecting to api.github.com" });
