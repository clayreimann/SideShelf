# GSD Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the tracked GSD planning corpus while preserving durable product direction, architectural rationale, explicit deferrals, and unresolved work in ordinary repository documentation.

**Architecture:** Treat deletion as the last step of a source-to-destination migration. Synthesize roadmap and decision sources first, migrate unresolved work and progress-sync rationale second, and remove `.planning/` only after coverage and reference checks succeed.

**Tech Stack:** Markdown, Git, `rg`, shell utilities, and the repository's Prettier hook.

## Global Constraints

- Work only in `/Users/clay/Code/github/SideShelf/.worktrees/gsd-cleanup` on `codex/gsd-cleanup`.
- Preserve `AGENTS.md`, `CLAUDE.md`, existing `docs/superpowers/`, application code, tests, configuration, and unrelated primary-checkout edits.
- Use the primary checkout's uncommitted stale-token brief as the migration source without modifying or staging it.
- Do not create a renamed GSD archive.
- Do not delete `.planning/` until every still-relevant decision has a maintained destination.
- Stop after the cleanup branch is committed and verified; do not merge it into `milestones/milestone-1.3` before user review.

---

### Task 1: Create the living roadmap and decision register

**Files:**

- Create: `docs/ROADMAP.md`
- Create: `docs/decisions/README.md`
- Read: `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`
- Read: `.planning/**/CONTEXT.md`, `.planning/**/*RESEARCH.md`, `.planning/**/*SUMMARY.md`
- Read: maintained documentation under `docs/`

**Interfaces:**

- Consumes: GSD decisions, requirements, deferrals, and existing maintained docs.
- Produces: the product-direction source of truth and searchable decision register used to gate deletion.

- [ ] **Step 1: Inventory candidate decision sections**

Run:

```bash
find .planning -type f -name '*.md' -print0 | xargs -0 rg -n '^#{1,4} (Decisions?|Key Decisions?|Locked Decisions?|Deferred|Deferred Ideas|Deferred Items|Out of Scope|Requirements?|Constraints?|Open Questions?)\b'
```

Expected: project, state, context, research, and final-summary decision sections are listed.

- [ ] **Step 2: Classify every candidate while drafting**

Use exactly one outcome per candidate: `documented` with a maintained link, `migrated`, `completed` with current evidence, or `obsolete` for generated execution detail and superseded alternatives.

Cover these domains explicitly:

- coordinator ownership, serial processing, event-bus boundary, custom FSM, observer rollback, and read-only `playerSlice`;
- progress restoration, explicit-seek smart-rewind suppression, and coordinator-owned queue rebuild;
- DB helper boundary, WAL/synchronous pragmas, batching, foreign-key non-enforcement, and explicit user-data deletion;
- download reconciliation, iCloud exclusion, mainline RNBD, path normalization, and orphan reassociation;
- movable-tab route scoping and nested More navigation;
- span tracing, diagnostics, accessibility, localization, and automated/UI testing;
- public numbering, podcasts/RNTP, Audio Browser/cars, Cast deferral, and the Expo SDK 55 gate.

- [ ] **Step 3: Write `docs/ROADMAP.md`**

Use sections `Versioning`, `Current State`, `Public 1.1 — Podcasts`, `Public 1.2 — Audio Browser and Cars`, `Deferred`, and `Supporting Specifications`. State that v1.0-v1.3 are historical internal milestones while public numbering begins with the store release. Link detailed specifications rather than duplicating them.

- [ ] **Step 4: Write `docs/decisions/README.md`**

Group entries under Product and releases, Playback architecture, Persistence and synchronization, Downloads and storage, Navigation and UI, and Quality and diagnostics. Every entry must have Status, Decision, Why, Consequence, and Source fields.

- [ ] **Step 5: Verify required coverage**

```bash
rg -n 'Public 1\.1|Public 1\.2|Google Cast|Expo SDK 55' docs/ROADMAP.md docs/decisions/README.md
rg -n 'coordinator|playerSlice|event bus|foreign keys|WAL|RNBD|route scope|span trac|accessibility|localization' docs/decisions/README.md
```

Expected: every required product and architecture domain has a maintained destination.

- [ ] **Step 6: Commit the living sources**

```bash
git add docs/ROADMAP.md docs/decisions/README.md
git commit -m "docs: preserve project roadmap and decisions"
```

### Task 2: Migrate unresolved work and progress-sync rationale

**Files:**

- Create: `docs/BACKLOG.md`
- Create: `docs/plans/stale-token-progress-sync.md`
- Read: `.planning/todos/pending/*.md`
- Read: `/Users/clay/Code/github/SideShelf/.planning/todos/pending/2026-07-20-stale-token-progress-sync-recovery.md`
- Read: `src/services/ProgressSyncWorker.ts`, `src/db/helpers/progressSyncOutbox.ts`, `src/providers/ProgressSyncProvider.tsx`

**Interfaces:**

- Consumes: unresolved briefs, current progress-sync code, and the user's uncommitted design revisions.
- Produces: a concise backlog and implemented design record.

- [ ] **Step 1: Confirm pending-item status**

```bash
git log --oneline --all --grep='chapter tap\|smart rewind\|play.pause\|progressToast\|internationalize\|AirPlay\|queue rebuild' -i
rg -n 'skipSmartRewind|optimistic|progressToast' src
```

Expected: chapter/smart-rewind and play/pause items are implemented; localization, simulator investigation, and upstream AirPlay remain backlog candidates.

- [ ] **Step 2: Write `docs/BACKLOG.md`**

Use sections Localization, Playback investigation, and Upstream contribution. Each item includes problem, affected files, acceptance signal, and relevant docs. Omit GSD metadata and commands.

- [ ] **Step 3: Write `docs/plans/stale-token-progress-sync.md`**

Mark it implemented in merge `0e1e128`. Preserve versioned-outbox invariants, unconditional `/api/session/local` worker delivery, auth suspension/recovery, revision acknowledgement, migration/backfill constraints, explicit logout deletion, foreign-key caveat, single-flight concurrency, retry classification, and foreign-key audit follow-up. Convert future-tense implementation instructions into present-tense architecture or historical constraints. Remove GSD metadata and commands.

- [ ] **Step 4: Verify migration fidelity**

```bash
rg -n 'desired_revision|acknowledged_revision|/api/session/local|foreign keys|wipeUserData|single.flight|backfill|reauth' docs/plans/stale-token-progress-sync.md
rg -n '/gsd:|\.planning/|get-shit-done' docs/BACKLOG.md docs/plans/stale-token-progress-sync.md
```

Expected: the first command covers every durable constraint; the second produces no output.

- [ ] **Step 5: Commit migrated work and rationale**

```bash
git add docs/BACKLOG.md docs/plans/stale-token-progress-sync.md
git commit -m "docs: migrate backlog and progress sync decisions"
```

### Task 3: Remove GSD and verify the review branch

**Files:**

- Delete: `.planning/`
- Modify only if the reference audit requires it: maintained Markdown outside `.planning/`

**Interfaces:**

- Consumes: completed roadmap, decision register, backlog, and progress-sync record.
- Produces: a documentation-only review branch with no tracked GSD workflow state.

- [ ] **Step 1: Audit live references**

```bash
git grep -n -i -e '\bGSD\b' -e 'get-shit-done' -e '\.planning' -e 'gsd-tools' -e '/gsd:' -- ':!.planning/**' ':!.claude/**'
```

Expected: only the cleanup design and implementation plan intentionally describe GSD. Migrate or remove any operational reference elsewhere.

- [ ] **Step 2: Delete `.planning/` in full**

Use patch-based deletion. Do not touch `.claude/worktrees/`, `.worktrees/`, code, tests, or primary-checkout modifications.

- [ ] **Step 3: Verify deletion and references**

```bash
test -z "$(git ls-files '.planning/**')"
git grep -n -i -e 'get-shit-done' -e 'gsd-tools' -e '/gsd:' -- ':!.claude/**'
git diff --check
```

Expected: no tracked `.planning` files, no live GSD commands, and no whitespace errors. Historical descriptions in the approved cleanup spec and plan are allowed.

- [ ] **Step 4: Validate added relative links**

Inspect each relative link in the four migrated documents and confirm its target with `git ls-files --error-unmatch <target>`.

- [ ] **Step 5: Confirm scope and primary-checkout preservation**

```bash
git diff --name-status 0e1e128...HEAD
git -C /Users/clay/Code/github/SideShelf status --short
git status --short
```

Expected: only documentation additions and `.planning/` deletions on the cleanup branch; original unrelated primary-checkout modifications remain.

- [ ] **Step 6: Run final verification**

```bash
npm test -- --runInBand --silent
git diff --check
git status --short
```

Expected: all Jest suites pass, diff check is clean, and only intended cleanup changes remain.

- [ ] **Step 7: Commit deletion and final cleanup**

```bash
git add -A .planning docs
git commit -m "chore: remove GSD planning corpus"
```

- [ ] **Step 8: Stop for user verification**

Report worktree path, branch, commits, decision destinations, deleted-file count, verification evidence, and comparison command. Do not merge, push, or modify `milestones/milestone-1.3`.
