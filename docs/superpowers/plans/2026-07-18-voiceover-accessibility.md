# VoiceOver / Accessibility Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SideShelf navigable and operable with VoiceOver/TalkBack — labeled controls, an operable seek bar, collapsed list rows, Dynamic Type tolerance, and Reduce Motion support.

**Architecture:** Three thrusts: (1) swap hand-rolled controls for RN built-ins that ship accessibility for free (`Switch`), or retrofit standard accessibility contracts onto custom controls we keep (`accessibilityRole="adjustable"` on ProgressBar); (2) collapse composite rows/cards into single accessible elements with composed labels, hiding decorative children; (3) system-settings compliance — `ReducedMotionConfig` for Reduce Motion, `minHeight` + `maxFontSizeMultiplier` for Dynamic Type. All user-facing strings go through the existing `translate()` i18n layer (interpolation syntax is `{token}`).

**Tech Stack:** React Native 0.7x / Expo 54, react-native-reanimated ~4.1, jest-expo + React Native Testing Library (co-located `__tests__/` dirs).

---

## Background: audit findings (2026-07-18)

- Only 13 of 52 files containing touchables have any accessibility props (27 props total).
- **Critical:** `ProgressBar` (PanResponder seek bar) is invisible/inoperable to VoiceOver; `PlayPauseButton` has `accessibilityRole="button"` but no label/state; custom `Toggle` has no switch semantics; all 8 secondary player controls are unlabeled icon buttons.
- **High:** chapter rows lack selected-state; login TextInputs rely on placeholders; custom modals have unlabeled buttons; cover images are unlabeled AT noise.
- **Systemic:** no `AccessibilityInfo` usage, no a11y i18n strings, no Reduce Motion handling, fixed-height containers will clip at large Dynamic Type sizes.
- **Working already (do not touch):** tab bar (expo-router `Tabs`/`NativeTabs` with `title` — labels + selected state are native), `HeaderControls` grid/list toggle, screen headers.

## Design decisions

### D-1: Swap in RN built-ins where they exist; retrofit where they don't

| Custom component                          | Decision                                            | Rationale                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Toggle` (Pressable + Views)              | **Swap internals to RN `Switch`**                   | `Switch` provides role="switch", checked state, larger native thumb, and haptics for free. Only 2 call sites; keep the `ToggleProps` API so call sites need only an added `accessibilityLabel`.                                                                                                                                  |
| `ProgressBar` (PanResponder)              | **Keep, retrofit `accessibilityRole="adjustable"`** | `@react-native-community/slider` would be a new native dependency and a visual change across ~10 call sites (it's also used non-interactively as a progress display). The adjustable-role contract (`accessibilityValue` + increment/decrement actions) is the same mechanism Apple's own players use and fits the existing API. |
| Custom prompt `Modal` in FullScreenPlayer | **Keep, label the buttons**                         | `Alert.prompt` is iOS-only; the custom modal is cross-platform. RN `Modal` already traps VoiceOver focus.                                                                                                                                                                                                                        |
| `MenuView` anchors (speed, sleep timer)   | **Keep, make anchor a labeled button**              | `@react-native-menu/menu` renders native UIMenu items which are accessible once open; only the anchor needs role/label/value.                                                                                                                                                                                                    |

### D-2: Collapse composite elements (fewer, richer swipe stops)

Rows/cards currently expose 3–5 fragment stops (cover, title, author, progress). Collapse each into **one** focusable element via `accessible={true}` + composed `accessibilityLabel` on the outer Pressable, and hide decorative children:

- `CoverImage` → hidden from AT entirely (`importantForAccessibility="no-hide-descendants"` + `accessibilityElementsHidden`); its download/offline badges get folded into the parent row's label.
- `FloatingPlayer` press area → one "Now playing…" button.
- `HomeItem`, `CoverItem`, chapter rows → one button each; chapter rows add `accessibilityState={{ selected }}`.
- Non-interactive `ProgressBar` instances inside collapsed rows are automatically hidden (children of an `accessible` parent), and their info is composed into the row label as "X% finished".

### D-3: Scaling and motion

- **Reduce Motion:** one global `<ReducedMotionConfig mode={ReduceMotion.System} />` in the root layout makes every reanimated animation respect the OS setting (reanimated's default is `Never`). No per-animation changes needed.
- **Dynamic Type:** keep font scaling ON (never `allowFontScaling={false}`). Two mitigations where layout is fixed: (a) `floatingPlayer.height` becomes a **minHeight**, and its `listPadding`/`bottomOffset` consumers derive from `PixelRatio.getFontScale()`; (b) cap runaway scaling only in pinned chrome (mini player text, player time labels) with `maxFontSizeMultiplier={1.5}` — content screens (lists, detail, settings) scale freely.

## File map

| File                                                                                                        | Change                                                   |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/i18n/locales/en.ts`, `es.ts`                                                                           | Add `accessibility.*` namespace                          |
| `src/components/ui/Toggle.tsx`                                                                              | Reimplement with `Switch`; add `accessibilityLabel` prop |
| `src/app/(tabs)/more/settings.tsx`, `logger-settings.tsx`                                                   | Pass `accessibilityLabel` to `Toggle`                    |
| `src/components/player/PlayPauseButton.tsx`                                                                 | label + `accessibilityState` + spinner label             |
| `src/components/player/SkipButton.tsx`, `JumpTrackButton.tsx`, `BookmarkButton.tsx`, `FullScreenButton.tsx` | role + label (+ disabled/busy state)                     |
| `src/components/player/SleepTimerControl.tsx`, `PlaybackSpeedControl.tsx`                                   | accessible anchor with label + value                     |
| `src/components/ui/ProgressBar.tsx`                                                                         | adjustable role, value, increment/decrement actions      |
| `src/components/ui/CoverImage.tsx`                                                                          | hide from AT                                             |
| `src/components/ui/FloatingPlayer.tsx`                                                                      | collapse press area; label AirPlay wrapper               |
| `src/components/home/Item.tsx`, `CoverItem.tsx`                                                             | collapse; composed label                                 |
| `src/components/player/ChapterList.tsx`, `src/components/library/LibraryItemDetail/ChapterList.tsx`         | row role/label/selected                                  |
| `src/app/login.tsx`                                                                                         | input labels; error live region                          |
| `src/app/FullScreenPlayer/index.tsx`                                                                        | label chevron/gear/prompt-modal buttons                  |
| `src/lib/styles.ts`                                                                                         | `floatingPlayer.height` → min-height semantics           |
| `src/app/_layout.tsx`                                                                                       | `ReducedMotionConfig`                                    |

---

### Task 1: i18n accessibility strings

**Files:**

- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/es.ts`

- [ ] **Step 1: Add the `accessibility.*` namespace to `en.ts`** (after the `// Authentication` block, matching existing flat-key style):

```typescript
  // Accessibility (VoiceOver/TalkBack labels — not shown visually)
  "accessibility.play": "Play",
  "accessibility.pause": "Pause",
  "accessibility.loading": "Loading",
  "accessibility.skipForward": "Skip forward {seconds} seconds",
  "accessibility.skipBackward": "Skip back {seconds} seconds",
  "accessibility.skipHint": "Long press to change skip interval",
  "accessibility.nextChapter": "Next chapter",
  "accessibility.previousChapter": "Previous chapter",
  "accessibility.addBookmark": "Add bookmark",
  "accessibility.openFullPlayer": "Open full screen player",
  "accessibility.closePlayer": "Close player",
  "accessibility.playerSettings": "Player settings",
  "accessibility.nowPlaying": "Now playing: {title}, {chapter}, {progress}",
  "accessibility.playbackPosition": "Playback position",
  "accessibility.playbackSpeed": "Playback speed",
  "accessibility.sleepTimer": "Sleep timer",
  "accessibility.percentFinished": "{percent}% finished",
  "accessibility.downloaded": "downloaded",
  "accessibility.partiallyDownloaded": "partially downloaded",
  "accessibility.openItemDetails": "Opens book details",
  "accessibility.chapterRow": "{title}, {duration}",
  "accessibility.currentChapter": "current chapter",
  "accessibility.serverUrl": "Server URL",
  "accessibility.username": "Username",
  "accessibility.password": "Password",
  "accessibility.cancel": "Cancel",
  "accessibility.save": "Save",
```

- [ ] **Step 2: Add the Spanish equivalents to `es.ts`** in the same position:

```typescript
  // Accessibility (etiquetas VoiceOver/TalkBack — no visibles)
  "accessibility.play": "Reproducir",
  "accessibility.pause": "Pausar",
  "accessibility.loading": "Cargando",
  "accessibility.skipForward": "Avanzar {seconds} segundos",
  "accessibility.skipBackward": "Retroceder {seconds} segundos",
  "accessibility.skipHint": "Mantén pulsado para cambiar el intervalo",
  "accessibility.nextChapter": "Capítulo siguiente",
  "accessibility.previousChapter": "Capítulo anterior",
  "accessibility.addBookmark": "Añadir marcador",
  "accessibility.openFullPlayer": "Abrir reproductor a pantalla completa",
  "accessibility.closePlayer": "Cerrar reproductor",
  "accessibility.playerSettings": "Ajustes del reproductor",
  "accessibility.nowPlaying": "Reproduciendo: {title}, {chapter}, {progress}",
  "accessibility.playbackPosition": "Posición de reproducción",
  "accessibility.playbackSpeed": "Velocidad de reproducción",
  "accessibility.sleepTimer": "Temporizador de apagado",
  "accessibility.percentFinished": "{percent}% completado",
  "accessibility.downloaded": "descargado",
  "accessibility.partiallyDownloaded": "descargado parcialmente",
  "accessibility.openItemDetails": "Abre los detalles del libro",
  "accessibility.chapterRow": "{title}, {duration}",
  "accessibility.currentChapter": "capítulo actual",
  "accessibility.serverUrl": "URL del servidor",
  "accessibility.username": "Nombre de usuario",
  "accessibility.password": "Contraseña",
  "accessibility.cancel": "Cancelar",
  "accessibility.save": "Guardar",
```

- [ ] **Step 3: Verify types compile** (keys are typed via `TranslationKey`):

Run: `npx tsc --noEmit`
Expected: no errors (if `es.ts` must mirror `en.ts` keys exactly, a missing key surfaces here).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/es.ts
git commit -m "feat(a11y): add accessibility string namespace to i18n"
```

---

### Task 2: Swap Toggle internals to RN `Switch`

**Files:**

- Modify: `src/components/ui/Toggle.tsx` (full rewrite, API-compatible + new `accessibilityLabel` prop)
- Modify: `src/app/(tabs)/more/settings.tsx`, `src/app/(tabs)/more/logger-settings.tsx` (pass labels)
- Test: `src/components/ui/__tests__/Toggle.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import Toggle from "@/components/ui/Toggle";

describe("Toggle", () => {
  it("renders an accessible switch with checked state", () => {
    const { getByRole } = render(
      <Toggle value={true} onValueChange={jest.fn()} accessibilityLabel="Dark mode" />
    );
    const toggle = getByRole("switch");
    expect(toggle.props.accessibilityLabel).toBe("Dark mode");
    expect(toggle.props.value).toBe(true);
  });

  it("calls onValueChange with the flipped value", () => {
    const onValueChange = jest.fn();
    const { getByRole } = render(
      <Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Dark mode" />
    );
    fireEvent(getByRole("switch"), "valueChange", true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it("does not fire when disabled", () => {
    const onValueChange = jest.fn();
    const { getByRole } = render(
      <Toggle value={false} onValueChange={onValueChange} disabled accessibilityLabel="Dark mode" />
    );
    expect(getByRole("switch").props.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `jest src/components/ui/__tests__/Toggle.test.tsx`
Expected: FAIL — no element with role "switch" (current implementation is a Pressable), and `accessibilityLabel` is not an accepted prop.

- [ ] **Step 3: Rewrite `Toggle.tsx`**

```tsx
/**
 * Toggle Component
 *
 * Thin wrapper around React Native's Switch. Using the built-in control
 * gives us the switch accessibility role, checked-state announcement, and
 * native styling for free (previously a hand-rolled Pressable that was
 * invisible to screen readers).
 */

import { useThemedStyles } from "@/lib/theme";
import { Switch } from "react-native";

export interface ToggleProps {
  /** Whether the toggle is currently enabled */
  value: boolean;
  /** Callback when toggle is pressed */
  onValueChange: (value: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Screen-reader label describing what this toggle controls */
  accessibilityLabel: string;
}

export default function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: ToggleProps) {
  const { isDark } = useThemedStyles();
  const primaryColor = isDark ? "#4A9EFF" : "#007AFF";

  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ true: primaryColor, false: isDark ? "#3A3A3C" : "#C7C7CC" }}
    />
  );
}
```

Note: `accessibilityLabel` is deliberately **required** — the compiler now flags every call site that lacks one.

- [ ] **Step 4: Fix call sites flagged by TypeScript**

Run: `npx tsc --noEmit` — every `<Toggle …>` in `src/app/(tabs)/more/settings.tsx` and `src/app/(tabs)/more/logger-settings.tsx` will error. For each, pass the row's existing visible title string (they already render a `<Text>` title next to the toggle — reuse the same `translate(...)` call or literal), e.g.:

```tsx
<Toggle
  value={someSetting}
  onValueChange={setSomeSetting}
  accessibilityLabel={translate("settings.someSetting.title")}
/>
```

- [ ] **Step 5: Run tests and typecheck**

Run: `jest src/components/ui/__tests__/Toggle.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Toggle.tsx src/components/ui/__tests__/Toggle.test.tsx "src/app/(tabs)/more/settings.tsx" "src/app/(tabs)/more/logger-settings.tsx"
git commit -m "feat(a11y): reimplement Toggle with native Switch for screen-reader semantics"
```

---

### Task 3: PlayPauseButton — label, state, spinner label

**Files:**

- Modify: `src/components/player/PlayPauseButton.tsx`
- Test: `src/components/player/__tests__/PlayPauseButton.test.tsx` (extend existing file)

- [ ] **Step 1: Add failing tests to the existing test file**

```tsx
it("announces Pause when playing", () => {
  // arrange store so isPlaying=true (follow the mock pattern already in this file)
  const { getByRole } = renderButton();
  const button = getByRole("button");
  expect(button.props.accessibilityLabel).toBe("Pause");
});

it("announces Play when paused", () => {
  // arrange store so isPlaying=false
  const { getByRole } = renderButton();
  expect(getByRole("button").props.accessibilityLabel).toBe("Play");
});
```

(Reuse the file's existing store-mocking helpers; the assertions above are the new part.)

- [ ] **Step 2: Run to verify failure**

Run: `jest src/components/player/__tests__/PlayPauseButton.test.tsx`
Expected: FAIL — `accessibilityLabel` undefined.

- [ ] **Step 3: Implement.** In `PlayPauseButton.tsx`:

Add import: `import { translate } from "@/i18n";`

Loading spinner branch (the `View` wrapping `ActivityIndicator`, ~line 68) — make it announce:

```tsx
      <View
        accessibilityRole="button"
        accessibilityLabel={translate("accessibility.loading")}
        accessibilityState={{ busy: true }}
        style={{ ... /* unchanged */ }}
      >
```

Main `Pressable` (~line 82) — replace the bare `accessibilityRole="button"` with:

```tsx
      accessibilityRole="button"
      accessibilityLabel={
        displayIsPlaying ? translate("accessibility.pause") : translate("accessibility.play")
      }
      accessibilityState={{ selected: displayIsPlaying }}
```

Using `displayIsPlaying` (the optimistic value) keeps the announcement in sync with the icon during the D-13 optimistic window.

- [ ] **Step 4: Run tests**

Run: `jest src/components/player/__tests__/PlayPauseButton.test.tsx`
Expected: PASS (including pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/player/PlayPauseButton.tsx src/components/player/__tests__/PlayPauseButton.test.tsx
git commit -m "feat(a11y): announce play/pause state on PlayPauseButton"
```

---

### Task 4: SkipButton and JumpTrackButton labels

**Files:**

- Modify: `src/components/player/SkipButton.tsx`
- Modify: `src/components/player/JumpTrackButton.tsx`
- Test: `src/components/player/__tests__/SkipButton.a11y.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from "@testing-library/react-native";
import SkipButton from "@/components/player/SkipButton";
import JumpTrackButton from "@/components/player/JumpTrackButton";

describe("player button accessibility", () => {
  it("SkipButton announces direction and interval", () => {
    const { getByRole } = render(
      <SkipButton direction="forward" interval={30} onPress={jest.fn()} />
    );
    expect(getByRole("button").props.accessibilityLabel).toBe("Skip forward 30 seconds");
  });

  it("SkipButton backward announces back interval", () => {
    const { getByRole } = render(
      <SkipButton direction="backward" interval={15} onPress={jest.fn()} />
    );
    expect(getByRole("button").props.accessibilityLabel).toBe("Skip back 15 seconds");
  });

  it("JumpTrackButton announces chapter navigation", () => {
    const { getByRole } = render(<JumpTrackButton direction="forward" onPress={jest.fn()} />);
    expect(getByRole("button").props.accessibilityLabel).toBe("Next chapter");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `jest src/components/player/__tests__/SkipButton.a11y.test.tsx`
Expected: FAIL — no role/label.

- [ ] **Step 3: Implement.** `SkipButton.tsx` has **two** `Pressable` render paths (~line 105 without `onJump`, ~line 125 with the MenuView long-press variant). Add to **both**:

```tsx
      accessibilityRole="button"
      accessibilityLabel={translate(
        direction === "forward" ? "accessibility.skipForward" : "accessibility.skipBackward",
        { seconds }
      )}
```

On the MenuView variant only, also add `accessibilityHint={translate("accessibility.skipHint")}` so the long-press menu is discoverable. (`translate` is already imported in this file.)

`JumpTrackButton.tsx` — add to the `Pressable`:

```tsx
            accessibilityRole="button"
            accessibilityLabel={translate(
                direction === 'forward' ? 'accessibility.nextChapter' : 'accessibility.previousChapter'
            )}
```

Add import: `import { translate } from '@/i18n';`

- [ ] **Step 4: Run tests, commit**

Run: `jest src/components/player/__tests__/SkipButton.a11y.test.tsx`
Expected: PASS

```bash
git add src/components/player/SkipButton.tsx src/components/player/JumpTrackButton.tsx src/components/player/__tests__/SkipButton.a11y.test.tsx
git commit -m "feat(a11y): label skip and chapter-jump buttons"
```

---

### Task 5: BookmarkButton and FullScreenButton labels

**Files:**

- Modify: `src/components/player/BookmarkButton.tsx`
- Modify: `src/components/player/FullScreenButton.tsx`

- [ ] **Step 1: Implement.** `BookmarkButton.tsx` — add to the `Pressable`, plus import `translate` from `@/i18n`:

```tsx
      accessibilityRole="button"
      accessibilityLabel={translate("accessibility.addBookmark")}
      accessibilityState={{ disabled, busy: isCreating }}
```

`FullScreenButton.tsx` — add to the `Pressable`, plus import `translate` from `@/i18n`:

```tsx
      accessibilityRole="button"
      accessibilityLabel={translate("accessibility.openFullPlayer")}
      accessibilityState={{ disabled }}
```

- [ ] **Step 2: Typecheck and run related tests**

Run: `npx tsc --noEmit && jest --findRelatedTests src/components/player/BookmarkButton.tsx src/components/player/FullScreenButton.tsx`
Expected: PASS / no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/player/BookmarkButton.tsx src/components/player/FullScreenButton.tsx
git commit -m "feat(a11y): label bookmark and full-screen buttons"
```

---

### Task 6: SleepTimerControl and PlaybackSpeedControl menu anchors

**Files:**

- Modify: `src/components/player/SleepTimerControl.tsx`
- Modify: `src/components/player/PlaybackSpeedControl.tsx`

The `MenuView` children are plain `View`s showing text state ("1.5x", timer countdown). Make each anchor a single accessible button whose **label** names the control and whose **value** carries the current state — VoiceOver reads "Playback speed, button, 1.5x".

- [ ] **Step 1: Implement.** `PlaybackSpeedControl.tsx` — on the inner `View` with `testID="speed-control"`:

```tsx
        <View
          testID="speed-control"
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={translate("accessibility.playbackSpeed")}
          accessibilityValue={{ text: translate("player.playbackSpeed.rate", { rate: playbackRate }) }}
          style={{ ... /* unchanged */ }}
        >
```

`SleepTimerControl.tsx` — on the inner anchor `View`:

```tsx
        <View
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={translate("accessibility.sleepTimer")}
          accessibilityValue={{ text: getDisplayText() }}
          style={{ ... /* unchanged */ }}
        >
```

`getDisplayText()` already returns "Off" or the remaining time, so the value announcement tracks the visible state. Note the timer ticks each second — VoiceOver only re-reads the value when refocused, so this does not spam.

- [ ] **Step 2: Typecheck, run related tests, commit**

Run: `npx tsc --noEmit && jest --findRelatedTests src/components/player/SleepTimerControl.tsx src/components/player/PlaybackSpeedControl.tsx`

```bash
git add src/components/player/SleepTimerControl.tsx src/components/player/PlaybackSpeedControl.tsx
git commit -m "feat(a11y): expose speed and sleep-timer anchors as valued buttons"
```

---

### Task 7: ProgressBar — adjustable role and accessibility actions

**Files:**

- Modify: `src/components/ui/ProgressBar.tsx`
- Test: `src/components/ui/__tests__/ProgressBar.a11y.test.tsx` (create)

This is the critical fix. VoiceOver users cannot perform pan gestures; the standard contract is `accessibilityRole="adjustable"` + `accessibilityValue` + `accessibilityActions` `[increment, decrement]` (swipe up/down adjusts). We seek by a fixed step (30 s when time-based, 5% otherwise) and fire the same `onSeekComplete` callback the pan path uses.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import ProgressBar from "@/components/ui/ProgressBar";

describe("ProgressBar accessibility", () => {
  it("interactive bar is an adjustable element with a value", () => {
    const { getByRole } = render(
      <ProgressBar progress={0.5} interactive currentTime={1800} duration={3600} showTimeLabels />
    );
    const bar = getByRole("adjustable");
    expect(bar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 50,
      text: "30:00 of 1:00:00",
    });
  });

  it("increment action seeks forward 30 seconds", () => {
    const onSeekComplete = jest.fn();
    const { getByRole } = render(
      <ProgressBar
        progress={0.5}
        interactive
        currentTime={1800}
        duration={3600}
        onSeekComplete={onSeekComplete}
      />
    );
    fireEvent(getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(onSeekComplete).toHaveBeenCalledWith(1830);
  });

  it("decrement action seeks back 30 seconds, clamped at minValue", () => {
    const onSeekComplete = jest.fn();
    const { getByRole } = render(
      <ProgressBar
        progress={0}
        interactive
        currentTime={10}
        duration={3600}
        onSeekComplete={onSeekComplete}
      />
    );
    fireEvent(getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(onSeekComplete).toHaveBeenCalledWith(0);
  });

  it("non-interactive bar is not focusable", () => {
    const { queryByRole } = render(<ProgressBar progress={0.5} />);
    expect(queryByRole("adjustable")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `jest src/components/ui/__tests__/ProgressBar.a11y.test.tsx`
Expected: FAIL — no adjustable role.

- [ ] **Step 3: Implement.** In `ProgressBar.tsx`:

Add import: `import { translate } from "@/i18n";` and add `AccessibilityActionEvent` to the `react-native` import list.

Add above the `return` (after `panResponder`):

```tsx
// VoiceOver/TalkBack cannot perform pan gestures. The "adjustable" role lets
// swipe-up/down fire increment/decrement; we seek by a fixed step and reuse
// the same onSeekComplete path the pan responder uses.
const a11ySeekStep = currentTime !== undefined ? 30 : seekRange * 0.05;
const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
  if (!interactive) return;
  const base = currentTime !== undefined ? currentTime : progress * seekMaxValue;
  const delta = event.nativeEvent.actionName === "increment" ? a11ySeekStep : -a11ySeekStep;
  const next = Math.max(minValue, Math.min(seekMaxValue, base + delta));
  onSeekComplete?.(next);
};

const a11yValueText =
  currentTime !== undefined && duration !== undefined
    ? `${formatTime(displayTime)} of ${formatTime(duration)}`
    : `${Math.round(progressPercentage * 100)}%`;
```

On the inner touch-area `View` (the one currently spreading `panResponder.panHandlers`, ~line 198), add:

```tsx
        {...(interactive
          ? {
              accessible: true,
              accessibilityRole: "adjustable" as const,
              accessibilityLabel: translate("accessibility.playbackPosition"),
              accessibilityValue: {
                min: 0,
                max: 100,
                now: Math.round(progressPercentage * 100),
                text: a11yValueText,
              },
              accessibilityActions: [
                { name: "increment" as const },
                { name: "decrement" as const },
              ],
              onAccessibilityAction: handleAccessibilityAction,
            }
          : {})}
```

- [ ] **Step 4: Run tests**

Run: `jest src/components/ui/__tests__/ProgressBar.a11y.test.tsx && jest --findRelatedTests src/components/ui/ProgressBar.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ProgressBar.tsx src/components/ui/__tests__/ProgressBar.a11y.test.tsx
git commit -m "feat(a11y): make interactive ProgressBar an adjustable element with seek actions"
```

---

### Task 8: Hide CoverImage from assistive technology

**Files:**

- Modify: `src/components/ui/CoverImage.tsx`

Covers are decorative — the adjacent text carries the information, and the badges (download arrow, "Partial", offline) get folded into parent-row labels in Tasks 9–10. Announcing them separately is pure noise.

- [ ] **Step 1: Implement.** On the outer `View` in `CoverImage.tsx`:

```tsx
    <View
      // Decorative: parent rows compose title/download state into their own label
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
      style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
    >
```

(`accessibilityElementsHidden` is iOS, `importantForAccessibility` is Android — both are needed.)

- [ ] **Step 2: Typecheck + related tests, commit**

Run: `npx tsc --noEmit && jest --findRelatedTests src/components/ui/CoverImage.tsx`

```bash
git add src/components/ui/CoverImage.tsx
git commit -m "feat(a11y): hide decorative cover images from screen readers"
```

---

### Task 9: Collapse FloatingPlayer into labeled elements

**Files:**

- Modify: `src/components/ui/FloatingPlayer.tsx`

- [ ] **Step 1: Implement.** Add import: `import { translate } from "@/i18n";`

On the main `Pressable` (~line 87), collapse and label:

```tsx
      <Pressable
        style={componentStyles.pressableArea}
        onPress={handlePlayerPress}
        testID="floating-player"
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={translate("accessibility.nowPlaying", {
          title: currentTrack?.title ?? "",
          chapter: chapterTitle,
          progress: formatProgress(progressFormat, position, currentTrack?.duration ?? 0),
        })}
        accessibilityHint={translate("accessibility.openFullPlayer")}
      >
```

`accessible={true}` collapses the cover, title, and progress `Text` children into this single element; the label recomposes what they showed. The `PlayPauseButton` and `AirPlayButton` siblings remain separate stops (correct — they're distinct actions).

Note: the label includes the live position. VoiceOver reads the value at focus time and does not re-announce on each 1 Hz store tick, so this is safe.

- [ ] **Step 2: Typecheck + related tests, commit**

Run: `npx tsc --noEmit && jest --findRelatedTests src/components/ui/FloatingPlayer.tsx`

```bash
git add src/components/ui/FloatingPlayer.tsx
git commit -m "feat(a11y): collapse mini player into a single labeled control"
```

---

### Task 10: Collapse list rows and cards; chapter selected-state

**Files:**

- Modify: `src/components/home/Item.tsx`
- Modify: `src/components/home/CoverItem.tsx`
- Modify: `src/components/player/ChapterList.tsx`
- Modify: `src/components/library/LibraryItemDetail/ChapterList.tsx` (same row pattern — apply the identical props)

- [ ] **Step 1: Implement `home/Item.tsx`.** Replace the current props on the `Pressable`:

```tsx
    <Pressable
      onPress={() => router.push(`/home/item/${item.id}`)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={[
        item.title,
        item.authorName,
        item.seriesName,
        item.progress !== undefined && item.progress > 0
          ? translate("accessibility.percentFinished", { percent: Math.round(item.progress * 100) })
          : undefined,
      ]
        .filter(Boolean)
        .join(", ")}
      accessibilityHint={translate("accessibility.openItemDetails")}
    >
```

Add import: `import { translate } from "@/i18n";`
The previous `accessibilityHint={`Open details for ${item.title}`}` (hardcoded English, title in the hint instead of the label) is removed by this change.

- [ ] **Step 2: Implement `home/CoverItem.tsx`** — same pattern on its `Pressable` (title, author, optional percent; same hint). Repeat the full block, adjusting for that file's fields.

- [ ] **Step 3: Implement chapter rows.** In `src/components/player/ChapterList.tsx` (`TouchableOpacity` at ~line 113) add:

```tsx
        <TouchableOpacity
          onPress={() => onChapterPress(item.start)}
          accessible={true}
          accessibilityRole="button"
          accessibilityState={{ selected: isCurrentChapter }}
          accessibilityLabel={
            translate("accessibility.chapterRow", {
              title: item.title,
              duration: formatTime(chapterDuration),
            }) + (isCurrentChapter ? `, ${translate("accessibility.currentChapter")}` : "")
          }
          style={{ ... /* unchanged */ }}
        >
```

Add import: `import { translate } from "@/i18n";`. Apply the identical props to the row in `src/components/library/LibraryItemDetail/ChapterList.tsx` (adjust variable names to that file's renderItem).

- [ ] **Step 4: Typecheck + related tests**

Run: `npx tsc --noEmit && jest --findRelatedTests src/components/home/Item.tsx src/components/player/ChapterList.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/Item.tsx src/components/home/CoverItem.tsx src/components/player/ChapterList.tsx src/components/library/LibraryItemDetail/ChapterList.tsx
git commit -m "feat(a11y): collapse rows into single labeled elements; announce current chapter"
```

---

### Task 11: Login form labels and error announcement

**Files:**

- Modify: `src/app/login.tsx`

- [ ] **Step 1: Implement.** Add `AccessibilityInfo` to the `react-native` import list. Add an `accessibilityLabel` to each `TextInput` (~lines 150–183):

```tsx
        <TextInput
          testID="login-server-url-input"
          accessibilityLabel={translate("accessibility.serverUrl")}
          ...
        <TextInput
          testID="login-username-input"
          accessibilityLabel={translate("accessibility.username")}
          ...
        <TextInput
          testID="login-password-input"
          accessibilityLabel={translate("accessibility.password")}
          ...
```

Make the error line a live region and announce it when set — on the error `Text` (~line 185):

```tsx
{
  error ? (
    <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
      {error}
    </Text>
  ) : null;
}
```

And wherever `setError(...)` is called with a non-empty message in this file, follow it with:

```tsx
AccessibilityInfo.announceForAccessibility(message);
```

(`accessibilityLiveRegion` covers Android; `announceForAccessibility` covers iOS, where RN has no live-region support.)

- [ ] **Step 2: Typecheck + related tests, commit**

Run: `npx tsc --noEmit && jest --findRelatedTests src/app/login.tsx`

```bash
git add src/app/login.tsx
git commit -m "feat(a11y): label login inputs and announce login errors"
```

---

### Task 12: FullScreenPlayer chrome — chevron, gear, prompt modal

**Files:**

- Modify: `src/app/FullScreenPlayer/index.tsx`

- [ ] **Step 1: Implement.** Three groups of unlabeled `TouchableOpacity`s:

Header row (after the drag pill, ~line 520+): the chevron-dismiss button gets

```tsx
          accessibilityRole="button"
          accessibilityLabel={translate("accessibility.closePlayer")}
```

and the gear/settings `MenuView` anchor gets

```tsx
          accessibilityRole="button"
          accessibilityLabel={translate("accessibility.playerSettings")}
```

Prompt modal (Cancel/Save, ~lines 485–500):

```tsx
                <TouchableOpacity
                  onPress={() => setShowPromptModal(false)}
                  style={{ padding: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={translate("accessibility.cancel")}
                >
```

```tsx
                <TouchableOpacity
                  onPress={() => { ... /* unchanged save handler */ }}
                  style={{ padding: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={translate("accessibility.save")}
                >
```

Also label the modal's `TextInput`: the modal renders a title `Text` above the input — pass the same string variable it renders as the input's `accessibilityLabel`.

The drag pill `View` needs no props (decorative; the chevron is the accessible dismissal path). If `translate` is not already imported in this file, add `import { translate } from "@/i18n";`.

- [ ] **Step 2: Typecheck + related tests, commit**

Run: `npx tsc --noEmit && jest --findRelatedTests src/app/FullScreenPlayer/index.tsx`

```bash
git add src/app/FullScreenPlayer/index.tsx
git commit -m "feat(a11y): label full-screen player chrome and prompt modal"
```

---

### Task 13: Dynamic Type — min-heights and scale caps in pinned chrome

**Files:**

- Modify: `src/lib/styles.ts`
- Modify: `src/components/ui/FloatingPlayer.tsx`

Policy: content screens scale freely (no changes needed — they're already in scrollable containers). Only **pinned chrome** with fixed geometry gets adjusted: the mini player.

- [ ] **Step 1: Make the mini player height scale-aware.** In `src/lib/styles.ts`, replace the `floatingPlayer` constants (~line 27):

```typescript
import { PixelRatio } from "react-native";

// Cap chrome scaling at 1.5x: below this, text scales with the OS setting;
// above it, the mini player would collide with the tab bar.
const chromeFontScale = Math.min(PixelRatio.getFontScale(), 1.5);

export const floatingPlayer = {
  /** Height of the floating mini player (grows with OS font scale, capped) */
  height: Math.round(64 * Math.max(1, chromeFontScale * 0.85)),
  /** Bottom offset above tab bar */
  bottomOffset: 100,
  /** Padding to add to scrollable lists when player is visible */
  listPadding: Math.round(84 * Math.max(1, chromeFontScale * 0.85)),
};
```

(`PixelRatio.getFontScale()` is fixed for an app session on iOS — a module-level constant is fine; that's why this stays a plain object rather than a hook.)

- [ ] **Step 2: Cap text scaling inside the mini player.** In `FloatingPlayer.tsx`, on both `Text` elements (chapter title ~line 103 and progress ~line 106), and change the container's `height` to `minHeight`:

```tsx
          <Text style={[styles.text, componentStyles.chapterTitle]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
```

```tsx
          <Text style={[styles.text, componentStyles.progressText]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
```

```tsx
  container: {
    ...
    minHeight: floatingPlayer.height,   // was: height
    ...
  },
```

- [ ] **Step 3: Typecheck + related tests, commit**

Run: `npx tsc --noEmit && jest --findRelatedTests src/components/ui/FloatingPlayer.tsx src/lib/styles.ts`

```bash
git add src/lib/styles.ts src/components/ui/FloatingPlayer.tsx
git commit -m "feat(a11y): scale mini-player chrome with Dynamic Type, capped at 1.5x"
```

---

### Task 14: Respect Reduce Motion globally

**Files:**

- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Implement.** Reanimated animations ignore the OS Reduce Motion setting by default (`ReduceMotion.Never`). One config element flips the default app-wide. Add to the imports of `src/app/_layout.tsx`:

```tsx
import { ReducedMotionConfig, ReduceMotion } from "react-native-reanimated";
```

Inside the root `View` returned at ~line 347 (first child, alongside the providers):

```tsx
<View style={{ flex: 1 }} onLayout={onLayoutRootView}>
  <ReducedMotionConfig mode={ReduceMotion.System} />
  {/* ...existing children unchanged... */}
</View>
```

- [ ] **Step 2: Verify in simulator.** Settings → Accessibility → Motion → Reduce Motion ON; open FullScreenPlayer — the reanimated `withTiming` transitions should snap instead of animate. (No automated test: this is a runtime native-module behavior.)

- [ ] **Step 3: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat(a11y): respect the OS Reduce Motion setting for all animations"
```

---

### Task 15: Full-suite verification and manual VoiceOver pass

- [ ] **Step 1: Run the entire suite**

Run: `npm test`
Expected: all suites PASS.

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Manual VoiceOver checklist** (iOS simulator: Settings → Accessibility → VoiceOver, or Accessibility Inspector in Xcode):

1. Tab bar: each tab announces its name + "tab" + selected state. _(pre-existing, regression check)_
2. Home: each card is ONE swipe stop announcing "title, author, series, N% finished — button".
3. Mini player: one stop — "Now playing: …, button", hint "Open full screen player"; play/pause announces "Play"/"Pause".
4. Full player: seek bar focusable, announces "Playback position, adjustable, MM:SS of H:MM:SS"; swipe up/down seeks ±30 s; skip buttons announce direction + seconds; speed/sleep anchors announce label + current value; chevron announces "Close player".
5. Chapter list: rows announce title + duration; current chapter adds "selected/current chapter".
6. Settings: toggles announce label + "switch" + on/off; double-tap flips them.
7. Login: each field announces its label; a failed login announces the error.
8. Dynamic Type at largest non-a11y size: mini player doesn't clip; lists reflow.
9. Reduce Motion ON: player transitions snap.

- [ ] **Step 3: Commit any fixups, then hand off** per superpowers:finishing-a-development-branch.

---

## Out of scope (follow-up candidates)

- `announceForAccessibility` for download completion / sync status (needs product wording decisions).
- `AppStatusIndicators` iOS announcement parity (has Android `accessibilityLiveRegion` only).
- Labeling the remaining `more/` diagnostic screens (logs, trace dumps, storage) — low-traffic dev tooling; same label pattern as Task 5 when picked up.
- Color-contrast audit (separate concern from VoiceOver).
- `SortMenu` / `LibraryPicker` modal dismiss affordances.
