# OTA Phase 0 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove SideShelf's nonfunctional GitHub Pages OTA publication path and user-facing custom Bundle Loader while retaining a safely dormant `expo-updates` core.

**Architecture:** Phase 0 is a truthful-disabled-state cleanup. A repository contract test prevents the retired workflows, routes, service, custom URL state, and unsafe preview configuration from returning; the application retains `expo-updates`, runtime-version configuration, and embedded-bundle recovery for the later Worker + R2 phases.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, Jest, Zustand, GitHub Actions YAML, Markdown

## Global Constraints

- Implement only Phase 0 from `docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md`; do not create or deploy Worker or R2 infrastructure.
- Retain the `expo-updates` dependency and native integration.
- Retain `updates.enabled: true`, `updates.checkAutomatically: "NEVER"`, `updates.fallbackToCacheTimeout: 0`, and the current `runtimeVersion.policy: "appVersion"` during the disabled interim state.
- Retain the `preview` and `production` channel names in `eas.json`.
- Remove `EXPO_PUBLIC_UPDATE_URL`, `disableAntiBrickingMeasures`, runtime URL overrides, custom channel overrides, and all user-facing OTA controls.
- Existing `@app/customUpdateUrl` values may remain as harmless orphaned AsyncStorage data; do not add a migration.
- Do not publish, push, create a pull request, deploy infrastructure, or alter the `gh-pages` branch.
- Preserve all unrelated user changes and keep commits scoped to Phase 0.

---

### Task 1: Remove the application-facing OTA loader

**Files:**

- Create: `src/__tests__/otaDisabledState.test.ts`
- Delete: `src/app/(tabs)/more/bundle-loader.tsx`
- Delete: `src/services/BundleService.ts`
- Modify: `src/app/(tabs)/more/settings.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `src/lib/appSettings.ts`
- Modify: `src/stores/slices/settingsSlice.ts`
- Modify: `src/stores/appStore.ts`
- Modify: `src/stores/slices/__tests__/settingsSlice.test.ts`

**Interfaces:**

- Consumes: the existing More settings route, root deep-link listener, settings persistence helpers, `SettingsSlice`, and `useSettings()`.
- Produces: an application with no Bundle Loader route, deep link, service, or `customUpdateUrl` state/action, plus a regression test that guards their absence.

- [ ] **Step 1: Add the failing application-surface contract tests**

Create `src/__tests__/otaDisabledState.test.ts` with:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

const repoPath = (...segments: string[]) => path.join(process.cwd(), ...segments);

describe("OTA Phase 0 disabled state", () => {
  it.each(["src/app/(tabs)/more/bundle-loader.tsx", "src/services/BundleService.ts"])(
    "removes retired application surface %s",
    (removedPath) => {
      expect(fs.existsSync(repoPath(removedPath))).toBe(false);
    }
  );

  it.each([
    "src/app/(tabs)/more/settings.tsx",
    "src/app/_layout.tsx",
    "src/lib/appSettings.ts",
    "src/stores/slices/settingsSlice.ts",
    "src/stores/appStore.ts",
  ])("contains no custom bundle loader reference in %s", (sourcePath) => {
    const source = fs.readFileSync(repoPath(sourcePath), "utf8");

    expect(source).not.toMatch(
      /BundleService|bundleService|bundle-loader|Bundle Loader|customUpdateUrl|CustomUpdateUrl/
    );
  });
});
```

- [ ] **Step 2: Run the new test and verify the expected red state**

Run:

```bash
npx jest src/__tests__/otaDisabledState.test.ts --runInBand
```

Expected: FAIL because the two retired files still exist and the listed application/state files still contain Bundle Loader or custom update URL references.

- [ ] **Step 3: Delete the Bundle Loader route and service**

Delete:

```text
src/app/(tabs)/more/bundle-loader.tsx
src/services/BundleService.ts
```

Do not replace them with redirects or stubs.

- [ ] **Step 4: Remove Bundle Loader navigation**

In `src/app/(tabs)/more/settings.tsx`, remove the complete `Bundle Loader Link` `Pressable`.

In `src/app/_layout.tsx`, remove only the bundle-loader branch from the deep-link listener:

```typescript
if (url.includes("://bundle-loader")) {
  // ...
}
```

Preserve logger deep links and the general `handleDeepLinkUrl(url)` fallback.

- [ ] **Step 5: Remove custom update URL persistence and state**

In `src/lib/appSettings.ts`, remove:

```typescript
customUpdateUrl: ("@app/customUpdateUrl", getCustomUpdateUrl());
setCustomUpdateUrl();
```

In `src/stores/slices/settingsSlice.ts`, remove:

```typescript
getCustomUpdateUrl;
setCustomUpdateUrl;
settings.customUpdateUrl;
updateCustomUpdateUrl;
```

Also remove the value from `DEFAULT_SETTINGS`, the `Promise.all` initialization tuple and call, the initialized settings object, and the action implementation.

In `src/stores/appStore.ts`, remove the `customUpdateUrl` and `updateCustomUpdateUrl` selectors, returned properties, and `useMemo` dependencies from `useSettings()`.

In `src/stores/slices/__tests__/settingsSlice.test.ts`, remove the matching mocked functions, typed mock bindings, default values, initialization values, expected state property, and any focused action tests for `updateCustomUpdateUrl`. Preserve all other settings coverage.

- [ ] **Step 6: Format changed TypeScript files**

Run:

```bash
npx prettier --write \
  src/__tests__/otaDisabledState.test.ts \
  src/app/_layout.tsx \
  "src/app/(tabs)/more/settings.tsx" \
  src/lib/appSettings.ts \
  src/stores/appStore.ts \
  src/stores/slices/settingsSlice.ts \
  src/stores/slices/__tests__/settingsSlice.test.ts
```

Expected: exit 0.

- [ ] **Step 7: Run focused tests and verify green**

Run:

```bash
npx jest \
  src/__tests__/otaDisabledState.test.ts \
  src/stores/slices/__tests__/settingsSlice.test.ts \
  --runInBand
```

Expected: both suites PASS.

- [ ] **Step 8: Commit the application cleanup**

```bash
git add \
  src/__tests__/otaDisabledState.test.ts \
  src/app/_layout.tsx \
  "src/app/(tabs)/more/settings.tsx" \
  src/app/\(tabs\)/more/bundle-loader.tsx \
  src/services/BundleService.ts \
  src/lib/appSettings.ts \
  src/stores/appStore.ts \
  src/stores/slices/settingsSlice.ts \
  src/stores/slices/__tests__/settingsSlice.test.ts
git commit -m "refactor: remove inactive OTA loader"
```

---

### Task 2: Remove false GitHub OTA publication

**Files:**

- Modify: `src/__tests__/otaDisabledState.test.ts`
- Delete: `.github/workflows/publish-pr-update.yml`
- Delete: `.github/workflows/publish-release-update.yml`
- Delete: `.github/workflows/cleanup-pr-bundle.yml`
- Delete: `.github/workflows/README-cleanup.md`
- Modify: `.github/workflows/test-coverage.yml`

**Interfaces:**

- Consumes: existing PR coverage workflow.
- Produces: coverage CI that runs circular-import checks, tests, complexity reporting, coverage comments, and coverage artifact upload without exporting or advertising installable OTA bundles.

- [ ] **Step 1: Extend the contract test for workflow removal**

Add inside the existing `describe` block:

```typescript
it.each([
  ".github/workflows/publish-pr-update.yml",
  ".github/workflows/publish-release-update.yml",
  ".github/workflows/cleanup-pr-bundle.yml",
  ".github/workflows/README-cleanup.md",
])("removes retired OTA workflow file %s", (removedPath) => {
  expect(fs.existsSync(repoPath(removedPath))).toBe(false);
});

it("keeps coverage CI focused on tests and coverage", () => {
  const workflow = fs.readFileSync(repoPath(".github/workflows/test-coverage.yml"), "utf8");

  expect(workflow).not.toMatch(
    /Export JavaScript bundle|Upload bundle artifacts|JavaScript Bundle Available|Bundle Loader/
  );
});
```

- [ ] **Step 2: Run the contract test and verify the expected red state**

Run:

```bash
npx jest src/__tests__/otaDisabledState.test.ts --runInBand
```

Expected: FAIL because the four workflow files exist and `test-coverage.yml` still exports, uploads, and comments about bundles.

- [ ] **Step 3: Delete retired OTA workflows**

Delete:

```text
.github/workflows/publish-pr-update.yml
.github/workflows/publish-release-update.yml
.github/workflows/cleanup-pr-bundle.yml
.github/workflows/README-cleanup.md
```

Do not edit or delete the remote `gh-pages` branch in this phase.

- [ ] **Step 4: Remove OTA work from coverage CI**

In `.github/workflows/test-coverage.yml`, remove:

- the `Export JavaScript bundle` step;
- the `Upload bundle artifacts` step; and
- the complete `Comment bundle download instructions` step.

Leave the test, circular-import, complexity, coverage comment, and coverage artifact steps unchanged.

- [ ] **Step 5: Format and run the workflow contract test**

Run:

```bash
npx prettier --write \
  src/__tests__/otaDisabledState.test.ts \
  .github/workflows/test-coverage.yml
npx jest src/__tests__/otaDisabledState.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit the workflow cleanup**

```bash
git add \
  src/__tests__/otaDisabledState.test.ts \
  .github/workflows/test-coverage.yml \
  .github/workflows/publish-pr-update.yml \
  .github/workflows/publish-release-update.yml \
  .github/workflows/cleanup-pr-bundle.yml \
  .github/workflows/README-cleanup.md
git commit -m "ci: remove false OTA publication"
```

---

### Task 3: Make Expo Updates safely dormant

**Files:**

- Modify: `src/__tests__/otaDisabledState.test.ts`
- Modify: `app.config.js`

**Interfaces:**

- Consumes: Expo dynamic app configuration and the retained `expo-updates` dependency.
- Produces: deterministic disabled-interim configuration with no update URL or anti-bricking override.

- [ ] **Step 1: Extend the contract test for resolved preview configuration**

Add inside the existing `describe` block:

```typescript
it("keeps expo-updates dormant and preserves recovery in preview builds", () => {
  const previousVariant = process.env.APP_VARIANT;
  let resolvedConfig!: {
    updates: Record<string, unknown>;
    runtimeVersion: { policy: string };
  };

  try {
    process.env.APP_VARIANT = "preview";
    jest.resetModules();
    const createConfig = require("../../app.config.js") as (input: {
      config: Record<string, unknown>;
    }) => typeof resolvedConfig;

    resolvedConfig = createConfig({ config: {} });
  } finally {
    if (previousVariant === undefined) {
      delete process.env.APP_VARIANT;
    } else {
      process.env.APP_VARIANT = previousVariant;
    }
    jest.resetModules();
  }

  expect(resolvedConfig.updates).toEqual({
    enabled: true,
    checkAutomatically: "NEVER",
    fallbackToCacheTimeout: 0,
  });
  expect(resolvedConfig.runtimeVersion).toEqual({ policy: "appVersion" });
});

it("contains no build-time custom update URL switch", () => {
  const source = fs.readFileSync(repoPath("app.config.js"), "utf8");

  expect(source).not.toMatch(
    /EXPO_PUBLIC_UPDATE_URL|CUSTOM_UPDATE_URL|disableAntiBrickingMeasures/
  );
});
```

- [ ] **Step 2: Run the contract test and verify the expected red state**

Run:

```bash
npx jest src/__tests__/otaDisabledState.test.ts --runInBand
```

Expected: FAIL because preview configuration includes `disableAntiBrickingMeasures` and the source still contains the custom URL environment switch.

- [ ] **Step 3: Simplify `app.config.js` update configuration**

Remove:

```javascript
const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";
const CUSTOM_UPDATE_URL = process.env.EXPO_PUBLIC_UPDATE_URL;
```

Remove the stale custom-URL description at the top of the file. Replace the `updates` object with exactly:

```javascript
updates: {
  // OTA is intentionally dormant until the Worker + R2 service passes
  // docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md.
  enabled: true,
  checkAutomatically: "NEVER",
  fallbackToCacheTimeout: 0,
},
```

Retain:

```javascript
runtimeVersion: {
  policy: "appVersion",
},
```

- [ ] **Step 4: Run focused configuration verification**

Run:

```bash
npx prettier --write app.config.js src/__tests__/otaDisabledState.test.ts
npx jest src/__tests__/otaDisabledState.test.ts --runInBand
npx expo config --type public --json
```

Expected:

- Jest PASS.
- Expo config exits 0.
- Resolved `updates` has `enabled: true`, `checkAutomatically: "NEVER"`, and `fallbackToCacheTimeout: 0`.
- Resolved config has no `updates.url` and no `disableAntiBrickingMeasures`.
- Resolved runtime policy remains `appVersion`.

- [ ] **Step 5: Commit dormant configuration**

```bash
git add app.config.js src/__tests__/otaDisabledState.test.ts
git commit -m "chore: leave OTA client safely dormant"
```

---

### Task 4: Replace stale OTA and release documentation

**Files:**

- Replace: `docs/architecture/OTA_UPDATES.md`
- Modify: `RELEASE.md`
- Modify: `TODO.md`

**Interfaces:**

- Consumes: the approved Worker + R2 design specification.
- Produces: concise current-state documentation that says OTA is disabled and release instructions that describe binary builds only.

- [ ] **Step 1: Replace the stale architecture document**

Replace `docs/architecture/OTA_UPDATES.md` with:

```markdown
# OTA Updates

## Current status

OTA updates are intentionally disabled in SideShelf.

The previous GitHub Pages workflow was removed because a static `expo export`
directory is not an Expo Updates protocol server. Current builds retain the
`expo-updates` native module and runtime-version configuration, but they do not
contain an update URL, automatically check for updates, expose a Bundle Loader,
or permit runtime URL overrides.

App Store and TestFlight releases therefore receive JavaScript changes only
through a new binary until the self-hosted update service passes its production
gates.

## Approved future design

The approved design uses a fixed Cloudflare Worker manifest endpoint and
content-addressed R2 storage with exact channel/platform/runtime matching,
signed manifests, atomic promotion, rollback, and physical-device acceptance.

See:

- `docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md`

Do not restore GitHub Pages publication or a user-entered update URL. Implement
the approved delivery phases in order.
```

- [ ] **Step 2: Correct release instructions**

In `RELEASE.md`:

- rename preview builds so they are not described as “with OTA Updates”;
- remove claims that preview builds dynamically load PR bundles;
- remove Bundle Loader and deep-link instructions;
- state that preview builds are internal binaries and OTA is currently disabled;
- remove claims that release tags export to GitHub Pages or create OTA deep links;
- state that JavaScript changes require another binary until the Worker + R2 production gates pass; and
- retain actual EAS build, submit, version-tag, App Store, and store-metadata instructions.

- [ ] **Step 3: Make the backlog item point to the approved design**

Change the release checklist entry in `TODO.md` from:

```markdown
- [ ] Configure OTA updates (if using)
```

to:

```markdown
- [ ] Implement the approved Worker + R2 OTA phases
```

Add the design path on the next indented line:

```markdown
- `docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md`
```

- [ ] **Step 4: Format and audit stale operational claims**

Run:

```bash
npx prettier --write docs/architecture/OTA_UPDATES.md RELEASE.md TODO.md
rg -n --hidden \
  --glob '!node_modules' \
  --glob '!.git' \
  --glob '!docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md' \
  --glob '!docs/superpowers/plans/2026-07-28-ota-phase-0-cleanup.md' \
  --glob '!docs/architecture/OTA_UPDATES.md' \
  --glob '!src/__tests__/otaDisabledState.test.ts' \
  'GitHub Pages|gh-pages|bundle-loader|Bundle Loader|EXPO_PUBLIC_UPDATE_URL|disableAntiBrickingMeasures|customUpdateUrl|BundleService|publish-pr-update|publish-release-update' \
  .
```

Expected: no matches. Historical rationale remains only in the approved specification, this implementation plan, the concise architecture status page, and the regression test that guards the removed names.

- [ ] **Step 5: Commit documentation corrections**

```bash
git add docs/architecture/OTA_UPDATES.md RELEASE.md TODO.md
git commit -m "docs: mark OTA updates disabled"
```

---

### Task 5: Verify Phase 0 as a whole

**Files:**

- Verify only; modify a Phase 0 file only if a check exposes an issue.

**Interfaces:**

- Consumes: Tasks 1 through 4.
- Produces: evidence that the entire Phase 0 cleanup is coherent and the repository is ready for the later Worker + R2 implementation plan.

- [ ] **Step 1: Run focused Phase 0 tests**

Run:

```bash
npx jest \
  src/__tests__/otaDisabledState.test.ts \
  src/stores/slices/__tests__/settingsSlice.test.ts \
  "src/app/(tabs)/more/__tests__/routeCoverage.test.ts" \
  --runInBand
```

Expected: PASS with zero failed suites or tests.

- [ ] **Step 2: Run static and Expo configuration checks**

Run:

```bash
npx prettier --check \
  app.config.js \
  src/__tests__/otaDisabledState.test.ts \
  src/app/_layout.tsx \
  "src/app/(tabs)/more/settings.tsx" \
  src/lib/appSettings.ts \
  src/stores/appStore.ts \
  src/stores/slices/settingsSlice.ts \
  src/stores/slices/__tests__/settingsSlice.test.ts \
  .github/workflows/test-coverage.yml \
  docs/architecture/OTA_UPDATES.md \
  RELEASE.md \
  TODO.md
npx expo config --type public --json
npx expo install --check
npx tsc --noEmit --pretty false
npm run lint
npm run check:circular
```

Expected:

- Prettier, Expo config, Expo dependency check, lint, and circular-import checks exit 0.
- TypeScript exits 0, or any repository baseline errors are recorded exactly and no Phase 0 file appears in them.
- Effective Expo config contains no update URL or anti-bricking override.

- [ ] **Step 3: Run the full Jest suite**

Run:

```bash
npm test -- --runInBand
```

Expected: all suites and tests PASS.

- [ ] **Step 4: Run the final stale-reference audit**

Run:

```bash
rg -n --hidden \
  --glob '!node_modules' \
  --glob '!.git' \
  --glob '!docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md' \
  --glob '!docs/superpowers/plans/2026-07-28-ota-phase-0-cleanup.md' \
  --glob '!docs/architecture/OTA_UPDATES.md' \
  --glob '!src/__tests__/otaDisabledState.test.ts' \
  'GitHub Pages|gh-pages|bundle-loader|Bundle Loader|EXPO_PUBLIC_UPDATE_URL|disableAntiBrickingMeasures|customUpdateUrl|BundleService|publish-pr-update|publish-release-update' \
  .
```

Expected: no matches.

- [ ] **Step 5: Review repository diff and commit state**

Run:

```bash
git status --short
git diff --check
git diff HEAD~4 --stat
git log -5 --oneline
```

Expected:

- no uncommitted Phase 0 changes;
- no whitespace errors;
- the diff contains only the implementation plan and approved Phase 0 files; and
- no Worker, R2, deployment, or remote GitHub state was created.
