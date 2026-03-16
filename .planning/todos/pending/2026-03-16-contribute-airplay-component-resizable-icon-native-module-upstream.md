---
created: 2026-03-16T03:54:30.200Z
title: Contribute AirPlay component resizable icon native module upstream
area: ui
files: []
---

## Problem

The AirPlay button/picker component used in the app has a fixed icon size — only the padding grows
when the component is resized, not the icon itself. This is a limitation of the underlying native
module. The icon should scale with the component dimensions.

Additionally, there may be new native module improvements worth contributing back to the upstream
open-source AirPlay component.

## Solution

1. Investigate the native module code powering the AirPlay button (likely a community package
   wrapping `MPVolumeView` on iOS).
2. Add a prop (e.g. `iconSize` or respect the component's `width`/`height`) that passes the size
   down to the native layer so the AirPlay icon scales properly.
3. Open a PR upstream with the fix + any other native module improvements discovered.
