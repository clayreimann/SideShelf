---
created: 2026-07-19T19:49:54.824Z
title: Add missing progressToast translations to es locale
area: i18n
files:
  - src/i18n/locales/es.ts
  - src/i18n/locales/en.ts
  - src/i18n/index.ts:87
---

## Problem

The `player.progressToast.*` keys exist in `en.ts` but are missing from `es.ts`. This causes a standing `npx tsc --noEmit` error at `src/i18n/index.ts:87` (`Property 'player.progressToast.label' does not exist on type 'TranslationDictionary'`) because the dictionary types require both locales to share the same key set. Spanish users also silently fall back to English for the progress toast.

Discovered during the 2026-07-18 accessibility remediation (pre-existing, unrelated to that work).

## Solution

Mirror the `player.progressToast.*` key set from `en.ts` into `es.ts` with Spanish translations, then confirm the tsc error at `src/i18n/index.ts:87` is gone.
