# 2026-07-13 Full-app review — remediation brief index

> **STATUS (2026-07-17): ALL 8 BRIEFS IMPLEMENTED AND MERGED** into
> `milestones/milestone-1.3` (merge commit `24dbf24`, branch
> `fix/review-remediation-briefs`, commits f333c18..2925262). Todo files moved
> to `.planning/todos/done/`. Suite: 932 → 1052 passing tests, zero
> regressions; `npm run check:circular` now enforces the import rule.
>
> Outstanding after merge:
>
> - Commit `2925262` (Brief H) is unsigned (1Password agent was locked);
>   history-rewrite would be needed to re-sign — accepted as-is at merge time.
> - Manual device verification: Brief E (stream + seek + token rotation
>   against a real ABS server), Brief F (insecure-login alert flow).
> - Follow-up task chips filed: cover-image URL tokens; orphaned
>   `0014_normalize_paths.sql` migration (registered pre-merge in
>   migrations.js but never journaled — has never run on any device; needs
>   its own migration slot).

Source: comprehensive architecture/security/correctness review of the app
(Claude session, 2026-07-13). Eight self-contained briefs were filed in
`.planning/todos/pending/`, each executable by an agent with no other
context beyond the repo + CLAUDE.md.

| Brief | Todo file                                                             | Priority | Area            |
| ----- | --------------------------------------------------------------------- | -------- | --------------- |
| A     | 2026-07-13-auth-refresh-resilience-401-retry-guard-legacy-servers.md  | P0       | auth            |
| B     | 2026-07-13-coordinator-rejected-transition-mutation-stuck-loading.md  | P0       | player          |
| C     | 2026-07-13-break-logger-appstore-circular-dependency-enforce-check.md | P1       | architecture    |
| D     | 2026-07-13-logging-token-redaction-lazy-bodies-deeplink-confirm.md    | P1       | logging         |
| E     | 2026-07-13-streaming-auth-header-instead-of-url-token.md              | P2       | player/security |
| F     | 2026-07-13-transport-security-scope-cleartext-warn-insecure-login.md  | P2       | security        |
| G     | 2026-07-13-download-progress-accounting-callback-lifecycle.md         | P3       | downloads       |
| H     | 2026-07-13-progressservice-constants-hotpath-lifecycle.md             | P3       | progress        |

## Execution order

```
Wave 1 (parallel): A, B          — P0 correctness fixes, disjoint files
Wave 2 (parallel): C, E, F, G    — run C first if serializing (broad import churn)
Wave 3:            D (after C — same logger module)
                   H (after B — same player event flow)
```

## Cross-brief constraints

- **C before D**: both modify `src/lib/logger/`; C restructures imports,
  D changes content/redaction.
- **B before H**: both touch player event dispatch; B changes rejected/error
  event semantics that H's trace-metadata fixes build on.
- **A vs existing todo**: brief A overlaps with
  `2026-03-31-app-startup-login-flicker-and-expired-token-ux.md` (expired
  token UX). A fixes the token-clearing root causes; the 2026-03-31 todo
  covers the offline-access UX. Agents on either should read both.
- **E and F have explicit bail-out clauses**: both include an
  investigate-first step and permission to conclude "don't do it, document
  why" if runtime behavior (RNTP header support on range requests; real-world
  plain-HTTP usage) makes the change net-negative.

## Review findings deliberately NOT filed as briefs

- Store-bridge split-brain (coordinator context vs playerSlice, currentTrack
  exception) — larger refactor, needs its own design discussion.
- ProgressService decomposition into collaborators — follow-up after H.
- Product gaps: no search, no CarPlay/Android Auto, no podcast UI, no
  casting, no ebooks, single-server/single-user.
- Accessibility audit (VoiceOver labels) — unaudited in review, needs a pass.
- No CI workflow (partially addressed by brief C's check:circular + minimal
  workflow).
- `package.json` still says `your-username/abs-react-native`.
