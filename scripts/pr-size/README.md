# PR size advisory

Warns when a PR has **more than 1,000 changed lines** (additions + deletions) **or more than 10 commits**. It is advisory only: every entry point exits 0, nothing is blocked, and no files are excluded.

| Entry point                              | Behaviour                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run pr-size [-- --base <ref>]`      | Prints the current branch's assessment.                                                                                                             |
| `.husky/pre-push`                        | Assesses each pushed `refs/heads/*` branch from git's stdin. Deletes, tags and the default branch are skipped. The nudge goes to stderr.            |
| `.claude/settings.json`                  | `PostToolUse` hook. Runs `$CLAUDE_PROJECT_DIR/scripts/pr-size/local.mjs` and skips if the variable is unset.                                        |
| `.codex/hooks.json`                      | `PostToolUse` hook. An inline Node bootstrap SHA-256-checks `local.mjs` + `core.mjs` before importing them; on a mismatch it silently does nothing. |
| `.github/workflows/pr-size-advisory.yml` | One bot comment per PR, updated in place. An under-limit PR with no earlier comment gets none.                                                      |

The agent hooks only react to `git [-C dir] [-c k=v] [--opt] commit|push|merge|rebase|cherry-pick|am`, `cd <dir> && …` and `gh pr`. Commands are tokenized, never evaluated. The hooks only assess this checker's own repository (same Git common dir). Output is a `systemMessage` for the human plus `additionalContext` for the agent. Dedup state is kept separately for pre-push and agent.

**After editing `local.mjs` or `core.mjs`:** run `node scripts/pr-size/digest.mjs > .codex/hooks.json`, then re-approve the changed definition in Codex `/hooks`. Codex only loads the hook in a trusted project and after `/hooks` review. `npm run test:pr-size` fails if the pin drifts.

**Base resolution:**

1. The open PR's `baseRefOid` from `gh pr view <branch>` (4s timeout). If that commit is missing locally, the result is "cannot assess"; a stale `origin/<base>` is never used.
2. Otherwise `--base`, then `git config branch.<branch>.prSizeBase`.
3. With no PR at all, `origin/HEAD`, falling back to `main`. The message then suggests setting `prSizeBase` for stacked branches.
4. A failed PR lookup reports "cannot assess" rather than guessing.

Commits are counted with `git rev-list --count base..<sha>` and lines with `git diff --numstat $(merge-base) <sha>`. Shallow or missing history reports "cannot assess". Nothing fetches or changes Git config.

**Binary files:** locally, `numstat` identifies binary files exactly, and they are counted separately. The GitHub API cannot tell binary files apart, so the comment reports "files without reported line counts" (may include binary, empty or mode-only files).

**Dedup:** state is kept per repo/branch/target/audience in `$(git rev-parse --absolute-git-dir)/pr-size-advisory.json`, written atomically. A warning repeats only when its status changes, and dropping below the limit re-arms it.
