# Phase 21: Maestro UI Testing Infrastructure - Research

**Researched:** 2026-03-30
**Domain:** Maestro mobile UI testing for React Native / Expo (iOS simulator)
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Credentials are stored in a local `.env.maestro` file (gitignored). A committed `.env.maestro.example` serves as a template with placeholder values.

**D-02:** Env var names inside Maestro YAML files: `${MAESTRO_USERNAME}`, `${MAESTRO_PASSWORD}`, `${MAESTRO_SERVER_URL}`. These are passed to maestro via `--env` flags sourced from `.env.maestro` (e.g., via a shell wrapper or npm script).

**D-03:** Add only the testIDs required by TESTING-01 and TESTING-03. No additional testIDs beyond the spec:

- TESTING-01: Login screen inputs (username field, password field, login button)
- TESTING-03: `play-resume-button`, `player-done-button`, `seek-slider`, `speed-control`, `download-button`, `library-search-input`

**D-04:** Keep existing `testID="floating-player"` and `testID="library-item"` as-is — do not rename them. Renaming would break `capture-screenshots.yaml`.

**D-05:** One Maestro flow per user journey (not per screen, not one monolithic end-to-end flow). Each flow is independently executable.

**D-06:** Three standalone regression flows:

- `library-navigation.yaml` — navigate to Library → browse items → tap item → assert item detail screen
- `playback.yaml` — open item → start playback → pause → seek → skip chapter → assert floating player progress
- `download.yaml` — navigate to item → tap download → assert download progress/completion badge (no airplane mode test)

**D-07:** Download flow covers download success verification only. Offline playback (airplane mode) is out of scope.

**D-08:** Flat `.maestro/` root with underscore prefix convention. No subdirectories.

- `_login.yaml` — subflow: authenticate from env vars; idempotent
- `_start-playback.yaml` — subflow: open first library item and start playback
- `library-navigation.yaml` — standalone regression flow
- `playback.yaml` — standalone regression flow
- `download.yaml` — standalone regression flow
- `capture-screenshots.yaml` — existing, leave untouched

**D-09:** Add `maestro:test` npm script to `package.json` that runs all standalone flows in sequence. Individual flows can also be run directly via `maestro test .maestro/<file>.yaml`.

**D-10:** `_login.yaml` detects "already logged in" by checking for a visible element that only appears on the home/library screen (e.g., `assertVisible` on the tab bar or a home screen element). If visible, skip the login form. If not visible, fill credentials and submit.

### Claude's Discretion

- Exact `waitForAnimationToEnd` placement and timeout values — match patterns in existing `capture-screenshots.yaml`
- How `_start-playback.yaml` selects the first item (index-based, same pattern as existing flow)
- Whether `_login` uses `assertVisible` or `tapOn` with `optional: true` for the idempotency check
- Structure of `.env.maestro.example` content and comments

### Deferred Ideas (OUT OF SCOPE)

- CI integration
- Offline/airplane-mode test automation
- Any testIDs beyond the D-03 spec
  </user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID         | Description                                                                                                             | Research Support                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| TESTING-01 | Login screen inputs have `testID` attributes enabling automated authentication in Maestro                               | `login.tsx` has 3 TextInputs (server URL, username, password) + 1 TouchableOpacity (login button) — all need `testID` props |
| TESTING-02 | Maestro `_login.yaml` subflow authenticates from env var credentials and is idempotent                                  | `runFlow` + conditional `when: notVisible:` pattern confirmed in Maestro docs; `${MAESTRO_USERNAME}` syntax verified        |
| TESTING-03 | Key interactive elements have `testID` attributes (6 elements)                                                          | 6 elements mapped to source files; see testID mapping table below                                                           |
| TESTING-04 | Maestro flows decomposed into reusable subflows (`_login`, `_start-playback`) and standalone screen flows               | `runFlow: file:` syntax confirmed; flat `.maestro/` structure decided                                                       |
| TESTING-05 | Maestro regression suite covers library navigation, playback, and download flows as independently executable test files | 3 standalone flows; `maestro:test` npm script to run sequence                                                               |

</phase_requirements>

---

## Summary

Phase 21 adds Maestro UI testing infrastructure to the SideShelf React Native app. It has two orthogonal parts: (1) adding `testID` props to specific React Native elements in TypeScript source files, and (2) writing Maestro YAML flow files that target those elements.

The project already has Maestro 2.2.0 installed and a working `capture-screenshots.yaml` flow that establishes the `appId: cloud.madtown.sideshelf` header, `tapOn:` targeting, `optional: true` idiom, `waitForAnimationToEnd`, and the `id:` selector (which maps to `testID` in React Native). The new flows follow identical patterns. No new npm packages are needed.

The key complexity is the `download-button`. The download action in `LibraryItemDetail` is hidden inside a `MenuView` (header ellipsis/three-dot menu), not a directly tappable button. The `testID="download-button"` must be placed on a tappable element that triggers download — the `TouchableOpacity` inside `MenuView` that opens the download action, or a dedicated button. Research shows the cleanest approach is to expose the download action via an accessible `testID` on the `MenuView` container or add a direct tap path. See the Architecture Patterns section for the recommended approach.

The `_login` idempotency pattern uses Maestro's `when: notVisible:` conditional — if the login form (identified by the username field) is not visible, the subflow skips the login steps. This is the correct pattern since the tab bar ("Library") only appears after login.

**Primary recommendation:** Write `testID` props first (React Native code changes), then write Maestro YAML flows that consume them.

---

## Standard Stack

### Core

| Tool/Library               | Version           | Purpose                        | Notes                                            |
| -------------------------- | ----------------- | ------------------------------ | ------------------------------------------------ |
| Maestro                    | 2.2.0 (installed) | Mobile UI test automation      | Already installed at `/opt/homebrew/bin/maestro` |
| React Native `testID` prop | SDK 54 (current)  | Element targeting from Maestro | Built-in RN prop, no package install needed      |

### Supporting

| Item                   | Purpose                             | Notes                                        |
| ---------------------- | ----------------------------------- | -------------------------------------------- |
| `.env.maestro`         | Local credential store (gitignored) | Shell `source`-based env var injection       |
| `.env.maestro.example` | Committed template                  | Documents required vars                      |
| `npm run maestro:test` | Convenience script                  | Chains 3 standalone flows via `maestro test` |

**Installation:** No new npm packages required. Maestro is already installed.

**Version verification:** `maestro --version` → `2.2.0` (confirmed on machine).

---

## Architecture Patterns

### Maestro File Layout

```
.maestro/
├── _login.yaml              # Subflow: idempotent auth
├── _start-playback.yaml     # Subflow: open first item + start play
├── library-navigation.yaml  # Standalone regression flow
├── playback.yaml            # Standalone regression flow
├── download.yaml            # Standalone regression flow
├── capture-screenshots.yaml # EXISTING — do not touch
└── wait.js                  # EXISTING — reuse if screenshots added
```

### Pattern 1: Flow File Header

All flow files (both subflows and standalone) require the `appId` header block. This is not optional — Maestro requires it to locate the running app.

```yaml
# Source: existing capture-screenshots.yaml + https://docs.maestro.dev/reference/commands-available/runflow
appId: cloud.madtown.sideshelf
---
- launchApp # only in standalone flows, not subflows
```

**Important:** Subflow files (`_login.yaml`, `_start-playback.yaml`) still need the `appId` header even though they are called via `runFlow`. Omitting `appId` causes Maestro to fail on the subflow.

### Pattern 2: Env Var Injection via `--env`

Credentials are passed at CLI invocation time, not stored in YAML.

```bash
# Shell wrapper pattern (sourced from .env.maestro):
maestro test \
  --env MAESTRO_USERNAME="$MAESTRO_USERNAME" \
  --env MAESTRO_PASSWORD="$MAESTRO_PASSWORD" \
  --env MAESTRO_SERVER_URL="$MAESTRO_SERVER_URL" \
  .maestro/library-navigation.yaml
```

Inside YAML files, access via `${MAESTRO_USERNAME}` syntax:

```yaml
# Source: https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants
- tapOn:
    id: "login-server-url-input"
- clearText
- inputText: ${MAESTRO_SERVER_URL}
```

The `npm run maestro:test` script must source `.env.maestro` and pass all three `--env` flags. A `bash -c "source .env.maestro && maestro test --env ..."` pattern is the standard approach since npm scripts run in a child shell.

### Pattern 3: Idempotent `_login` with `when: notVisible:`

```yaml
# Source: https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions
appId: cloud.madtown.sideshelf
---
# If "Library" tab is already visible, we're logged in — skip login form
- runFlow:
    when:
      notVisible: "Library"
    commands:
      - tapOn:
          id: "login-server-url-input"
      - clearText
      - inputText: ${MAESTRO_SERVER_URL}
      - tapOn:
          id: "login-username-input"
      - clearText
      - inputText: ${MAESTRO_USERNAME}
      - tapOn:
          id: "login-password-input"
      - clearText
      - inputText: ${MAESTRO_PASSWORD}
      - tapOn:
          id: "login-button"
      - waitForAnimationToEnd
```

The detection element ("Library") is the tab bar label that only appears on the home/library screens post-login. Using `notVisible:` with a text string is stable; using a `testID` with `id:` is also acceptable.

### Pattern 4: `runFlow` to Include Subflow

Standalone flows call subflows via `runFlow: file:`. Env vars propagate automatically to subflows from the parent invocation — no need to re-pass them.

```yaml
# Source: https://docs.maestro.dev/reference/commands-available/runflow
- runFlow: .maestro/_login.yaml
- runFlow: .maestro/_start-playback.yaml
```

### Pattern 5: Element Targeting with `id:` Selector

In Maestro, `id:` maps to React Native `testID`. The existing `capture-screenshots.yaml` establishes this pattern:

```yaml
# Existing pattern in capture-screenshots.yaml:
- tapOn:
    id: "library-item"
    index: 0
- tapOn:
    id: "floating-player"
```

New flows use the same `id:` selector for all `testID`-targeted elements.

### Pattern 6: `optional: true` for Conditional Taps

```yaml
# Source: existing capture-screenshots.yaml
- tapOn:
    text: "Grid"
    optional: true # skips if element not found
```

Use `optional: true` when an element may or may not exist (e.g., the play button label changes to "Resume" on second run).

### Anti-Patterns to Avoid

- **Omitting `appId` from subflow files:** Maestro needs `appId` in every flow file, even ones called via `runFlow`. Will fail silently or with confusing errors.
- **Hardcoding credentials in YAML:** Defeats the purpose of `.env.maestro`. Always use `${MAESTRO_USERNAME}` etc.
- **Nesting `.maestro/` subdirectories:** D-08 mandates a flat structure. `runFlow: file:` paths are relative — subdirectories complicate path resolution.
- **Renaming existing testIDs:** `floating-player` and `library-item` are used by `capture-screenshots.yaml`. Changing them breaks screenshot automation.

---

## testID Mapping: Source Files and Placement

This is the critical implementation guide for TESTING-01 and TESTING-03.

### TESTING-01: Login Screen (src/app/login.tsx)

Three `TextInput` elements and one `TouchableOpacity` button — all currently lack `testID`.

| testID                   | Element                | Component   | Line approx |
| ------------------------ | ---------------------- | ----------- | ----------- |
| `login-server-url-input` | Server URL TextInput   | `login.tsx` | ~119        |
| `login-username-input`   | Username TextInput     | `login.tsx` | ~129        |
| `login-password-input`   | Password TextInput     | `login.tsx` | ~138        |
| `login-button`           | Login TouchableOpacity | `login.tsx` | ~155        |

No new component needed — add `testID="..."` prop to each existing element.

### TESTING-03: Key Interactive Elements

| testID                 | Element                                   | Source File                           | Notes                                                                                                                                                                                                                                                |
| ---------------------- | ----------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `play-resume-button`   | Play TouchableOpacity (not playing state) | `ConsolidatedPlayerControls.tsx` ~148 | The green "Play" button shown when item is not currently playing                                                                                                                                                                                     |
| `play-resume-button`   | PlayPauseButton Pressable                 | `PlayPauseButton.tsx` ~49             | Both the detail-page play button AND the floating/full-screen play/pause need `play-resume-button`; use the same ID so Maestro can find whichever is visible                                                                                         |
| `player-done-button`   | Chevron-down TouchableOpacity             | `FullScreenPlayer/index.tsx` ~531     | Phase 16 replaced the "Done" text button with `<Ionicons name="chevron-down">` inside a `TouchableOpacity`; existing `capture-screenshots.yaml` taps `tapOn: "Done"` which still works via text — add `testID` for explicit targeting                |
| `seek-slider`          | Interactive ProgressBar container View    | `ProgressBar.tsx` ~194                | The outer `View` with `{...panResponder.panHandlers}` — add `testID` to the interactive `View` at ~196 (the `paddingVertical: 8` view). Only the FullScreenPlayer uses `interactive={true}`                                                          |
| `speed-control`        | PlaybackSpeedControl MenuView             | `PlaybackSpeedControl.tsx` ~43        | The `MenuView` outer element or its inner `View` (the speed badge)                                                                                                                                                                                   |
| `download-button`      | Download MenuView in detail header        | `LibraryItemDetail.tsx` ~614          | The download action is inside a `MenuView` (header ellipsis button). For Maestro targeting, add `testID` to the `MenuView` container View at ~623 (`ellipsis-horizontal` icon wrapper). Alternatively, add a testID to the outer `MenuView` wrapper. |
| `library-search-input` | Library search TextInput                  | `LibraryItemList.tsx` ~45             | The TextInput inside `ListHeaderComponent`                                                                                                                                                                                                           |

**Important note on `download-button`:** The download action in this app is inside a `MenuView` (native iOS UIMenu), not a standalone button. Maestro cannot interact with iOS native context menus programmatically. The `testID="download-button"` should be placed on the `MenuView`'s child `View` (the ellipsis button wrapper at line ~623 of `LibraryItemDetail.tsx`). The `download.yaml` flow will tap this view, which opens the native menu, then tap the "Download" text option. This is consistent with how Maestro handles MenuView interactions — it taps the trigger, then taps the menu item by text.

**Important note on `play-resume-button`:** The `PlayPauseButton` component is rendered in multiple surfaces (FullScreenPlayer, FloatingPlayer, ConsolidatedPlayerControls). Adding `testID="play-resume-button"` directly to the `Pressable` in `PlayPauseButton.tsx` would assign the same ID to multiple simultaneous elements. The safer approach is:

- Add `testID="play-resume-button"` to the standalone green "Play" `TouchableOpacity` in `ConsolidatedPlayerControls.tsx` (the not-playing branch, line ~148)
- The `PlayPauseButton` component gets a `testID` prop that callers can pass through, so `FullScreenPlayer` passes `testID="play-pause-button"` (used in `playback.yaml`)

**Important note on `seek-slider`:** The `ProgressBar` component renders with `interactive={true}` only in `FullScreenPlayer`. The testID goes on the inner interactive `View` (line ~196, the `paddingVertical: 8` wrapper with `{...panResponder.panHandlers}`). This requires adding a `testID` prop to `ProgressBar`'s interface that gets passed to the interactive wrapper View.

---

## Don't Hand-Roll

| Problem                | Don't Build                                     | Use Instead                                                        | Why                                                        |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Idempotency check      | Custom "isLoggedIn" state passing between flows | `when: notVisible:` conditional block                              | Built-in Maestro condition; zero state to pass             |
| Env var file parsing   | Custom shell parser for `.env.maestro`          | `set -a; source .env.maestro; set +a`                              | Standard shell idiom; bash handles quoting edge cases      |
| Sequential flow runner | Custom Node.js script                           | `maestro test flow1.yaml && maestro test flow2.yaml` in npm script | Maestro handles process exit codes; no orchestrator needed |
| Element waiting        | `sleep` commands                                | `waitForAnimationToEnd`                                            | Maestro's built-in smart wait; `sleep` is brittle          |

---

## Common Pitfalls

### Pitfall 1: `appId` Missing from Subflow Files

**What goes wrong:** Maestro 2.x requires `appId` in every flow file, including subflows called via `runFlow`. If omitted, the subflow may run against the wrong app or fail with an unhelpful error.

**Why it happens:** Developers assume subflows inherit the parent's `appId`. They do not in some Maestro versions.

**How to avoid:** Every `.yaml` file in `.maestro/` starts with `appId: cloud.madtown.sideshelf\n---`.

**Warning signs:** "No app found" or actions targeting wrong elements during subflow execution.

### Pitfall 2: Login Flow Blocking on Disabled Submit Button

**What goes wrong:** The login form's submit button (`canSubmit`) is disabled until the server URL is pinged successfully. `inputText` + immediate `tapOn` on the button will fail because the ping is async.

**Why it happens:** `login.tsx` runs `tryPing()` on `onBlur` of the server URL field, and only sets `didPing=true` after success. The button is disabled (`!canSubmit`) until ping completes.

**How to avoid:** After entering the server URL, trigger the blur by tapping the username field (which causes the URL field to blur and ping to run), then `waitForAnimationToEnd`, then enter username/password. The login button will become enabled after ping succeeds.

**Warning signs:** `tapOn: id: "login-button"` executes but nothing happens (button is disabled, tap is silently swallowed).

**Sequence to use:**

```yaml
- tapOn:
    id: "login-server-url-input"
- clearText
- inputText: ${MAESTRO_SERVER_URL}
- tapOn:
    id: "login-username-input" # This triggers onBlur on server URL → ping starts
- waitForAnimationToEnd
- clearText
- inputText: ${MAESTRO_USERNAME}
- tapOn:
    id: "login-password-input"
- clearText
- inputText: ${MAESTRO_PASSWORD}
- waitForAnimationToEnd # Wait for ping to complete → button enabled
- tapOn:
    id: "login-button"
- waitForAnimationToEnd
```

### Pitfall 3: Seek Slider Interaction Requires Drag, Not Tap

**What goes wrong:** The `ProgressBar` seek interaction uses `PanResponder`, not a standard slider. `tapOn` will not trigger seeking — the element needs a `swipeRight` or `scroll` gesture.

**Why it happens:** React Native's `PanResponder` detects drag gestures, not point taps. Maestro's `tapOn` sends a single touch event that does not satisfy `onMoveShouldSetPanResponder`.

**How to avoid:** Use `scroll` or `swipeRight` on the `seek-slider` element in Maestro, not `tapOn`. Testing seek by dragging a small distance is sufficient to verify the element is targetable.

**Warning signs:** `tapOn: id: "seek-slider"` runs without error but position does not change.

### Pitfall 4: Native MenuView Cannot Be Inspected by Maestro

**What goes wrong:** The download option and speed control both use `@react-native-menu/menu`'s `MenuView`, which presents as a native iOS `UIMenu`. Maestro cannot enumerate or assert on items inside the native popover.

**Why it happens:** Native UIMenu items are not in the React accessibility tree after the menu opens — they render in a separate native layer.

**How to avoid:** Tap the `testID`-tagged trigger element to open the menu, then tap the menu item by its title text (e.g., `tapOn: "Download"`). Assert visible state changes in the React layer after dismissal (e.g., `DownloadProgressView` appears). Do not attempt to assert on menu item state.

**Warning signs:** `assertVisible` on menu items fails even though the menu is open.

### Pitfall 5: `.env.maestro` Not Gitignored

**What goes wrong:** Credentials committed to the repo.

**Why it happens:** `.gitignore` only excludes `.env*.local` — `.env.maestro` is NOT covered by this pattern.

**How to avoid:** Add `.env.maestro` explicitly to `.gitignore`. Confirm `.env.maestro.example` is committed (it only contains placeholder values).

### Pitfall 6: `play-resume-button` Ambiguity on Screens with Multiple Players

**What goes wrong:** If `testID="play-resume-button"` is assigned to `PlayPauseButton.tsx` directly, the ID appears on both the FloatingPlayer and the ConsolidatedPlayerControls simultaneously, causing `tapOn: id: "play-resume-button"` to fail with a "multiple elements found" error.

**Why it happens:** `PlayPauseButton` is a shared component rendered in multiple surfaces.

**How to avoid:** Apply `testID="play-resume-button"` only to the green standalone "Play" `TouchableOpacity` in `ConsolidatedPlayerControls.tsx` (the not-playing branch). For the FullScreenPlayer, use a distinct `testID="play-pause-button"` passed as a prop. The regression flows then navigate to the item detail page first (where the standalone green play button is unique on screen).

---

## Code Examples

### Env Var Injection in npm script

```bash
# package.json scripts entry
"maestro:test": "set -a && . .env.maestro && set +a && maestro test --env MAESTRO_USERNAME=\"$MAESTRO_USERNAME\" --env MAESTRO_PASSWORD=\"$MAESTRO_PASSWORD\" --env MAESTRO_SERVER_URL=\"$MAESTRO_SERVER_URL\" .maestro/library-navigation.yaml && maestro test --env MAESTRO_USERNAME=\"$MAESTRO_USERNAME\" --env MAESTRO_PASSWORD=\"$MAESTRO_PASSWORD\" --env MAESTRO_SERVER_URL=\"$MAESTRO_SERVER_URL\" .maestro/playback.yaml && maestro test --env MAESTRO_USERNAME=\"$MAESTRO_USERNAME\" --env MAESTRO_PASSWORD=\"$MAESTRO_PASSWORD\" --env MAESTRO_SERVER_URL=\"$MAESTRO_SERVER_URL\" .maestro/download.yaml"
```

A cleaner approach: use a shell script `scripts/run-maestro-tests.sh` similar to `scripts/run-screenshots.sh`, and have `maestro:test` call `bash scripts/run-maestro-tests.sh`.

### testID prop additions (summary)

```typescript
// login.tsx — server URL TextInput
<TextInput
  testID="login-server-url-input"
  ...
/>

// login.tsx — username TextInput
<TextInput
  testID="login-username-input"
  ...
/>

// login.tsx — password TextInput
<TextInput
  testID="login-password-input"
  ...
/>

// login.tsx — submit button
<TouchableOpacity
  testID="login-button"
  ...
/>

// ConsolidatedPlayerControls.tsx — standalone Play button (not-playing branch)
<TouchableOpacity
  testID="play-resume-button"
  ...
/>

// FullScreenPlayer/index.tsx — chevron-down dismiss button
<TouchableOpacity
  testID="player-done-button"
  hitSlop={...}
  onPress={handleClose}
>

// ProgressBar.tsx — add testID prop to interface + pass to interactive View
interface ProgressBarProps {
  ...
  testID?: string;  // for seek-slider targeting
}
// Pass to: <View {...panResponder.panHandlers} testID={testID} ... >

// PlaybackSpeedControl.tsx — add testID to inner View (the speed badge)
<View
  testID="speed-control"
  style={{ flexDirection: "row", ... }}
>

// LibraryItemDetail.tsx — the MenuView trigger View (ellipsis button)
<View testID="download-button" style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
  <Ionicons name="ellipsis-horizontal" ... />
</View>

// LibraryItemList.tsx — search TextInput
<TextInput
  testID="library-search-input"
  ...
/>
```

### .env.maestro.example

```bash
# Maestro UI test credentials
# Copy to .env.maestro and fill in real values (file is gitignored)
MAESTRO_SERVER_URL=http://your-abs-server.local:13378
MAESTRO_USERNAME=your-username
MAESTRO_PASSWORD=your-password
```

---

## Environment Availability

| Dependency    | Required By            | Available          | Version | Fallback |
| ------------- | ---------------------- | ------------------ | ------- | -------- |
| maestro CLI   | All YAML flows         | Yes                | 2.2.0   | —        |
| iOS Simulator | Flow execution         | Yes (macOS Darwin) | —       | —        |
| bash          | `run-maestro-tests.sh` | Yes                | system  | —        |
| npm           | `maestro:test` script  | Yes                | project | —        |

No missing dependencies.

---

## Validation Architecture

### Test Framework

| Property           | Value                                            |
| ------------------ | ------------------------------------------------ |
| Framework          | Jest + jest-expo (unit tests for source changes) |
| Config file        | `jest.config.js` (project root)                  |
| Quick run command  | `npm test -- --testPathPattern=login`            |
| Full suite command | `npm test`                                       |

### Phase Requirements → Test Map

| Req ID     | Behavior                                    | Test Type   | Automated Command                                       | Notes                                                             |
| ---------- | ------------------------------------------- | ----------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| TESTING-01 | `testID` props on login inputs              | manual-only | `maestro test .maestro/_login.yaml`                     | No Jest test; visual confirmation via Maestro run                 |
| TESTING-02 | `_login.yaml` authenticates + is idempotent | manual-only | `maestro test .maestro/_login.yaml` (twice in sequence) | Idempotency verified by running subflow twice; no Jest equivalent |
| TESTING-03 | `testID` props on 6 key elements            | manual-only | `maestro test .maestro/playback.yaml`                   | Verified by Maestro targeting the elements                        |
| TESTING-04 | Subflows decomposed and reusable            | manual-only | `maestro test .maestro/library-navigation.yaml`         | Verified by running each flow independently                       |
| TESTING-05 | Regression suite: 3 independent flows       | manual-only | `npm run maestro:test`                                  | All 3 flows pass = green                                          |

**Note:** All TESTING requirements are integration-level (require a running iOS simulator + ABS server). They are not suitable for Jest unit tests. The "Nyquist" verification gate for this phase is: all 5 Maestro flows complete without error on a simulator connected to a real ABS server.

### Wave 0 Gaps

None — no Jest test infrastructure is needed for this phase. The phase creates Maestro YAML files and adds `testID` props; there is no new business logic to unit test.

---

## State of the Art

| Old Approach                          | Current Approach                                 | Notes                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tapOn: "Done"` (text-based)          | `tapOn: id: "player-done-button"` (testID-based) | Phase 16 replaced the "Done" text button with a chevron icon; text-based tap still works in `capture-screenshots.yaml` but new flows should use testID for robustness |
| `tapOn: "Play"` with `optional: true` | `tapOn: id: "play-resume-button"`                | testID targeting is more stable than text targeting when locale or translation changes                                                                                |

---

## Open Questions

1. **`_login` ping timing: how long does `waitForAnimationToEnd` take vs. the ABS server ping?**
   - What we know: `tryPing()` is async and fires on `onBlur` of the server URL field. `waitForAnimationToEnd` waits for UI animations, not network calls.
   - What's unclear: If the ping takes >2s, `waitForAnimationToEnd` may resolve before `didPing=true`, leaving the button still disabled.
   - Recommendation: Use a fixed `waitFor` assertion on the "Connected to server" text label that appears when `didPing=true`, rather than relying on `waitForAnimationToEnd` alone. This is more reliable than a blind delay.

2. **`download-button` testID placement: on `MenuView` or inner `View`?**
   - What we know: `MenuView` from `@react-native-menu/menu` wraps a child view that acts as the trigger. In `LibraryItemDetail.tsx`, the trigger is `<View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>`.
   - What's unclear: Whether Maestro can tap the inner `View` testID when it is a child of `MenuView`, or whether the `MenuView` wrapper intercepts the touch.
   - Recommendation: Add `testID="download-button"` to the inner `View` (same pattern as existing `capture-screenshots.yaml` which taps the floating player area successfully). Verify during implementation by running `maestro test .maestro/download.yaml` and checking Maestro's element inspector output.

---

## Sources

### Primary (HIGH confidence)

- Maestro CLI 2.2.0 — verified via `maestro --version` on target machine
- `capture-screenshots.yaml` (`.maestro/capture-screenshots.yaml`) — existing patterns for `appId`, `tapOn: id:`, `optional: true`, `waitForAnimationToEnd`
- `login.tsx`, `PlayPauseButton.tsx`, `PlaybackSpeedControl.tsx`, `ProgressBar.tsx`, `LibraryItemDetail.tsx`, `LibraryItemList.tsx`, `ConsolidatedPlayerControls.tsx`, `FullScreenPlayer/index.tsx` — direct source inspection for element locations

### Secondary (MEDIUM confidence)

- [Maestro runFlow docs](https://docs.maestro.dev/reference/commands-available/runflow) — `file:` syntax, env propagation
- [Maestro conditions docs](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions) — `when: notVisible:` syntax for idempotency
- [Maestro parameters docs](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants) — `${VAR}` syntax, `-e` flag
- [Mastering Maestro — Medium](https://medium.com/@NirajsubediQA/mastering-maestro-dos-don-ts-of-mobile-ui-automation-be383c2607ce) — idempotency and best practice patterns

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — Maestro version verified on machine; RN testID is standard SDK behavior
- Architecture: HIGH — existing `capture-screenshots.yaml` establishes all YAML patterns; source code inspected directly
- Pitfalls: HIGH — login form ping timing and MenuView native layer limitation derived directly from source code review; Maestro docs confirm PanResponder/swipe distinction
- testID mapping: HIGH — every target element located in source with line numbers

**Research date:** 2026-03-30
**Valid until:** 2026-05-01 (Maestro 2.2.x minor; stable; no fast-moving API)
