# TestFlight Timestamp Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run build-testflight` assign one command-start timestamp to both the iOS build number and local IPA filename while retaining marketing version `1.0.0`.

**Architecture:** Keep the behavior in the existing `package.json` npm script. Capture a shell variable before dependency installation, pass it to Expo as `BUILD_NUMBER`, and pass the same value to EAS Local Build through `--output`; `app.config.js` remains the single consumer that maps `BUILD_NUMBER` to `ios.buildNumber`.

**Tech Stack:** npm scripts, POSIX shell, Expo SDK 54, EAS CLI local iOS builds.

## Global Constraints

- Marketing version remains exactly `1.0.0`.
- Timestamp format remains exactly `YYYYMMDDHHMMSS` in the machine's local timezone.
- Capture the timestamp before `npm i` so it represents command start.
- Use the identical captured value for `BUILD_NUMBER` and `build-YYYYMMDDHHMMSS.ipa`.
- Do not run a full local TestFlight build solely to verify this configuration change.
- Do not modify unrelated dirty-worktree files.

---

### Task 1: Stamp the TestFlight build and artifact from one timestamp

**Files:**

- Modify: `package.json:25`
- Read for verification: `app.config.js:18-39,78`

**Interfaces:**

- Consumes: POSIX `date +%Y%m%d%H%M%S`; existing `app.config.js` environment variable `BUILD_NUMBER`.
- Produces: npm script `build-testflight` that emits an iOS build with matching build number and artifact filename.

- [x] **Step 1: Run a behavioral assertion against the current script and verify it fails**

Run:

```bash
node -e 'const s=require("./package.json").scripts["build-testflight"]; const expected="BUILD_TIMESTAMP=$(date +%Y%m%d%H%M%S) && npm i && BUILD_NUMBER=$BUILD_TIMESTAMP npx eas-cli build --platform ios --profile production --local --non-interactive --output \"build-$BUILD_TIMESTAMP.ipa\""; if(s!==expected){console.error("build-testflight does not yet share the command-start timestamp"); process.exit(1)}'
```

Expected: exit 1 with `build-testflight does not yet share the command-start timestamp`.

- [x] **Step 2: Replace the package script with the minimal implementation**

Set the `build-testflight` entry in `package.json` to:

```json
"build-testflight": "BUILD_TIMESTAMP=$(date +%Y%m%d%H%M%S) && npm i && BUILD_NUMBER=$BUILD_TIMESTAMP npx eas-cli build --platform ios --profile production --local --non-interactive --output \"build-$BUILD_TIMESTAMP.ipa\""
```

This captures the timestamp before `npm i`, exports it to the EAS process as `BUILD_NUMBER`, and expands the same shell variable into the output filename.

- [x] **Step 3: Re-run the behavioral assertion and verify it passes**

Run the exact `node -e` command from Step 1.

Expected: exit 0 with no output.

- [x] **Step 4: Verify package JSON and the timestamp format**

Run:

```bash
node -e 'const p=require("./package.json"); if(!p.scripts["build-testflight"]) process.exit(1); const stamp="20260718143522"; if(!/^\d{14}$/.test(stamp)) process.exit(1); console.log(p.scripts["build-testflight"])'
```

Expected: exit 0 and the updated script printed once.

- [x] **Step 5: Verify Expo receives the fixed build number without performing a build**

Run:

```bash
BUILD_NUMBER=20260718143522 npx expo config --type public --json
```

Expected: JSON output where `ios.buildNumber` equals `20260718143522` and top-level `version` equals `1.0.0`.

- [x] **Step 6: Check formatting and scope**

Run:

```bash
npx prettier --check package.json docs/superpowers/specs/2026-07-18-testflight-timestamp-artifact-design.md docs/superpowers/plans/2026-07-18-testflight-timestamp-artifact.md
git diff --check -- package.json docs/superpowers/plans/2026-07-18-testflight-timestamp-artifact.md
git diff -- package.json
```

Expected: Prettier and whitespace checks pass; the package diff changes only `scripts.build-testflight`.

- [x] **Step 7: Commit the implementation and plan**

```bash
git add package.json docs/superpowers/plans/2026-07-18-testflight-timestamp-artifact.md
git commit -m "build: timestamp TestFlight artifact filename"
```

Expected: one commit containing only `package.json` and this implementation plan; existing unrelated worktree changes remain unstaged.
