# Phase 9: Navigation & UI Polish - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the More screen (navigation behavior, icons, visual affordance), add a shimmer skeleton to the home screen cold-start, and fix cover art missing from the lock screen on first install. No new capabilities — this phase makes existing screens look and feel correct.

</domain>

<decisions>
## Implementation Decisions

### More screen navigation

- Series and Authors only appear on the More screen when their corresponding tabs are **hidden** from the tab bar — there is no tab to switch to
- When tapped, Series and Authors should **push a screen** onto the More navigation stack (not tab-switch)
- **Current bug**: tapping Series or Authors does nothing — no navigation fires at all
- Settings, About Me, Leave Feedback, and Log out all remain as-is (push or action behavior unchanged)
- **Correction to roadmap**: NAV-01 and NAV-02 success criteria said "switches to the Series/Authors tab" — this was incorrect. The correct behavior is push navigation since the tabs are hidden.

### More screen visual design

- **Icon style**: Prefer native platform UI icons (SF Symbols on iOS); fall back to a common vector icon set (e.g., Ionicons from @expo/vector-icons) if native symbols are not readily available
- **List style**: Native platform style (iOS Settings-style grouped rows on iOS; equivalent Android pattern on Android)
- **Navigation rows** (Series, Authors, Settings): Show a chevron affordance indicating they navigate somewhere
- **Action rows** (Leave Feedback, Log out, About Me): No chevron; style as button or action target (visually distinct from nav rows)
- **Log out row**: Destructive styling — red text, following iOS convention
- Developer-only items follow the same pattern; their display is gated by existing developer settings flag

### Home screen skeleton

- **Shape**: Mirrors the real layout — horizontal scroll rows with section headers (shelf-style, like Apple TV / Plex)
- **Section count**: Cache the number of sections from the last session and show that many skeleton shelves on cold start. If no cached count (first ever launch), fall back to a fixed sensible default (Claude's discretion).
- **Animation**: Pulsing opacity fade (not left-to-right shimmer)
- **Transition**: Fade from skeleton to real content when data arrives
- **Trigger**: Skeleton appears only during cold start when no cached sections are available

### Cover art fallback

- **Trigger**: On app startup, eagerly scan all items (downloaded and streamed) for missing cover art
- **Action**: Trigger a background re-download of the cover art file for any item where the local path doesn't resolve
- **Scope**: All library items — not only downloaded items; streaming items with stale cover paths are also included
- **Lock screen update timing**: Claude's discretion — pick whichever approach (auto-update on download complete vs. next playback start) fits the existing `updateNowPlayingMetadata` architecture

### Claude's Discretion

- Lock screen cover art refresh timing after re-download (auto vs. next play start)
- Fallback section count for home skeleton on first-ever launch
- Exact skeleton card dimensions and spacing (match real card proportions)
- Icon selection per More screen item (Claude picks from SF Symbols or Ionicons)
- Exact pulsing animation duration and easing

</decisions>

<specifics>
## Specific Ideas

- "Native platform style for each app" — iOS should feel like iOS Settings, not a custom styled list
- Log out should be red text per standard iOS destructive action convention
- Home skeleton should cache section count from last session so it feels personalized

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 09-navigation-ui-polish_
_Context gathered: 2026-02-27_
