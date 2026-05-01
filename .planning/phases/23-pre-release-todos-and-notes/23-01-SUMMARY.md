---
phase: 23-pre-release-todos-and-notes
plan: "01"
subsystem: auth
tags: [auth, startup, ux, modal, splash-screen]
dependency_graph:
  requires: []
  provides: [auth-splash-hold, expired-token-modal-ux]
  affects: [src/providers/AuthProvider.tsx, src/app/_layout.tsx, src/app/(tabs)/_layout.tsx, src/app/login.tsx]
tech_stack:
  added: []
  patterns: [module-level-promise, canGoBack-modal-dismiss, conditional-header-left]
key_files:
  created: []
  modified:
    - src/providers/AuthProvider.tsx
    - src/app/_layout.tsx
    - src/app/(tabs)/_layout.tsx
    - src/app/login.tsx
decisions:
  - authInitializedPromise is module-level (not React state) — RootLayout cannot use useAuth() because AuthProvider is a child; promise bridges the parent-child boundary without prop drilling
  - router.replace('/login') kept for initial unauthenticated state; only the loginMessage (expired token) effect switched to router.push — two different UX intents require different navigation verbs
  - Tabs headerShown conditionally true when showTokenExpiredHeader — header only appears after session expiry so the re-login affordance is visible; normally hidden
  - router.canGoBack() in login.tsx distinguishes modal-dismissed-from-tabs vs initial-login — cleanly handles both flows without auth-state flag
metrics:
  duration_seconds: 221
  completed_date: "2026-05-01"
  tasks_completed: 2
  files_modified: 4
---

# Phase 23 Plan 01: Auth Startup Login Flicker and Expired Token UX Summary

**One-liner:** Module-level `authInitializedPromise` holds splash until auth is known; expired token replaces destructive `router.replace` with a dismissible `formSheet` modal and a `headerLeft` "Sign In" button.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Hold splash screen until auth initialized + signal mechanism | 1b02b0a | src/providers/AuthProvider.tsx, src/app/_layout.tsx |
| 2 | Expired token modal UX + headerLeft re-login button | e1340a7 | src/app/(tabs)/_layout.tsx, src/app/login.tsx |

## What Was Built

**Task 1 — Splash hold until auth initialized (D-01/D-02):**
- Added `authInitializedPromise` as a module-level `Promise<void>` in `AuthProvider.tsx`; resolves via `_onAuthInitialized?.()` called alongside `setInitialized(true)` in the auth init useEffect
- `RootLayout.onLayoutRootView` now `await`s `authInitializedPromise` before calling `SplashScreen.hideAsync()` — splash stays visible until auth state is known, eliminating the 100–500ms login screen flash on cold start when already authenticated

**Task 2 — Expired token modal UX (D-03 through D-07):**
- `(tabs)/_layout.tsx` loginMessage effect changed from `router.replace("/login")` to `router.push("/login")` — presents the login screen as a dismissible `formSheet` modal (configured in `_layout.tsx`)
- `tokenExpiredHeaderLeft` Pressable button (`Ionicons log-in-outline` + "Sign In" text, `colors.link` tint) rendered in `Tabs.screenOptions.headerLeft` when `showTokenExpiredHeader` is true
- `Tabs.screenOptions.headerShown` conditionally true when session expired — header (and button) hidden normally, visible only when re-authentication is needed
- `login.tsx` useEffect checks `router.canGoBack()` after successful auth: `true` → `router.back()` dismisses the modal, returning user to their current screen; `false` → `router.replace("/")` for initial login flow

## Decisions Made

1. **`authInitializedPromise` is module-level, not React state** — `RootLayout` is the parent of `AuthProvider` so it cannot call `useAuth()`. A module-level promise resolves the parent-child boundary without prop drilling or a separate context layer.
2. **`router.replace` kept for initial unauthenticated state** — The `initialized && !isAuthenticated` effect (no loginMessage) retains `router.replace` since the user has never been on the tabs stack. Only the `loginMessage` effect (expired token) switches to `router.push` — two distinct UX intents.
3. **Tabs `headerShown` conditional** — Rather than injecting a button into every nested Stack navigator, the Tabs header is conditionally shown when session expired. This gives a clean affordance without modifying each tab's Stack layout.
4. **`router.canGoBack()` in login.tsx** — Cleanly distinguishes the modal-dismiss scenario from the initial-login scenario without adding auth-state flags or route parameters.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- src/providers/AuthProvider.tsx: FOUND ✓ (contains `authInitializedPromise`, `_onAuthInitialized?.()`)
- src/app/_layout.tsx: FOUND ✓ (contains `import { authInitializedPromise }`, `await authInitializedPromise`, `await SplashScreen.hideAsync()`)
- src/app/(tabs)/_layout.tsx: FOUND ✓ (contains `router.push("/login")`, `headerLeft`)
- src/app/login.tsx: FOUND ✓ (contains `canGoBack`, `router.back()`)
- Commit 1b02b0a: FOUND ✓
- Commit e1340a7: FOUND ✓
