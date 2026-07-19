---
created: 2026-07-13T00:00:00.000Z
title: Break logger→appStore circular dependency and enforce with a check
area: architecture
brief: C
priority: P1
depends_on: []
coordinate_with: [D]
files:
  - src/lib/logger/index.ts
  - src/stores/slices/loggerSlice.ts
  - src/types/database.ts
  - src/types/components.ts
  - src/db/helpers/mediaMetadata.ts
  - src/lib/covers.ts
  - package.json
---

## Problem

CLAUDE.md declares "No Circular Imports (Important!)" and prescribes dpdm
verification — yet as of 2026-07-13:

```
rtk proxy npx dpdm --circular --no-tree --no-warning src/services/PlayerService.ts
```

reports **23 circular chains**. Roughly 20 share one root cause:
`src/lib/logger/index.ts` imports `src/stores/appStore.ts`, while every slice
and service imports the logger. The most-imported leaf module in the codebase
depends on the top of the dependency graph, so every `appStore → slice → *`
path closes a cycle through the logger.

Remaining cycles:

- `src/types/database.ts ↔ src/types/components.ts`
- `src/db/helpers/mediaMetadata.ts ↔ src/lib/covers.ts`
- `PlayerService ↔ PlayerStateCoordinator` — known, documented, worked around
  via `require()` in `PlayerStateCoordinator.executeTransition`. **Leave this
  one alone** (allowlist it).

Circular imports cause uninitialized values at runtime in Metro/Hermes — this
is exactly the failure class the CLAUDE.md rule exists to prevent, and there
is currently no enforcement, so the rule drifted.

## Solution

**1. Invert the logger→store dependency.**

- Precedent to follow: `src/services/coordinator/eventBus.ts` (services
  dispatch to a bus; the coordinator subscribes — "NO circular dependency!"
  per its header comment).
- The logger exposes a subscription API (e.g. `logger.subscribe(listener)` or
  an exported logger event emitter). Whatever state the logger currently
  pushes into the store (inspect `src/lib/logger/index.ts` for the appStore
  usage — likely mirroring log entries/settings into `loggerSlice`), invert
  it: `loggerSlice` (or a small bootstrap module that already legitimately
  imports both, e.g. app init in `src/index.ts`) subscribes and mirrors state
  into the store.
- End state: `src/lib/logger/` imports **nothing** from `src/stores/`.

**2. Fix the two small cycles.**

- `types/database ↔ types/components`: move the shared type(s) to whichever
  file is lower in the graph, or a new shared types file.
- `mediaMetadata ↔ covers`: extract the shared function, or pass data as
  explicit arguments per the CLAUDE.md rule ("helpers must take explicit
  arguments").

**3. Enforce.**

- Add npm script `check:circular` that runs dpdm against BOTH
  `src/services/PlayerService.ts` and `src/stores/appStore.ts` and fails on
  any cycle not in a small documented allowlist (the
  PlayerService↔coordinator pair only). A small node script comparing dpdm
  JSON output against the allowlist is fine.
- If a CI workflow exists under `.github/workflows/`, add the check to it.
  If none exists, create a minimal PR workflow running `npm test`,
  `npm run lint`, and `npm run check:circular`.

## Verification

- dpdm reports only the allowlisted cycle(s).
- `npm test` fully green — especially `loggerSlice` tests; log settings and
  log-entry mirroring into the store must still work (check the logger
  settings screen wiring: `src/app/(tabs)/more/logger-settings.tsx`).
- `npm run check:circular` passes locally and fails if a cycle is
  deliberately introduced (spot-check once, then revert).

## Out of scope

- Log content/redaction changes — that is brief D
  (2026-07-13-logging-token-redaction-lazy-bodies-deeplink-confirm.md), which
  touches the same module. **Land this brief first**, then D.
- Refactoring slices beyond the subscription hookup.
- The PlayerService↔coordinator require() workaround.
