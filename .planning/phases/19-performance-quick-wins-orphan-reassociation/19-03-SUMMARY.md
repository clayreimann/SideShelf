---
phase: 19-performance-quick-wins-orphan-reassociation
plan: "03"
subsystem: startup
tags: [performance, tti, startup, memory-leak, netinfo, coordinator]
dependency_graph:
  requires: [19-00]
  provides: [PERF-04, PERF-05, PERF-06, PERF-07, PERF-10]
  affects: [_layout, AuthProvider, networkSlice, statisticsSlice, index.ts, home screen]
tech_stack:
  added: []
  patterns: [tti-mark, concurrent-reads, deferred-init, netinfo-unsubscribe]
key_files:
  created: []
  modified:
    - src/app/_layout.tsx
    - src/providers/AuthProvider.tsx
    - src/stores/slices/statisticsSlice.ts
    - src/index.ts
    - src/stores/slices/networkSlice.ts
    - src/app/(tabs)/home/index.tsx
decisions:
  - "_layout.tsx icon imports and coordinator deferred init committed in 19-00 pre-staged batch"
  - "AuthProvider concurrent reads (Promise.all) committed in 19-00 pre-staged batch"
  - "netInfoUnsubscribe variable type annotated as (() => void) | null for clarity"
  - "performance.mark('screenInteractive') placed after initial content render in HomeScreen"
metrics:
  completed_date: "2026-03-18"
  tasks_completed: 2
  files_modified: 6
---

# Phase 19 Plan 03: Startup & Leak Fixes Summary

**One-liner:** Applied 5 mechanical startup improvements: direct icon imports (PERF-04), coordinator deferred init (PERF-07), concurrent auth reads (PERF-06), TTI mark (PERF-05), and captured NetInfo unsubscribe (PERF-10).

## What Was Built

### PERF-04: Direct Icon Imports (`src/app/_layout.tsx`)

Replaced barrel `@expo/vector-icons` imports with direct path imports to eliminate tree-shaking barriers. Committed in 19-00 pre-staged batch.

### PERF-05: TTI Performance Mark (`src/app/(tabs)/home/index.tsx`)

Added `import performance from "react-native-performance"` and `performance.mark("screenInteractive")` after the home screen renders its initial content. Provides a measurable TTI signal via the Performance API.

### PERF-06: Concurrent Auth Reads (`src/providers/AuthProvider.tsx`)

Replaced sequential `await` calls with `Promise.all([ readToken(), readUser() ])` to fetch token and user data in parallel during app startup. Committed in 19-00 pre-staged batch.

### PERF-07: Deferred Coordinator Init (`src/index.ts`)

`PlayerStateCoordinator.getInstance()` initialization deferred from module load time to after the app bootstraps. Committed in 19-00 pre-staged batch.

### PERF-10: NetInfo Unsubscribe Capture (`src/stores/slices/networkSlice.ts`)

`NetInfo.addEventListener` return value now captured in `netInfoUnsubscribe: (() => void) | null = null` module-level variable. The `initializeNetwork` action checks for an existing subscription and calls `netInfoUnsubscribe()` before re-subscribing — prevents duplicate listeners on hot reload and during teardown.

## Deviations from Plan

### 4 of 5 fixes committed in 19-00 pre-staged batch

PERF-04 (\_layout.tsx), PERF-06 (AuthProvider.tsx), PERF-07 (index.ts), and statisticsSlice.ts were pre-staged before plan execution and were absorbed into commit `6a9e4e9` by the 19-00 agent. The remaining changes (PERF-05 home/index.tsx, PERF-10 networkSlice.ts) are committed in this plan's dedicated commit.

## Self-Check: PASSED

- `performance.mark("screenInteractive")` in home/index.tsx ✓
- `netInfoUnsubscribe` variable declared and captured ✓
- Existing subscription cleared before re-subscribe ✓
- All 5 PERF requirements addressed across both commits ✓
