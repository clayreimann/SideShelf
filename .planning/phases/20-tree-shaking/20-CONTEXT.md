# Phase 20: Tree Shaking - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable Expo SDK 54 tree shaking and metro `inlineRequires` in the production build configuration, then verify the resulting TestFlight binary works correctly. No new user-visible features. The deliverable is a working production build with tree shaking enabled.

</domain>

<decisions>
## Implementation Decisions

### Configuration approach

- Implementation approach already specified by PERF-03: `.env` flags + `metro.config.js` transformer config
- Create a `.env` file (checked into git) with `EXPO_TREE_SHAKING=true`
- `metro.config.js` reads this env var and conditionally enables `inlineRequires` in the transformer config
- When `EXPO_TREE_SHAKING=false` (or unset), metro config is unchanged from current state

### Revert / fallback strategy

- Feature flag approach: `EXPO_TREE_SHAKING=false` in `.env` disables tree shaking without any code changes
- Revert procedure (if TestFlight fails): set `EXPO_TREE_SHAKING=false` in `.env`, rebuild and resubmit
- No need for a separate EAS build profile or git revert — the flag in `.env` is the escape hatch
- Document the revert procedure explicitly in the plan so it's actionable during verification

### TestFlight verification scope

- Full regression checklist — not just Reanimated animations
- The following must all pass in the TestFlight binary before closing the phase:
  1. **Reanimated animations:** CollapsibleSection expand/collapse (peek → full height → back), FullScreenPlayer chapter panel open/close
  2. **Audio playback:** Open a library item, play, pause, seek via slider, skip chapters
  3. **Downloads:** Download a library item, verify it plays in airplane mode
  4. **Navigation & other flows:** More tab → Series/Authors navigation, `sideshelf://` deep link, add/view/delete a bookmark

### Bundle size measurement

- No before/after measurement — success is purely behavioral ("app works correctly in TestFlight")
- Tree shaking is a known Expo SDK 54 win; we trust the config works without needing size numbers

### Claude's Discretion

- Exact `inlineRequires` configuration syntax (whether to use `transformer.inlineRequires: true` or the allowlist/blocklist form)
- Whether `EXPO_PUBLIC_TREE_SHAKING` or `EXPO_TREE_SHAKING` is the correct env var prefix for non-public metro config consumption
- How to read `.env` in `metro.config.js` (dotenv vs process.env direct access)
- EAS build profile changes needed (if any) for the env var to be available in cloud builds

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md` §Performance — PERF-03 requirement spec (tree shaking via `.env` flags and `metro.config.js` transformer config)

### Existing config files to modify

- `metro.config.js` — add `inlineRequires` transformer config gated by env var
- `babel.config.js` — reference only; Reanimated 4 does NOT require the Reanimated Babel plugin, so no changes expected here
- `app.json` — reference for Expo SDK version (54.0.21), jsEngine (hermes), newArchEnabled (true)

### Reanimated components (must verify in TestFlight)

- `src/components/ui/CollapsibleSection.tsx` — uses `useSharedValue`, `useAnimatedStyle`, `withTiming` (UI-thread worklets)
- `src/app/FullScreenPlayer/index.tsx` — uses `useSharedValue`, `useAnimatedStyle`, `withTiming` for cover resize + chapter panel animations

### STATE.md risk note

- `.planning/STATE.md` — §Blockers/Concerns: "Tree shaking (Phase 20): `inlineRequires` + Reanimated 4 + React Compiler triple interaction undocumented; treat as exploratory; have revert plan ready"

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `metro.config.js` — currently minimal; uses `getDefaultConfig`, adds `.sql` sourceExt, `.wasm` assetExt, and a custom `resolveRequest` shim for shaka-player/expo-sqlite/web. Tree shaking config slots in via `config.transformer.inlineRequires`
- `babel.config.js` — uses `babel-preset-expo` + `inline-import` plugin only; NO Reanimated Babel plugin (Reanimated 4 doesn't need it — worklets are processed differently)
- No `.env` files exist today — this phase creates the first one

### Established Patterns

- `app.config.js` already reads `process.env.EXPO_PUBLIC_UPDATE_URL` for OTA update config — same pattern for reading env vars in Expo config files
- Expo 54.0.21 with `newArchEnabled: true` and `jsEngine: "hermes"` — the three-way interaction (inlineRequires + Reanimated 4 + new arch) is the primary risk

### Integration Points

- `metro.config.js` — primary change target; env var gate added here
- `.env` — new file; sets `EXPO_TREE_SHAKING=true` (or equivalent flag name)
- EAS build configuration (if `eas.json` exists) — may need env var declared for cloud builds

</code_context>

<specifics>
## Specific Ideas

- STATE.md explicitly says "treat as exploratory; have revert plan ready" — the plan should include a REVERT section with the exact one-line change needed to disable
- The revert is: set `EXPO_TREE_SHAKING=false` in `.env` and rebuild — document this in the plan's acceptance criteria

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 20-tree-shaking_
_Context gathered: 2026-03-22_
