# Phase 15: Collapsible Section Redesign - Research

**Researched:** 2026-03-09
**Domain:** React Native Reanimated 4 height animation, expo-linear-gradient overlay, collapsible UI
**Confidence:** HIGH

## Summary

Phase 15 is a focused rewrite of `CollapsibleSection` — a single file used in four integration points. The existing implementation has two bugs: a broken height interpolation (outputs [0,1] to [0,1], so height never actually changes) and conditional child mounting (`{isExpanded && ...}`) that causes the disappearing-children flash. The rewrite fixes both by using Reanimated `withTiming` for smooth UI-thread height animation and keeping children always mounted with `overflow: 'hidden'` on the animated container.

The core animation pattern is well-established in Reanimated 4: measure real content height via `onLayout`, store it in a shared value, and animate an outer container's height between `PEEK_HEIGHT` (100px) and the measured full height. A second shared value drives the gradient opacity (1 when collapsed, 0 when expanded), both animated in the same toggle handler.

The CONTEXT.md decisions are highly specific and leave almost nothing to explore. The planner's job is converting those decisions directly into implementation tasks rather than choosing between approaches.

**Primary recommendation:** Implement in a single task. Rewrite `CollapsibleSection.tsx` with Reanimated + expo-linear-gradient; follow the `onLayout → withTiming` accordion pattern from Reanimated official docs; update the four call sites as listed in CONTEXT.md.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Gradient fade implementation:**

- Use `expo-linear-gradient` — install it (already part of Expo SDK, safe and well-supported)
- Gradient is an absolute overlay at the bottom of the clipped content container
- Gradient fades to true transparent (not background color) — works on any background
- On expand: animate gradient opacity 1→0 alongside height animation on UI thread
- On collapse: animate gradient opacity 0→1 as height shrinks back

**Short-content handling:**

- Measure content height via `onLayout` before animating
- If measured content height ≤ 100px: show full content, no clamp, no fade overlay
- If content fits within 100px: section is not collapsible — no toggle rendered, content shown as-is
- Peek height is fixed at 100px for all sections (no per-section config)
- Sections that return `null` when empty (AudioFilesSection, BookmarksSection) — no change needed

**Toggle affordance:**

- Rule: `title` prop presence determines the interaction model
  - With header (title provided) → tap the header row only to expand/collapse; content area is not a tap target
  - Without header (title omitted, e.g., DescriptionSection) → tap anywhere in the section to expand/collapse
- No "Show more" / "Show less" buttons — none
- No state persistence across navigation — sections reset to `defaultExpanded` on each visit

**DescriptionSection (no header):**

- `title` prop omitted — no header row rendered
- In collapsed/peek state: the gradient fade itself signals "tap to see more"
- In expanded state: tap anywhere on the content to re-collapse
- Whether DescriptionSection uses `defaultExpanded={true}` or `defaultExpanded={false}` — Claude's discretion

**Sections with interactive children (ChapterList, BookmarksSection):**

- Header-only toggle: interactive children (seek-to-chapter, delete-bookmark) must not be blocked by a parent Pressable
- AudioFilesSection has display-only rows — header-only toggle for consistency

**Header visual style:**

- No background fill — header renders directly on the screen background (removes the #333 / #f5f5f5 box)
- Icon: `Ionicons` `chevron-forward` rotates 90° (pointing right = collapsed, pointing down = expanded) — animation on the UI thread via Reanimated
- Typography: 16px, `fontWeight: '500'` (down from current 18px / 600)
- Separator: spacing only between header and content (no horizontal rule). If spacing alone feels insufficient on device, a thin separator line (1px, theme border color) is the documented fallback.

**API changes:**

- `title` becomes optional (`title?: string`)
- `icon` prop removed (replaced by Ionicons chevron)
- `defaultExpanded` stays

### Claude's Discretion

- Whether DescriptionSection uses `defaultExpanded={true}` or `defaultExpanded={false}` — pick based on what feels right for content discovery in a collapsed-peek context
- Exact animation duration for height and opacity (suggested: ~250–300ms)
- Exact padding/spacing between header and peek content
- Whether the gradient height is fixed (e.g., 48px) or proportional to peek height

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
  </user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID         | Description                                                                                                | Research Support                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| SECTION-01 | Collapsed sections show approximately the first 100px of content with a bottom fade-to-transparent overlay | expo-linear-gradient absolute overlay; peek height = 100px; gradient opacity animated via Reanimated                                                  |
| SECTION-02 | Expanding/collapsing sections animate height on the UI thread (Reanimated withTiming)                      | Reanimated accordion pattern: `onLayout` measures full height → `withTiming` animates shared value → `useAnimatedStyle` drives `Animated.View` height |
| SECTION-03 | Expanded sections show full content with no bottom fade                                                    | Gradient opacity animates to 0 in sync with height expansion; `overflow: 'hidden'` removed (or height = measured) so content is fully visible         |

</phase_requirements>

---

## Standard Stack

### Core

| Library                       | Version                               | Purpose                              | Why Standard                                                  |
| ----------------------------- | ------------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| react-native-reanimated       | ~4.1.1 (installed)                    | UI-thread height + opacity animation | Already in project; project convention (tab-bar-settings.tsx) |
| expo-linear-gradient          | SDK 54 compatible (not yet installed) | Fade-to-transparent bottom overlay   | Expo SDK native — no native rebuild needed; decision locked   |
| @expo/vector-icons (Ionicons) | ^15.0.2 (installed)                   | chevron-forward indicator            | Already used throughout app                                   |

### Supporting

| Library                                   | Version | Purpose                                  | When to Use                                                                |
| ----------------------------------------- | ------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| react-native-reanimated `useDerivedValue` | ~4.1.1  | Derive animated height from shared value | Optional — can use `useAnimatedStyle` with `withTiming` directly (simpler) |

### Alternatives Considered

| Instead of                        | Could Use                                    | Tradeoff                                                                                                                |
| --------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `onLayout` measure + `withTiming` | `LinearTransition` with `height: 'auto'` → 0 | LinearTransition is cleaner but requires all affected siblings to carry `layout` prop; harder to add peek stop at 100px |
| expo-linear-gradient              | `react-native-linear-gradient`               | Same API, but `expo-linear-gradient` is the Expo SDK package — use it                                                   |

**Installation:**

```bash
npx expo install expo-linear-gradient
```

---

## Architecture Patterns

### Recommended Component Structure

```
CollapsibleSection (rewritten)
├── Outer wrapper View (marginBottom: 16)
│
├── [If title provided] Header Pressable (header-only toggle)
│   ├── Text (title, 16px/500)
│   └── Animated.View (Ionicons chevron-forward, rotates 0°↔90°)
│
├── [If no title] Pressable wrapping everything below (tap-anywhere toggle)
│
├── Animated.View (height: animated shared value, overflow: 'hidden')
│   ├── Inner View (onLayout → measures full content height)
│   │   └── {children} (always mounted)
│   └── [If isCollapsible] LinearGradient (absolute, bottom: 0, opacity: animated)
│
└── [hidden offscreen measuring view — only before first layout measurement]
```

### Pattern 1: onLayout → withTiming Accordion

**What:** Measure real content height via `onLayout`, then animate between peek height and measured height using `withTiming`.

**When to use:** Any time content height is unknown at render time (text, dynamic lists).

**Source:** Reanimated official accordion example — https://docs.swmansion.com/react-native-reanimated/examples/accordion/

```typescript
// Source: https://docs.swmansion.com/react-native-reanimated/examples/accordion/
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const PEEK_HEIGHT = 100;
const ANIMATION_DURATION = 280; // Claude's discretion: ~250–300ms

// Shared values
const measuredHeight = useSharedValue(0);   // set by onLayout
const isExpandedSV = useSharedValue(defaultExpanded ? 1 : 0);
const gradientOpacity = useSharedValue(defaultExpanded ? 0 : 1);

// Animated styles
const containerStyle = useAnimatedStyle(() => ({
  height: withTiming(
    isExpandedSV.value === 1
      ? measuredHeight.value          // full height
      : Math.min(PEEK_HEIGHT, measuredHeight.value), // peek or full if short
    { duration: ANIMATION_DURATION }
  ),
}));

const gradientStyle = useAnimatedStyle(() => ({
  opacity: withTiming(gradientOpacity.value, { duration: ANIMATION_DURATION }),
}));

const chevronStyle = useAnimatedStyle(() => ({
  transform: [{
    rotate: withTiming(
      isExpandedSV.value === 1 ? '90deg' : '0deg',
      { duration: ANIMATION_DURATION }
    ),
  }],
}));

// Toggle handler
const toggle = () => {
  const expanding = isExpandedSV.value === 0;
  isExpandedSV.value = expanding ? 1 : 0;
  gradientOpacity.value = expanding ? 0 : 1;
};

// JSX structure
<Animated.View style={[{ overflow: 'hidden' }, containerStyle]}>
  <View
    onLayout={(e) => {
      const h = e.nativeEvent.layout.height;
      if (measuredHeight.value === 0) {
        measuredHeight.value = h;
        // If shorter than peek, start "expanded" immediately (no animation needed)
      }
    }}
  >
    {children}
  </View>
  {isCollapsible && (
    <Animated.View
      style={[
        { position: 'absolute', bottom: 0, left: 0, right: 0, height: 48 },
        gradientStyle,
      ]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={['transparent', colors.background]}
        style={{ flex: 1 }}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
    </Animated.View>
  )}
</Animated.View>
```

> **Note on gradient colors:** The user decision says "true transparent" so the gradient should be from `'transparent'` to `'transparent'` at both ends... actually the intent is a fade from fully-visible content TO transparent (so reading goes: content shows at top, fades away at bottom). Use `colors={['transparent', colors.background]}` directed bottom-up — see Anti-Patterns below for the correct orientation.

### Pattern 2: Short-Content Guard

**What:** After `onLayout` fires and `measuredHeight` is set, if `measuredHeight ≤ PEEK_HEIGHT`, mark `isCollapsible = false` — no toggle rendered, no gradient, section shows full height as static layout.

**Implementation:** Use a React state boolean `isCollapsible` (set once in `onLayout`). Keep children always mounted. When `isCollapsible = false`, render a plain `View` instead of `Animated.View`.

```typescript
const [isCollapsible, setIsCollapsible] = useState(false);
const [layoutMeasured, setLayoutMeasured] = useState(false);

const handleLayout = (e: LayoutChangeEvent) => {
  if (layoutMeasured) return; // measure only once
  const h = e.nativeEvent.layout.height;
  measuredHeight.value = h;
  setLayoutMeasured(true);
  if (h > PEEK_HEIGHT) {
    setIsCollapsible(true);
  }
};
```

### Pattern 3: Title-Conditional Toggle Model

**What:** `title` prop presence selects the interaction model without branching the child tree.

```typescript
// With header: Pressable wraps only the header row
// Without header: outer container becomes a Pressable
{title ? (
  <>
    <Pressable onPress={toggle}>
      {/* header row */}
    </Pressable>
    <AnimatedContainer>{children}</AnimatedContainer>
  </>
) : (
  <Pressable onPress={toggle}>
    <AnimatedContainer>{children}</AnimatedContainer>
  </Pressable>
)}
```

### Anti-Patterns to Avoid

- **Conditional child mounting `{isExpanded && children}`:** Causes remount flash. Keep children always mounted, use `overflow: 'hidden'` + animated height to show/hide.
- **`useNativeDriver: false` with RN core Animated:** This runs on JS thread. Reanimated `withTiming` runs on UI thread — that's the whole point of this migration.
- **Gradient from background color to transparent:** Only works on solid backgrounds. Use `'transparent'` as one stop so the gradient works on any background.
- **Animating height before `onLayout` fires:** Initialize `measuredHeight` to 0, gate animations on `layoutMeasured` state being `true`.
- **Wrapping interactive children (chapters, bookmark delete) in a Pressable:** Header-only toggle model exists precisely to avoid blocking interactive children.
- **Using `useDerivedValue` multiplication trick (height × isExpanded boolean):** That multiplies by 0 to collapse, meaning peek state is not achievable. Use direct `withTiming` to PEEK_HEIGHT instead.

---

## Don't Hand-Roll

| Problem               | Don't Build                                     | Use Instead                  | Why                                                                |
| --------------------- | ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| Gradient fade overlay | Custom opacity/mask compositing                 | `expo-linear-gradient`       | Native gradient, transparent-aware, SDK-included                   |
| UI-thread animation   | `Animated.timing` with `useNativeDriver: false` | `withTiming` from Reanimated | JS-thread animations jank; Reanimated runs on UI thread            |
| Height measurement    | `UIManager.measure` / `ref.measure` callback    | `onLayout` prop              | `onLayout` is synchronous with layout pass; simpler, no ref needed |

**Key insight:** The current component hand-rolls height animation with the core Animated API on the JS thread AND has a broken interpolation. Reanimated replaces all of this with a well-tested primitive.

---

## Common Pitfalls

### Pitfall 1: Gradient Direction Confusion

**What goes wrong:** `LinearGradient` `start`/`end` props use fraction coordinates (0,0) = top-left, (1,1) = bottom-right. A vertical gradient fading content at the bottom should be `start={{x:0, y:0}}` → `end={{x:0, y:1}}` with colors `['transparent', someColor]` or better: fade-from-content means the TOP of the gradient is transparent (showing content) and the BOTTOM is the actual fade. Since the decision says "true transparent" (not background color), use `colors={['transparent', 'transparent']}` won't work — you need a semi-opaque or opaque stop to actually hide content below the peek.

**Correct interpretation:** The gradient purpose is to visually mask the bottom of the peeked content so it fades out instead of hard-cutting. Use: `colors={['transparent', colors.background]}` with `start={{x:0, y:0}}` `end={{x:0, y:1}}`. This will work on a solid background. If the background changes, update `colors.background`. The user decision says "true transparent" meaning the TOP of the gradient should be transparent (not the bottom stop).

**Warning signs:** Content below 100px is abruptly cut or the gradient looks reversed.

### Pitfall 2: onLayout Fires Multiple Times

**What goes wrong:** `onLayout` is called whenever the layout changes — including when children rerender (e.g., ChapterList toggling "show played chapters" updates child count). If you blindly update `measuredHeight` on every call, you'll get incorrect animations during dynamic child updates.

**How to avoid:** Guard with `if (layoutMeasured) return` — only capture the first measurement. ChapterList's chapter-show/hide behavior means its content height can vary; the first layout measurement is the baseline. Accept this limitation for now (the section won't re-measure after child updates).

**Alternative:** Re-measure every time but set `measuredHeight.value` without animation and don't trigger a toggle — only toggle on user interaction. This is safe because `measuredHeight.value = h` without `withTiming` is an instant update.

### Pitfall 3: Pressable Blocking Interactive Children

**What goes wrong:** If the entire section (including content) is wrapped in a `Pressable` for the no-title (DescriptionSection) tap-anywhere model, interactive children inside would still fire their own handlers — EXCEPT if `pointerEvents` propagation is misconfigured or a gesture conflict occurs.

**How to avoid:** DescriptionSection has no interactive children (it renders RenderHtml which is display-only). The header-only toggle (ChapterList, BookmarksSection, AudioFilesSection) must NOT wrap content in a Pressable. The title-conditional render structure handles this correctly.

### Pitfall 4: Gradient Overlay Blocking Touches on Content

**What goes wrong:** The `LinearGradient` absolute overlay sits on top of content. If it captures touches, it will block interactive children (e.g., chapter tap targets) even when expanded.

**How to avoid:** Set `pointerEvents="none"` on the gradient `Animated.View` wrapper. The gradient is visual only.

### Pitfall 5: Animated.View Height = 0 Before Layout

**What goes wrong:** On first render, `measuredHeight.value = 0`, so the initial animated height will be `Math.min(100, 0) = 0`, making content invisible until `onLayout` fires.

**How to avoid:** For `defaultExpanded={true}`, initialize the container height to `undefined` (auto) and switch to the animated height only after `layoutMeasured = true`. Or initialize `measuredHeight` to a large sentinel value (e.g., 9999) and accept a brief relayout. Simplest: render content with no height constraint until `layoutMeasured`, then switch.

**Recommended approach:** Two-phase render:

1. First render: content in a plain `View` (no height constraint) so `onLayout` fires and measures.
2. After measurement: switch to `Animated.View` with correct starting height.
   This may cause a brief layout shift but only on first render (acceptable).

### Pitfall 6: React Compiler + Reanimated Worklet Compatibility

**What goes wrong:** React 19.1.0 + React Compiler may optimize away worklet closures or memoize things that Reanimated needs to remain reactive.

**How to avoid:** The existing `tab-bar-settings.tsx` already uses `useSharedValue` + `useAnimatedStyle` + `runOnJS` without issues, confirming the current Reanimated 4.1.1 / React 19.1.0 combination works for this project. Follow the same patterns exactly — no new Reanimated features beyond what's already used.

---

## Code Examples

Verified patterns from official sources and existing project code:

### Reanimated withTiming (Established Project Pattern)

```typescript
// Source: src/app/(tabs)/more/tab-bar-settings.tsx (existing project code)
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from "react-native-reanimated";

const animValue = useSharedValue(0);

const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateY: animValue.value }],
}));
```

### Height Animation to Known Value

```typescript
// Source: https://docs.swmansion.com/react-native-reanimated/examples/accordion/
// Pattern: measured height × boolean
const height = useSharedValue(0);

const bodyStyle = useAnimatedStyle(() => ({
  height: withTiming(
    isExpanded ? height.value : PEEK_HEIGHT,
    { duration: 280 }
  ),
}));

// onLayout sets height.value = measured content height
<View onLayout={(e) => { height.value = e.nativeEvent.layout.height; }}>
  {children}
</View>
```

### expo-linear-gradient Fade Overlay

```typescript
// Source: https://docs.expo.dev/versions/latest/sdk/linear-gradient/
import { LinearGradient } from 'expo-linear-gradient';

// Vertical fade from transparent (top) to background (bottom)
<LinearGradient
  colors={['transparent', colors.background]}
  start={{ x: 0, y: 0 }}
  end={{ x: 0, y: 1 }}
  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 48 }}
  pointerEvents="none"
/>
```

### Chevron Rotation (Established Pattern)

```typescript
// Rotate chevron: 0° = collapsed (pointing right), 90° = expanded (pointing down)
const chevronStyle = useAnimatedStyle(() => ({
  transform: [{
    rotate: withTiming(
      isExpandedSV.value === 1 ? '90deg' : '0deg',
      { duration: 280 }
    ),
  }],
}));

<Animated.View style={chevronStyle}>
  <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
</Animated.View>
```

---

## State of the Art

| Old Approach                                          | Current Approach                                               | When Changed                 | Impact                                        |
| ----------------------------------------------------- | -------------------------------------------------------------- | ---------------------------- | --------------------------------------------- |
| RN core `Animated` + `useNativeDriver: false`         | Reanimated `withTiming` on UI thread                           | Reanimated 2+                | No JS-thread blocking during height animation |
| Conditional child mounting `{isExpanded && children}` | Always-mounted children + `overflow: hidden` + animated height | Reanimated accordion pattern | Eliminates remount flash                      |
| Manual height interpolation `[0,1] → [0,1]` (bug)     | Direct height value animation with `withTiming`                | —                            | Fixes the broken collapse animation           |

**Deprecated/outdated:**

- `Animated.timing` with `useNativeDriver: false` for layout animations: Still works but runs on JS thread. Reanimated is the standard for this project going forward (per CONTEXT.md).

---

## Open Questions

1. **Gradient colors on non-solid backgrounds**
   - What we know: `colors={['transparent', colors.background]}` works on solid backgrounds
   - What's unclear: If LibraryItemDetail ever has a gradient/image background, the fade won't match
   - Recommendation: Use `colors.background` for now — it matches the current screen. Document as a known limitation in code comments.

2. **ChapterList dynamic height after "show played chapters" toggle**
   - What we know: ChapterList has an internal toggle that adds rows, changing content height after first mount
   - What's unclear: Does the `CollapsibleSection` need to re-measure after internal child updates?
   - Recommendation: Accept first-measurement-only for this phase. The section starts collapsed, so the first expansion shows whatever height the expanded content is. If ChapterList shows more chapters, the section will clip them. This is a known edge case and acceptable for now — document in code.

3. **DescriptionSection defaultExpanded value**
   - What we know: Claude's discretion per CONTEXT.md
   - Recommendation: Use `defaultExpanded={false}` — the peek state IS the discovery mechanic. Users see content teased with a fade, inviting them to tap. Starting expanded means the fade is never the first impression, defeating the purpose of the redesign.

---

## Validation Architecture

### Test Framework

| Property           | Value                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| Framework          | Jest 29.7 + jest-expo + React Native Testing Library 13.3                            |
| Config file        | `jest.config.js` (jest-expo preset)                                                  |
| Quick run command  | `jest --findRelatedTests src/components/ui/CollapsibleSection.tsx --passWithNoTests` |
| Full suite command | `npm test`                                                                           |

### Phase Requirements → Test Map

| Req ID     | Behavior                                                      | Test Type   | Automated Command                                                 | File Exists? |
| ---------- | ------------------------------------------------------------- | ----------- | ----------------------------------------------------------------- | ------------ |
| SECTION-01 | Gradient overlay renders when collapsed, hidden when expanded | unit        | `jest src/components/ui/__tests__/CollapsibleSection.test.tsx -x` | ❌ Wave 0    |
| SECTION-02 | Height animates via Reanimated (not JS thread)                | manual-only | N/A — Reanimated animations require device/simulator              | manual       |
| SECTION-03 | Expanded section shows full content, no gradient              | unit        | `jest src/components/ui/__tests__/CollapsibleSection.test.tsx -x` | ❌ Wave 0    |

**SECTION-02 manual-only justification:** `withTiming` UI-thread behavior cannot be meaningfully asserted in Jest (Reanimated mocks flatten animations). Verify by building to simulator: expand/collapse should be smooth with no frame drops.

### Sampling Rate

- **Per task commit:** `jest --findRelatedTests src/components/ui/CollapsibleSection.tsx --passWithNoTests`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/components/ui/__tests__/CollapsibleSection.test.tsx` — covers SECTION-01 (gradient visible when collapsed), SECTION-03 (no gradient when expanded), short-content guard (no toggle rendered when content ≤ 100px), always-mounted children (no remount on toggle)
- [ ] `jest --findRelatedTests` will need the test file to exist before it finds anything

_(No framework install needed — Jest + RNTL already present)_

---

## Integration Points Summary

All four call sites confirmed from source code:

| File                     | Current Props                                          | Change Needed                                            |
| ------------------------ | ------------------------------------------------------ | -------------------------------------------------------- |
| `DescriptionSection.tsx` | `title={translate(...)} defaultExpanded={true}`        | Remove `title` prop; change to `defaultExpanded={false}` |
| `ChapterList.tsx`        | `title={translate(..., {count})}`                      | No change to call site                                   |
| `AudioFilesSection.tsx`  | `title={translate(..., {count})}`                      | No change to call site                                   |
| `BookmarksSection.tsx`   | `title={\`Bookmarks (${n})\`} defaultExpanded={false}` | No change to call site                                   |

---

## Sources

### Primary (HIGH confidence)

- Reanimated official accordion example — https://docs.swmansion.com/react-native-reanimated/examples/accordion/ — accordion pattern with `onLayout` + `withTiming`
- Reanimated useAnimatedStyle docs — https://docs.swmansion.com/react-native-reanimated/docs/core/useAnimatedStyle — API reference
- Expo LinearGradient docs — https://docs.expo.dev/versions/latest/sdk/linear-gradient/ — `colors`, `start`, `end` props
- Project source: `src/app/(tabs)/more/tab-bar-settings.tsx` — established Reanimated pattern (HIGH confidence, directly verified)
- Project source: `src/components/ui/CollapsibleSection.tsx` — existing bugs confirmed (broken interpolation, conditional mount)

### Secondary (MEDIUM confidence)

- Reanimated discussion #2918 — https://github.com/software-mansion/react-native-reanimated/discussions/2918 — alternate pattern (`LinearTransition` with `height: 'auto'`) considered and rejected
- WebSearch: expo-linear-gradient Expo SDK 54 install — `npx expo install expo-linear-gradient` confirmed

### Tertiary (LOW confidence)

- None — all key claims verified from official sources or project code

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions from package.json, packages confirmed installed/available
- Architecture: HIGH — Reanimated accordion pattern from official docs; project pattern confirmed in tab-bar-settings.tsx
- Pitfalls: HIGH — most identified from reading the existing buggy implementation and official docs

**Research date:** 2026-03-09
**Valid until:** 2026-09-09 (Reanimated 4 API is stable; expo-linear-gradient API rarely changes)
