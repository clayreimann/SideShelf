---
status: complete
phase: 18-sleep-timer-fade-navigation-path-standardization
source: [18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md]
started: 2026-03-17T21:00:00.000Z
updated: 2026-03-17T21:00:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. More Tab — Series Navigation Self-Contained

expected: Tapping a series from More > Series opens the series detail screen within the More stack (not the Series tab). Back button returns to More > Series list.
result: pass

### 2. More Tab — Authors Navigation Self-Contained

expected: Tapping an author from More > Authors opens the author detail screen within the More stack (not the Authors tab). Back button returns to More > Authors list.
result: pass

### 3. Sleep Timer Volume Fade

expected: Set sleep timer to a short duration. In the last 30 seconds, volume smoothly fades to silence (linear ramp). When timer expires, audio stops silently (no abrupt cut).
result: pass

### 4. Sleep Timer Fade Cancel Restores Volume

expected: Start the sleep timer fade (in the last 30s), then cancel the timer. Volume restores immediately to the pre-fade level without needing to adjust manually.
result: pass

### 5. Deep Links — sideshelf:// Scheme Opens Screens

expected: Opening a sideshelf:// URL (e.g. sideshelf://item/{id}) in the simulator or via Expo Go navigates to the correct screen. Unauthenticated users are redirected to login.
result: pass

### 6. Deep Links — Copy Link in ··· Menu

expected: Long-pressing or tapping ··· on an item detail screen shows a "Copy Link" option. Tapping it copies a sideshelf://item/{id} URL to the clipboard.
result: pass

### 7. Path Normalization Migration

expected: First app launch after update runs migration 0014_normalize_paths without errors. DB paths no longer have file:// prefix or %20/%28/%29 percent-encoding (verifiable in diagnostics or SQLite inspector).
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
