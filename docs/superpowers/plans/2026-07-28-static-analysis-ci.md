# Static Analysis and CI Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate SideShelf's 137 TypeScript diagnostics and 12 tracked-file ESLint errors, then make TypeScript, ESLint, and circular-import analysis a required CI gate.

**Architecture:** Repair compiler and lint failures at their real type and source boundaries without suppressions or relaxed configuration. Expose the three existing analyzers through one deterministic npm command and run that command in a dedicated, read-only GitHub Actions workflow.

**Tech Stack:** TypeScript 5.9, ESLint 9 flat config with `eslint-config-expo`, Jest 29, Expo SDK 54, npm, GitHub Actions

## Global Constraints

- `npx tsc --noEmit --pretty false` must finish with zero diagnostics.
- ESLint must finish with zero errors across tracked project JavaScript and TypeScript files.
- Existing ESLint warnings remain visible and non-blocking; this project must not attempt a repository-wide warning cleanup.
- Do not add `any`, `@ts-ignore`, `@ts-expect-error`, declaration shims, compiler relaxations, new source/test exclusions, or diagnostic baselines to make a check pass.
- Do not remove or weaken a test assertion merely to satisfy TypeScript.
- Production fixes must preserve runtime behavior unless an existing type error proves the implementation cannot satisfy its declared contract.
- Test fixes must model the real production interface with explicit typed mocks, fixtures, and callbacks.
- Do not upgrade dependencies as part of this project.
- Preserve the existing circular-import allowlist and architecture rules.
- Preserve unrelated commits and worktree changes.
- CI must use the repository lockfile through `npm ci` and Node.js 20.
- The approved design is `docs/superpowers/specs/2026-07-28-static-analysis-ci-design.md`.

---

### Task 1: Eliminate static-analysis debt and add the CI gate

The compiler cleanup and CI enforcement form one deliverable: CI must not be introduced until the full repository can pass it, and the remediation must be reviewed as the exact code surface that makes the new gate green.

**Files:**

- Create: `.github/workflows/static-analysis.yml`
- Modify: `package.json`
- Modify: `eslint.config.js`
- Modify: `.maestro/wait.js`
- Modify: `src/__tests__/setup-before.js`
- Modify: `src/app/(tabs)/more/bundle-loader.tsx`
- Modify: `src/__tests__/mocks/database.ts`
- Modify: `src/components/diagnostics/CoordinatorDiagnostics.tsx`
- Modify: `src/components/library/LibraryItemList.tsx`
- Modify: `src/components/ui/PlayerProgressToast.tsx`
- Modify: `src/db/helpers/__tests__/libraryItems.test.ts`
- Modify: `src/db/helpers/__tests__/mediaProgress.test.ts`
- Modify: `src/db/helpers/__tests__/normalizePaths.test.ts`
- Modify: `src/i18n/index.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/es.ts`
- Modify: `src/lib/__tests__/nowPlayingMetadata.test.ts`
- Modify: `src/lib/api/__tests__/api.test.ts`
- Modify: `src/lib/api/__tests__/endpoints.redaction.test.ts`
- Modify: `src/lib/fileLifecycleManager.ts`
- Modify: `src/services/__tests__/ApiClientService.test.ts`
- Modify: `src/services/__tests__/BackgroundReconnectCollaborator.test.ts`
- Modify: `src/services/__tests__/DownloadRepairCollaborator.test.ts`
- Modify: `src/services/__tests__/DownloadService.test.ts`
- Modify: `src/services/__tests__/PlaybackControlCollaborator.test.ts`
- Modify: `src/services/__tests__/PlayerBackgroundServiceFade.test.ts`
- Modify: `src/services/__tests__/PlayerService.test.ts`
- Modify: `src/services/__tests__/ProgressRestoreCollaborator.test.ts`
- Modify: `src/services/__tests__/TrackLoadingCollaborator.test.ts`
- Modify: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`
- Modify: `src/services/coordinator/PlayerStateCoordinator.ts`
- Modify: `src/services/DownloadService.ts`
- Modify: `src/stores/slices/__tests__/librarySlice.test.ts`
- Modify: `src/stores/slices/playerSlice.ts`
- Test: all affected co-located Jest suites plus the full Jest suite

**Interfaces:**

- Consumes: existing `npm run lint`, `npm run check:circular`, TypeScript strict configuration, production service/component/database types, Jest test contracts, and GitHub pull requests targeting `main`.
- Produces: `npm run typecheck`, `npm run static-analysis`, and the `Static Analysis` GitHub Actions check.
- `npm run typecheck` is exactly `tsc --noEmit --pretty false`.
- `npm run static-analysis` is exactly `npm run typecheck && npm run lint && npm run check:circular`.
- The `lint` script becomes `eslint .` so tracked configuration and Maestro JavaScript are covered; `eslint.config.js` excludes only generated output and local worktree roots.

- [ ] **Step 1: Record the failing compiler and lint gates**

Run:

```bash
npx tsc --noEmit --pretty false
```

Expected: exit 2 with 137 diagnostics across 26 files.

Run:

```bash
git ls-files -z '*.js' '*.jsx' '*.ts' '*.tsx' \
  | xargs -0 npx eslint
```

Expected: non-zero with these 12 errors:

- `.maestro/wait.js`: `no-var`
- `src/__tests__/setup-before.js`: four `no-undef` errors for the Jest global
- `src/app/(tabs)/more/bundle-loader.tsx`: six `react/no-unescaped-entities` errors
- `src/stores/slices/__tests__/librarySlice.test.ts`: duplicate `marshalLibraryItemFromApi`

Do not edit files until both failures and counts are recorded in the task report.

- [ ] **Step 2: Repair the tracked ESLint errors and lint scope**

In `eslint.config.js`, preserve the existing Expo, complexity, and accessibility rules. Expand the environment-only ignore list:

```js
{
  ignores: [
    "coverage/**",
    "dist/**",
    ".expo/**",
    ".claude/**",
    ".worktrees/**",
  ],
},
```

Add a Jest-global override for the JavaScript setup file instead of disabling `no-undef`:

```js
{
  files: ["src/__tests__/setup-before.js"],
  languageOptions: {
    globals: {
      jest: "readonly",
    },
  },
},
```

Apply these exact source corrections:

- Change `.maestro/wait.js` from `var start` to `const start`.
- Encode the six quotation marks rendered as JSX text in `bundle-loader.tsx` as `&quot;`.
- Remove the duplicate `marshalLibraryItemFromApi` property from the mocked helper object in `librarySlice.test.ts`; retain one implementation and all assertions.

Run:

```bash
git ls-files -z '*.js' '*.jsx' '*.ts' '*.tsx' \
  | xargs -0 npx eslint
```

Expected: exit 0 with zero errors. Warnings remain printed and non-blocking.

- [ ] **Step 3: Repair Jest mock and fixture typing**

Resolve the test-only diagnostic clusters without casts through `unknown`, loose `jest.Mock`, or `any`.

Use the production function type whenever a real import exists:

```ts
const mockApiFetch = jest.mocked(apiFetch);
const mockFetch = jest.fn<typeof fetch>();
```

Use exact standalone signatures where the mock is the dependency:

```ts
const getAuthContext = jest.fn<() => { baseUrl: string; accessToken: string } | null>();
const getGeneration = jest.fn<() => number>();
```

For callbacks, name the production-shaped callback type and return `void`:

```ts
type ProgressCallback = (data: DownloadProgress) => void;
const subscribe = jest.fn<(callback: ProgressCallback) => () => void>();
```

Apply those patterns to:

- `src/__tests__/mocks/database.ts`: type every exported database/file-system mock at the helper's real return signature.
- `src/lib/api/__tests__/api.test.ts`, `endpoints.redaction.test.ts`, and `src/services/__tests__/ApiClientService.test.ts`: type `fetch`/`apiFetch` mocks as `typeof fetch` or the imported function; narrow logger mock results to the exported logger interface before assertions.
- `src/services/__tests__/BackgroundReconnectCollaborator.test.ts`, `PlaybackControlCollaborator.test.ts`, `ProgressRestoreCollaborator.test.ts`, and `TrackLoadingCollaborator.test.ts`: type facade methods at the collaborator interface signatures and make resume-position fixtures satisfy `ResumePositionInfo`.
- `src/services/__tests__/DownloadRepairCollaborator.test.ts`, `DownloadService.test.ts`, `PlayerBackgroundServiceFade.test.ts`, `PlayerService.test.ts`, and `src/lib/__tests__/nowPlayingMetadata.test.ts`: give every promise, callback, and native-module mock its real argument and return types. Replace existing callback `any` annotations with the concrete production payload type.
- `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`: build events as the actual `PlayerEvent` variants, use the optional tuple element when filtering dispatched calls, type rejected promises explicitly, and update store fixtures through the real state shape.
- `src/db/helpers/__tests__/libraryItems.test.ts`: import `NewLibraryItemRow` from the schema/type module that exports it rather than from the helper implementation.
- `src/db/helpers/__tests__/mediaProgress.test.ts`: create the user fixture with the current users schema; do not add the removed `token` property.
- `src/db/helpers/__tests__/normalizePaths.test.ts`: type the mocked statement and statement collection from the database interface.
- `src/stores/slices/__tests__/librarySlice.test.ts`: type the mocked item callback and make `rawItems` satisfy `LibraryItemDisplayRow[]`.

Run the affected test suites:

```bash
npx jest --runInBand --silent \
  src/lib/api/__tests__/api.test.ts \
  src/lib/api/__tests__/endpoints.redaction.test.ts \
  src/services/__tests__/ApiClientService.test.ts \
  src/services/__tests__/BackgroundReconnectCollaborator.test.ts \
  src/services/__tests__/DownloadRepairCollaborator.test.ts \
  src/services/__tests__/DownloadService.test.ts \
  src/services/__tests__/PlaybackControlCollaborator.test.ts \
  src/services/__tests__/PlayerBackgroundServiceFade.test.ts \
  src/services/__tests__/PlayerService.test.ts \
  src/services/__tests__/ProgressRestoreCollaborator.test.ts \
  src/services/__tests__/TrackLoadingCollaborator.test.ts \
  src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts \
  src/db/helpers/__tests__/libraryItems.test.ts \
  src/db/helpers/__tests__/mediaProgress.test.ts \
  src/db/helpers/__tests__/normalizePaths.test.ts \
  src/stores/slices/__tests__/librarySlice.test.ts
```

Expected: all listed suites pass with unchanged behavioral assertions.

Run:

```bash
npx tsc --noEmit --pretty false
```

Expected: the test-only diagnostics above are gone. Record the remaining production-file diagnostics in the task report before proceeding.

- [ ] **Step 4: Repair production type boundaries**

Make these narrow corrections and retain existing behavior:

- `CoordinatorDiagnostics.tsx`: type the timer reference as `ReturnType<typeof setInterval>` so React Native and Jest/Node declarations agree.
- `LibraryItemList.tsx`: remove the unsupported FlashList v2 `estimatedItemSize` prop; keep the current data, columns, item type, renderer, refresh control, and indicator behavior.
- `PlayerProgressToast.tsx`: narrow a caught `unknown` value to `Error` before passing it to the tagged logger.
- `src/i18n/index.ts` and locale files: make the English and Spanish dictionaries expose the same `TranslationKey` set, including `player.progressToast.label`; index only after the locale dictionary has been typed as `TranslationDictionary`.
- `fileLifecycleManager.ts`: select or return `lastAccessedAt` through the existing download-row contract before reading it; do not fabricate a timestamp.
- `PlayerStateCoordinator.ts`: use the actual `CurrentChapter` property defined by the player state rather than the nonexistent `id`.
- `DownloadService.ts`: align calls to the current database-helper arity, narrow filesystem results to strings before path use, and preserve the current user/library item scoping.
- `playerSlice.ts`: type the Zustand setter callback state as `PlayerSlice`.

Run the focused production-adjacent suites:

```bash
npx jest --runInBand --silent \
  src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts \
  src/services/__tests__/DownloadService.test.ts \
  src/lib/__tests__/fileLifecycleManager.test.ts \
  src/components/ui/__tests__/ProgressBar.a11y.test.tsx \
  src/stores/slices/__tests__/playerSlice.test.ts
```

Expected: all listed suites pass.

Run:

```bash
npx tsc --noEmit --pretty false
```

Expected: exit 0 with zero diagnostics.

- [ ] **Step 5: Commit the error remediation**

Review the diff for suppressions and accidental behavior changes:

```bash
rg -n '\bany\b|@ts-ignore|@ts-expect-error' \
  src .maestro eslint.config.js
git diff --check
```

Existing `any` usages outside the changed lines may remain. No changed line may add one of the prohibited constructs.

Commit only the error-remediation files:

```bash
git add \
  .maestro/wait.js \
  eslint.config.js \
  src
git -c commit.gpgsign=false commit -m "fix: eliminate static analysis errors"
```

- [ ] **Step 6: Verify the missing combined command fails before configuration**

Run:

```bash
npm run static-analysis
```

Expected: fail with `Missing script: "static-analysis"`.

Record that failure in the task report.

- [ ] **Step 7: Add deterministic npm scripts**

In `package.json`:

- Change `lint` from `expo lint` to `eslint .`.
- Add `"typecheck": "tsc --noEmit --pretty false"`.
- Add `"static-analysis": "npm run typecheck && npm run lint && npm run check:circular"`.

Do not change dependency versions, the lockfile, `lint:complexity`, or test scripts.

Run:

```bash
npm run typecheck
npm run lint
npm run check:circular
npm run static-analysis
```

Expected: every command exits 0; lint prints warnings but zero errors.

- [ ] **Step 8: Add the read-only GitHub Actions workflow**

Create `.github/workflows/static-analysis.yml` with exactly this structure:

```yaml
name: Static Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - main
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run static analysis
        run: npm run static-analysis
```

Do not add write permissions, secrets, `continue-on-error`, or diagnostic-baseline logic.

Validate package and workflow formatting:

```bash
npx prettier --check package.json .github/workflows/static-analysis.yml
```

Expected: both files pass.

- [ ] **Step 9: Commit the CI gate**

Run:

```bash
git diff --check
git add package.json .github/workflows/static-analysis.yml
git -c commit.gpgsign=false commit -m "ci: enforce static analysis"
```

- [ ] **Step 10: Run final acceptance**

Run:

```bash
npm run static-analysis
npm test -- --runInBand --silent
npx prettier --check \
  package.json \
  eslint.config.js \
  .github/workflows/static-analysis.yml \
  docs/superpowers/specs/2026-07-28-static-analysis-ci-design.md \
  docs/superpowers/plans/2026-07-28-static-analysis-ci.md
git diff --check 0824f06...HEAD
git status --short --branch
```

Expected:

- TypeScript: zero diagnostics.
- ESLint: zero errors; warnings reported and non-blocking.
- Circular imports: no unexpected cycles.
- Jest: 82 suites pass, with the current 1,301 passing and 3 skipped baseline unless added tests intentionally change the totals.
- Prettier and whitespace checks pass.
- Worktree is clean.

Write the final implementation report with:

- Red evidence for the compiler, lint, and missing-script gates.
- Commits created.
- Files changed.
- TypeScript diagnostic count before and after.
- ESLint error/warning counts before and after.
- Focused and full Jest totals.
- Circular-import, formatting, and whitespace results.
- Any behavior or interface decision that required judgment.
