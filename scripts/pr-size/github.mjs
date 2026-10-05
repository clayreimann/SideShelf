/** PR size advisory for actions/github-script; reads PR metadata only, never PR code. */
import { evaluate, findAdvisoryComment, planComment } from "./core.mjs";

// The API can't distinguish binary from empty, mode-only or pure-rename files.
const isUnlined = (f) => f.changes === 0 && !f.patch;

export async function runAdvisory({ github, context, core }) {
  const { owner, repo } = context.repo;
  const event = context.payload.pull_request;
  const pull_number = event.number;
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
  if (pr.state !== "open" || pr.head.sha !== event.head.sha) {
    core.info("PR closed or event head is stale; a newer run will report.");
    return;
  }

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pull_number,
    per_page: 100,
  });
  const existing = findAdvisoryComment(comments);
  const counts = { additions: pr.additions, deletions: pr.deletions, commits: pr.commits };
  if (!existing && evaluate(counts).status === "under") return;

  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  const result = evaluate({ ...counts, unlinedFiles: files.filter(isUnlined).length });
  const plan = planComment(existing, result);
  core.info(
    `PR size ${result.status}: ${result.lines} lines, ${result.commits} commits -> ${plan.action}`
  );
  if (plan.action === "create") {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: plan.body,
    });
  } else if (plan.action === "update") {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: plan.body,
    });
  }
}
