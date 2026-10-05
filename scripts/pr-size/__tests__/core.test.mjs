import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKER,
  evaluate,
  findAdvisoryComment,
  parseNumstat,
  planComment,
  shouldNotify,
} from "../core.mjs";
import { runAdvisory } from "../github.mjs";

test("line threshold is strictly greater than 1000 (additions + deletions)", () => {
  assert.equal(evaluate({ additions: 600, deletions: 400, commits: 1 }).status, "under");
  assert.equal(evaluate({ additions: 600, deletions: 401, commits: 1 }).status, "over:lines");
});

test("commit threshold is strictly greater than 10", () => {
  assert.equal(evaluate({ additions: 1, deletions: 0, commits: 10 }).status, "under");
  assert.equal(evaluate({ additions: 1, deletions: 0, commits: 11 }).status, "over:commits");
  assert.equal(
    evaluate({ additions: 1001, deletions: 0, commits: 11 }).status,
    "over:lines+commits"
  );
});

test("numstat counts binary files separately without dropping text lines", () => {
  const parsed = parseNumstat("10\t2\ta.ts\n-\t-\tlogo.png\n0\t5\tb.ts\n-\t-\tfont.ttf\n");
  assert.deepEqual(parsed, { additions: 10, deletions: 7, binaryFiles: 2 });
});

test("unchanged warning status is suppressed and rearms after dropping below", () => {
  assert.equal(shouldNotify(undefined, "over:lines"), true);
  assert.equal(shouldNotify("over:lines", "over:lines"), false);
  assert.equal(shouldNotify("over:lines", "over:lines+commits"), true);
  assert.equal(shouldNotify("over:lines", "under"), false);
  assert.equal(shouldNotify("under", "over:lines"), true);
});

const bot = { type: "Bot", login: "github-actions[bot]" };

test("advisory comment is found only by exact marker from the actions bot", () => {
  const comments = [
    { id: 1, user: { type: "User", login: "mallory" }, body: `${MARKER}\nfake` },
    { id: 2, user: bot, body: "Test Coverage Summary" },
    { id: 3, user: bot, body: `${MARKER}\nreal` },
  ];
  assert.equal(findAdvisoryComment(comments).id, 3);
  assert.equal(findAdvisoryComment(comments.slice(0, 2)), undefined);
});

test("comment plan: none under limit, create over, skip identical, resolve once", () => {
  const under = evaluate({ additions: 5, deletions: 0, commits: 1 });
  const over = evaluate({ additions: 2000, deletions: 0, commits: 1, unlinedFiles: 1 });
  assert.equal(planComment(undefined, under).action, "none");

  const created = planComment(undefined, over);
  assert.equal(created.action, "create");
  assert.ok(created.body.startsWith(MARKER));
  assert.match(created.body, /binary/i);
  assert.doesNotMatch(created.body, /@/);

  assert.equal(planComment({ id: 9, body: created.body }, over).action, "none");
  const grown = evaluate({ additions: 2500, deletions: 0, commits: 1 });
  assert.equal(planComment({ id: 9, body: created.body }, grown).action, "update");

  const resolved = planComment({ id: 9, body: created.body }, under);
  assert.equal(resolved.action, "update");
  assert.match(resolved.body, /resolved/i);
  assert.equal(planComment({ id: 9, body: resolved.body }, under).action, "none");
  const stillUnder = evaluate({ additions: 50, deletions: 0, commits: 2 });
  assert.equal(planComment({ id: 9, body: resolved.body }, stillUnder).action, "none");
});

function fakeGithub({ pr, comments = [], files = [] }) {
  const calls = [];
  const rest = {
    pulls: {
      get: async () => ({ data: pr }),
      listFiles: Symbol("listFiles"),
    },
    issues: {
      listComments: Symbol("listComments"),
      createComment: async (args) => calls.push(["create", args]),
      updateComment: async (args) => calls.push(["update", args]),
    },
  };
  return {
    calls,
    github: {
      rest,
      paginate: async (method, args) => {
        calls.push(["paginate", method, args]);
        return method === rest.issues.listComments ? comments : files;
      },
    },
  };
}

const context = (headSha) => ({
  repo: { owner: "o", repo: "r" },
  payload: { pull_request: { number: 7, head: { sha: headSha } } },
});
const core = { info() {} };

test("workflow uses fresh pulls.get counts, not stale event counts", async () => {
  const pr = { state: "open", head: { sha: "h1" }, additions: 900, deletions: 200, commits: 3 };
  const files = [
    { status: "added", changes: 0, filename: "a.png" },
    { status: "modified", changes: 1100, filename: "a.ts", patch: "@@" },
  ];
  const { github, calls } = fakeGithub({ pr, files });
  const ctx = context("h1");
  ctx.payload.pull_request.additions = 1;
  await runAdvisory({ github, context: ctx, core });
  const create = calls.find(([kind]) => kind === "create");
  assert.ok(create, "expected a comment to be created");
  assert.match(create[1].body, /1,100/);
  assert.match(create[1].body, /Files without reported line counts \| 1 \|/);
  assert.equal(create[1].issue_number, 7);
  const listComments = calls.find(
    ([kind, m]) => kind === "paginate" && m === github.rest.issues.listComments
  );
  assert.equal(listComments[2].per_page, 100);
});

test("workflow reports all zero-change, patchless files as lacking line counts, not as binary", async () => {
  const pr = { state: "open", head: { sha: "h1" }, additions: 2000, deletions: 0, commits: 1 };
  const files = [
    { status: "added", changes: 0 },
    { status: "modified", changes: 0 },
    { status: "renamed", changes: 0 },
    { status: "modified", changes: 2000, patch: "@@" },
  ];
  const { github, calls } = fakeGithub({ pr, files });
  await runAdvisory({ github, context: context("h1"), core });
  const body = calls.find(([kind]) => kind === "create")[1].body;
  assert.match(body, /Files without reported line counts \| 3 \|/);
  assert.match(body, /binary, empty or mode-only/);
  assert.doesNotMatch(body, /Binary files \|/);
});

test("workflow updates the existing comment in place instead of adding one", async () => {
  const pr = { state: "open", head: { sha: "h1" }, additions: 2000, deletions: 0, commits: 12 };
  const comments = [{ id: 42, user: bot, body: `${MARKER}\nold` }];
  const { github, calls } = fakeGithub({ pr, comments });
  await runAdvisory({ github, context: context("h1"), core });
  assert.deepEqual(
    calls.filter(([k]) => k === "create" || k === "update").map(([k, a]) => [k, a.comment_id]),
    [["update", 42]]
  );
});

test("workflow posts nothing for an under-limit PR without a prior comment", async () => {
  const pr = { state: "open", head: { sha: "h1" }, additions: 10, deletions: 0, commits: 1 };
  const { github, calls } = fakeGithub({ pr });
  await runAdvisory({ github, context: context("h1"), core });
  assert.equal(calls.filter(([k]) => k === "create" || k === "update").length, 0);
});

test("workflow declines a stale event whose head no longer matches", async () => {
  const pr = { state: "open", head: { sha: "newer" }, additions: 5000, deletions: 0, commits: 50 };
  const { github, calls } = fakeGithub({ pr });
  await runAdvisory({ github, context: context("older"), core });
  assert.equal(calls.length, 0);
});
