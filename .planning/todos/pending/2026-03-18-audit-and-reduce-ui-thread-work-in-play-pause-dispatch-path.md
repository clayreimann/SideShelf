---
created: 2026-03-18T00:58:25.505Z
title: Audit and reduce UI-thread work in play-pause dispatch path
area: ui
files:
  - src/components/player/PlayPauseButton.tsx
  - src/services/coordinator/PlayerStateCoordinator.ts
  - src/services/coordinator/eventBus.ts
  - src/stores/slices/playerSlice.ts
---

## Problem

Noticeable UI lag when tapping play/pause before the icon updates, and sometimes before audio actually starts/pauses. Also intermittent flickering between play and pause states during the transition.

Three distinct symptoms:

1. **Icon lag** — tap play, visible delay before the icon switches from play→pause (or vice versa)
2. **Playback lag** — tap play, delay before audio actually starts
3. **Icon flicker** — icon briefly oscillates between play and pause states during transition

Root cause hypotheses:

- The dispatch path goes through the async coordinator lock on the JS thread — this blocks the render cycle from seeing the state update until the lock releases
- No optimistic UI update: the icon waits for the full coordinator round-trip (dispatch → state machine transition → playerSlice sync) before updating
- The flicker may be caused by the coordinator writing an intermediate state (e.g., LOADING) that briefly renders as "paused" before settling on "playing"
- Possible: store selector triggering excess re-renders if an object-returning selector is used on the play/pause button

## Solution

1. **Profile first** — use Flipper or React DevTools profiler to identify where time is spent between tap and icon update
2. **Add optimistic update** — PlayPauseButton should update icon state immediately on press (before coordinator confirms), then reconcile with coordinator state on next tick
3. **Audit store selectors** — confirm PlayPauseButton uses individual selectors not object-returning ones (existing CLAUDE.md rule)
4. **Check for intermediate states** — if coordinator transitions through LOADING/BUFFERING on play, ensure the icon treats these as "not paused" rather than toggling back
5. **Consider moving dispatch off the render path** — dispatch is currently synchronous on the JS thread inside the button's onPress; may benefit from `InteractionManager.runAfterInteractions` or `startTransition`
