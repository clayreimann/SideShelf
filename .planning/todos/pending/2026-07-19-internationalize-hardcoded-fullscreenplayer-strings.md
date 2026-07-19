---
created: 2026-07-19T19:49:54.824Z
title: Internationalize hardcoded FullScreenPlayer strings
area: i18n
files:
  - src/app/FullScreenPlayer/index.tsx:765-807
  - src/i18n/locales/en.ts
  - src/i18n/locales/es.ts
---

## Problem

The full-screen player has hardcoded English display strings that bypass the `translate()` i18n layer:

- The three control caption texts "Speed", "Bookmark", "Sleep Timer" (bottom control row, ~lines 765–807). These are now hidden from screen readers (`accessibilityElementsHidden` — the controls carry their own translated a11y labels), so this is a visual-text gap only.
- The bookmark prompt modal title "Bookmark Title" (also used as the modal TextInput's `accessibilityLabel`, which should switch to the same new key).
- The "Bookmark Title Mode" string near line 583.

Spanish users see English text for these labels.

## Solution

Add `player.*` keys for these strings to both `en.ts` and `es.ts` and replace the literals with `translate()` calls. When replacing the prompt-modal title, update the TextInput `accessibilityLabel` to use the same key so visible title and a11y label stay in sync.
