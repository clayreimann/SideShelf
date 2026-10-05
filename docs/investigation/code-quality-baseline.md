# Code Quality Baseline: Complexity & Duplication

**Measured:** 2026-10-05, against `062019f` (App Store release, PR #84)
**Tracked in:** `TODO.md` → "Reduce complexity hotspots"

> **Delete this file when the TODO item is complete** (all checklist items below are done or
> explicitly dropped). The live numbers come from CI; this doc only exists to guide the
> refactor work. See CLAUDE.md → Documentation: "Clean up intermediate investigation files
> after the feature is complete."

## Tooling

| Command                                     | What it does                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run quality`                           | Runs both checks below                                                                        |
| `npm run quality:complexity`                | ESLint complexity rules (`eslint.complexity.config.js`), compared against the baseline        |
| `npm run quality:baseline`                  | Rewrites `.github/quality/complexity-baseline.json`; run after an improvement and commit it   |
| `npm run quality:duplication`               | jscpd over `src/` (tests and migrations excluded), fails above the threshold in `.jscpd.json` |
| `node scripts/check-complexity.js --report` | Lists every current violation, worst first                                                    |

Limits: complexity 15, cognitive complexity 15, nesting depth 4, parameters 4,
200 lines per function, 500 lines per file (blank lines and comments excluded).

The complexity check is a **ratchet**: violations are grouped by file and rule, and CI
fails if a group gets more violations or its worst value goes up. Existing hotspots don't
block CI. After you simplify something, run `npm run quality:baseline` and commit the
result so the gain can't slip back.

## Snapshot

| Metric                                 | Pre-release (`7e646f6`) | Release (`062019f`) |
| -------------------------------------- | ----------------------- | ------------------- |
| Lines in `src/` (excluding tests)      | 39,110 (190 files)      | 48,160 (227 files)  |
| Duplicated lines                       | 3.51%                   | 3.55%               |
| Violations recorded in the baseline    | 108                     | 139                 |
| Functions over complexity 15 / 30      | 34 / 9                  | 40 / 12             |
| Worst complexity                       | 50                      | 107                 |
| Functions over cognitive complexity 50 | 3                       | 6                   |
| Nesting deeper than 4 levels           | 15                      | 24                  |
| Functions over 200 lines               | 20                      | 28                  |
| Largest file                           | 835 lines               | 1,248 lines         |

Violations grew a little faster than the code. They are concentrated in the player and
progress pipeline, especially `PlayerStateCoordinator.ts`, which grew from 653 to 1,248 lines.

The duplication threshold is 3.6%, which leaves about 25 lines of headroom. Item 2 below
frees roughly 350 lines; after that, lower the threshold in `.jscpd.json` to match.

## Refactor checklist (highest payoff first)

Function locations are as of `062019f`. Use the function names, since line numbers will drift.

### 1. Split up `PlayerStateCoordinator` (`src/services/coordinator/PlayerStateCoordinator.ts`)

- [ ] `handleEvent` (complexity 107, 289 lines). Replace the branching with a handler
      table keyed by event type, so each handler is a small method.
- [ ] `executeTransition` (complexity 47, cognitive 65). Same approach, keyed by target state.
- [ ] `updateContextFromEvent` (complexity 40). Use a per-event context reducer.
- [ ] `resolveCanonicalPosition` (cognitive 85, nested 8 deep). Extract a **pure**
      `pickResumePosition({ asyncStorage, session, savedProgress })` that returns
      `{ position, source }`. `position`, `source` and `authoritativePosition` are always
      set to the same value, so collapse the triple. Unit-test the pure function directly.

Run `npx dpdm --circular` before and after any split (see CLAUDE.md).

### 2. Merge the duplicated list screens (quick win, about 350 duplicated lines)

The More-tab copies differ from the tab screens only in route prefix and `testID`.

- [ ] `src/app/(tabs)/more/series.tsx` and `src/app/(tabs)/series/index.tsx` (172 lines).
- [ ] `src/app/(tabs)/more/authors.tsx` and `src/app/(tabs)/authors/index.tsx` (148 lines).
- [ ] Move each pair into one component under `src/components/` with a `basePath` prop
      (e.g. `"/more/series"` vs `"/series"`), and make both route files thin wrappers.
- [ ] Optional: `authors/[authorId]/index.tsx` vs `series/[seriesId]/index.tsx` (32 lines).

### 3. Hotspots unchanged since the pre-release snapshot

- [ ] `handlePlaybackProgressUpdated` in `src/services/PlayerBackgroundService.ts`
      (cognitive 80). It runs every second and does five jobs. Split it into
      `checkSleepTimer`, `maybeSyncToServer`, `trackMeaningfulListen` and the
      rehydration path. It also reads the current session from the database up to three
      times per tick; reuse one read.
- [ ] `restorePersistedState` in `src/stores/slices/playerSlice.ts` (cognitive 71).
      Turn its seven copy-pasted "read storage key, then set or record not-found" blocks
      into a table-driven loop. Use early returns in the database reconciliation part.
- [ ] `buildTrackList` in `src/services/player/TrackLoadingCollaborator.ts` (cognitive 51,
      up from 38).

### 4. Long parameter lists, which lead to positional `undefined` arguments at call sites

- [ ] `ProgressService.startSession` (9 parameters), `ProgressService.updateProgress` (7).
- [ ] `DownloadService.updateProgress` (9).
- [ ] `startListeningSession` (8) and `createProgressSnapshot` (7) in
      `src/db/helpers/localListeningSessions.ts`.

Switch each to a single options object.

### 5. Repeated user lookup

- [ ] The "stored username → `getUserByUsername` → user id" sequence is repeated at 14 call sites in 10 files across
      services and slices. Add one `getCurrentUserId()` helper (taking explicit arguments,
      per the no-circular-imports rules) and replace the copies. Each replacement also
      removes a level of nesting.

### 6. Large components

- [ ] `FullScreenPlayer` (`src/app/FullScreenPlayer/index.tsx`, a 681-line function, up from 363).
- [ ] `LibraryItemDetail` (`src/components/library/LibraryItemDetail.tsx`, complexity 58).
- [ ] `StorageScreen` (494 lines) and `SettingsScreen` (453 lines, also 114 lines duplicated within the file).

Extract sections and hooks. `LibraryItemDetail/` already has section components to follow.

### 7. Smaller duplication clusters (optional)

- [ ] Code duplicated within `db/helpers/combinedQueries.ts` (101 lines) and
      `db/helpers/libraryItems.ts` (86 lines).
- [ ] `db/helpers/audioFiles.ts` vs `db/helpers/fullLibraryItems.ts` (64 lines).
- [ ] `ErrorBoundary` vs `TabErrorBoundary` (62 lines).

## Done when

All boxes above are checked or explicitly dropped and the baseline has been regenerated.
Then delete this file and tick the item in `TODO.md`.
