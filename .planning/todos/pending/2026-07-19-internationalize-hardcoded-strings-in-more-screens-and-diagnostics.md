---
created: 2026-07-19T21:30:00.000Z
title: Internationalize hardcoded strings in More screens and diagnostics
area: i18n
files:
  - src/app/(tabs)/more/logs.tsx
  - src/app/(tabs)/more/tab-bar-settings.tsx
  - src/app/(tabs)/more/storage.tsx
  - src/app/(tabs)/more/bundle-loader.tsx
  - src/app/(tabs)/more/trace-dump-detail.tsx
  - src/app/(tabs)/more/library-stats.tsx
  - src/components/diagnostics/TraceDumps.tsx
  - src/components/diagnostics/CoordinatorDiagnostics.tsx
  - src/components/library/LibraryItemDetail/BookmarksSection.tsx
---

## Problem

Many More-tab utility screens and diagnostics components render hardcoded English display strings instead of going through `translate()` — button texts (Refresh, Clear, Copy, Share, Reset to Defaults, Save, Check for Updates), section headers, TextInput placeholders, and modal button texts (e.g. Cancel/Save/Delete in BookmarksSection's rename modal and its MenuView action titles). Spanish users see English throughout these screens.

Important coupling: during the 2026-07-19 accessibility sweep, VoiceOver labels on these screens were deliberately set to reuse the same hardcoded string variables/literals the rows display (so what VoiceOver announces always matches what sighted users see). When internationalizing, sweep BOTH the visible text and the corresponding `accessibilityLabel` in the same change so they stay in sync — grep each file for the literal before replacing it.

This is the broader sibling of the existing todo "Internationalize hardcoded FullScreenPlayer strings" (2026-07-19).

## Solution

Add keys under existing namespaces (`logs.*`, `storage.*`, `diagnostics.*`, etc. — follow the flat-key convention in src/i18n/locales/en.ts), mirror them into es.ts (key sets must stay identical or tsc fails), and replace both visible strings and their reused accessibility labels with the same `translate()` calls.
