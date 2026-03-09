# UI Testing Plan

## Overview

Evolve the Maestro screenshot automation into a full E2E UI test suite covering navigation, playback, downloads, and progress sync. The screenshot workflow (`npm run screenshots`) is the starting point — the same infrastructure supports regression tests once the remaining prerequisites are in place.

**Current Status:** Screenshot capture working (8 PNGs, fully automated). Foundation established but several gaps remain before tests are reliable in CI.

---

## Known Issues in Current Implementation

These are limitations discovered during screenshot implementation that inform the phases below.

1. **No deep links** — Navigation state resets use a double-tap hack (tap Library tab twice to pop to root). This is fragile; any future change to tab press behavior would silently break it.
2. **No login precondition** — Flow assumes the app is already logged in with a synced library. Running from a clean install or after logout will fail immediately.
3. **Text-based selectors for Play/Resume** — The playback step uses `optional: true` on `tapOn: "Play"` because the label changes to "Resume" when playback is already active. A `testID` would remove this ambiguity.
4. **XCTest tree invalidation after `takeScreenshot`** — Maestro crashes on the next accessibility tree read after a screenshot. Worked around with a JS busy-wait (`wait.js`); the real fix is a Maestro upstream patch or a delay mechanism Maestro adds in a future release.
5. **Single flow file** — Everything in one YAML makes individual screen tests impossible and makes failures hard to isolate.

---

## Phase 1: Deep Link Navigation

**Goal:** Replace all navigation hacks with deterministic URL routing.

### Why

Maestro's `openLink` command navigates to an exact screen regardless of current navigation state. It eliminates the double-tap hack, makes flows order-independent, and unlocks testing from notification tap-throughs.

### Tasks

**1. Register a URL scheme in `app.json`**

```json
{
  "expo": {
    "scheme": "sideshelf"
  }
}
```

**2. Verify Expo Router's automatic deep link handling**

Expo Router automatically maps file-based routes to deep links when a scheme is registered. Test by running:

```bash
xcrun simctl openurl booted "sideshelf:///(tabs)/library"
```

If the app navigates to Library, no additional code is needed.

**3. Test routes to cover**

| URL                                    | Screen              |
| -------------------------------------- | ------------------- |
| `sideshelf:///(tabs)/home`             | Home / Downloads    |
| `sideshelf:///(tabs)/library`          | Library list (root) |
| `sideshelf:///(tabs)/library/[itemId]` | Book detail         |
| `sideshelf:///FullScreenPlayer`        | Full-screen player  |

**4. Update `.maestro/capture-screenshots.yaml`**

Replace:

```yaml
- tapOn: "Library"
- waitForAnimationToEnd
- tapOn: "Library" # double-tap hack to pop to root
- waitForAnimationToEnd
```

With:

```yaml
- openLink: "sideshelf:///(tabs)/library"
- waitForAnimationToEnd
```

**Testing:** Run `npm run screenshots` — all 8 screenshots should still produce. Verify no regression via the `assertVisible` guards already in the flow.

**Rollback:** Remove `scheme` from `app.json` and revert YAML. The double-tap approach still works.

---

## Phase 2: Self-Contained Login Flow

**Goal:** Make flows runnable from a fresh install, not just a pre-authenticated session.

### Why

Without this, every CI run requires a pre-seeded simulator snapshot. That makes the test suite fragile in proportion to how often the simulator is rebuilt.

### Tasks

**1. Create `.maestro/_login.yaml`**

A reusable subflow that detects the login screen and authenticates if needed. Uses environment variables for credentials so no secrets are hardcoded.

```yaml
# .maestro/_login.yaml
# Called via "runFlow" from other flows.
# Only acts if the login screen is visible; safe to call unconditionally.
appId: cloud.madtown.sideshelf
---
- runFlow:
    when:
      visible: "Sign In"
    file: _do-login.yaml
```

```yaml
# .maestro/_do-login.yaml
---
- tapOn:
    id: "server-url-input"
- inputText: "${ABS_SERVER_URL}"
- tapOn:
    id: "username-input"
- inputText: "${ABS_USERNAME}"
- tapOn:
    id: "password-input"
- inputText: "${ABS_PASSWORD}"
- tapOn:
    id: "sign-in-button"
- waitForAnimationToEnd
- assertVisible: "Library"
```

**2. Add testIDs to auth screen inputs**

In `src/app/login.tsx` (or equivalent):

```tsx
<TextInput testID="server-url-input" ... />
<TextInput testID="username-input" ... />
<TextInput testID="password-input" secureTextEntry ... />
<Pressable testID="sign-in-button" ... />
```

**3. Update `run-screenshots.sh` to pass credentials**

```bash
maestro test capture-screenshots.yaml \
  -e ABS_SERVER_URL="${ABS_SERVER_URL}" \
  -e ABS_USERNAME="${ABS_USERNAME}" \
  -e ABS_PASSWORD="${ABS_PASSWORD}"
```

Credentials come from environment variables, not the script. For local use: set in `.env.local` (gitignored). For CI: inject as secrets.

**4. Update `capture-screenshots.yaml` to call login first**

```yaml
- launchApp:
    clearState: false
- runFlow: _login.yaml
```

**Testing:** Wipe the simulator, run `npm run screenshots`, verify it logs in and captures all 8 screenshots end to end.

---

## Phase 3: TestID Coverage for Player Flow

**Goal:** Remove all text-based selectors from the playback initiation path.

### Why

Text selectors break when strings are translated or renamed. The `Play`/`Resume` ambiguity already required `optional: true`, which silently passes even if the button is missing entirely.

### Tasks

**1. Add testIDs to book detail screen**

In `src/app/(tabs)/library/[item]/index.tsx`:

```tsx
<Pressable testID="play-resume-button" onPress={handlePlay}>
  <Text>{isCurrentlyPlaying ? t("common.resume") : t("common.play")}</Text>
</Pressable>
```

**2. Update YAML to use testID**

Replace:

```yaml
- tapOn:
    text: "Play"
    optional: true
```

With:

```yaml
- tapOn:
    id: "play-resume-button"
```

**3. Audit remaining text-based selectors**

Run `grep 'tapOn:' .maestro/*.yaml` after each change. Any `text:` selector on a translated string should become a `testID`.

Candidates beyond Play/Resume:

- "Continue Listening" in `assertVisible` — acceptable since it's an assertion, not navigation
- "Done" on the player header — add `testID="player-done-button"` to future-proof

**Testing:** Run `npm run screenshots` and verify `Tap on (Optional) "Play"... WARNED` disappears — the step should complete cleanly.

---

## Phase 4: Flow Decomposition

**Goal:** Split the monolithic flow into composable subflows.

### Why

A single 60-line YAML means any failure blocks all subsequent screenshots. Separate flows let Maestro (or the shell script) run and report on each screen independently.

### Proposed structure

```
.maestro/
  _login.yaml              # reusable: authenticate if needed
  _do-login.yaml           # reusable: actual login steps
  _start-playback.yaml     # reusable: tap first book and start playing
  wait.js                  # workaround: busy-wait after takeScreenshot

  capture-screenshots.yaml # orchestrator: calls subflows, captures all 8
  test-library.yaml        # standalone: library navigation + view toggle
  test-player.yaml         # standalone: full-screen player interactions
  test-downloads.yaml      # standalone: home screen + downloads
  test-playback.yaml       # standalone: play/pause/seek/speed regression
```

**`_start-playback.yaml`** (extracted reusable subflow):

```yaml
---
# Navigates to Library, opens first book, starts playback.
# Idempotent: if playback is already active for this item, no-ops.
- openLink: "sideshelf:///(tabs)/library"
- waitForAnimationToEnd
- tapOn:
    id: "library-item"
    index: 0
- waitForAnimationToEnd
- tapOn:
    id: "play-resume-button"
- waitForAnimationToEnd
```

**`capture-screenshots.yaml`** becomes an orchestrator:

```yaml
appId: cloud.madtown.sideshelf
---
- launchApp:
    clearState: false
- runFlow: _login.yaml
- runFlow:
    file: _capture-library.yaml
- runFlow:
    file: _capture-player.yaml
- runFlow:
    file: _capture-downloads.yaml
```

**Testing:** `maestro test .maestro/test-library.yaml` should run independently and pass without needing the player to be active.

---

## Phase 5: Regression Test Suite

**Goal:** Cover core user flows as automated regression tests, runnable pre-release.

### Flows to implement

**Library navigation (`test-library.yaml`)**

- [ ] Library list loads with items visible
- [ ] Grid/list toggle persists after app restart
- [ ] Search filters results
- [ ] Tapping a book opens detail page
- [ ] Back navigation returns to list

**Playback (`test-playback.yaml`)**

- [ ] Play starts, floating player appears
- [ ] Pause/resume works from floating player
- [ ] Full-screen player opens via floating player tap
- [ ] Seek slider updates position
- [ ] Speed control changes playback rate
- [ ] Done button dismisses player

**Downloads (`test-downloads.yaml`)**

- [ ] Home screen shows "Continue Listening" for in-progress books
- [ ] Download button initiates download (progress indicator appears)
- [ ] Downloaded book plays offline (airplane mode test)

**Progress sync (`test-progress.yaml`)**

- [ ] Progress persists after kill/relaunch
- [ ] Chapter advances correctly

### testID additions needed for regression flows

| Component            | testID                                                                   | Used by |
| -------------------- | ------------------------------------------------------------------------ | ------- |
| `FloatingPlayer.tsx` | `floating-player`                                                        | ✅ done |
| `LibraryItem.tsx`    | `library-item`                                                           | ✅ done |
| Login inputs         | `server-url-input`, `username-input`, `password-input`, `sign-in-button` | Phase 2 |
| Play/Resume button   | `play-resume-button`                                                     | Phase 3 |
| Player Done button   | `player-done-button`                                                     | Phase 3 |
| Download button      | `download-button`                                                        | Phase 5 |
| Speed control        | `speed-control`                                                          | Phase 5 |
| Seek slider          | `seek-slider`                                                            | Phase 5 |
| Search input         | `library-search-input`                                                   | Phase 5 |

---

## CI Integration

Once Phase 2 (login) is complete, the suite can run unattended.

**Recommended setup (GitHub Actions):**

1. Boot a fixed simulator (e.g. iPhone 15 Pro, iOS 17) using `xcrun simctl boot`
2. Build and install the app from the repo using `expo run:ios --configuration Release`
3. Restore a pre-seeded simulator snapshot (logged in, library synced) using `xcrun simctl snapshot`
4. Run `npm run screenshots` — fail the job on non-zero exit
5. Upload screenshots as artifacts

**Simulator snapshot strategy:**

Once Phase 2 is done (login subflow), a snapshot is no longer strictly needed for screenshots — the flow self-authenticates. But for regression tests that require downloaded books, a snapshot with pre-downloaded content will still be needed to avoid download wait times during every CI run.

---

## Rollback

All phases are additive:

- testIDs are backward-compatible (ignored by non-Maestro runs)
- YAML files can be deleted without affecting the app
- Deep link scheme is optional; removing it from `app.json` and the YAML reverts to the double-tap approach
- Login subflow only activates when the login screen is visible

---

## Success Metrics

- `npm run screenshots` completes in under 3 minutes, zero manual steps
- Deep-link navigation: zero reliance on tab double-tap or arbitrary waits
- All text-based selectors in playback path replaced with testIDs
- Regression suite catches a broken `Play` button before a release
- CI green on a clean simulator without pre-seeding

---

## Timeline

- **Phase 1 (Deep links):** 1 day — `app.json` change + YAML update + verification
- **Phase 2 (Login flow):** 1-2 days — testIDs on auth screen + subflow YAML + credential wiring
- **Phase 3 (TestID coverage):** 1 day — testIDs on player detail + YAML cleanup
- **Phase 4 (Flow decomposition):** 1 day — YAML restructure, no code changes
- **Phase 5 (Regression suite):** 1 week — flow authoring + testIDs for new selectors
