# Phase 15: Collapsible Section Redesign - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the existing `Animated`-based `CollapsibleSection` with a Reanimated implementation that shows a ~100px peek with a fade-to-transparent gradient when collapsed, animates height smoothly on the UI thread, and keeps children always mounted (no disappearing flash). This is also the Reanimated probe for Phase 16 (FullScreenPlayer panel animations). AirPlay, bookmark UI, and any other screen-level features are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Gradient fade implementation

- Use **expo-linear-gradient** — install it (already part of the Expo SDK, safe and well-supported)
- Gradient is an **absolute overlay** at the bottom of the clipped content container
- Gradient fades to **true transparent** (not background color) — works on any background
- On expand: animate gradient **opacity 1→0** alongside the height animation on the UI thread
- On collapse: animate gradient **opacity 0→1** as height shrinks back

### Short-content handling

- Measure content height via `onLayout` before animating
- If measured content height **≤ 100px**: show full content, no clamp, no fade overlay
- If content fits within 100px: section is **not collapsible** — no toggle rendered, content shown as-is
- Peek height is **fixed at 100px** for all sections (no per-section config)
- Sections that return `null` when empty (AudioFilesSection, BookmarksSection) — no change needed

### Toggle affordance

- **Rule: `title` prop presence determines the interaction model**
  - **With header** (title provided) → tap the **header row only** to expand/collapse; content area is not a tap target
  - **Without header** (title omitted, e.g., DescriptionSection) → tap **anywhere in the section** to expand/collapse
- No "Show more" / "Show less" buttons — none
- No state persistence across navigation — sections reset to `defaultExpanded` on each visit

#### DescriptionSection (no header)

- `title` prop omitted — no header row rendered
- In collapsed/peek state: the **gradient fade itself** signals "tap to see more"
- In expanded state: **tap anywhere on the content** to re-collapse
- DescriptionSection switches from `defaultExpanded={true}` to `defaultExpanded={false}` so the peek is visible on first open (or keep `defaultExpanded={true}` — Claude's call based on what feels right for content discovery)

#### Sections with interactive children (ChapterList, BookmarksSection)

- Header-only toggle: interactive children (seek-to-chapter, delete-bookmark) must not be blocked by a parent Pressable
- AudioFilesSection has display-only rows — header-only toggle for consistency

### Header visual style

- **No background fill** — header renders directly on the screen background (removes the #333 / #f5f5f5 box)
- **Icon:** `Ionicons` `chevron-forward` rotates 90° (pointing right = collapsed, pointing down = expanded) — animation on the UI thread via Reanimated
- **Typography:** 16px, `fontWeight: '500'` (down from current 18px / 600 — lighter feel with the minimal style)
- **Separator:** Spacing only between header and content (no horizontal rule). If spacing alone feels insufficient on device, a thin separator line (1px, theme border color) is the documented fallback to try.

### Claude's Discretion

- Whether DescriptionSection uses `defaultExpanded={true}` or `defaultExpanded={false}` — pick based on what feels right for content discovery in a collapsed-peek context
- Exact animation duration for height and opacity (suggested: ~250–300ms)
- Exact padding/spacing between header and peek content
- Whether the gradient height is fixed (e.g., 48px) or proportional to peek height

</decisions>

<specifics>
## Specific Ideas

- The header design the user confirmed: `"Chapters (3)  ›"` — title on the left, chevron on the right, no background box
- The tap-anywhere model for DescriptionSection is intentional: the gradient fade acts as the affordance, same as native iOS "read more" patterns

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- `CollapsibleSection` (`src/components/ui/CollapsibleSection.tsx`): this is the file being replaced. Currently uses `Animated` API with `useNativeDriver: false`, broken height interpolation (outputs [0,1]→[0,1]), and conditionally mounts children (`{isExpanded && ...}` — the flash bug). Rewrite in-place.
- `Ionicons`: already used throughout the app — use `chevron-forward` for the collapse indicator
- `useThemedStyles` / `colors`: established theme hook for colors and styles — use for icon color, title color
- `react-native-reanimated` 4.1.1: already installed, established pattern in `tab-bar-settings.tsx` using `useSharedValue`, `useAnimatedStyle`, `runOnJS`

### Established Patterns

- Reanimated usage: `useSharedValue`, `useAnimatedStyle`, `withTiming` — see `tab-bar-settings.tsx` for project conventions
- `Animated.View` from Reanimated (not RN core) for height-animated container
- `onLayout` for measuring natural content height before deciding whether to clamp

### Integration Points

- `src/components/ui/CollapsibleSection.tsx` — rewrite this file; API changes:
  - `title` becomes optional (`title?: string`)
  - `icon` prop removed (replaced by Ionicons chevron)
  - `defaultExpanded` stays
- `src/components/ui/index.ts` — export is already there; no change
- `src/components/library/LibraryItemDetail/DescriptionSection.tsx` — remove `title` prop from `<CollapsibleSection>` call (or pass none); section becomes tap-anywhere
- `src/components/library/LibraryItemDetail/ChapterList.tsx` — keeps `title` prop → header-only toggle (no change to call site API)
- `src/components/library/LibraryItemDetail/AudioFilesSection.tsx` — keeps `title` prop → header-only toggle (no change to call site API)
- `src/components/library/LibraryItemDetail/BookmarksSection.tsx` — keeps `title` prop → header-only toggle (no change to call site API)
- `expo-linear-gradient`: add to `package.json` dependencies (SDK-native, no native module rebuild required for Expo managed workflow)

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

_Phase: 15-collapsible-section-redesign_
_Context gathered: 2026-03-09_
