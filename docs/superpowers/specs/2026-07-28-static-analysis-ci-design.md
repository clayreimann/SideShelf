# Static Analysis and CI Gate Design

**Date:** 2026-07-28
**Status:** Proposed for review
**Scope:** SideShelf TypeScript, ESLint, circular-import analysis, and pull-request CI

## Goal

Make SideShelf's full-project static analysis a trustworthy release gate by eliminating every current TypeScript and ESLint error and running the resulting checks automatically for pull requests and the protected branch.

This is a debt-removal and enforcement project. It must not intentionally change application behavior, weaken strictness, hide files from analysis, or turn the current failures into an accepted baseline.

## Current Baseline

The 2026-07-28 inventory established:

- `npx tsc --noEmit --pretty false` reports 139 diagnostics across 27 files.
- Most TypeScript diagnostics are test-typing failures: 92 are `TS2345`, and the largest clusters are Jest mocks and fixtures in download, API, coordinator, and collaborator tests.
- Production diagnostics remain in components, database helpers, i18n, API and deep-link utilities, file lifecycle code, download/player services, and Zustand slices.
- ESLint reports 12 errors in tracked JavaScript and TypeScript files.
- ESLint also reports 423 warnings. Those warnings remain visible but are outside this remediation's blocking scope.
- `npm run check:circular` passes.
- The existing `test-coverage.yml` workflow runs tests, coverage, circular-import detection, a non-blocking complexity report, and a non-blocking Expo export. It does not run TypeScript or blocking ESLint.
- The current branch is clean at the approved worktree fork point. The unpushed Audiobookshelf compatibility-plan commit is part of that fork point and must be preserved.

## Chosen Approach

Eliminate the existing error debt and add one explicit static-analysis command that CI can require.

The implementation will:

1. Repair all TypeScript diagnostics at their source.
2. Repair all ESLint errors in tracked files.
3. Add package scripts for full-project type checking and the combined static-analysis gate.
4. Add a dedicated GitHub Actions workflow that runs the gate on pull requests targeting `main` and pushes to `main`.
5. Keep existing ESLint warnings non-blocking and reported.
6. Retain the existing test-coverage workflow for behavior and coverage evidence.

## Global Constraints

- `npx tsc --noEmit --pretty false` must finish with zero diagnostics.
- ESLint must finish with zero errors across tracked project JavaScript and TypeScript files.
- Existing ESLint warnings remain visible and non-blocking; this project must not attempt a repository-wide warning cleanup.
- Do not add `any`, `@ts-ignore`, `@ts-expect-error`, declaration shims, compiler relaxations, new exclusions, or diagnostic baselines to make a check pass.
- Do not remove or weaken a test assertion merely to satisfy TypeScript.
- Production fixes must preserve runtime behavior unless an existing type error proves the implementation cannot satisfy its declared contract.
- Test fixes must model the real production interface with explicit typed mocks, fixtures, and callbacks.
- Do not upgrade dependencies as part of this project.
- Preserve the existing circular-import allowlist and architecture rules.
- Preserve unrelated commits and worktree changes.
- CI must use the repository lockfile through `npm ci` and Node.js 20, matching the existing workflows.

## TypeScript Remediation

### Test code

The dominant failure pattern is Jest inference collapsing mock arguments or return values to `never` or `unknown`. Fix these structurally:

- Prefer `jest.mocked(realFunction)` when the imported production function exists.
- Give standalone mocks an explicit `jest.MockedFunction<Signature>` or `jest.fn<Signature>()` type.
- Type callback captures and deferred promises at their production signatures.
- Build fixtures from exported production types or `satisfies` constraints.
- Correct stale event, database-row, and service-facade fixtures rather than casting them through `unknown`.
- Remove duplicate object keys and other JavaScript errors exposed by the compiler.

Tests must continue to assert the same behavior. A typing cleanup is not authorization to replace a meaningful assertion with a looser one.

### Production code

Production diagnostics require narrow, contract-preserving fixes:

- Align component props and third-party component usage with the installed dependency versions.
- Correct mismatches between database helper return types, schema types, and lifecycle consumers.
- Make i18n key sets and dictionary indexing consistent.
- Narrow unknown values before logging, file operations, or service calls.
- Align player/coordinator event payloads and chapter types with the actual state-machine contracts.
- Restore explicit Zustand callback types where inference has been lost.

If a production error reveals ambiguous intended behavior, implementation must stop and report the ambiguity rather than inventing a semantic change.

## ESLint Remediation

Fix the 12 tracked-file errors without broad formatting or warning cleanup:

- Replace the Maestro helper's `var`.
- Configure or import the Jest global correctly in the pre-test setup file.
- Replace unescaped JSX quotation marks with render-safe text.
- Remove the duplicate test-fixture key.

Local agent worktrees must not pollute root lint runs. ESLint configuration may explicitly ignore `.claude/**` and `.worktrees/**`; this is an environment exclusion, not a source-code exclusion. Source, scripts, configuration, and tracked Maestro helpers remain in scope.

The 423 warnings remain reviewable output. CI must not use `--max-warnings=0` in this project.

## Package Scripts

Add:

- `typecheck`: `tsc --noEmit --pretty false`
- `static-analysis`: run `typecheck`, blocking ESLint, and `check:circular` in a deterministic order

Retain the existing `lint` command unless implementation demonstrates that Expo's wrapper cannot cover the tracked project consistently. If a CI-specific lint script is necessary, it must target tracked project sources and configuration without suppressing rules or warnings.

The combined command is the local and CI acceptance gate. A failure in any constituent check must produce a non-zero exit.

## CI Design

Create `.github/workflows/static-analysis.yml` with:

- Triggers for `pull_request` events (`opened`, `synchronize`, `reopened`) targeting `main`.
- A `push` trigger for `main`.
- Read-only repository permissions.
- One Ubuntu job using `actions/checkout@v4`.
- Node.js 20 via `actions/setup-node@v4` with npm caching.
- `npm ci`.
- `npm run static-analysis`.

Keep this workflow separate from coverage so static-analysis failures are immediately identifiable and do not require running the slower Jest coverage suite first. Leave the existing circular check in coverage unless removing the duplication is clearly safe and keeps both workflows understandable; correctness and clear failure reporting take priority over a small amount of duplicate work.

## Verification

Implementation is complete only when all of these pass in the isolated worktree:

- `npm run typecheck`
- `npm run lint`
- `npm run check:circular`
- `npm run static-analysis`
- `npm test -- --runInBand --silent`
- `git diff --check`
- Formatting validation for `package.json`, the workflow, and changed source/test files

The implementation report must record the final TypeScript diagnostic count, ESLint error and warning counts, test suite/test totals, and circular-import result.

Because CI configuration is declarative, validate the workflow's YAML structure locally with an available parser and review its trigger/permission semantics directly.

## Review and Integration

One implementation subagent owns the remediation so test and production contracts are reconciled consistently across the repository. It must commit cohesive changes, self-review the complete diff, and report any semantic ambiguity instead of guessing.

An independent reviewer then checks:

- No diagnostics were hidden or reclassified.
- Runtime behavior and test strength were preserved.
- CI actually fails when TypeScript, ESLint, or circular analysis fails.
- The workflow cannot mutate repository contents.
- The final diff contains no unrelated dependency or feature work.

The controller reruns every acceptance command on the final branch. The work remains in the isolated worktree until that review and verification are complete.

## Explicitly Out of Scope

- Fixing the 423 existing ESLint warnings.
- Raising or changing ESLint complexity thresholds.
- Dependency, Expo SDK, Jest, TypeScript, or ESLint upgrades.
- Expo Doctor, Expo package-compatibility, native-build, Maestro, or device-test expansion.
- Changing coverage thresholds or the existing coverage baseline.
- Refactoring unrelated architecture solely because a touched file could be cleaner.
