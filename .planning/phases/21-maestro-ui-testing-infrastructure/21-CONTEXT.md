# Phase 21: Maestro UI Testing Infrastructure - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Maestro automated UI test infrastructure: testID attributes on key interactive elements, reusable subflows (`_login`, `_start-playback`), and a standalone regression suite covering library navigation, playback, and download flows.

No new app features. No CI integration. No offline/airplane-mode test automation.
</domain>

<decisions>
## Implementation Decisions

### Credentials & Env Var Injection

- **D-01:** Credentials are stored in a local `.env.maestro` file (gitignored). A committed `.env.maestro.example` serves as a template with placeholder values.
- **D-02:** Env var names inside Maestro YAML files: `${MAESTRO_USERNAME}`, `${MAESTRO_PASSWORD}`, `${MAESTRO_SERVER_URL}`. These are passed to maestro via `--env` flags sourced from `.env.maestro` (e.g., via a shell wrapper or npm script).

### testID Scope

- **D-03:** Add only the testIDs required by TESTING-01 and TESTING-03. No additional testIDs beyond the spec:
  - TESTING-01: Login screen inputs (username field, password field, login button)
  - TESTING-03: `play-resume-button`, `player-done-button`, `seek-slider`, `speed-control`, `download-button`, `library-search-input`
- **D-04:** Keep existing `id: "floating-player"` and `id: "library-item"` testIDs as-is — do not rename them. Renaming would break `capture-screenshots.yaml`.

### Regression Suite Structure

- **D-05:** One Maestro flow per user journey (not per screen, not one monolithic end-to-end flow). Each flow is independently executable.
- **D-06:** Three standalone regression flows:
  - `library-navigation.yaml` — navigate to Library → browse items → tap item → assert item detail screen
  - `playback.yaml` — open item → start playback → pause → seek → skip chapter → assert floating player progress
  - `download.yaml` — navigate to item → tap download → assert download progress/completion badge (no airplane mode test)
- **D-07:** Download flow covers download success verification only. Offline playback (airplane mode) is out of scope for this phase — too unreliable in Maestro automation.

### Flow File Layout

- **D-08:** Flat `.maestro/` root with underscore prefix convention. No subdirectories.
  - `_login.yaml` — subflow: authenticate from `${MAESTRO_USERNAME}` / `${MAESTRO_PASSWORD}` / `${MAESTRO_SERVER_URL}`; idempotent (safe to call when already logged in)
  - `_start-playback.yaml` — subflow: open first library item and start playback
  - `library-navigation.yaml` — standalone regression flow
  - `playback.yaml` — standalone regression flow
  - `download.yaml` — standalone regression flow
  - `capture-screenshots.yaml` — existing, leave untouched
- **D-09:** Add `maestro:test` npm script to `package.json` that runs all standalone flows in sequence. Individual flows can also be run directly via `maestro test .maestro/<file>.yaml`.

### Idempotency Strategy for `_login`

- **D-10:** `_login.yaml` detects "already logged in" by checking for a visible element that only appears on the home/library screen (e.g., `assertVisible` on the tab bar or a home screen element). If visible, skip the login form. If not visible, fill credentials and submit.

### Claude's Discretion

- Exact `waitForAnimationToEnd` placement and timeout values — match patterns in existing `capture-screenshots.yaml`
- How `_start-playback.yaml` selects the first item (index-based, same pattern as existing flow)
- Whether `_login` uses `assertVisible` or `tapOn` with `optional: true` for the idempotency check
- Structure of `.env.maestro.example` content and comments

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md` §UI Testing — TESTING-01 through TESTING-05 define the full acceptance criteria

### Existing Maestro Infrastructure

- `.maestro/capture-screenshots.yaml` — Existing flow; establishes appId, navigation patterns, `optional: true` idiom, `id:` targeting convention; DO NOT BREAK this flow
- `.maestro/wait.js` — XCTest tree recovery busy-wait after `takeScreenshot`; reuse if screenshots are added

### Project Context

- `.planning/PROJECT.md` — Project overview and core principles
- `.planning/ROADMAP.md` §Phase 21 — Phase goal and success criteria

</canonical_refs>
