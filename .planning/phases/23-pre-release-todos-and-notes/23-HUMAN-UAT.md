---
status: partial
phase: 23-pre-release-todos-and-notes
source: [23-VERIFICATION.md]
started: 2026-05-01T23:55:00Z
updated: 2026-05-01T23:55:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Auth Startup Flicker (D-01/D-02)
expected: Cold-start the app on a device with a valid stored token — tabs appear immediately without any flash of the login screen
result: [pending]

### 2. Expired Token Modal UX (D-04/D-05/D-06)
expected: Expire a token, trigger a request — (1) formSheet modal appears over current screen, (2) after dismiss a "Sign In" button appears in header, (3) after modal login the user stays on same screen with button gone
result: [pending]

### 3. Chapter Tap Seek+Play (D-08/D-09)
expected: Open a paused item, tap a non-current chapter — player seeks to that chapter's start and begins playing with no smart rewind applied
result: [pending]

### 4. Cold-Start Chapter Highlight (D-10)
expected: Close app at 30% through an item, re-open, navigate to item detail — ChapterList highlights the chapter at the 30% position, not chapter 1
result: [pending]

### 5. Play/Pause Optimistic Update (D-13/D-14)
expected: Tap play/pause rapidly on a loaded track — icon flips immediately on tap with no visible lag or oscillation through loading states
result: [pending]

### 6. More Tab Deep Navigation (D-16/D-17/D-18)
expected: More -> Series -> Series Detail -> Item Detail renders correctly with full back stack
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
