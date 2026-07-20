# Dependency Upgrade Program Design

**Date:** 2026-07-20
**Status:** Proposed for review
**Scope:** SideShelf npm, Expo, React Native, native-module, and JavaScript tooling dependencies

## Goal

Upgrade SideShelf from its current Expo SDK 54 dependency baseline through Expo SDK 57, then evaluate and adopt independent tooling and library majors without combining unrelated breaking changes into one release.

The program must preserve the app's production-critical behaviors: authenticated access to self-hosted Audiobookshelf servers, LAN and remote connectivity, streaming and offline playback, downloads, local database state, progress synchronization, background audio, native media controls, and compatible OTA delivery.

This is a compatibility and reliability program, not a feature project. An upgrade phase is complete only when its automated, native-build, and device regression gates have produced reviewable evidence.

## Current Baseline

The 2026-07-20 inventory established the following starting point:

- The project declares 74 direct dependencies: 55 runtime and 19 development dependencies.
- `npm outdated` reports 63 direct dependencies with newer published versions. Forty-six can move within the currently declared ranges; the remaining upgrades require manifest changes or framework coordination.
- `npm ls --depth=0` resolves cleanly.
- The application is on Expo SDK 54, but `npx expo install --check` reports 23 mismatches.
- The highest-risk current mismatch is `expo-application@55.0.9`; SDK 54 expects `~7.0.8`.
- Expo Doctor passes 12 of 18 checks. Its failures include duplicate `expo-sqlite`, app configuration/native synchronization concerns, React Native Track Player new-architecture compatibility metadata, and incomplete metadata for the route-picker package.
- `app.json` and `app.config.js` both participate in configuration and currently overlap. The upgrade program needs one unambiguous source of truth.
- iOS currently targets 15.1. Expo SDK 56 raises the minimum supported iOS version to 16.4.
- `runtimeVersion` currently follows `appVersion`. Reusing the same app version across native dependency changes would allow incompatible OTA artifacts to share a runtime unless the policy or release versioning changes.
- The repository already has substantial Jest coverage, circular-dependency checking, linting, Expo export checks, Maestro scripts, and device-build scripts. Some existing CI checks are non-blocking and the device flows require a more explicit acceptance record.

These are live-inventory facts, not a promise that all transitive dependencies or registry metadata will remain unchanged. Each phase must refresh its own inventory immediately before implementation.

## Program Structure

The work will be represented by one governing design, five executable implementation plans, and one shared acceptance record:

1. `docs/superpowers/plans/2026-07-20-dependency-upgrade-baseline.md`
2. `docs/superpowers/plans/2026-07-20-expo-sdk-55-upgrade.md`
3. `docs/superpowers/plans/2026-07-20-expo-sdk-56-upgrade.md`
4. `docs/superpowers/plans/2026-07-20-expo-sdk-57-upgrade.md`
5. `docs/superpowers/plans/2026-07-20-post-sdk-tooling-majors.md`
6. `docs/testing/dependency-upgrade-acceptance.md`

The first four plans are sequential. The post-SDK plan is a set of independently releasable subphases; its packages must not be upgraded as one batch merely because they share a plan document.

Each Expo SDK phase receives its own dependency diff, native regeneration audit, verification evidence, commit series, development-client rebuild, and rollback point. SDK 54 must be healthy before SDK 55 begins, and each later SDK must pass all required gates before the next begins.

## Global Constraints

- Upgrade exactly one Expo SDK at a time: 54 baseline, then 55, then 56, then 57.
- Do not mix independent tooling majors into an Expo SDK phase unless that major is a documented framework requirement.
- Use Expo's compatibility recommendations as the starting point for Expo-managed packages. Do not select versions solely from `npm latest`.
- Refresh the lockfile through a clean, reproducible install and audit all direct and material transitive changes.
- Treat generated iOS and Android changes as code. Review them before committing; never accept a full prebuild diff blindly.
- Preserve user data across an installed-app upgrade. A clean install alone is insufficient evidence.
- Preserve HTTPS, LAN HTTP, and the app's deliberate remote-HTTP warning behavior.
- Preserve offline operation, downloaded media, SQLite data, settings, bookmarks, playback state, and progress synchronization.
- Do not intentionally change user-facing behavior unless the approved upgrade plan identifies a required compatibility adaptation.
- Do not weaken or delete a test merely to make an upgrade pass. Any test replacement must preserve or improve the behavior asserted and explain why the old assertion became invalid.
- Do not add Expo Doctor exclusions or package-metadata suppressions without documenting the owner, rationale, expiry condition, and proof that the warning is not a runtime incompatibility.
- Native dependency changes must produce a new compatible OTA runtime. The baseline plan must either adopt a native-aware runtime policy such as `fingerprint` or require a unique app/runtime version for every native dependency set.
- Never attempt to roll back a native dependency change with an OTA update. Roll back by rebuilding the last known-good native commit.
- Preserve unrelated working-tree changes, including the existing user-owned `CLAUDE.md` modification.

## Phase 0: Repair and Freeze the Expo SDK 54 Baseline

### Purpose

Remove existing dependency and configuration drift so later failures can be attributed to an actual SDK transition rather than a broken starting state.

### Required work

- Capture the current direct, transitive, Expo-compatible, and native-module dependency inventory.
- Align all Expo SDK 54 packages to the versions recommended by `npx expo install --check`, beginning with `expo-application`.
- Resolve the duplicate `expo-sqlite` installation and prove there is one native version in the dependency graph and built application.
- Choose one app-configuration authority. Retain JavaScript configuration only where environment-aware logic is required, and remove or reduce overlapping static configuration so `npx expo config` is deterministic.
- Reconcile checked-in native projects with the chosen Expo configuration. Audit plugin-generated changes instead of regenerating indiscriminately.
- Define the OTA runtime compatibility policy and a release-version rule for native dependency changes.
- Make Expo export failures blocking in CI after current failures are understood.
- Establish a TypeScript baseline. The desired end state is a clean full-project check; until that is achieved, changed files must be clean and the full-project diagnostic count must not increase.
- Create the shared acceptance record with device, OS, server, network, build, commit, and evidence fields.
- Record performance and memory baselines using the same build type and hardware that SDK 55 and SDK 56 will use.

### Exit condition

SDK 54 must have a reproducible install, an explainable dependency graph, deterministic app configuration, compatible OTA runtime rules, and passing required gates. Any remaining Expo Doctor warning must have a written disposition and device evidence.

## Phase 1: Expo SDK 55

### Expected breaking-change areas

- React Native 0.83 and React 19.2 behavior and type changes.
- New Architecture as the only supported architecture for this SDK line.
- Xcode 26 and corresponding Apple build-tool requirements.
- Removal or obsolescence of configuration fields that no longer affect the underlying native versions.
- Native module compatibility for React Native Track Player, the blob/download stack, route picker, SQLite, Reanimated, Gesture Handler, and other plugins.

### Required work

- Upgrade only the framework-aligned dependency set and direct compatibility fixes required by SDK 55.
- Re-run native generation in a disposable comparison location first, then apply only reviewed native/config changes to the repository.
- Rebuild development clients; do not validate a new native dependency graph in an old client.
- Validate audio engine initialization, queue restoration, background playback, lock-screen controls, interruptions, output-route changes, downloads, file access, SQLite migrations, and release builds.
- Re-run the full acceptance matrix on an installed upgrade from the signed-off SDK 54 build.

### Exit condition

All automated, build, simulator, physical-device, persistence, OTA, and performance gates pass on SDK 55. The SDK 54 rollback build remains reproducible.

## Phase 2: Expo SDK 56

### Expected breaking-change areas

- React Native 0.85.
- Minimum iOS 16.4 and Xcode 26.4. This intentionally drops iOS 15.x support and requires a release decision before implementation.
- Expo Router and React Navigation integration changes. The repository has direct `useFocusEffect` imports from `@react-navigation/native` that require explicit review.
- Expo FileSystem move/copy APIs becoming asynchronous. The current `sourceFile.move(destFile)` call must be awaited and its failure behavior tested.
- React Native's global `fetch` implementation changes, affecting authentication, API requests, downloads, abort behavior, timeouts, and error normalization.
- TypeScript 6 compatibility pressure from the framework toolchain.
- The vector-icons package migration path and possible package-level replacements.
- Hermes, Reanimated, and New Architecture memory/performance behavior, including known upgrade sensitivity during sustained playback.

### Required work

- Approve the iOS 16.4 support floor and update build, store, and test-device expectations together.
- Migrate Router/Navigation imports and behaviors with focused navigation tests for top-level and More-scoped tabs, descendant routes, back behavior, and focus-driven refresh.
- Convert affected file operations to awaited flows; test success, destination conflicts, interruption, cleanup, and rollback of partial state.
- Test every API transport mode against the new fetch implementation: HTTPS, LAN HTTP, remote HTTP warning, token expiry, cancellation, reconnect, malformed responses, and offline recovery.
- Run TypeScript 6 as its own compatibility step within this phase if SDK 56 requires it; do not combine the later TypeScript 7 experiment.
- Decide the vector-icons migration explicitly. It may be deferred only if the retained version is supported and the deferral has an owner and removal trigger.
- Run the sustained-playback memory gate before accepting the SDK. A build that is functionally correct but leaks or regresses beyond the threshold does not pass.

### Exit condition

SDK 56 passes the complete matrix on supported iOS and Android devices, the iOS 16.4 product decision is recorded, networking and file operations have focused regression coverage, and sustained playback remains within the agreed resource budget.

## Phase 3: Expo SDK 57

### Expected breaking-change areas

- React Native 0.86 and its framework-level compatibility changes.
- Expo package versions that are expected to use exact SDK-aligned pins.
- Clean-prebuild and native-project regeneration behavior.
- Any deprecations deliberately deferred during SDK 55 or SDK 56.

### Required work

- Refresh official release notes and compatibility metadata immediately before implementation; SDK 57 is recent enough that assumptions from this design may drift.
- Keep the phase narrow: SDK-aligned packages, mandatory code changes, and previously approved deprecation removal only.
- Compare clean generated native projects with the maintained projects and document every retained manual native edit.
- Rebuild and rerun all gates, including installed-app upgrade, OTA compatibility, and store-style release artifacts.

### Exit condition

SDK 57 is the signed-off framework baseline, has reproducible native builds and compatible OTA behavior, and introduces no unresolved regression or unexplained configuration drift.

## Phase 4: Independent Tooling and Library Majors

These are separate subphases with separate commits, focused tests, and rollback points. Their order is based on dependency and testing leverage, not npm version magnitude.

### React Native Testing Library 14

The repository has a large asynchronous interaction surface, including approximately 153 call sites that may need review. Migrate tests in bounded groups, prefer awaited user interactions and queries, and prove that timing changes do not hide state-update failures.

### Jest 30

Upgrade only after the Expo/Jest preset declares compatibility. Validate fake timers, module transforms, ESM/CJS boundaries, snapshots, setup files, mocks of native modules, open-handle detection, and coverage output. Defer the major if `jest-expo` support is not authoritative.

### AsyncStorage 3

Migrate removed or changed APIs such as `multiRemove`, validate Android Maven/native installation changes, and test stored-data compatibility by upgrading an installed app with real existing settings and session data.

### React Native Gesture Handler 3

Migrate legacy builder-style gesture definitions to supported hooks/APIs where required. Run interaction tests for every player, list, sheet, swipe, and press gesture affected, plus physical-device conflict testing with navigation gestures.

### ESLint 10

Upgrade configuration and plugins together only after confirming their support ranges. Treat new findings as real diagnostics unless a rule's behavior changed incompatibly; document any rule replacement or suppression.

### TypeScript 7

Do not start until TypeScript 6 and the SDK 57 codebase are clean. Run it as a compiler-compatibility experiment first, identify ecosystem blockers, and merge only when Expo, React Native types, Jest, and lint tooling support it.

### Other majors

Evaluate `uuid`, `react-native-get-random-values`, `react-native-device-info`, `lint-staged`, NetInfo, and other remaining majors one at a time or in a tightly justified compatibility cluster. Each subphase must identify its public API delta, native rebuild requirement, data-format risk, and targeted tests before editing the manifest.

## Regression Gate Model

Every phase progresses through the same ordered gates. A failed required gate stops promotion. Fixes return to the earliest gate they can affect.

### Gate G0: Dependency and configuration integrity

Required evidence:

- Clean `npm ci` using the CI Node/npm version.
- `npm ls --depth=0` exits successfully with no invalid or missing direct dependency.
- `npx expo install --check` passes for the active SDK, or every deliberate exception is recorded and approved.
- `npx expo-doctor@latest` passes, or every remaining item has a recorded disposition, owner, and device evidence.
- No duplicate native module versions for Expo, SQLite, Reanimated, Gesture Handler, AsyncStorage, Track Player, or the download/file stack.
- `npx expo config --type public` is deterministic and contains the expected bundle identifiers, schemes, plugins, runtime policy, platform targets, and update URL.
- Package manifest and lockfile diffs contain only intended changes.
- The resolved Node, npm, Expo CLI, EAS CLI, CocoaPods, Ruby, Java, Gradle, Xcode, and Android SDK versions are captured.

### Gate G1: Static analysis and automated behavior

Required evidence:

- Focused tests are written or updated before compatibility code for every identified breaking change.
- Focused tests fail for the old/incompatible behavior where a meaningful red test can be produced, then pass after the migration.
- Full Jest suite passes without forced exit and without newly ignored open handles.
- ESLint passes for changed files and the full repository does not regress.
- TypeScript passes for changed files. Full-project TypeScript errors must be zero or no higher than the explicitly captured Phase 0 baseline; the program goal is a clean full-project check.
- Circular-import checks pass for all affected service entry points, with special attention to PlayerService and its coordinator.
- Database helper and migration tests use the repository test database utilities and include upgrade-from-existing-data cases.
- Snapshot changes are individually reviewed and explained.

### Gate G2: Bundle and native build integrity

Required evidence:

- Blocking Expo exports succeed for iOS and Android.
- Development and release-style iOS simulator builds succeed.
- Development and release-style Android emulator builds succeed.
- Physical-device development clients are rebuilt from the current dependency graph.
- A clean generated-project comparison is reviewed for both platforms.
- The built iOS application's `Info.plist` contains `UILaunchScreen`; the app does not launch in compatibility/letterboxed mode.
- Release artifacts contain expected permissions, background modes, URL schemes, network security settings, native modules, and no development-only endpoints or credentials.
- The app launches from a terminated state without a JavaScript or native startup exception.

### Gate G3: Deterministic simulator regression

Required evidence:

- Maestro or an equivalent deterministic harness covers login, library load, top-level and More-scoped navigation, nested series/author/book routes, player opening, playback controls, settings, and logout/re-authentication.
- Test preconditions, server fixtures, credentials handling, and cleanup are documented so a different engineer or agent can repeat the run.
- Both iOS and Android simulator/emulator smoke suites pass when the affected behavior is supported there.
- A failed flow produces retained screenshots, logs, and the exact build/commit identifier.

Simulator success is necessary but does not replace physical-device audio, networking, storage, or OTA gates.

### Gate G4: Physical-device and data-preservation regression

Run on at least one supported physical iPhone and one supported physical Android device before release promotion. Where a phase changes a platform minimum or native implementation, include devices near both the minimum and current OS ranges when available.

Required scenarios:

- Fresh install, sign-in, library selection, data sync, and relaunch.
- Installed-app upgrade from the prior signed-off build without deleting app data.
- HTTPS server, LAN HTTP server, remote HTTP warning/decision path, airplane mode, network loss, reconnect, and server unavailability.
- Valid session, expired token, re-authentication, cancellation, and return to the interrupted route.
- Streamed playback and downloaded playback while offline.
- Download start, pause/cancel if supported, resume/retry, completion, file validation, deletion, and storage-pressure/error handling.
- Play, pause, seek, skip, playback speed, chapters, bookmarks, sleep behavior where present, and queue changes.
- Backgrounding, screen lock, native media controls, audio interruption, headphones/Bluetooth, output-route change/AirPlay where supported, force quit, and restoration.
- Progress/session persistence across backgrounding, termination, reconnect, and installed-app upgrade, respecting intentional smart-rewind rules.
- SQLite schema/data preservation, downloaded-file presence, settings, credentials/tokens, bookmarks, and current-item state after upgrade.
- OTA update on the matching runtime, embedded-bundle fallback, failed-update recovery, and proof that an artifact from an incompatible native runtime is rejected.

The acceptance record must include device model, OS, build type, server version, network path, starting app version, ending app version, commit, result, evidence link/path, and tester.

### Gate G5: Performance, endurance, and release promotion

Required evidence:

- Five cold starts on the same device/build type. The median time to interactive must not regress more than 10% from the signed-off baseline without explicit approval and root-cause analysis.
- At least 60 minutes of continuous playback with representative UI/background transitions and no crash, hang, audio stall, or unbounded memory growth.
- Steady-state resident memory after 30 minutes must not regress more than 15% from the comparable baseline. During the final 15 minutes, unexplained growth greater than 10 MB requires investigation and blocks promotion until classified.
- Download and offline-start timings do not regress more than 15% under the same server/network fixture without an approved explanation.
- Release-style IPA/TestFlight and Android AAB/internal artifacts install, launch, authenticate, stream, download, and play offline.
- Crash and native logs contain no new recurring fatal or high-severity signature during the acceptance run.
- The acceptance record is complete and explicitly signed off before the next SDK phase or production release.

Threshold changes require an evidence-based amendment to this design; a phase may not silently redefine its own pass criteria after seeing results.

## Failure Handling and Stop Rules

- Any crash, data loss, download corruption, authentication lockout, incompatible OTA delivery, inability to play in the background, or failure to restore an existing user's library blocks the phase regardless of aggregate test results.
- A newly flaky test is a failure to diagnose, not a candidate for retries by default.
- If a native module is not supported by the target SDK/New Architecture, stop the phase and choose among upgrade, replacement, scoped patch, or SDK deferral through a documented decision. Do not suppress the compatibility signal and proceed.
- If the iOS or Android minimum version change drops an intended supported audience, stop before manifest/native changes and obtain a product decision.
- If performance exceeds a threshold, capture a profiler trace on the old and new builds using the same scenario before deciding whether to optimize, defer, or accept the regression.
- If generated native changes overwrite maintained customizations, restore the last known-good files, identify the responsible config/plugin input, and make the source configuration authoritative before regenerating again.

## Rollback Design

- The signed-off state of every phase is a reproducible commit and release/build identifier.
- Keep package manifest, lockfile, app configuration, native projects, generated migrations, and compatibility fixes in the same phase history so a rollback restores a coherent dependency set.
- A phase is rolled back by rebuilding the prior native commit and distributing it through the appropriate internal/store channel. OTA is reserved for JavaScript/assets compatible with the currently installed native runtime.
- Never publish an OTA artifact until the build's runtime identifier has been inspected and matched to the intended native build.
- Database migrations must be forward-safe. If a schema cannot be downgraded, rollback validation must prove that the prior app either tolerates the new schema or that release promotion prevents an unsafe downgrade path.
- Preserve acceptance artifacts for the last known-good build and the failed candidate so the regression is reproducible.

## Deliverables Per Phase

Each implementation plan must produce:

- A refreshed dependency and breaking-change inventory with authoritative source links.
- Exact package/config/native/code changes.
- Focused test additions and migration order.
- Commands with expected pass conditions.
- A reviewed dependency/lockfile/native-project diff.
- A completed section of `docs/testing/dependency-upgrade-acceptance.md`.
- Performance and endurance comparison results.
- Known warnings and deferrals with owners and expiry triggers.
- A rollback commit/build identifier.
- A concise release note describing platform minimums, developer-environment changes, and user-visible compatibility impact.

## Non-Goals

- Shipping unrelated features or visual redesigns.
- Updating every package to its latest published major regardless of Expo compatibility.
- Refactoring architecture solely because an upgrade touches nearby code.
- Replacing native libraries without first proving incompatibility or unacceptable risk.
- Treating a green Expo export, CI workflow, or simulator smoke test as proof of production readiness.
- Publishing a production release, OTA update, or pull request as part of planning.

## Program Completion Criteria

The dependency upgrade program is complete when:

- Expo SDK 57 is the reproducible, signed-off framework baseline.
- All required Expo-managed and native dependencies are compatible with that baseline.
- Independent majors selected for adoption have passed their own subphase gates; explicitly deferred majors have documented blockers and revisit triggers.
- CI blocks dependency, type/lint, test, circular-import, and Expo export regressions at the agreed levels.
- iOS and Android release artifacts pass the shared device acceptance matrix.
- User data, downloaded content, playback, authentication, progress sync, and OTA runtime safety have been demonstrated across installed-app upgrades.
- No unresolved critical/high-severity regression, unexplained native configuration drift, or undocumented compatibility suppression remains.
