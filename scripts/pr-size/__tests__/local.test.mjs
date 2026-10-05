import { test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { advise, assess, hookTarget, prePush, runHook } from "../local.mjs";
import {
  GIT_ENV,
  brokenGh,
  commit,
  fakeGhPath,
  git,
  noPrGh,
  prGh,
  repo,
  setOriginHead,
  tmp,
} from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../local.mjs", import.meta.url));
const ZERO = "0".repeat(40);

test("stacked PR measures only against its actual non-main base", async () => {
  const dir = repo();
  git(dir, "checkout", "-q", "-b", "feature-a");
  for (let i = 0; i < 11; i++) commit(dir, `a${i}.txt`, 200);
  const aTip = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "-b", "feature-b");
  commit(dir, "b.txt", 5);

  const res = await assess({ cwd: dir, gh: prGh("feature-a", aTip) });
  assert.equal(res.target, "feature-a");
  assert.equal(res.result.commits, 1);
  assert.equal(res.result.lines, 5);
  assert.equal(res.result.status, "under");
});

test("main advancing with unrelated commits does not inflate counts", async () => {
  const dir = repo();
  git(dir, "checkout", "-q", "-b", "feature");
  for (let i = 0; i < 10; i++) commit(dir, `f${i}.txt`, 100);
  git(dir, "checkout", "-q", "main");
  for (let i = 0; i < 15; i++) commit(dir, `m${i}.txt`, 500);
  git(dir, "checkout", "-q", "feature");

  const res = await assess({ cwd: dir, gh: prGh("main", git(dir, "rev-parse", "main")) });
  assert.equal(res.result.commits, 10);
  assert.equal(res.result.lines, 1000);
  assert.equal(res.result.status, "under");

  commit(dir, "f10.txt", 1);
  const over = await assess({ cwd: dir, gh: prGh("main", git(dir, "rev-parse", "main")) });
  assert.equal(over.result.status, "over:lines+commits");
});

test("binary files are counted separately from line totals", async () => {
  const dir = repo();
  git(dir, "checkout", "-q", "-b", "feature");
  writeFileSync(join(dir, "img.bin"), Buffer.from([0, 1, 2, 0, 255, 0]));
  git(dir, "add", "img.bin");
  git(dir, "commit", "-q", "-m", "bin");
  commit(dir, "t.txt", 3);
  setOriginHead(dir);

  const res = await assess({ cwd: dir, gh: noPrGh });
  assert.equal(res.target, "origin/main");
  assert.equal(res.result.binaryFiles, 1);
  assert.equal(res.result.lines, 3);
});

test("PR lookup failure never silently falls back to main", async () => {
  const dir = repo();
  setOriginHead(dir);
  git(dir, "checkout", "-q", "-b", "feature");
  commit(dir, "x.txt", 2000);

  const res = await assess({ cwd: dir, gh: brokenGh });
  assert.match(res.unknown, /PR lookup failed/);
  assert.equal(res.result, undefined);

  git(dir, "config", "branch.feature.prSizeBase", "main");
  const configured = await assess({ cwd: dir, gh: brokenGh });
  assert.equal(configured.target, "main");
  assert.equal(configured.result.status, "over:lines");

  const explicit = await assess({ cwd: dir, base: "main", gh: brokenGh });
  assert.equal(explicit.target, "main");
});

test("missing base object is reported as cannot assess", async () => {
  const src = repo();
  git(src, "checkout", "-q", "-b", "feature");
  commit(src, "f.txt", 3);
  git(src, "checkout", "-q", "main");
  const mainSha = git(src, "rev-parse", "main");
  const dir = tmp("pr-size-clone-");
  git(dir, "clone", "-q", "--depth", "1", "--branch", "feature", `file://${src}`, "c");

  const res = await assess({ cwd: join(dir, "c"), gh: prGh("main", mainSha) });
  assert.match(res.unknown, /not available locally/);
});

test("supplied PR base OID that is missing never falls back to a stale origin ref", async () => {
  const dir = repo();
  setOriginHead(dir);
  git(dir, "checkout", "-q", "-b", "feature");
  commit(dir, "f.txt", 3);

  const res = await assess({ cwd: dir, gh: prGh("main", "a".repeat(40)) });
  assert.match(res.unknown, /not available locally/);
  assert.equal(res.result, undefined);
});

test("shallow history without a merge base is reported as cannot assess", async () => {
  const src = repo();
  commit(src, "m.txt", 1);
  git(src, "checkout", "-q", "-b", "feature");
  commit(src, "f.txt", 3);
  git(src, "checkout", "-q", "main");
  commit(src, "m2.txt", 1);
  const mainSha = git(src, "rev-parse", "main");
  const dir = tmp("pr-size-clone-");
  git(
    dir,
    "clone",
    "-q",
    "--depth",
    "1",
    "--no-single-branch",
    "--branch",
    "feature",
    `file://${src}`,
    "c"
  );

  const res = await assess({ cwd: join(dir, "c"), gh: prGh("main", mainSha) });
  assert.match(res.unknown, /shallow/);
});

test("detached HEAD and the default branch are skipped", async () => {
  const dir = repo();
  setOriginHead(dir);
  assert.ok((await assess({ cwd: dir, gh: noPrGh })).skip);
  git(dir, "checkout", "-q", "--detach");
  assert.ok((await assess({ cwd: dir, gh: noPrGh })).skip);
});

test("warnings are deduplicated per branch/target and rearm below threshold", async () => {
  const dir = repo();
  setOriginHead(dir);
  git(dir, "checkout", "-q", "-b", "feature");
  commit(dir, "big.txt", 1001);
  const opts = { cwd: dir, gh: noPrGh, audience: "agent" };

  assert.match((await advise(opts)).message, /1,001/);
  assert.equal(await advise(opts), null);

  git(dir, "reset", "-q", "--hard", "HEAD~1");
  commit(dir, "small.txt", 10);
  assert.equal(await advise(opts), null);

  commit(dir, "big2.txt", 1001);
  assert.ok(await advise(opts));
  assert.equal(
    git(dir, "status", "--porcelain"),
    "",
    "state must live in the gitdir, not the worktree"
  );
});

test("pre-push warning does not consume the agent hook warning", async () => {
  const dir = repo();
  setOriginHead(dir);
  git(dir, "checkout", "-q", "-b", "feature");
  const sha = commit(dir, "big.txt", 1001);

  const pushed = await prePush(`refs/heads/feature ${sha} refs/heads/feature ${ZERO}\n`, {
    cwd: dir,
    gh: noPrGh,
  });
  assert.equal(pushed.length, 1);
  const out = await runHook(
    { tool_input: { command: "git push" }, cwd: dir },
    { gh: noPrGh, home: dir }
  );
  assert.ok(out?.systemMessage);
});

test("opening the PR (origin/main -> main) does not repeat the same warning", async () => {
  const dir = repo();
  setOriginHead(dir);
  git(dir, "checkout", "-q", "-b", "feature");
  commit(dir, "big.txt", 1001);
  const mainSha = git(dir, "rev-parse", "main");

  assert.ok(
    await runHook({ tool_input: { command: "git push" }, cwd: dir }, { gh: noPrGh, home: dir })
  );
  const after = await runHook(
    { tool_input: { command: "gh pr create --fill" }, cwd: dir },
    { gh: prGh("main", mainSha), home: dir }
  );
  assert.equal(after, null);
});

test("no-PR stacked warning points at branch.<branch>.prSizeBase", async () => {
  const dir = repo();
  setOriginHead(dir);
  git(dir, "checkout", "-q", "-b", "feature-a");
  for (let i = 0; i < 11; i++) commit(dir, `a${i}.txt`, 1);
  git(dir, "checkout", "-q", "-b", "feature-b");
  commit(dir, "b.txt", 1);

  const advice = await advise({ cwd: dir, gh: noPrGh, audience: "agent" });
  assert.match(advice.message, /branch\.feature-b\.prSizeBase/);
});

test("pre-push assesses each pushed branch, not the checked-out one", async () => {
  const dir = repo();
  setOriginHead(dir);
  git(dir, "checkout", "-q", "-b", "big");
  const bigSha = commit(dir, "big.txt", 1500);
  git(dir, "checkout", "-q", "-b", "many", "main");
  for (let i = 0; i < 11; i++) commit(dir, `m${i}.txt`, 1);
  const manySha = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "main");
  const mainSha = git(dir, "rev-parse", "main");
  const calls = [];

  const stdin = [
    `refs/heads/big ${bigSha} refs/heads/big ${ZERO}`,
    `refs/heads/many ${manySha} refs/heads/many ${ZERO}`,
    `refs/heads/main ${mainSha} refs/heads/main ${ZERO}`,
    `refs/tags/v1 ${mainSha} refs/tags/v1 ${ZERO}`,
    `(delete) ${ZERO} refs/heads/old ${bigSha}`,
  ].join("\n");
  const messages = await prePush(stdin, { cwd: dir, gh: prGh("main", mainSha, calls) });

  assert.equal(messages.length, 2);
  assert.match(messages[0], /big → main.*1,500/);
  assert.match(messages[1], /many → main.*11 commits/);
  assert.deepEqual(
    calls.map((args) => args[2]),
    ["big", "many"]
  );
});

test("hook command parsing handles git global options, cd and quoted paths without eval", () => {
  const cwd = "/work/repo";
  assert.equal(hookTarget("git push", cwd), cwd);
  assert.equal(hookTarget("git -C ../other push origin x", cwd), "/work/other");
  assert.equal(hookTarget('git -C "/a b/c" commit -m "x"', cwd), "/a b/c");
  assert.equal(hookTarget("git -c core.editor=true commit -m 'msg; git push'", cwd), cwd);
  assert.equal(hookTarget("git --no-pager push", cwd), cwd);
  assert.equal(hookTarget("cd '/x y' && git push", cwd), "/x y");
  assert.equal(hookTarget("npm test && gh pr create --fill", cwd), cwd);
  assert.equal(hookTarget("git status && ls", cwd), null);
  assert.equal(hookTarget('echo "git push"', cwd), null);
  assert.equal(hookTarget("git -C $(evil) push", cwd), null);
  assert.equal(hookTarget("cd ~/x && git push", cwd), null);
});

test("hook follows git -C into the approved repo but skips other repositories", async () => {
  const dir = join(tmp(), "with space");
  mkdirSync(join(dir, "sub"), { recursive: true });
  repo(dir);
  setOriginHead(dir);
  git(dir, "checkout", "-q", "-b", "feature");
  commit(dir, "big.txt", 1001);
  const other = repo();
  git(other, "checkout", "-q", "-b", "feature");
  commit(other, "big.txt", 1001);
  const elsewhere = tmp();

  const foreign = { tool_input: { command: `git -C "${other}" push` }, cwd: dir };
  assert.equal(await runHook(foreign, { gh: noPrGh, home: dir }), null);
  const viaC = { tool_input: { command: `git -C "${join(dir, "sub")}" push` }, cwd: elsewhere };
  assert.match((await runHook(viaC, { gh: noPrGh, home: dir })).systemMessage, /1,001/);
});

test("hook emits systemMessage plus PostToolUse additionalContext, only for git/gh commands", async () => {
  const dir = repo();
  setOriginHead(dir);
  git(dir, "checkout", "-q", "-b", "feature");
  for (let i = 0; i < 11; i++) commit(dir, `c${i}.txt`, 1);
  const deps = { gh: noPrGh, home: dir };

  assert.equal(await runHook({ tool_input: { command: "ls -la" }, cwd: dir }, deps), null);
  const out = await runHook(
    { tool_input: { command: "git push -u origin feature" }, cwd: dir },
    deps
  );
  assert.match(out.systemMessage, /11 commits/);
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /split/i);
  assert.equal(out.decision, undefined);
});

test("CLI pre-push reads pushed refs from stdin and exits 0", () => {
  const dir = repo();
  const mainSha = git(dir, "rev-parse", "main");
  git(dir, "checkout", "-q", "-b", "feature");
  const sha = commit(dir, "big.txt", 1500);
  git(dir, "checkout", "-q", "main");
  const env = { ...GIT_ENV, PATH: fakeGhPath(mainSha) };

  const input = `refs/heads/feature ${sha} refs/heads/feature ${ZERO}\n`;
  const push = spawnSync(process.execPath, [CLI, "--pre-push"], {
    cwd: dir,
    env,
    input,
    encoding: "utf8",
  });
  assert.equal(push.status, 0);
  assert.match(push.stderr, /feature → main.*1,500/);

  const outside = spawnSync(process.execPath, [CLI, "--pre-push"], {
    cwd: tmp(),
    env,
    input,
    encoding: "utf8",
  });
  assert.equal(outside.status, 0);
});
