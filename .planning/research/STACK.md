# Stack Research: v1.2 Tech Cleanup

**Project:** abs-react-native — v1.2 milestone (tech debt / dependency upgrades)
**Researched:** 2026-02-28
**Confidence:** HIGH for versions (npm-verified); MEDIUM for RNTP new-arch status (conflicting signals); LOW for custom fork migration specifics (cannot read remote git diff without auth)

---

## Executive Decision Summary

Three targeted questions, three direct answers:

1. **Expo upgrade target** — Upgrade to **Expo SDK 55.0.4 / React Native 0.83.2**. This is a mandatory architectural break: SDK 55 drops the legacy bridge entirely. New Architecture is not optional. RNTP 4.1.2 does not have full new-arch support on Android — this is the primary blocker to assess before committing.

2. **RN Downloader mainline migration** — The mainline package is at **4.5.3** (jumped from the 3.x series the fork was based on, through a major 4.x rewrite). The custom fork is pinned to a `spike-event-queue` branch at tag `3.1.1`. Migrating to mainline 4.x is a significant API surface change; it requires understanding what the fork added and whether mainline absorbed it. This needs a pre-phase investigation.

3. **Drizzle tooling** — Upgrade **drizzle-orm 0.44.5 → 0.45.1** and **drizzle-kit 0.31.4 → 0.31.9**. Minor bumps, no breaking changes documented. No new query analysis tooling needed beyond existing drizzle-kit. expo-sqlite should upgrade from `^16.0.8` → `^55.0.0` (SDK 55 version matching).

---

## Upgrade Target Versions

| Package                                             | Current                                           | Target           | Notes                                                   |
| --------------------------------------------------- | ------------------------------------------------- | ---------------- | ------------------------------------------------------- |
| `expo`                                              | 54.0.21                                           | 55.0.4           | Current stable SDK 55 release                           |
| `react-native`                                      | 0.81.5                                            | 0.83.2           | Bundled with Expo SDK 55                                |
| `react` / `react-dom`                               | 19.1.0                                            | 19.2.x           | SDK 55 ships React 19.2                                 |
| `expo-router`                                       | ~6.0.14                                           | ~55.0.3          | Now versioned with SDK (v7 internally)                  |
| `expo-sqlite`                                       | ^16.0.8                                           | ^55.0.0          | SDK 55 version alignment                                |
| `expo-file-system`                                  | ~19.0.17                                          | ^55.0.0          | API change: `Directory/File/Paths` already uses new API |
| `jest-expo`                                         | ~54.0.13                                          | ~55.0.x          | Must match SDK version                                  |
| All other `expo-*` packages                         | 54.x                                              | 55.x             | `npx expo install --fix` handles the rest               |
| `drizzle-orm`                                       | ^0.44.5                                           | ^0.45.1          | Minor bump, safe                                        |
| `drizzle-kit`                                       | ^0.31.4                                           | ^0.31.9          | Minor bump, safe                                        |
| `@kesha-antonov/react-native-background-downloader` | github:clayreimann/…#spike-event-queue (3.x base) | 4.5.3 (mainline) | Major API rewrite — needs spike                         |

**Hold at current version:**

| Package                        | Current | Reason to Hold                                                                           |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------- |
| `react-native-track-player`    | ^4.1.2  | 5.0.0-alpha0 is broken on iOS; 4.1.2 works under SDK 55 via interop; wait for stable 5.x |
| `react-native-reanimated`      | ~4.1.1  | Already new-arch compatible; `npx expo install --fix` will set correct version           |
| `react-native-gesture-handler` | ~2.28.0 | Same; let `--fix` resolve                                                                |

---

## Section 1: Expo SDK 55 Upgrade

### What Changed (SDK 54 → 55)

**React Native 0.81.5 → 0.83.2** (MEDIUM confidence — search-verified; confirmed by Expo X post)

**Legacy Architecture dropped — hardest change:**

- SDK 54 was the last SDK supporting the old bridge
- SDK 55 is new-architecture-only; there is no opt-out
- The `newArchEnabled` flag becomes irrelevant — it is always true
- Any library still using `RCT_EXPORT_MODULE` / legacy `NativeModules` may break silently under the compatibility layer or require TurboModule migration

Impact on this project: the custom iCloud backup exclusion native module (`ICloudBackupExclusion.m`) uses the legacy bridge pattern. In SDK 54 it worked via the interop layer. In SDK 55, the interop layer is still present but narrowing — verify before shipping.

**expo-file-system API promotion:**

- The `Directory / File / Paths` API (formerly `expo-file-system/next`) is now the default export from `expo-file-system`
- The old API (functions like `copyAsync`, `moveAsync`, `readAsStringAsync`) is now at `expo-file-system/legacy`
- **This project already uses the new API** (`Directory`, `File`, `Paths` imports in `fileSystem.ts`, `covers.ts`, `orphanScanner.ts`, `authorImages.ts`, `exportUtils.ts`, `storage.tsx`) — no migration needed

**expo-router v7:**

- Ships as `expo-router@~55.0.x` (matching SDK version scheme)
- `router.navigate()` behavior note: as of expo-router v4+, `router.navigate()` is equivalent to `router.push()` — does not pop to existing route. This project uses `router.push` and `router.replace` explicitly — no change required.
- New features: Colors API, Apple Zoom Transition, Stack.Toolbar (not blocking, purely additive)

**expo-av removed from Expo Go:**

- This project does not use `expo-av` (uses `react-native-track-player`) — no impact

**Package versioning alignment:**

- All `expo-*` packages now use the same major version as the SDK (55.x)
- `npx expo install --fix` resolves these automatically

### Upgrade Command Sequence

```bash
# Step 1: Upgrade expo and let it resolve compatible versions
npx expo install expo@55.0.4

# Step 2: Fix all expo-* packages to SDK 55 compatible versions
npx expo install --fix

# Step 3: Check for remaining issues
npx expo-doctor

# Step 4: Rebuild native layers
npm run ios   # runs expo prebuild --clean && expo run:ios
```

Do NOT upgrade Expo SDK and adopt New Architecture simultaneously if you hit issues — isolate each change.

### Breaking Changes Requiring Code Changes

| Breaking Change                         | Affected Files                      | Fix                                                         |
| --------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `expo-file-system` default → new API    | None — project already uses new API | No change needed                                            |
| `expo-router` version bump              | `package.json`                      | `npx expo install --fix`                                    |
| Legacy native module (iCloud exclusion) | `plugins/excludeFromBackup/`        | Verify under SDK 55 interop; may need TurboModule migration |
| Package naming (expo-\* → 55.x)         | `package.json`                      | `npx expo install --fix`                                    |

Sources:

- Expo SDK 55 changelog: https://expo.dev/changelog/sdk-55
- Expo upgrade guide: https://expo.dev/blog/upgrading-to-sdk-55
- Expo X announcement: https://x.com/expo/status/2026811977990025364

---

## Section 2: RN Background Downloader — Custom Fork → Mainline

### Current State

```
"@kesha-antonov/react-native-background-downloader": "github:clayreimann/react-native-background-downloader#spike-event-queue"
```

The custom fork is the `clayreimann/react-native-background-downloader` repo, `spike-event-queue` branch. The fork is based on the original at tag `3.1.1` (confirmed via `git ls-remote` showing tag `3.1.1` on the fork). The branch name `spike-event-queue` matches the problem it was solving: the MEMORY.md notes state it was used to add an event queue fix.

### Mainline Version History

Mainline `@kesha-antonov/react-native-background-downloader` is at **4.5.3** (npm-verified, 2026-02-28).

Major version history (npm registry):

- `3.x` — the series the fork is based on (3.1.1 tag)
- `3.2.6` — last 3.x release
- `4.0.0` — major rewrite (confirmed as significant API change; MMKV dependency added)
- `4.1.x` — MMKV dependency changes (issue #16: MMKV usage incompatible with Expo in 3.1+, fixed in 4.x)
- `4.2.0` — Android pause/resume support
- `4.3.x` — iOS MMKV dependency changes
- `4.4.x` — continued updates
- `4.5.3` — current stable

### What the Fork Added (Best Inference — LOW confidence)

The branch name `spike-event-queue` combined with the MEMORY.md entry ("custom fork of @kesha-antonov/react-native-background-downloader in use") and the coordinator's event queue pattern suggests the fork adds serialized/queued event delivery to avoid race conditions in the download callbacks. The mainline 4.x changelog mentions MMKV and Android enhancements, but does not explicitly mention event queue serialization.

**Cannot confirm without reading the actual git diff** — the fork is on a private/personal GitHub account without direct read access from this environment.

### Migration Risk Assessment

| Risk Factor                    | Assessment                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| API surface change (3.x → 4.x) | HIGH — major version jump with confirmed breaking changes                                                  |
| MMKV dependency added in 4.x   | MEDIUM — may require `react-native-mmkv` native install or configuration                                   |
| Event queue behavior lost      | HIGH if the fork's additions are not in mainline — DownloadService relies on predictable callback ordering |
| Expo compatibility             | Expo SDK 55 / New Architecture may require 4.x anyway (if 3.x uses legacy bridge internals)                |

### Recommended Pre-Phase Investigation

Before scheduling this upgrade in the roadmap, do a focused spike:

1. `git log --oneline 3.1.1..spike-event-queue` on the fork to enumerate commits
2. Check if any of those commits were upstreamed (compare to mainline 4.x CHANGELOG)
3. Review mainline 4.x API docs for DownloadService integration points

The `DownloadService.ts` integration surface:

```typescript
RNBackgroundDownloader.setConfig({ progressInterval, isLogsEnabled })
RNBackgroundDownloader.checkForExistingDownloads()
RNBackgroundDownloader.download({ id, url, destination, headers })
task.begin() / .progress() / .done() / .error() / .stop() / .pause() / .resume()
```

If mainline 4.x preserves this surface (likely since it's the same author), migration may be straightforward. But the event queue behavior needs validation under the coordinator's serial processing model.

### Confidence Level: LOW

Cannot determine migration effort without reading the fork diff. Flag this for a phase-start research spike.

Sources:

- npm registry: https://www.npmjs.com/package/@kesha-antonov/react-native-background-downloader
- MMKV issue #16: https://github.com/kesha-antonov/react-native-background-downloader/issues/16
- GitHub releases: https://github.com/kesha-antonov/react-native-background-downloader/releases

---

## Section 3: Drizzle ORM / SQLite Audit Tooling

### Drizzle Version Targets

| Package       | Current | Target  | Change Type                            |
| ------------- | ------- | ------- | -------------------------------------- |
| `drizzle-orm` | ^0.44.5 | ^0.45.1 | Minor bump                             |
| `drizzle-kit` | ^0.31.4 | ^0.31.9 | Minor bump                             |
| `expo-sqlite` | ^16.0.8 | ^55.0.0 | SDK alignment (same underlying SQLite) |

`drizzle-orm` 0.45.1 peer dependency: `"expo-sqlite": ">=14.0.0"` — satisfied by 55.x.

`drizzle-orm` 1.0 beta (`1.0.0-beta.x`) is in active development but NOT stable. Do not use beta channel for this milestone.

### Known Issues to Watch

- `drizzle-orm/expo-sqlite` is not truly async — it blocks the UI thread (issue #5240). This is a known limitation, not a regression. The project's DB architecture (helpers + transactions) already mitigates this by batching writes.
- Migration failures with multiple migrations (issue #2384) — confirmed resolved in later 0.44.x patches. Running `drizzle-kit generate` before each migration ensures the hash chain is consistent.

### Query Analysis Tooling

No new tooling needed. The existing setup provides:

- `expo-drizzle-studio-plugin` (installed at `^0.2.0`) — provides a visual query debugger in Expo Dev Client
- `drizzle-kit generate --config=drizzle.config.ts` — migration diff generation
- `better-sqlite3` (dev dep) — enables server-side test execution of queries

For DB/SQL audit work, the recommended approach:

1. Use `expo-drizzle-studio-plugin` to inspect live query results on device
2. Review `src/db/helpers/` for N+1 queries by reading helper files directly
3. Use `npm run test:coverage` to identify untested DB helpers

No additional tooling required.

Sources:

- Drizzle ORM latest releases: https://orm.drizzle.team/docs/latest-releases
- drizzle-orm/expo-sqlite blocking issue: https://github.com/drizzle-team/drizzle-orm/issues/5240
- Expo SQLite docs: https://docs.expo.dev/versions/latest/sdk/sqlite/

---

## react-native-track-player Status

### Hold at 4.1.2

RNTP 4.1.2 is the current stable. The next planned release is 5.0 (new architecture rewrite), but:

- `5.0.0-alpha0` is confirmed broken on iOS (tracks cannot play — issue #2503)
- The alpha has `shaka-player` as a peer dependency (new web-video dependency, unusual)
- New Architecture migration for RNTP 4.x was partially completed but Android support is incomplete in 4.1.2

Under Expo SDK 55 / React Native 0.83, the New Architecture interop layer will still run RNTP 4.1.2 in bridge-compatibility mode. The coordinator architecture (Phase 2) does not use any new-arch-specific RNTP APIs. **Hold at 4.1.2 until 5.0 stable ships.**

Verify at project launch: run the app with `newArchEnabled: true` under SDK 55 and confirm audio playback works before committing to the upgrade.

Sources:

- RNTP 5.0.0-alpha0 iOS issue: https://github.com/doublesymmetry/react-native-track-player/issues/2503
- RNTP New Architecture issue: https://github.com/doublesymmetry/react-native-track-player/issues/2443

---

## Version Compatibility Matrix

| Package A                         | Compatible With        | Notes                                                        |
| --------------------------------- | ---------------------- | ------------------------------------------------------------ |
| `expo@55.0.4`                     | `react-native@0.83.2`  | Bundled together                                             |
| `expo@55.0.4`                     | `react@19.2.x`         | Bundled together                                             |
| `expo@55.0.4`                     | `expo-router@~55.0.3`  | SDK version alignment                                        |
| `expo@55.0.4`                     | `expo-sqlite@^55.0.0`  | SDK version alignment                                        |
| `drizzle-orm@0.45.1`              | `expo-sqlite@>=14.0.0` | Peer dep satisfied by 55.x                                   |
| `react-native-track-player@4.1.2` | `react-native@0.83.2`  | Verified via interop layer; no new-arch native codegen       |
| `react-native-reanimated@~4.1.1`  | Expo SDK 55            | `npx expo install --fix` will update to correct 4.x patch    |
| `@kesha-antonov/…@3.1.1 (fork)`   | `react-native@0.83.2`  | UNKNOWN — legacy bridge internals may conflict with new arch |

---

## Installation Sequence for v1.2

```bash
# Phase A: Expo SDK upgrade
npx expo install expo@55.0.4
npx expo install --fix          # resolves all expo-* to SDK 55 versions
npx expo-doctor                  # identifies remaining incompatibilities
npm run ios                      # rebuilds native layer

# Phase B: Drizzle minor bump
npm install drizzle-orm@^0.45.1 drizzle-kit@^0.31.9

# Phase C: RN Downloader (requires pre-phase spike)
# After spike confirms migration path:
npm install @kesha-antonov/react-native-background-downloader@4.5.3
npm run ios   # rebuilds native
# OR: keep fork if mainline lacks event queue behavior
```

---

## What NOT to Change

| Do Not Change                         | Why                                                                    | When to Revisit                    |
| ------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `react-native-track-player`           | 5.0.0-alpha0 broken on iOS; hold at 4.1.2                              | When 5.0 stable ships              |
| `drizzle-orm` 1.0 beta                | Not stable, API may change                                             | After 1.0 stable release           |
| `expo-drizzle-studio-plugin`          | Already installed, no upgrade needed                                   | When expo-sqlite has major changes |
| Custom iCloud exclusion native module | Works under SDK 55 interop; needs test before migrating to TurboModule | If SDK 55 interop breaks it        |

---

## Confidence Assessment

| Area                              | Confidence | Basis                                                                  |
| --------------------------------- | ---------- | ---------------------------------------------------------------------- |
| Expo 55 target version            | HIGH       | npm registry verified (55.0.4 stable)                                  |
| Expo 55 breaking changes          | MEDIUM     | Multiple search sources agree; not tested in this repo                 |
| RN 0.83.2 bundled version         | MEDIUM     | Confirmed by Expo X post + reactnative.dev blog                        |
| expo-file-system migration status | HIGH       | Source files verified — already uses new API                           |
| RNTP 4.1.2 hold recommendation    | MEDIUM     | Issue tracker confirms 5.0 alpha broken; interop assumption unverified |
| Drizzle 0.45.1 upgrade            | HIGH       | npm-verified; minor bump with no documented breaking changes           |
| RN Downloader mainline 4.5.3      | LOW        | Cannot read fork diff; API surface change unknown                      |
| expo-sqlite 55.x alignment        | HIGH       | npm-verified; same underlying SQLite engine                            |

---

_Stack research for: abs-react-native v1.2 Tech Cleanup milestone_
_Researched: 2026-02-28_
