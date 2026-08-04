# GSD Cleanup Design

**Date:** 2026-07-20
**Status:** Approved for implementation planning

## Purpose

Remove the abandoned GSD workflow and its generated planning corpus from the repository without losing product direction, architectural rationale, deferred decisions, or unresolved work that future contributors and agents would otherwise have to rediscover.

This cleanup removes GSD as a repository convention. It does not remove other agent guidance or existing design documents.

## Scope

### Remove

- The tracked `.planning/` directory and all GSD state, configuration, milestone, phase, research, plan, summary, verification, and todo files beneath it.
- GSD-specific commands, paths, and workflow language that survive outside `.planning/`, if the final reference audit finds any.

### Preserve

- `AGENTS.md` and `CLAUDE.md`.
- Existing `docs/superpowers/` specifications and plans.
- Existing architecture, investigation, and implementation documentation.
- All source code, tests, configuration, and unrelated working-tree changes.
- Important decisions and unresolved work currently recorded only in `.planning/`.

Local `.claude/worktrees/` content is outside the tracked GSD cleanup. It is neither a migration source nor a deletion target.

## Migration Destinations

### Product roadmap

Create `docs/ROADMAP.md` as the maintained source of truth for product direction. It will preserve:

- the distinction between historical internal milestone numbering and public release numbering;
- the accepted public 1.1 podcast direction;
- the accepted public 1.2 Audio Browser and car-integration direction;
- active product direction that is still relevant;
- explicit deferrals and out-of-scope decisions whose rationale would otherwise be lost.

The roadmap will link to detailed existing specifications rather than copying them.

### Decision register

Create `docs/decisions/README.md` as a compact register of durable project decisions. Each entry will include:

- decision and current status;
- concise rationale;
- consequences or constraints for future work;
- link to the maintained source-of-truth document when one exists.

Decision rationale belongs in the nearest maintained architecture, investigation, or specification document. The register indexes those sources and contains standalone rationale only when no more natural destination exists.

### Open backlog

Create `docs/BACKLOG.md` for concise unresolved work that remains useful:

- add missing Spanish progress-toast translations;
- internationalize hardcoded FullScreenPlayer strings;
- internationalize hardcoded More and diagnostics strings;
- investigate simulator hot-reload queue reconstruction behavior;
- consider an upstream AirPlay picker icon-sizing contribution.

Items already implemented, including chapter-tap playback, explicit-seek smart-rewind suppression, and optimistic play/pause feedback, will not be migrated as open work.

### Detailed progress-sync design

Migrate the substantially edited stale-token progress synchronization brief to `docs/plans/stale-token-progress-sync.md`. Preserve its decisions, invariants, migration constraints, concurrency model, authentication behavior, verification requirements, and known database caveats. Remove only GSD-specific metadata, commands, and file conventions.

The uncommitted edits in the source brief are user work and are part of the content to preserve during migration.

## Decision-Coverage Audit

Deletion is gated on a source-to-destination audit of:

- `.planning/PROJECT.md`;
- `.planning/STATE.md`;
- current and archived requirements and roadmaps;
- each phase and milestone `CONTEXT` file;
- research sections labeled as locked decisions, deferred ideas, out of scope, or open questions;
- final summary sections labeled as decisions made or deferred items;
- pending todo briefs.

Each candidate decision must be classified as exactly one of:

1. **Already documented** — link to the maintained source of truth.
2. **Migrated** — add it to the roadmap, decision register, backlog, detailed plan, or an existing maintained document.
3. **Completed** — confirm that current code or maintained documentation represents the outcome.
4. **Obsolete execution detail** — discard plan mechanics, transient implementation sequencing, generated verification bookkeeping, and superseded alternatives that no longer constrain future work.

The audit is a working aid for the migration. The durable decision register and destination documents are the final artifacts; a second archive of GSD content will not be created.

## Deletion Boundary

After decision coverage is complete, remove the tracked `.planning/` tree in full. Git history remains the recovery path for historical execution detail.

The cleanup must not alter or delete:

- local `.claude/worktrees/` directories;
- unrelated modified or untracked files;
- existing maintained documentation merely because it originated from agent-assisted work;
- application behavior.

## Verification

The cleanup is complete only when all of the following are true:

1. Every still-relevant decision found by the audit has a maintained destination.
2. The stale-token design includes the user's current uncommitted revisions.
3. No tracked `.planning/` files remain.
4. No live repository document points to `.planning/` or instructs contributors to run GSD commands.
5. Links added by the migration resolve to tracked files.
6. `git diff --check` passes.
7. `git status --short` confirms unrelated pre-existing edits remain present and unmodified.

Application tests are not required because this cleanup changes documentation only. If implementation unexpectedly touches code or runtime configuration, the cleanup must stop and the verification scope must be reconsidered.

## Success Criteria

Future contributors and first-party agents can understand the project's roadmap, architectural constraints, important rationale, explicit deferrals, and open work from ordinary repository documentation without knowing GSD or consulting `.planning/`. The repository contains no active GSD workflow state or generated planning corpus.
