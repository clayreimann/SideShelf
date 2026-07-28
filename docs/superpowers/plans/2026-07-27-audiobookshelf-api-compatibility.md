# Audiobookshelf API Compatibility Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable black-box compatibility gate that proves a SideShelf revision works with supported Audiobookshelf versions before every SideShelf release and proves a deployed SideShelf release survives a proposed Audiobookshelf upgrade.

**Architecture:** A dependency-free Node.js runner will restore deterministic synthetic fixture backups into isolated, version-pinned Audiobookshelf containers, execute SideShelf's real HTTP contracts, validate semantics, compare observations, and produce `GO`, `CONDITIONAL GO`, or `NO-GO` evidence. App-release mode uses a version-native backup for each server; server-upgrade mode gives both baseline and candidate independent copies of the baseline backup so the candidate performs the real forward migration.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, built-in `fetch`, Docker Compose v2, POSIX `tar`, JSON and Markdown artifacts, existing npm tooling.

## Global Constraints

- Implement from an isolated worktree created with `superpowers:using-git-worktrees`; preserve unrelated changes in the source checkout.
- Read the approved design at `docs/superpowers/specs/2026-07-27-audiobookshelf-api-compatibility-design.md` before starting each implementation session.
- Follow test-driven development for executable modules: add a failing test, run it and confirm the intended failure, implement the smallest behavior, then rerun it.
- Add no runtime npm dependency. The runner must use Node 20 built-ins and the host's Docker Compose v2 and `tar`.
- Never mount production Audiobookshelf paths, databases, metadata, media, credentials, or Docker volumes.
- Bind published container ports to `127.0.0.1` only. Use run-scoped Compose project names and disposable directories.
- Never clean up Docker resources by image, label shared with other projects, broad name prefix, or user-supplied path. Clean up only the exact Compose project and run directory created by the current process.
- Never start two server versions against the same writable `/config` or `/metadata` tree.
- App-release mode must use the version-native fixture for every server version. Server-upgrade mode must use separate copies of the baseline fixture for baseline and candidate.
- Record both requested image tags and immutable image digests. A tag without a digest cannot receive `GO`.
- Validate declared SideShelf semantics. Baseline/candidate equality cannot hide a contract failure.
- Redact access tokens, refresh tokens, passwords, cookies, authorization headers, fixture test credentials, and signed media query values from every artifact and error.
- Tests must not require a permanently running server. Unit tests use fakes; opt-in acceptance tests own and remove their containers.
- Generated local run evidence belongs under `.artifacts/api-compatibility/` and must remain ignored. Durable promotion entries belong under `docs/testing/`.
- Use exact version strings without a leading `v` in both the compatibility manifest and container image tags; Audiobookshelf publishes fixed container tags such as `:2.35.1`.
- End each task with its focused tests, `npm run lint` only when TypeScript/React Native files are touched, and `git diff --check`.
- Commit each task separately. Do not publish, push, open a pull request, or update production infrastructure without a new explicit request.

---

### Task 1: Establish the manifest, command model, and local entry point

**Files:**

- Create: `api-compatibility/compatibility.json`
- Create: `api-compatibility/src/config.mjs`
- Create: `api-compatibility/src/cli-args.mjs`
- Create: `api-compatibility/__tests__/config.test.mjs`
- Create: `api-compatibility/__tests__/cli-args.test.mjs`
- Create: `scripts/run-api-compatibility.sh`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**

- `loadCompatibilityConfig(path): Promise<CompatibilityConfig>`
- `validateCompatibilityConfig(value): CompatibilityConfig`
- `parseCliArgs(argv): CliRequest`
- `buildRunPlan(config, request): RunPlan`
- `npm run api-compatibility -- <mode> [options]`
- `npm run test:api-compatibility`

- [ ] **Step 1: Add the initial compatibility manifest**

  Create `api-compatibility/compatibility.json` with this schema and initial policy:

  ```json
  {
    "schemaVersion": 1,
    "containerRepository": "ghcr.io/advplyr/audiobookshelf",
    "minimumServerVersion": "2.28.0",
    "productionServerVersion": "2.28.0",
    "releaseTestVersions": ["2.28.0", "2.35.1"],
    "fixtureRevision": "fixture-v1",
    "contractSuiteRevision": 1,
    "nativeFixtures": {
      "2.28.0": {
        "archive": "fixtures/snapshots/2.28.0-fixture-v1.tgz",
        "map": "fixtures/maps/2.28.0-fixture-v1.json",
        "sha256": null
      },
      "2.35.1": {
        "archive": "fixtures/snapshots/2.35.1-fixture-v1.tgz",
        "map": "fixtures/maps/2.35.1-fixture-v1.json",
        "sha256": null
      }
    },
    "acceptedImageDigests": {},
    "waivers": []
  }
  ```

  `sha256: null` means the fixture has not been generated and must block execution; it is not a wildcard.

- [ ] **Step 2: Add failing manifest and CLI tests**

  Cover:
  - exact semantic version validation;
  - rejection of versions with shell metacharacters, whitespace, paths, or a leading `v`;
  - rejection of an unsupported schema version;
  - rejection of a missing or null fixture checksum at run-plan time;
  - deduplication of app-release versions while retaining minimum, production, and candidate anchors;
  - server-upgrade plan selection of the baseline fixture for both targets;
  - app-release plan selection of each target's native fixture;
  - required `--sideshelf-ref`;
  - default output directory under `.artifacts/api-compatibility/`; and
  - distinct exit codes: `0` for `GO`, `2` for `CONDITIONAL GO`, `3` for `NO-GO` or incomplete evidence, and `1` for invalid invocation.

  Use temporary fixture manifests created under `node:test`'s temporary directory. Do not edit the repository manifest from a test.

- [ ] **Step 3: Run the tests and verify the modules are missing**

  Run:

  ```bash
  node --test api-compatibility/__tests__/config.test.mjs api-compatibility/__tests__/cli-args.test.mjs
  ```

  Expected: module-resolution failures for `config.mjs` and `cli-args.mjs`.

- [ ] **Step 4: Implement strict manifest and argument parsing**

  Use `node:fs/promises`, `node:path`, and explicit validation functions. The public model must normalize into this shape:

  ```js
  /**
   * @typedef {{
   *   mode: "app-release" | "server-upgrade",
   *   sideshelfRef: string,
   *   targets: Array<{
   *     role: "minimum" | "production" | "candidate" | "baseline",
   *     version: string,
   *     fixtureVersion: string
   *   }>,
   *   outputDir: string,
   *   keepFailedArtifacts: boolean
   * }} RunPlan
   */
  ```

  `buildRunPlan()` must reject:
  - a server-upgrade request without both `--baseline` and `--candidate`;
  - an app-release request for a version without a native fixture entry;
  - a server-upgrade request without a native fixture for the baseline;
  - any fixture entry whose checksum is null or not 64 lowercase hexadecimal characters; and
  - output directories resolving to the repository root or any ancestor of it.

- [ ] **Step 5: Add the stable shell and npm entry points**

  `scripts/run-api-compatibility.sh` must:

  ```sh
  #!/bin/sh
  set -eu
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
  exec node "$REPO_ROOT/api-compatibility/src/cli.mjs" "$@"
  ```

  Add:

  ```json
  {
    "scripts": {
      "api-compatibility": "sh scripts/run-api-compatibility.sh",
      "test:api-compatibility": "node --test api-compatibility/__tests__/*.test.mjs"
    }
  }
  ```

  Preserve all existing `package.json` scripts. Add `.artifacts/api-compatibility/` to `.gitignore`.

- [ ] **Step 6: Verify and commit Task 1**

  Run:

  ```bash
  npm run test:api-compatibility
  sh -n scripts/run-api-compatibility.sh
  git diff --check
  ```

  Expected: all compatibility unit tests pass, the shell script parses, and no whitespace errors are reported.

  Commit:

  ```bash
  git add .gitignore package.json scripts/run-api-compatibility.sh api-compatibility/compatibility.json api-compatibility/src/config.mjs api-compatibility/src/cli-args.mjs api-compatibility/__tests__/config.test.mjs api-compatibility/__tests__/cli-args.test.mjs
  git commit -m "test: scaffold ABS compatibility gate"
  ```

---

### Task 2: Build a safe Docker lifecycle with bounded readiness and cleanup

**Files:**

- Create: `api-compatibility/compose.yml`
- Create: `api-compatibility/src/process.mjs`
- Create: `api-compatibility/src/docker.mjs`
- Create: `api-compatibility/src/redact.mjs`
- Create: `api-compatibility/__tests__/process.test.mjs`
- Create: `api-compatibility/__tests__/docker.test.mjs`
- Create: `api-compatibility/__tests__/redact.test.mjs`

**Interfaces:**

- `runProcess(command, args, options): Promise<ProcessResult>`
- `createRunScope({ outputRoot, role, version }): Promise<RunScope>`
- `resolveImageDigest(repository, version): Promise<string>`
- `startServer(scope, target): Promise<RunningServer>`
- `waitForServer(server, timeoutMs): Promise<ServerStatus>`
- `stopServer(server): Promise<CleanupResult>`
- `redact(value): unknown`

- [ ] **Step 1: Add failing process, redaction, and lifecycle tests**

  Use an injected process runner and fake clock. Prove:
  - command and arguments are passed as arrays with `shell: false`;
  - timeout sends `SIGTERM`, then `SIGKILL` after a bounded grace period;
  - stdout and stderr have maximum captured sizes;
  - redaction handles nested objects, arrays, strings, mixed-case headers, URLs, and server logs;
  - run IDs contain only lowercase letters, digits, and hyphens;
  - Compose project names and directories derive only from the generated run ID;
  - host ports bind to `127.0.0.1`;
  - readiness polling stops on success, timeout, or early container exit;
  - cleanup calls `docker compose --project-name <generated-run-id> --file api-compatibility/compose.yml down --volumes --remove-orphans` for the exact project;
  - cleanup never invokes `docker system prune`, `docker volume prune`, or an unscoped `docker rm`; and
  - signal handlers execute cleanup once.

- [ ] **Step 2: Run the tests and verify the modules are missing**

  Run:

  ```bash
  node --test api-compatibility/__tests__/process.test.mjs api-compatibility/__tests__/docker.test.mjs api-compatibility/__tests__/redact.test.mjs
  ```

  Expected: module-resolution failures for all three new modules.

- [ ] **Step 3: Define the isolated Compose service**

  `api-compatibility/compose.yml` must define one service named `abs`:

  ```yaml
  services:
    abs:
      image: "${ABS_IMAGE:?ABS_IMAGE is required}"
      environment:
        TZ: UTC
      volumes:
        - "${ABS_CONFIG_DIR:?ABS_CONFIG_DIR is required}:/config"
        - "${ABS_METADATA_DIR:?ABS_METADATA_DIR is required}:/metadata"
        - "${ABS_BOOKS_DIR:?ABS_BOOKS_DIR is required}:/audiobooks:ro"
        - "${ABS_PODCASTS_DIR:?ABS_PODCASTS_DIR is required}:/podcasts:ro"
      ports:
        - "127.0.0.1::80"
      restart: "no"
  ```

  Compose project isolation supplies the network. Do not set `network_mode: host`, privileged mode, a fixed container name, or a fixed host port.

- [ ] **Step 4: Implement bounded process execution and redaction**

  `runProcess()` must use `spawn(command, args, { shell: false })`, cap each captured stream at 1 MiB, attach the exit code and sanitized output to failures, and distinguish timeout from non-zero exit.

  `redact()` must replace values for keys matching:

  ```js
  /^(authorization|cookie|set-cookie|password|accessToken|refreshToken|token)$/i;
  ```

  It must also redact bearer tokens, `x-refresh-token` values, fixture passwords, and query values named `token`, `sig`, or `signature` inside free-form strings.

- [ ] **Step 5: Implement the Docker lifecycle**

  The lifecycle must:
  1. verify `docker compose version`;
  2. resolve `repository:<version>` to a RepoDigest using `docker image inspect`, pulling the exact tag only if absent;
  3. create a temporary run directory beneath the validated artifact root;
  4. prepare separate `config`, `metadata`, and evidence directories;
  5. run Compose with an explicit `--project-name`, `--file`, and `--env-file`;
  6. obtain the mapped port using `docker compose port abs 80`;
  7. poll `GET /ping` every 500 ms for at most 90 seconds;
  8. inspect container state when readiness fails;
  9. capture sanitized Compose logs before teardown; and
  10. tear down only that project and remove only that run directory.

  Register `SIGINT` and `SIGTERM` handlers after a scope is created. The handler must set a cancellation flag, await the active cleanup promise, and exit with code `130` or `143`.

- [ ] **Step 6: Verify and commit Task 2**

  Run:

  ```bash
  npm run test:api-compatibility
  docker compose -f api-compatibility/compose.yml config --no-interpolate
  git diff --check
  ```

  Expected: unit tests pass. The Compose validation may report only the intentionally missing required environment variables; it must not report YAML or schema errors.

  Commit:

  ```bash
  git add api-compatibility/compose.yml api-compatibility/src/process.mjs api-compatibility/src/docker.mjs api-compatibility/src/redact.mjs api-compatibility/__tests__/process.test.mjs api-compatibility/__tests__/docker.test.mjs api-compatibility/__tests__/redact.test.mjs
  git commit -m "test: isolate ABS compatibility containers"
  ```

---

### Task 3: Generate the logical synthetic media library

**Files:**

- Create: `api-compatibility/fixtures/fixture-v1.json`
- Create: `api-compatibility/fixtures/generate-media.mjs`
- Create: `api-compatibility/fixtures/verify-media.mjs`
- Create: `api-compatibility/__tests__/fixture-media.test.mjs`
- Generate: `api-compatibility/fixtures/media/audiobooks/**`
- Generate: `api-compatibility/fixtures/media/podcasts/**`

**Interfaces:**

- `generateFixtureMedia(definition, outputRoot): Promise<MediaManifest>`
- `verifyFixtureMedia(definition, outputRoot): Promise<MediaManifest>`
- `node api-compatibility/fixtures/generate-media.mjs`

- [ ] **Step 1: Define the logical fixture**

  `fixture-v1.json` must contain:
  - book library `compat-books`, folder `/audiobooks`;
  - podcast library `compat-podcasts`, folder `/podcasts`;
  - admin user `compat_admin`;
  - normal user `compat_user`, with download permission and both libraries;
  - restricted user `compat_restricted`, without the podcast library;
  - 101 pagination books so SideShelf's page size of 100 crosses a boundary;
  - one named single-file book;
  - one named two-track book;
  - one author with generated artwork;
  - one podcast with one local episode;
  - chapters at `0`, `1`, and `2` seconds on the two-track book;
  - known progress, bookmark, and closed-session values; and
  - test-only credentials visibly labeled as isolated fixture values.

  Use ASCII names and filenames so path encoding does not obscure API failures in fixture revision 1.

- [ ] **Step 2: Add failing deterministic-media tests**

  Prove that two independent generations produce identical:
  - relative paths;
  - file bytes;
  - SHA-256 checksums;
  - WAV RIFF headers and declared byte lengths;
  - PNG signatures; and
  - aggregate manifest.

  Also prove the verifier rejects a missing file, a changed byte, an extra media file, and a fixture path containing `..`, an absolute path, or a NUL byte.

- [ ] **Step 3: Run the test and verify generation is not implemented**

  Run:

  ```bash
  node --test api-compatibility/__tests__/fixture-media.test.mjs
  ```

  Expected: module-resolution failure for the media generator.

- [ ] **Step 4: Implement deterministic WAV and PNG generation**

  Generate 8 kHz, 16-bit, mono PCM WAV files. Every sample is derived only from the fixture entry's index and sample position; do not use time or randomness. The two-track book uses two 2-second tracks. Pagination books use 0.25-second tracks to keep the repository fixture small.

  Write PNG artwork from fixed base64 byte strings stored in the generator. Generate:

  ```text
  audiobooks/Contract Author/Single File Contract Book/01 - Complete.wav
  audiobooks/Contract Author/Single File Contract Book/cover.png
  audiobooks/Contract Author/Multi File Contract Book/01 - Part One.wav
  audiobooks/Contract Author/Multi File Contract Book/02 - Part Two.wav
  audiobooks/Contract Author/Multi File Contract Book/cover.png
  audiobooks/Pagination Author/Page Book 001/01.wav
  through
  audiobooks/Pagination Author/Page Book 101/01.wav
  podcasts/Contract Podcast/001 - Contract Episode.wav
  podcasts/Contract Podcast/cover.png
  author-images/Contract Author.png
  ```

  The generator must refuse to overwrite a non-matching existing file unless invoked with `--replace`, and `--replace` may operate only inside `api-compatibility/fixtures/media`.

- [ ] **Step 5: Generate, verify, and inspect the media**

  Run:

  ```bash
  node api-compatibility/fixtures/generate-media.mjs
  node api-compatibility/fixtures/verify-media.mjs
  find api-compatibility/fixtures/media -type f | sort
  ```

  Expected: 109 generated fixture files, a stable aggregate checksum, and no file outside the fixture media directory.

- [ ] **Step 6: Verify and commit Task 3**

  Run:

  ```bash
  npm run test:api-compatibility
  node api-compatibility/fixtures/verify-media.mjs
  git diff --check
  ```

  Expected: all tests pass and the verifier prints the fixture revision plus aggregate checksum.

  Commit:

  ```bash
  git add api-compatibility/fixtures/fixture-v1.json api-compatibility/fixtures/generate-media.mjs api-compatibility/fixtures/verify-media.mjs api-compatibility/fixtures/media api-compatibility/__tests__/fixture-media.test.mjs
  git commit -m "test: add synthetic ABS media library"
  ```

---

### Task 4: Bootstrap reproducible version-native fixture backups

**Files:**

- Create: `api-compatibility/src/http.mjs`
- Create: `api-compatibility/src/bootstrap.mjs`
- Create: `api-compatibility/src/snapshot.mjs`
- Create: `api-compatibility/fixtures/build-snapshot.mjs`
- Create: `api-compatibility/__tests__/http.test.mjs`
- Create: `api-compatibility/__tests__/bootstrap.test.mjs`
- Create: `api-compatibility/__tests__/snapshot.test.mjs`
- Generate: `api-compatibility/fixtures/snapshots/2.28.0-fixture-v1.tgz`
- Generate: `api-compatibility/fixtures/snapshots/2.35.1-fixture-v1.tgz`
- Generate: `api-compatibility/fixtures/maps/2.28.0-fixture-v1.json`
- Generate: `api-compatibility/fixtures/maps/2.35.1-fixture-v1.json`
- Modify: `api-compatibility/compatibility.json`
- Modify: `package.json`

**Interfaces:**

- `HttpClient.request(method, path, options): Promise<HttpObservation>`
- `initializeServer(client, fixture): Promise<FixtureCredentials>`
- `bootstrapFixture(client, fixture): Promise<FixtureMap>`
- `createSnapshot(scope, version, fixtureMap): Promise<SnapshotRecord>`
- `verifySnapshot(record): Promise<void>`
- `restoreSnapshot(record, destination): Promise<void>`
- `npm run api-compatibility:fixture -- --version <version>`

- [ ] **Step 1: Add failing HTTP, bootstrap, and snapshot tests**

  The HTTP fake server must prove:
  - JSON and binary response capture;
  - request timeout classification;
  - status, headers, safe body preview, byte length, and SHA-256 observation;
  - rejection of redirects outside the loopback server origin;
  - login token normalization from the response shapes accepted by SideShelf;
  - polling a library scan until it is no longer running;
  - fixture-map validation for every named entity;
  - archive checksum verification before extraction;
  - extraction into an empty destination only;
  - refusal of archive members with absolute paths or `..`; and
  - byte-for-byte preservation of the source archive across two restores.

- [ ] **Step 2: Run the focused tests and verify the modules are missing**

  Run:

  ```bash
  node --test api-compatibility/__tests__/http.test.mjs api-compatibility/__tests__/bootstrap.test.mjs api-compatibility/__tests__/snapshot.test.mjs
  ```

  Expected: module-resolution failures for `http.mjs`, `bootstrap.mjs`, and `snapshot.mjs`.

- [ ] **Step 3: Implement the loopback-only HTTP client**

  The constructor accepts one `http://127.0.0.1:<port>` origin. Reject credentials in URLs and any response redirect whose final origin differs. Store tokens only in memory. Return:

  ```js
  {
    (status, headers, contentType, json, bytes, byteLength, sha256, durationMs);
  }
  ```

  Never include raw authorization or refresh headers in a thrown error.

- [ ] **Step 4: Implement server initialization and logical fixture bootstrap**

  Against a blank server:
  1. wait for `/status` to report an uninitialized server;
  2. `POST /init` with the fixture administrator;
  3. `POST /login` with `x-return-tokens: true`;
  4. create `/audiobooks` and `/podcasts` libraries;
  5. trigger and poll scans;
  6. paginate all book items and locate the named single-file, multi-file, and pagination entities by media metadata;
  7. locate the podcast and local episode;
  8. set deterministic chapters on the multi-file book;
  9. upload the generated author image with multipart `FormData`;
  10. create the normal and restricted users with explicit permission objects and library IDs;
  11. log in as the normal user;
  12. create the known book and episode progress;
  13. create the known bookmark;
  14. create, sync, and close the known local session; and
  15. read every mutation back before declaring bootstrap complete.

  Library settings must disable automatic scanning and watchers so a restored snapshot does not mutate itself during a contract run.

- [ ] **Step 5: Write and validate the fixture map**

  The fixture map must contain no tokens or passwords. It records only stable lookup data:

  ```js
  {
    schemaVersion: 1,
    fixtureRevision: "fixture-v1",
    serverVersion,
    libraries: { booksId, podcastsId },
    users: { adminId, normalId, restrictedId },
    items: {
      singleFileBookId,
      multiFileBookId,
      podcastId,
      podcastEpisodeId,
      restrictedItemId
    },
    author: { id },
    media: {
      multiFileTrackInodes,
      expectedSha256ByRelativePath
    },
    state: {
      bookmarkTime,
      progressCurrentTime,
      closedSessionId
    }
  }
  ```

  Validate that all IDs are non-empty strings, inode values are finite positive numbers or numeric strings, every referenced media file exists, and the map's server version matches the running server.

- [ ] **Step 6: Implement safe snapshot creation and restoration**

  Stop the fixture-building container before archiving. Archive only its `config` and `metadata` directories. List the archive before extraction and reject any member outside those two roots.

  Write the archive to a temporary sibling file, compute SHA-256, then rename it atomically. Update only the matching `nativeFixtures[version].sha256` after:
  - restoring the archive twice to independent temporary directories;
  - verifying both directory trees have identical relative paths and hashes; and
  - proving the source archive hash did not change.

  Snapshot generation must fail when `git status --short` shows an unexpected pre-existing change to the target archive, map, or manifest entry.

- [ ] **Step 7: Add the fixture-building command**

  Add:

  ```json
  {
    "scripts": {
      "api-compatibility:fixture": "node api-compatibility/fixtures/build-snapshot.mjs"
    }
  }
  ```

  The command accepts exactly one `--version`, verifies media, starts a blank container for that exact version, bootstraps the fixture, stops it, creates the snapshot, updates the map and manifest checksum, and cleans its Compose project.

- [ ] **Step 8: Generate both initial native fixtures**

  Run:

  ```bash
  npm run api-compatibility:fixture -- --version 2.28.0
  npm run api-compatibility:fixture -- --version 2.35.1
  ```

  Expected: both archives, both fixture maps, and both non-null manifest checksums are created; no containers or networks remain for either build project.

- [ ] **Step 9: Verify and commit Task 4**

  Run:

  ```bash
  npm run test:api-compatibility
  node api-compatibility/fixtures/verify-media.mjs
  npm run api-compatibility:fixture -- --verify-only --version 2.28.0
  npm run api-compatibility:fixture -- --verify-only --version 2.35.1
  git diff --check
  ```

  Expected: tests pass; each archive, map, and media checksum verifies without starting a container.

  Commit:

  ```bash
  git add package.json api-compatibility/compatibility.json api-compatibility/src/http.mjs api-compatibility/src/bootstrap.mjs api-compatibility/src/snapshot.mjs api-compatibility/fixtures/build-snapshot.mjs api-compatibility/fixtures/snapshots api-compatibility/fixtures/maps api-compatibility/__tests__/http.test.mjs api-compatibility/__tests__/bootstrap.test.mjs api-compatibility/__tests__/snapshot.test.mjs
  git commit -m "test: build reproducible ABS fixture backups"
  ```

---

### Task 5: Implement semantic validators, result models, and deliberate incompatibility tests

**Files:**

- Create: `api-compatibility/src/result.mjs`
- Create: `api-compatibility/contracts/assertions.mjs`
- Create: `api-compatibility/contracts/validators.mjs`
- Create: `api-compatibility/__tests__/assertions.test.mjs`
- Create: `api-compatibility/__tests__/validators.test.mjs`

**Interfaces:**

- `pass(contract, observations): ContractResult`
- `fail(contract, category, message, observations): ContractResult`
- `blocked(contract, dependencyIds): ContractResult`
- `assertObject`, `assertString`, `assertFiniteNumber`, `assertArray`
- `validateUser`, `validateLibrary`, `validateMinifiedItem`, `validateFullItem`
- `validatePlaybackSession`, `validateProgress`, `validateBookmark`
- `validateRangeResponse`, `validateDownloadResponse`

- [ ] **Step 1: Add failing validator tests using representative ABS response shapes**

  Cover all fields SideShelf reads from:
  - login and current user;
  - library list, library detail, and filter data;
  - minified book and podcast items;
  - full book and podcast item media;
  - audio tracks and chapters;
  - playback sessions;
  - book and episode progress;
  - bookmarks;
  - cover and author-image bytes;
  - byte-range responses; and
  - complete file downloads.

  Include deliberate counterexamples for missing IDs, string durations, negative times, duplicate pagination IDs, chapter end before start, a track gap or overlap, a mismatched `Content-Range`, and a successful mutation whose read-back is unchanged.

- [ ] **Step 2: Run the tests and verify the validator modules are missing**

  Run:

  ```bash
  node --test api-compatibility/__tests__/assertions.test.mjs api-compatibility/__tests__/validators.test.mjs
  ```

  Expected: module-resolution failures for the assertion and validator modules.

- [ ] **Step 3: Implement structured assertion failures**

  Assertion failures must contain:

  ```js
  {
    category: ("http-status" |
      "malformed-json" |
      "missing-field" |
      "wrong-type" |
      "semantic-mismatch" |
      "permission-bypass" |
      "timeout" |
      "network" |
      "server-exit",
      path,
      expected,
      actual);
  }
  ```

  Actual values pass through `redact()` before storage. Human-readable messages must name the contract and JSON path without embedding a full response body.

- [ ] **Step 4: Implement SideShelf-semantic validators**

  Do not snapshot whole JSON bodies. Validate only required behavior:
  - IDs are non-empty strings;
  - durations and times are finite seconds;
  - progress is within media duration;
  - page totals and IDs are coherent;
  - track starts are ordered and durations positive;
  - chapter bounds are ordered and inside media duration;
  - playback content URLs remain on the test origin or are relative URLs;
  - binary media is non-empty;
  - a range request returns the requested bytes with coherent headers;
  - a full download matches the generated fixture file's byte length and SHA-256;
  - permission denials are 401 or 403 and never contain protected entity data; and
  - mutation validators perform a read-back and compare semantic state.

- [ ] **Step 5: Add a deliberate additive-field and breaking-field proof**

  The same test fixture response must:
  - pass when an unused `futureField` is present;
  - fail with category `missing-field` when a SideShelf-required field is removed; and
  - remain failed even when both a fake baseline and fake candidate omit the field.

- [ ] **Step 6: Verify and commit Task 5**

  Run:

  ```bash
  npm run test:api-compatibility
  git diff --check
  ```

  Expected: all validator tests pass, including the deliberate additive and breaking cases.

  Commit:

  ```bash
  git add api-compatibility/src/result.mjs api-compatibility/contracts/assertions.mjs api-compatibility/contracts/validators.mjs api-compatibility/__tests__/assertions.test.mjs api-compatibility/__tests__/validators.test.mjs
  git commit -m "test: validate SideShelf ABS response semantics"
  ```

---

### Task 6: Create the contract catalog and enforce route coverage

**Files:**

- Create: `api-compatibility/contracts/catalog.mjs`
- Create: `api-compatibility/contracts/source-coverage.mjs`
- Create: `api-compatibility/__tests__/catalog.test.mjs`
- Create: `api-compatibility/__tests__/source-coverage.test.mjs`

**Interfaces:**

- `CONTRACTS: readonly ContractDefinition[]`
- `NON_CONTRACT_EXPORTS: readonly SourceDisposition[]`
- `validateCatalog(contracts): void`
- `auditSourceCoverage(repoRoot, contracts, dispositions): CoverageReport`

- [ ] **Step 1: Add failing catalog integrity and source-coverage tests**

  Prove:
  - contract IDs are unique and match `^[a-z][a-z0-9.-]+$`;
  - priority is exactly `P0`, `P1`, or `P2`;
  - every entry declares method, route, auth mode, fixture prerequisites, timeout, parallel safety, validator, and source owner;
  - every dependency ID names another catalog entry;
  - the catalog is acyclic;
  - all exported endpoint functions in `src/lib/api/endpoints.ts` are cataloged or explicitly disposed;
  - direct server calls in `src/lib/api/api.ts`, `src/services/ApiClientService.ts`, `src/services/DownloadService.ts`, `src/lib/fileSystem.ts`, `src/lib/covers.ts`, `src/lib/authorImages.ts`, and `src/stores/slices/networkSlice.ts` are cataloged or disposed; and
  - adding a temporary exported server endpoint to a copied source tree causes a targeted coverage failure naming its file and function.

- [ ] **Step 2: Run the tests and verify the catalog does not exist**

  Run:

  ```bash
  node --test api-compatibility/__tests__/catalog.test.mjs api-compatibility/__tests__/source-coverage.test.mjs
  ```

  Expected: module-resolution failures for `catalog.mjs` and `source-coverage.mjs`.

- [ ] **Step 3: Register the approved contract matrix**

  Add all P0 and P1 IDs from the approved design:

  ```text
  server.ping
  auth.login
  auth.refresh
  user.me
  libraries.list
  libraries.get
  libraries.filterdata
  items.page
  items.added
  items.get
  items.batch
  play.start
  media.stream
  media.download
  progress.read
  progress.update
  session.local
  session.sync
  session.close
  bookmark.create
  bookmark.rename
  bookmark.delete
  permissions.core
  cover.item
  image.author
  auth.retry-once
  auth.reject
  items.multipage
  book.multifile
  chapters.bounds
  server.restart
  errors.classifiable
  logs.clean
  ```

  Each source owner must name an exact file and exported function, class method, or module-level function. Utility exports such as `getDeviceInfo()` and the multi-page aggregation wrapper must have an explicit disposition that points to the contract exercising their behavior.

- [ ] **Step 4: Implement source coverage without a TypeScript parser dependency**

  Use lexical extraction limited to the guarded files:
  - exported function and exported constant names in `endpoints.ts`;
  - named methods that contain `apiFetch(` or `fetch(` in the other guarded modules; and
  - route-bearing string and template literals inside those functions or methods.

  Strip comments before extraction. Normalize template substitutions to `:param` and preserve static route segments. Fail closed when the extractor encounters a network call it cannot assign to a named scope.

  The audit report must list:
  - discovered network scopes;
  - cataloged scopes;
  - disposed scopes with reasons;
  - missing scopes; and
  - stale catalog owners no longer found in source.

- [ ] **Step 5: Verify and commit Task 6**

  Run:

  ```bash
  npm run test:api-compatibility
  node api-compatibility/contracts/source-coverage.mjs
  git diff --check
  ```

  Expected: the live repository has zero missing network scopes and zero stale owners.

  Commit:

  ```bash
  git add api-compatibility/contracts/catalog.mjs api-compatibility/contracts/source-coverage.mjs api-compatibility/__tests__/catalog.test.mjs api-compatibility/__tests__/source-coverage.test.mjs
  git commit -m "test: catalog SideShelf ABS network contracts"
  ```

---

### Task 7: Execute authentication, read, pagination, and media contracts

**Files:**

- Create: `api-compatibility/contracts/auth.mjs`
- Create: `api-compatibility/contracts/reads.mjs`
- Create: `api-compatibility/contracts/media.mjs`
- Create: `api-compatibility/src/executor.mjs`
- Create: `api-compatibility/__tests__/auth-contracts.test.mjs`
- Create: `api-compatibility/__tests__/read-contracts.test.mjs`
- Create: `api-compatibility/__tests__/media-contracts.test.mjs`
- Create: `api-compatibility/__tests__/executor.test.mjs`

**Interfaces:**

- `runContracts(context, catalog): Promise<ContractResult[]>`
- `login(context, user): Promise<AuthState>`
- `refresh(context, authState): Promise<AuthState>`
- `runReadContracts(context): Promise<ContractResult[]>`
- `runMediaContracts(context): Promise<ContractResult[]>`

- [ ] **Step 1: Add failing fake-server contract tests**

  Test exact requests for:
  - `GET /ping`;
  - `POST /login` with `x-return-tokens: true`;
  - `POST /auth/refresh` with `x-refresh-token`;
  - `GET /api/me`;
  - library list, detail, filter data, pages, added sort, item detail, and batch get;
  - `POST /api/items/:id/play`;
  - playback content range;
  - item file download;
  - item cover; and
  - author image.

  Assert exact methods, headers, query parameters, and bodies used by SideShelf. Tests must fail if a contract silently follows an off-origin redirect or accepts HTML in place of JSON.

- [ ] **Step 2: Add auth lifecycle counterexamples**

  Prove:
  - a deliberately invalid access token plus a valid refresh token causes one 401, one refresh, and one retry;
  - a second 401 is terminal;
  - a rejected refresh is terminal and remains distinguishable from 5xx and network failures;
  - two independently logged-in sessions can refresh serially without invalidating each other;
  - concurrent callers share one in-flight refresh promise; and
  - no execution path sends more than one refresh for one rejected request wave.

- [ ] **Step 3: Run the tests and verify executors are missing**

  Run:

  ```bash
  node --test api-compatibility/__tests__/auth-contracts.test.mjs api-compatibility/__tests__/read-contracts.test.mjs api-compatibility/__tests__/media-contracts.test.mjs api-compatibility/__tests__/executor.test.mjs
  ```

  Expected: module-resolution failures for the new executors.

- [ ] **Step 4: Implement dependency-ordered execution**

  `runContracts()` must:
  - topologically order catalog dependencies;
  - run parallel-safe read contracts with a maximum concurrency of four;
  - run token, permission, mutation, restart, and persistence contracts serially;
  - mark a dependent contract `blocked` when its prerequisite failed;
  - continue independent diagnostics after a failure;
  - assign a per-contract timeout from the catalog; and
  - preserve catalog order in the final report regardless of completion order.

- [ ] **Step 5: Implement authentication and read contracts**

  Use the exact fixture IDs only for locating expected entities. Still verify API-visible relationships and pagination:
  - request `limit=100&page=0`, then subsequent pages until the server total is satisfied;
  - reject duplicate IDs or missing indices;
  - prove all 101 pagination books appear exactly once;
  - verify `sort=addedAt&desc=1` is non-increasing;
  - verify batch get returns authorized requested IDs and no others; and
  - test both the book and podcast full-item shapes.

- [ ] **Step 6: Implement playback and byte contracts**

  Start playback with the same device/session request shape as SideShelf. For one known track:
  - request `Range: bytes=0-127`;
  - require 206, 128 bytes, `Accept-Ranges: bytes`, and coherent `Content-Range`;
  - compare the bytes with the first 128 bytes of the checked-in WAV; and
  - reject an authorization redirect or HTML response.

  For full download, use the fixture map's inode and require complete bytes whose length and SHA-256 match the source WAV. Verify both multi-file track order and cumulative offsets.

- [ ] **Step 7: Verify and commit Task 7**

  Run:

  ```bash
  npm run test:api-compatibility
  git diff --check
  ```

  Expected: fake-server tests prove every P0/P1 auth, read, and media path, including bounded retry and multi-page behavior.

  Commit:

  ```bash
  git add api-compatibility/contracts/auth.mjs api-compatibility/contracts/reads.mjs api-compatibility/contracts/media.mjs api-compatibility/src/executor.mjs api-compatibility/__tests__/auth-contracts.test.mjs api-compatibility/__tests__/read-contracts.test.mjs api-compatibility/__tests__/media-contracts.test.mjs api-compatibility/__tests__/executor.test.mjs
  git commit -m "test: execute ABS read and playback contracts"
  ```

---

### Task 8: Execute progress, session, bookmark, permission, restart, and log contracts

**Files:**

- Create: `api-compatibility/contracts/mutations.mjs`
- Create: `api-compatibility/contracts/permissions.mjs`
- Create: `api-compatibility/contracts/persistence.mjs`
- Create: `api-compatibility/contracts/logs.mjs`
- Create: `api-compatibility/__tests__/mutation-contracts.test.mjs`
- Create: `api-compatibility/__tests__/permission-contracts.test.mjs`
- Create: `api-compatibility/__tests__/persistence-contracts.test.mjs`
- Create: `api-compatibility/__tests__/log-contracts.test.mjs`

**Interfaces:**

- `runMutationContracts(context): Promise<ContractResult[]>`
- `runPermissionContracts(context): Promise<ContractResult[]>`
- `capturePersistenceState(context): Promise<PersistenceState>`
- `verifyPersistenceAfterRestart(context, before): Promise<ContractResult>`
- `classifyServerLogs(logs): LogClassification`

- [ ] **Step 1: Add failing mutation and permission tests**

  Use a stateful fake server to prove:
  - book and episode progress read;
  - progress update plus exact read-back;
  - local session creation using a submitted UUID;
  - duplicate session replay classification;
  - session sync preserves seconds without multiplying or dividing;
  - session close persists final progress;
  - bookmark create handles the raw bookmark response;
  - bookmark rename is visible through `GET /api/me`;
  - numeric-time bookmark deletion removes the intended bookmark;
  - normal user download succeeds; and
  - restricted user cannot read the restricted library, item, batch item, playback session, media bytes, cover, progress, or mutation.

  A 2xx permission bypass must fail as `permission-bypass`, even if the body is empty.

- [ ] **Step 2: Add failing restart and log-classification tests**

  Prove restart verification compares:
  - progress current time and completion state;
  - bookmark time and title;
  - closed session ID and final time; and
  - fixture library and item counts.

  Log classification must recognize case-insensitive:

  ```text
  uncaught exception
  unhandled rejection
  SQLITE_ERROR
  migration failed
  database is locked
  authorization bypass
  fatal
  ```

  It must not treat an expected tested 401/403 request as a server error. Tokens and credentials must be redacted before matching or storage.

- [ ] **Step 3: Run the tests and verify the modules are missing**

  Run:

  ```bash
  node --test api-compatibility/__tests__/mutation-contracts.test.mjs api-compatibility/__tests__/permission-contracts.test.mjs api-compatibility/__tests__/persistence-contracts.test.mjs api-compatibility/__tests__/log-contracts.test.mjs
  ```

  Expected: module-resolution failures for mutation, permission, persistence, and log modules.

- [ ] **Step 4: Implement serial, collision-free mutations**

  Derive a run-specific UUID and bookmark time inside a reserved fixture range. Record the values in the result so read-back is exact. Do not rely on cleanup inside the server because the entire writable fixture copy is disposable.

  Send the same payload fields SideShelf sends for:
  - `PATCH /api/me/progress/:itemId`;
  - `POST /api/session/local`;
  - `POST /api/session/:id/sync`;
  - `POST /api/session/:id/close`;
  - `POST /api/me/item/:id/bookmark`;
  - `PATCH /api/me/item/:id/bookmark`; and
  - `DELETE /api/me/item/:id/bookmark/:time`.

  Every successful mutation requires a separate read-back. Status alone is insufficient.

- [ ] **Step 5: Implement the permission matrix**

  Log in independently as the normal and restricted fixture users. The restricted user must retain access to its allowed book library while receiving 401 or 403 for the protected podcast library and item. Verify batch responses contain neither the protected item nor metadata that identifies it.

- [ ] **Step 6: Implement restart persistence**

  After mutations:
  1. capture the semantic state;
  2. restart only the current Compose service with `docker compose restart abs`;
  3. wait for bounded readiness;
  4. log in again rather than reusing tokens;
  5. reread progress, bookmarks, sessions, libraries, and items; and
  6. compare semantic state.

  A restart that triggers a rescan, changes fixture counts, or loses a mutation fails `server.restart`.

- [ ] **Step 7: Implement server-log evidence**

  Capture:
  - `docker compose logs --no-color abs`;
  - files under the disposable `/metadata/logs/daily`;
  - files under `/metadata/logs/scans`; and
  - `/metadata/logs/crash_logs.txt` when present.

  Reject symlinks or paths escaping the disposable metadata root. A crash, migration failure, database error, unhandled request error, or container exit is P1 `logs.clean` failure. Expected authorization denials remain observations, not server-log failures.

- [ ] **Step 8: Verify and commit Task 8**

  Run:

  ```bash
  npm run test:api-compatibility
  git diff --check
  ```

  Expected: all stateful fake-server, permission, restart, and log tests pass.

  Commit:

  ```bash
  git add api-compatibility/contracts/mutations.mjs api-compatibility/contracts/permissions.mjs api-compatibility/contracts/persistence.mjs api-compatibility/contracts/logs.mjs api-compatibility/__tests__/mutation-contracts.test.mjs api-compatibility/__tests__/permission-contracts.test.mjs api-compatibility/__tests__/persistence-contracts.test.mjs api-compatibility/__tests__/log-contracts.test.mjs
  git commit -m "test: execute ABS mutation and permission contracts"
  ```

---

### Task 9: Compare observations, apply promotion rules, and write evidence

**Files:**

- Create: `api-compatibility/src/normalize.mjs`
- Create: `api-compatibility/src/compare.mjs`
- Create: `api-compatibility/src/decision.mjs`
- Create: `api-compatibility/src/report.mjs`
- Create: `api-compatibility/__tests__/compare.test.mjs`
- Create: `api-compatibility/__tests__/decision.test.mjs`
- Create: `api-compatibility/__tests__/report.test.mjs`

**Interfaces:**

- `normalizeObservation(contractId, observation): NormalizedObservation`
- `compareTargetResults(baseline, candidate): Difference[]`
- `decide(runEvidence, waivers): Decision`
- `writeReports(runEvidence, outputDir): Promise<{ jsonPath, markdownPath }>`

- [ ] **Step 1: Add failing normalization and comparison tests**

  Normalize only declared volatile fields:
  - server-generated IDs when relationships remain intact;
  - request timestamps and durations;
  - absolute disposable paths;
  - loopback port numbers;
  - image digests only in human-readable labels, never in evidence identity; and
  - object-property order.

  Prove:
  - additive unused fields are `compatible`;
  - nullable, content-type, default-sort, retry status, and envelope changes are `review-required`;
  - route loss, validator failure, permission bypass, wrong time unit, lost mutation, media mismatch, migration failure, and server crash are `breaking`; and
  - a common failure on baseline and candidate remains breaking.

- [ ] **Step 2: Add failing decision and report tests**

  Cover:
  - any P0 failure yields `NO-GO`;
  - any unwaived P1 failure yields `NO-GO`;
  - a valid P1 waiver yields `CONDITIONAL GO`;
  - P0, data corruption, permission bypass, failed migration, and auth loops cannot be waived;
  - expired, malformed, wrong-contract, or wrong-version waivers are ignored and reported;
  - missing digest, checksum, running-version proof, evidence, or cleanup proof yields `NO-GO`;
  - all required contracts plus cleanup yield `GO`;
  - JSON output conforms to schema version 1;
  - Markdown lists exact SideShelf ref, versions, digests, fixture checksum, contract results, differences, logs, cleanup, and decision; and
  - neither report contains fixture credentials or synthetic token values.

- [ ] **Step 3: Run the tests and verify comparison/report modules are missing**

  Run:

  ```bash
  node --test api-compatibility/__tests__/compare.test.mjs api-compatibility/__tests__/decision.test.mjs api-compatibility/__tests__/report.test.mjs
  ```

  Expected: module-resolution failures for normalization, comparison, decision, and report modules.

- [ ] **Step 4: Implement strict normalization and comparison**

  Each normalized observation retains:
  - contract ID;
  - request semantics;
  - status category;
  - required field/type summary;
  - semantic values used by SideShelf;
  - byte length and SHA-256 for media;
  - duration bucket;
  - validator result; and
  - sanitized diagnostics.

  Do not discard a field solely because it differs. Normalization rules must be contract-specific and covered by tests.

- [ ] **Step 5: Implement promotion decisions and waivers**

  A waiver record must contain:

  ```js
  {
    (id,
      contractId,
      serverVersions,
      sideshelfRefs,
      userImpact,
      mitigation,
      owner,
      expiresOn,
      evidence);
  }
  ```

  Require an ISO date, non-empty owner, mitigation, impact, and evidence location. Treat expiration at the start of the expiration date in UTC. Never downgrade a P0 or prohibited failure.

- [ ] **Step 6: Implement atomic, redacted reports**

  Write `report.json` and `report.md` to temporary siblings, read them back, run the redaction scanner, then rename atomically. If report validation fails, keep only a sanitized diagnostic and return incomplete evidence.

  Use deterministic ordering for targets, contracts, differences, and waivers. Runtime timestamps may vary, but rerunning identical revisions, fixture hashes, and image digests must yield the same decision.

- [ ] **Step 7: Verify and commit Task 9**

  Run:

  ```bash
  npm run test:api-compatibility
  git diff --check
  ```

  Expected: comparison, decision, and snapshot report tests pass with no secret values in generated reports.

  Commit:

  ```bash
  git add api-compatibility/src/normalize.mjs api-compatibility/src/compare.mjs api-compatibility/src/decision.mjs api-compatibility/src/report.mjs api-compatibility/__tests__/compare.test.mjs api-compatibility/__tests__/decision.test.mjs api-compatibility/__tests__/report.test.mjs
  git commit -m "test: report ABS compatibility decisions"
  ```

---

### Task 10: Wire both end-to-end run modes and operator documentation

**Files:**

- Create: `api-compatibility/src/runner.mjs`
- Create: `api-compatibility/src/cli.mjs`
- Create: `api-compatibility/__tests__/runner.test.mjs`
- Create: `api-compatibility/__tests__/cli.test.mjs`
- Create: `docs/testing/api-compatibility.md`
- Create: `docs/testing/api-compatibility-acceptance.md`
- Modify: `README.md`

**Interfaces:**

- `runCompatibilityGate(runPlan, dependencies): Promise<RunEvidence>`
- CLI commands:
  - `app-release --sideshelf-ref <ref> [--versions <csv>]`
  - `server-upgrade --sideshelf-ref <ref> --baseline <version> --candidate <version>`
  - `verify-fixtures`

- [ ] **Step 1: Add failing orchestration tests**

  With fake Docker, snapshots, HTTP, contracts, and reporter, prove app-release mode:
  - tests the minimum, production, and newest claimed versions once each;
  - restores each version's native fixture;
  - records an independent target result;
  - blocks promotion if any required version fails; and
  - cleans each target before starting the next.

  Prove server-upgrade mode:
  - verifies the baseline archive checksum once and before each restore;
  - restores independent copies of the baseline archive;
  - starts baseline against one copy and candidate against the other;
  - permits the candidate to mutate only its copy through migration;
  - rechecks the original archive checksum after both runs;
  - compares baseline and candidate observations; and
  - reports candidate migration errors as `NO-GO`.

  Also prove cancellation and a failure at every lifecycle stage still trigger only run-scoped cleanup.

- [ ] **Step 2: Run the tests and verify runner and CLI are missing**

  Run:

  ```bash
  node --test api-compatibility/__tests__/runner.test.mjs api-compatibility/__tests__/cli.test.mjs
  ```

  Expected: module-resolution failures for `runner.mjs` and `cli.mjs`.

- [ ] **Step 3: Implement app-release mode**

  For every planned server version:
  1. verify the native fixture archive and map;
  2. restore them to a fresh target scope;
  3. resolve and record the exact image digest;
  4. start, verify running version, and execute all contracts;
  5. capture logs and cleanup evidence; and
  6. stop and remove the target before proceeding.

  The final decision is `GO` only if every required server target independently qualifies.

- [ ] **Step 4: Implement server-upgrade mode**

  Restore the baseline fixture twice before either target starts. Retain a hash tree for both copies. Run baseline, then candidate. For candidate:
  - record startup logs from before readiness so migrations are observable;
  - verify the reported running version equals the requested candidate;
  - execute the same contract suite and restart contract;
  - compare semantic results with baseline; and
  - prove the baseline copy and source archive remain unchanged.

  The candidate copy is expected to change. The source archive and baseline target copy are not.

- [ ] **Step 5: Implement the CLI and exit behavior**

  Print a concise progress stream without secrets:

  ```text
  [fixture] verified fixture-v1 for 2.28.0
  [baseline] starting Audiobookshelf 2.28.0
  [baseline] 33/33 required contracts complete
  [candidate] starting Audiobookshelf 2.35.1
  [candidate] 33/33 required contracts complete
  [report] .artifacts/api-compatibility/<run-id>/report.md
  [decision] GO
  ```

  On failure, print the contract ID, category, safe summary, report path, and final decision. Return the documented exit code without bypassing cleanup.

- [ ] **Step 6: Write the operator runbook**

  `docs/testing/api-compatibility.md` must document:
  - prerequisites and Docker resource expectations;
  - fixture generation and checksum verification;
  - exact commands for both modes;
  - how to select the installed SideShelf release ref;
  - how to resolve candidate tags and rerun if a digest changes;
  - report interpretation;
  - waiver rules and prohibited waivers;
  - troubleshooting readiness, scan, migration, media, and cleanup failures;
  - confirmation that no test service remains running; and
  - the explicit prohibition on production paths or data.

  Use these commands as the canonical examples:

  ```bash
  npm run api-compatibility -- app-release \
    --sideshelf-ref "$(git rev-parse HEAD)"

  npm run api-compatibility -- server-upgrade \
    --sideshelf-ref "<installed-sideshelf-release-commit>" \
    --baseline 2.28.0 \
    --candidate 2.35.1
  ```

  `docs/testing/api-compatibility-acceptance.md` must define a copyable entry format with date, mode, SideShelf ref, fixture revision/checksum, server tags/digests, report location, decision, reviewer, and waiver IDs.

- [ ] **Step 7: Link the runbook from README**

  Add one testing/documentation link. Do not expand the README into the full runbook.

- [ ] **Step 8: Verify and commit Task 10**

  Run:

  ```bash
  npm run test:api-compatibility
  node api-compatibility/contracts/source-coverage.mjs
  npm run api-compatibility -- verify-fixtures
  sh -n scripts/run-api-compatibility.sh
  git diff --check
  ```

  Expected: all unit and orchestration tests pass; live source coverage is complete; both initial fixture archives verify; the shell entry point parses.

  Commit:

  ```bash
  git add README.md docs/testing/api-compatibility.md docs/testing/api-compatibility-acceptance.md api-compatibility/src/runner.mjs api-compatibility/src/cli.mjs api-compatibility/__tests__/runner.test.mjs api-compatibility/__tests__/cli.test.mjs
  git commit -m "test: wire reusable ABS compatibility gates"
  ```

---

### Task 11: Run the first real 2.28.0 to 2.35.1 acceptance and record the result

**Files:**

- Modify: `docs/testing/api-compatibility-acceptance.md`
- Retain locally: `.artifacts/api-compatibility/<run-id>/report.json`
- Retain locally: `.artifacts/api-compatibility/<run-id>/report.md`
- Retain locally: `.artifacts/api-compatibility/<run-id>/logs/**`
- Modify only after a `GO`: `api-compatibility/compatibility.json`

- [ ] **Step 1: Confirm the installed SideShelf release revision**

  Resolve the exact commit or release tag corresponding to the app currently installed on devices. Do not substitute the implementation branch HEAD for server-upgrade evidence unless that is the installed build's exact source revision.

  Record:

  ```bash
  git rev-parse "<installed-release-ref>"
  git show -s --format='%H %cI %s' "<installed-release-ref>"
  ```

- [ ] **Step 2: Run the SideShelf app-release gate**

  Against the release-candidate commit:

  ```bash
  npm run api-compatibility -- app-release \
    --sideshelf-ref "$(git rev-parse HEAD)"
  ```

  Expected: exact native 2.28.0 and 2.35.1 fixtures run independently. The report exits `0` only for `GO`; any other decision remains valid diagnostic evidence but blocks release promotion.

- [ ] **Step 3: Run the server-upgrade gate**

  ```bash
  npm run api-compatibility -- server-upgrade \
    --sideshelf-ref "<installed-release-commit>" \
    --baseline 2.28.0 \
    --candidate 2.35.1
  ```

  Expected: baseline and candidate use independent copies of the 2.28.0 fixture, the candidate's startup captures its forward migration, and the source archive checksum is unchanged after both targets.

- [ ] **Step 4: Inspect Docker cleanup and retained evidence**

  Run the runner's recorded exact Compose project names through:

  ```bash
  docker compose -p "<recorded-project-name>" -f api-compatibility/compose.yml ps -a
  docker network ls --filter "name=<recorded-project-name>"
  docker volume ls --filter "name=<recorded-project-name>"
  ```

  Expected: no container, network, or volume remains for either run. Do not run broad Docker cleanup commands.

- [ ] **Step 5: Review the 2.28.0 to 2.35.1 watch areas**

  Confirm the report has explicit passing or failing evidence for:
  - login, refresh rotation, retry-once, rejected refresh, and two-session refresh;
  - listening-session create, sync, close, and persistence;
  - book and podcast progress;
  - bookmark create, rename, delete, and permission boundaries;
  - batch item authorization;
  - playback content and full download;
  - migrated fixture counts and state; and
  - absence of migration, authorization, crash, and unhandled-request errors.

- [ ] **Step 6: Record the durable acceptance result**

  Append one entry per run to `docs/testing/api-compatibility-acceptance.md`. Record the actual decision even when it is `NO-GO`. Do not copy raw tokens, credentials, or unsanitized logs into Git.

  Only after a reviewed `GO`, copy the resolved RepoDigests into `acceptedImageDigests` for the exact tags. A later digest change invalidates that acceptance and requires rerunning.

- [ ] **Step 7: Run final repository verification**

  Run:

  ```bash
  npm run test:api-compatibility
  npm test -- --runInBand
  npm run lint
  node api-compatibility/contracts/source-coverage.mjs
  npm run api-compatibility -- verify-fixtures
  git diff --check
  git status --short
  ```

  Expected: all compatibility tests, SideShelf Jest tests, and lint pass; route coverage is complete; fixture checksums verify; only the reviewed acceptance entry and any approved digest updates remain uncommitted.

- [ ] **Step 8: Commit the acceptance record**

  If the decision is `GO`:

  ```bash
  git add docs/testing/api-compatibility-acceptance.md api-compatibility/compatibility.json
  git commit -m "docs: record ABS 2.35.1 compatibility"
  ```

  If the decision is `CONDITIONAL GO` or `NO-GO`, omit the manifest:

  ```bash
  git add docs/testing/api-compatibility-acceptance.md
  git commit -m "docs: record ABS 2.35.1 compatibility finding"
  ```

---

## Final Review Checklist

- [ ] Compare every implementation task with all 13 acceptance criteria in the approved design.
- [ ] Confirm both run modes use the correct fixture provenance.
- [ ] Confirm every SideShelf network scope is cataloged or explicitly disposed.
- [ ] Confirm a deliberate removed required field produces a P0 failure and `NO-GO`.
- [ ] Confirm a deliberate additive unused field remains compatible.
- [ ] Confirm restricted-user tests cannot expose protected content.
- [ ] Confirm the original fixture archive checksum remains unchanged after candidate migration.
- [ ] Confirm cancellation and injected failures remove only their run-scoped Docker resources.
- [ ] Search committed source, snapshots, maps, reports, and docs for fixture credentials, access tokens, refresh tokens, hostnames, and production-looking paths.
- [ ] Confirm exact image digests and running server versions appear in both JSON and Markdown evidence.
- [ ] Confirm the first real acceptance record states an actual reviewed decision rather than assuming compatibility from release notes.
- [ ] Run `git diff --check` and inspect `git status --short` before handoff.

## Deliberately Deferred

- Scheduled latest-Audiobookshelf probes.
- GitHub Actions execution and artifact retention.
- Non-Docker container runtimes.
- Reverse-proxy, TLS, NAS filesystem, and remote-network matrices.
- Additional host architectures beyond the machine used for the retained acceptance.
- Production database or media testing.
- Audiobookshelf database rollback testing.

These may be added after the local disposable gate has produced stable evidence for at least one SideShelf release and one server upgrade.
