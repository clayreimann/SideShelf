# Phase 20: Tree Shaking - Research

**Researched:** 2026-03-22
**Domain:** Expo Metro bundle optimization (tree shaking + inlineRequires)
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Implementation approach already specified by PERF-03: `.env` flags + `metro.config.js` transformer config
- Create a `.env` file (checked into git) with `EXPO_TREE_SHAKING=true`
- `metro.config.js` reads this env var and conditionally enables `inlineRequires` in the transformer config
- When `EXPO_TREE_SHAKING=false` (or unset), metro config is unchanged from current state
- Feature flag approach: `EXPO_TREE_SHAKING=false` in `.env` disables tree shaking without any code changes
- Revert procedure (if TestFlight fails): set `EXPO_TREE_SHAKING=false` in `.env`, rebuild and resubmit
- No need for a separate EAS build profile or git revert — the flag in `.env` is the escape hatch
- Full regression checklist (not just Reanimated) — the following must all pass in the TestFlight binary:
  1. **Reanimated animations:** CollapsibleSection expand/collapse, FullScreenPlayer chapter panel open/close
  2. **Audio playback:** Open a library item, play, pause, seek via slider, skip chapters
  3. **Downloads:** Download a library item, verify it plays in airplane mode
  4. **Navigation & other flows:** More tab → Series/Authors navigation, `sideshelf://` deep link, add/view/delete a bookmark
- No before/after bundle size measurement — success is purely behavioral ("app works correctly in TestFlight")

### Claude's Discretion

- Exact `inlineRequires` configuration syntax (whether to use `transformer.inlineRequires: true` or the allowlist/blocklist form)
- Whether `EXPO_PUBLIC_TREE_SHAKING` or `EXPO_TREE_SHAKING` is the correct env var prefix for non-public metro config consumption
- How to read `.env` in `metro.config.js` (dotenv vs process.env direct access)
- EAS build profile changes needed (if any) for the env var to be available in cloud builds

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                         | Research Support                                                                                                 |
| ------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| PERF-03 | Expo tree shaking enabled via `.env` flags and `metro.config.js` transformer config | Exact env var names, transformer config syntax, EAS build propagation, Reanimated 4.1.3 worklets risk documented |

</phase_requirements>

---

## Summary

Expo SDK 54 ships with experimental tree shaking enabled by default for production builds. The mechanism is controlled by two environment variables (`EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1` and `EXPO_UNSTABLE_TREE_SHAKING=1`) which Expo CLI respects during `npx expo export` / EAS production builds. The user's requirement uses a custom `EXPO_TREE_SHAKING` gate in `.env` to drive both of these plus `inlineRequires` in metro.config.js — this is a valid layered approach.

The critical risk for this project is Reanimated 4.x + worklets. The installed `react-native-worklets@0.5.1` lacks a `sideEffects` field in its `package.json`, which means the worklets initialization code — which runs at module top-level — can be stripped by Expo's tree shaking. This is a confirmed bug documented in Reanimated issue #8752. The fix (`sideEffects` field) was shipped in worklets 0.7.2+, but that version is incompatible with Reanimated 4.1.3 (which requires worklets 0.5.x per Expo SDK 54's version lock). The Expo issue #41620 tracking this interaction is "on hold" as of December 2025.

**Primary recommendation:** Enable tree shaking exactly as locked in CONTEXT.md, build to TestFlight, and execute the full regression checklist. If the worklets initialization crash (`[Worklets] Native part of Worklets doesn't seem to be initialized`) occurs, the revert is a single `.env` change. The Reanimated 4.1.3/worklets 0.5.1 combination is the primary risk surface, not the metro config itself.

## Standard Stack

### Core

| Library           | Version (installed) | Purpose                                                         | Why Standard                                        |
| ----------------- | ------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| Expo Metro Config | via `expo@54.0.21`  | Provides `getDefaultConfig` + tree-shaking hooks                | Expo's official metro config wrapper                |
| dotenv            | (installed as dep)  | Parse `.env` files in Node.js (metro.config.js is Node context) | Standard `.env` parsing; already present in project |

### Supporting

| Library                 | Version           | Purpose                                        | When to Use                                |
| ----------------------- | ----------------- | ---------------------------------------------- | ------------------------------------------ |
| react-native-worklets   | 0.5.1 (installed) | Worklet runtime peer dep of Reanimated 4.1.x   | Already installed; NO change in this phase |
| react-native-reanimated | 4.1.3 (installed) | Animation library; worklet UI-thread execution | Already installed; NO change in this phase |

### Alternatives Considered

| Instead of                        | Could Use                                         | Tradeoff                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EXPO_TREE_SHAKING` custom gate   | `EXPO_UNSTABLE_TREE_SHAKING` directly in env      | Custom gate gives a single user-controlled toggle that drives both the unstable env vars AND metro `inlineRequires`; cleaner than managing multiple env vars |
| `transformer.getTransformOptions` | direct `config.transformer.inlineRequires = true` | `getTransformOptions` is the documented approach; direct assignment also works but bypasses the async transform options pipeline                             |

**No installation needed.** All packages are already present.

## Architecture Patterns

### How Expo Tree Shaking Works (SDK 54)

Tree shaking in Expo is a production-only feature activated by two environment variables:

```
EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
EXPO_UNSTABLE_TREE_SHAKING=1
```

These are consumed by Expo CLI's metro bundler integration. They must be set in the shell environment at build time. They are **not** `EXPO_PUBLIC_` variables — they are build-tool variables, not app-bundle variables.

In SDK 54, `experimentalImportSupport` is enabled by default by `getDefaultConfig`, so the metro.config.js transformer configuration only needs to add `inlineRequires`.

### Pattern 1: Conditional inlineRequires via .env gate

**What:** Read a custom `.env` variable in `metro.config.js` to conditionally set `getTransformOptions`. When false/unset, metro config is unchanged from today.

**When to use:** This project's locked approach. Works because `metro.config.js` runs in Node.js, and `dotenv` can parse the `.env` file before metro reads config.

```javascript
// Source: Expo tree shaking docs + dotenv standard pattern
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Load .env so metro.config.js can read non-EXPO_PUBLIC_ vars.
// dotenv is already installed; it's a dev/build-time dependency.
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const TREE_SHAKING_ENABLED = process.env.EXPO_TREE_SHAKING === "true";

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// ... existing config (sql, wasm, resolveRequest) ...

if (TREE_SHAKING_ENABLED) {
  config.transformer.getTransformOptions = async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  });
}

module.exports = config;
```

**The `.env` file (checked into git):**

```
# Enable Expo SDK 54 tree shaking in production builds.
# Set to false to disable without any code changes (revert procedure).
EXPO_TREE_SHAKING=true
```

### Pattern 2: EAS build profile env vars

**What:** EAS cloud builds run `metro.config.js` in a Node.js process where the project `.env` file is present. Because `dotenv.config()` is called explicitly in `metro.config.js`, EAS cloud builds will read the same `.env` file as local builds.

**Why this matters:** No changes to `eas.json` are required. The `.env` file is checked into git and EAS clones the repo, so the file is present at build time. The `EXPO_UNSTABLE_TREE_SHAKING` and `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH` env vars are set automatically by Expo SDK 54 during `npx expo export` when tree shaking is active — they do not need to be set in `eas.json`.

**Important note on `EXPO_PUBLIC_` prefix:** `EXPO_TREE_SHAKING` must NOT use the `EXPO_PUBLIC_` prefix. `EXPO_PUBLIC_` variables get inlined into the app bundle (client-side). This variable is consumed only by `metro.config.js` (build-time Node.js), so no prefix is needed and no prefix is correct.

### Pattern 3: inlineRequires full vs allowlist/blocklist form

**What:** Two forms exist for `inlineRequires`:

```javascript
// Form 1: Boolean — inline all requires (recommended with tree shaking)
inlineRequires: true

// Form 2: Object with allowlist/blocklist
inlineRequires: {
  blockList: {
    '/path/to/module.js': true,
  }
}
```

**Recommendation:** Use `inlineRequires: true` (Form 1). The boolean form is the documented form for use alongside Expo tree shaking. The blocklist form is an escape hatch if specific modules break; do not pre-emptively configure it.

### Anti-Patterns to Avoid

- **Setting `EXPO_TREE_SHAKING` with `EXPO_PUBLIC_` prefix:** The variable is for the metro build tool, not the app bundle. `EXPO_PUBLIC_` would expose it to client code unnecessarily and may confuse Expo's variable inlining.
- **Using `transformer.inlineRequires = true` without tree shaking env vars:** The Expo docs explicitly warn this changes execution order of side-effects and should not be used standalone.
- **Adding `require("dotenv").config()` after `getDefaultConfig`:** `getDefaultConfig` may read env vars itself; call dotenv first.
- **Modifying `babel.config.js` for tree shaking:** No Babel plugin is needed. Reanimated 4 uses the worklets plugin via `babel-preset-expo`; no new babel changes are required for tree shaking.

## Don't Hand-Roll

| Problem                         | Don't Build                      | Use Instead                                  | Why                                                                             |
| ------------------------------- | -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| .env parsing in metro.config.js | manual `fs.readFileSync` + regex | `require("dotenv").config()`                 | dotenv is already installed; handles edge cases (quoting, comments, multi-line) |
| Tree shaking control            | custom Metro graph plugin        | Expo's `EXPO_UNSTABLE_TREE_SHAKING` env vars | Expo's hooks integrate with the entire Metro pipeline                           |

## Common Pitfalls

### Pitfall 1: Worklets Initialization Crash

**What goes wrong:** App crashes in production (TestFlight) with `[Worklets] Native part of Worklets doesn't seem to be initialized.` — worklet functions fail because the top-level initialization code in `react-native-worklets` was tree-shaken out.

**Why it happens:** `react-native-worklets@0.5.1` (installed in this project) has no `sideEffects` field in its `package.json`. Expo's tree shaker treats modules without `sideEffects` declarations as side-effect-free and may strip the initialization code. The fix (`sideEffects` in worklets package.json) was shipped in worklets 0.7.2, but that version requires Reanimated 4.2+ (incompatible with this project's Expo SDK 54 lock on Reanimated 4.1.x / worklets 0.5.x).

**How to avoid:** Execute the full regression checklist in TestFlight before closing the phase. Specifically, test CollapsibleSection and FullScreenPlayer panel animations first — these are the worklet-dependent surfaces.

**Warning signs:** Animations that work in development builds (Expo Go / simulator) but crash or freeze in the TestFlight (production) binary. A crash log showing `[WorkletsError]` or `Failed to create a worklet` is the definitive signal.

**Revert procedure (one-liner):** Set `EXPO_TREE_SHAKING=false` in `.env`, rebuild, resubmit. No code changes required.

**Open question:** Whether Expo SDK 54's tree shaker actually strips worklets 0.5.1 initialization in practice is not confirmed — the reported crash is against Reanimated 4.2.0 / worklets 0.7.1, not 4.1.3 / 0.5.1. The 4.1.x line's `react-native-reanimated@4.1.3` already has a `sideEffects` array covering its own initialization files. The risk may be lower than feared, but only TestFlight verification confirms.

### Pitfall 2: dotenv not called before getDefaultConfig

**What goes wrong:** `process.env.EXPO_TREE_SHAKING` reads as `undefined` and tree shaking is never enabled, even with `EXPO_TREE_SHAKING=true` in `.env`.

**Why it happens:** Expo CLI loads `EXPO_PUBLIC_` variables from `.env` for the app bundle, but does NOT automatically make non-public variables available to `metro.config.js` as a Node.js module. The `.env` file must be parsed manually in `metro.config.js` using dotenv.

**How to avoid:** Call `require("dotenv").config(...)` at the top of `metro.config.js`, before any `getDefaultConfig` call or `process.env` read.

### Pitfall 3: Tree shaking active in development builds

**What goes wrong:** Unexpected behavior in Expo Go or simulator builds that are already working.

**Why it happens:** Expo tree shaking is production-only (`npx expo export`). It will NOT activate in `npx expo start` (development) even with env vars set. This is by design — only a concern to understand, not prevent.

**How to avoid:** N/A — this is expected behavior. Development builds are unaffected.

### Pitfall 4: EAS build doesn't see .env file

**What goes wrong:** EAS cloud build produces a bundle without tree shaking active (EXPO_TREE_SHAKING env var unresolved).

**Why it happens:** If `.env` is in `.gitignore`, EAS won't have the file. This project currently has no `.env` files.

**How to avoid:** The `.env` file for this phase is designed to be checked into git (it contains no secrets — only the `EXPO_TREE_SHAKING=true` flag). Ensure `.env` is NOT in `.gitignore`. Verify the `.gitignore` before committing.

### Pitfall 5: experimentalImportSupport already set by getDefaultConfig

**What goes wrong:** If `getDefaultConfig` in SDK 54 already enables `experimentalImportSupport`, setting it again in `getTransformOptions` is a no-op but harmless.

**Why it happens:** SDK 54 enables ESM support by default. The `getTransformOptions` setting of `experimentalImportSupport: true` is redundant but safe to include for clarity.

**How to avoid:** Include it for explicitness. No harm.

## Code Examples

### Complete metro.config.js (after this phase)

```javascript
// Source: Expo tree shaking docs (https://docs.expo.dev/guides/tree-shaking/)
// + existing project metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Load .env so this Node.js config file can read non-EXPO_PUBLIC_ variables.
// dotenv is already installed; safe to call even if .env doesn't exist.
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const TREE_SHAKING_ENABLED = process.env.EXPO_TREE_SHAKING === "true";

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("sql");

// .wasm files must be treated as binary assets on web
config.resolver.assetExts.push("wasm");

// Stub out web-only modules on native platforms
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== "web") {
    if (moduleName.startsWith("shaka-player") || moduleName.includes("expo-sqlite/web/")) {
      return { type: "empty" };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Enable Expo SDK 54 tree shaking + inlineRequires (production-only).
// Gated by EXPO_TREE_SHAKING env var for feature-flag control.
// Revert: set EXPO_TREE_SHAKING=false in .env and rebuild.
if (TREE_SHAKING_ENABLED) {
  config.transformer.getTransformOptions = async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  });
}

module.exports = config;
```

### .env file (new, checked into git)

```
# Expo SDK 54 tree shaking production optimization.
# REVERT PROCEDURE: set to false and rebuild + resubmit to TestFlight.
EXPO_TREE_SHAKING=true
```

### .gitignore check (verify .env is NOT ignored)

```bash
grep -n "\.env" .gitignore
```

If `.env` appears in `.gitignore`, remove that entry. The file contains only the tree shaking flag — no secrets.

## State of the Art

| Old Approach                               | Current Approach                                                  | When Changed                       | Impact                                              |
| ------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| No tree shaking (default in SDK 52/53)     | `EXPO_UNSTABLE_TREE_SHAKING=1` experimental                       | SDK 52 introduced, SDK 54 improved | Removes dead code from Expo SDK modules; faster OTA |
| `experimentalImportSupport` manual set     | Enabled by default in SDK 54 via `getDefaultConfig`               | SDK 54                             | One less manual config line                         |
| Reanimated Babel plugin in babel.config.js | Removed; handled by `babel-preset-expo` + `react-native-worklets` | Reanimated 4.x                     | babel.config.js needs no changes for this phase     |
| inlineRequires unsafe without tree shaking | Safe with tree shaking (lazy module loading)                      | SDK 52+                            | Startup time improvement                            |

**Deprecated/outdated:**

- `react-native-reanimated/plugin` Babel plugin: removed in Reanimated 4.x, now `react-native-worklets/plugin` (already handled by `babel-preset-expo`; no action needed)

## Open Questions

1. **Will worklets 0.5.1 be stripped by Expo's tree shaker?**
   - What we know: The confirmed crash (issue #8752) is with worklets 0.7.1 (no `sideEffects`). This project uses worklets 0.5.1, also without `sideEffects`. The Reanimated 4.1.3 package DOES have a `sideEffects` array that covers its own initialization files, but worklets is a separate package.
   - What's unclear: Whether Expo SDK 54's tree shaker actually reaches into worklets 0.5.1 initialization code in practice (vs. having already resolved it through Reanimated's own sideEffects entries).
   - Recommendation: Build and test. The answer is discovered only in the TestFlight binary. The revert path is a single line in `.env`.

2. **React Compiler interaction with inlineRequires**
   - What we know: `app.json` has `experiments.reactCompiler: true`. The Expo tree shaking docs say nothing about React Compiler interaction. STATE.md flags this as the "triple interaction" risk.
   - What's unclear: Whether React Compiler's transform output (which rewrites function signatures) interacts badly with inlineRequires' module-scoped lazy loading.
   - Recommendation: This also requires TestFlight verification. No pre-emptive workaround available. Revert path is unchanged.

## Validation Architecture

### Test Framework

| Property           | Value                           |
| ------------------ | ------------------------------- |
| Framework          | Jest (jest-expo preset)         |
| Config file        | `jest.config.js` (project root) |
| Quick run command  | `npm test -- --passWithNoTests` |
| Full suite command | `npm test`                      |

### Phase Requirements → Test Map

| Req ID  | Behavior                                                                                 | Test Type  | Automated Command              | File Exists?         |
| ------- | ---------------------------------------------------------------------------------------- | ---------- | ------------------------------ | -------------------- |
| PERF-03 | `metro.config.js` reads `EXPO_TREE_SHAKING` and conditionally sets `getTransformOptions` | unit       | `jest --testPathPattern=metro` | ❌ Wave 0 (optional) |
| PERF-03 | App builds and passes full regression in TestFlight                                      | manual/e2e | N/A — TestFlight UAT           | N/A                  |

**Note on PERF-03 testing:** The primary validation for this phase is a TestFlight build passing a manual regression checklist. There is no automated test that can verify a production bundle behaves correctly with tree shaking. A unit test for the metro.config.js logic (does it read the env var correctly and set getTransformOptions?) is possible but low-value given the simplicity of the change.

### Sampling Rate

- **Per task commit:** `npm test -- --passWithNoTests` (no new test files expected; confirms no regression)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + TestFlight UAT checklist before `/gsd:verify-work`

### Wave 0 Gaps

- None — existing test infrastructure covers the code changes. A metro.config.js unit test is not required; the config change is verified by building.

## Sources

### Primary (HIGH confidence)

- [Expo tree shaking docs](https://docs.expo.dev/guides/tree-shaking/) — env var names, metro config syntax, inlineRequires recommendation, production-only note
- [Expo metro config docs](https://docs.expo.dev/versions/latest/config/metro/) — transformer options reference
- Installed packages: `react-native-reanimated@4.1.3`, `react-native-worklets@0.5.1` — direct inspection of `sideEffects` fields

### Secondary (MEDIUM confidence)

- [Reanimated issue #8752](https://github.com/software-mansion/react-native-reanimated/issues/8752) — worklets sideEffects crash; fix in worklets 0.7.2
- [Expo issue #41620](https://github.com/expo/expo/issues/41620) — Expo tree shaking + Reanimated 4.2.0 crash; "on hold" as of December 2025
- [Reanimated/worklets discussions #8778](https://github.com/software-mansion/react-native-reanimated/discussions/8778) — worklets 0.5.x is the correct version for Expo SDK 54 + Reanimated 4.1.x

### Tertiary (LOW confidence)

- WebSearch: "SDK 54 tree shaking enabled by default" — needs verification; docs suggest env vars still required even in SDK 54 for explicit activation

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — packages already installed, versions verified by direct inspection
- metro.config.js syntax: HIGH — verified against official Expo tree shaking docs
- Env var names: HIGH — `EXPO_UNSTABLE_TREE_SHAKING`, `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH` confirmed by official docs
- dotenv in metro.config.js: HIGH — dotenv already installed; pattern verified
- Worklets tree shaking risk: MEDIUM — crash confirmed for worklets 0.7.1, behavior of 0.5.1 unconfirmed in practice
- React Compiler interaction: LOW — no official documentation found; treat as unknown risk

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (Expo/Reanimated move fast; re-verify if SDK bumped)
