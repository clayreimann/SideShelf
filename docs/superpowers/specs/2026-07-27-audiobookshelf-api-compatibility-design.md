# Audiobookshelf API Compatibility Gate Design

**Date:** 2026-07-27

**Status:** Proposed for review

**Scope:** Reusable compatibility testing between SideShelf releases and versioned Audiobookshelf server releases

## Goal

Create a repeatable, disposable compatibility gate that proves SideShelf's actual Audiobookshelf API contracts still work:

1. before every SideShelf app release; and
2. before every upgrade of the user's Audiobookshelf instance.

The gate must use a small synthetic library and version-pinned Audiobookshelf containers. It must produce a reviewable `GO`, `CONDITIONAL GO`, or `NO-GO` result without requiring a permanently running test server or any copy of production user data.

Audiobookshelf 2.28.0 to 2.35.1 is the first acceptance run. Those versions are inputs to the reusable system, not hard-coded design assumptions.

## Decision Summary

SideShelf will maintain a black-box API contract suite backed by:

- an explicit inventory of every Audiobookshelf route and behavior the app consumes;
- a deterministic synthetic media library;
- sanitized, versioned fixture database backups;
- disposable, version-pinned Audiobookshelf containers;
- response and behavior validators that express SideShelf's requirements rather than exact JSON snapshots;
- a comparison and reporting layer with explicit promotion rules; and
- a compatibility manifest that records the supported server floor, tested versions, fixture revision, and temporary exceptions.

The same contracts, fixture definition, runner, and report format serve both app-release and server-upgrade checks. The two modes differ in which database snapshot is restored and which versions are compared.

## Non-Goals

This design does not:

- test Audiobookshelf's web client or administrative features SideShelf does not use;
- prove that every third-party reverse proxy, NAS, filesystem, or network configuration works;
- replace SideShelf's Jest, device, native build, Maestro, playback endurance, or App Store release gates;
- claim compatibility with an untested future Audiobookshelf version based only on semantic versioning;
- keep test containers running after a compatibility run;
- copy, sanitize, mount, or otherwise use the production Audiobookshelf database or media library;
- validate Audiobookshelf database rollback to an older server version; or
- loosen a SideShelf contract merely because the candidate server returns a different response.

## Compatibility Terms

### Declared contract

A declared contract is the request shape, authentication behavior, response semantics, mutation result, permission boundary, or media behavior on which SideShelf relies.

The declared contract is authoritative. The baseline server's raw response is useful comparison evidence, but it is not automatically the correct specification.

### Minimum supported server

The oldest Audiobookshelf version a SideShelf release promises to support. Every SideShelf release must pass all required contracts against this version.

### Tested server

An exact Audiobookshelf image digest that passed the required contract suite for a specific SideShelf commit and fixture revision. A mutable image tag alone is not evidence of a tested version.

### Baseline server

The currently deployed Audiobookshelf version in a server-upgrade run.

### Candidate server

The proposed Audiobookshelf version in a server-upgrade run, or the newest version SideShelf intends to claim as tested in an app-release run.

## Required Run Modes

### Mode A: SideShelf app-release gate

Purpose: prove that a proposed SideShelf release remains compatible with the server versions SideShelf supports and the server version the user currently operates.

Each run must test the proposed SideShelf commit against:

1. the declared minimum supported Audiobookshelf version;
2. the current production Audiobookshelf version; and
3. the newest Audiobookshelf version SideShelf intends to claim as tested.

Duplicate versions are run once. Additional versions may be included when release research identifies a compatibility boundary between these anchors.

Each server version receives a version-native fixture database backup representing the same logical synthetic dataset. App-release mode does not intentionally test a database migration; it isolates app-to-server compatibility.

The app release is blocked if the proposed SideShelf commit fails a required contract on any required server version.

### Mode B: Audiobookshelf server-upgrade gate

Purpose: prove that the currently released SideShelf app will continue working after the real Audiobookshelf instance is upgraded.

Each run must test:

1. the currently deployed Audiobookshelf version as the baseline; and
2. the proposed Audiobookshelf version as the candidate.

Both runs use independent copies of the same synthetic database backup created by the baseline version:

- The baseline container opens its native backup.
- The candidate container opens a separate copy and performs the real forward migration from the baseline database format.

This mode therefore validates both the SideShelf API contract and the candidate server's migration of representative synthetic data. It never attempts to start the old server against a database already migrated by the candidate.

The contract-suite revision associated with the currently installed SideShelf release is authoritative for this check. A newer development branch must not silently redefine what the installed app needs.

## Compatibility Manifest

A version-controlled manifest will contain:

- manifest schema version;
- minimum supported Audiobookshelf version;
- current production Audiobookshelf version;
- Audiobookshelf versions required for the next SideShelf release;
- logical fixture revision;
- available version-native fixture backups and their checksums;
- contract-suite revision;
- container repository;
- required host architectures, when architecture is material;
- active compatibility exceptions; and
- the owner and expiration condition for each exception.

The initial manifest will use:

- minimum supported version: `2.28.0`;
- current production version: `2.28.0`;
- first candidate version: `2.35.1`; and
- container repository: `ghcr.io/advplyr/audiobookshelf`.

These initial values are operational starting points, not permanent support policy.

## Architecture

### 1. Contract catalog

The catalog is a machine-readable registry of SideShelf's server dependencies. Every entry includes:

- stable contract ID;
- HTTP method and route pattern;
- SideShelf function or code path that consumes it;
- required authentication mode;
- prerequisite fixture entity;
- request fields, headers, and query parameters;
- expected success statuses;
- required response fields and semantic constraints;
- expected failure statuses;
- mutation and cleanup behavior;
- criticality (`P0`, `P1`, or `P2`); and
- whether the test is safe to parallelize.

A coverage guard must fail when a new server route is added to SideShelf's network access points without a corresponding catalog entry or an explicit non-contract disposition.

The guarded access points initially include:

- `src/lib/api/endpoints.ts`;
- `src/lib/api/api.ts`;
- `src/services/ApiClientService.ts`;
- `src/services/DownloadService.ts`;
- `src/lib/fileSystem.ts`;
- `src/lib/covers.ts`;
- `src/lib/authorImages.ts`; and
- direct server reachability calls in `src/stores/slices/networkSlice.ts`.

### 2. Logical synthetic fixture

The logical fixture describes content and state independently of any Audiobookshelf database schema. It must remain small enough to initialize, archive, restore, and test quickly.

It includes:

- one book library and one podcast library;
- one single-file audiobook;
- one multi-file audiobook with ordered tracks;
- chapters with known boundaries;
- cover art;
- one author with an image;
- one podcast with at least one locally available episode;
- enough items to force at least two API result pages at the test page size;
- one administrator test user;
- one normal user with download access;
- one restricted user without access to at least one library or item;
- known media progress for a book and podcast episode;
- a known bookmark;
- one closed listening session; and
- deterministic IDs or a generated fixture-map file that lets contracts locate all entities.

All media and artwork must be original, public-domain, or generated specifically for the fixture. Credentials are test-only constants and must never be reused outside the isolated test environment.

### 3. Version-native database backups

The fixture system separates the logical dataset from physical database backups:

- App-release mode uses a database backup generated natively by each tested server version from the same logical fixture.
- Server-upgrade mode uses the baseline version's database backup for both containers so the candidate exercises its forward migrations.

Every backup must be:

- sanitized;
- immutable during a run;
- checksummed;
- associated with an exact Audiobookshelf version and logical fixture revision;
- free of production paths, credentials, tokens, hostnames, and personal data; and
- copied into a disposable writable volume before a container starts.

If a backup cannot be reproduced from the logical fixture definition, it is invalid evidence and must be regenerated before promotion.

### 4. Disposable container orchestrator

The orchestrator accepts a run mode, SideShelf revision, and one or more Audiobookshelf versions. For each version it:

1. resolves the requested image tag;
2. records the immutable image digest;
3. creates an isolated container network and writable volumes;
4. copies the appropriate fixture backup and synthetic media into those volumes;
5. binds any host port to loopback only and selects a non-conflicting port;
6. starts the server;
7. waits for bounded readiness;
8. verifies the running package version matches the requested version;
9. executes the contract suite;
10. captures sanitized logs and structured results;
11. stops and removes the container, network, and writable volumes; and
12. repeats independently for the next version.

Cleanup must run after success, failure, cancellation, and timeout. A failed cleanup marks the run incomplete even when contracts passed.

No mutable container volume may be reused between server versions or between independent runs.

### 5. Contract executor

The executor sends the same methods, headers, query parameters, bodies, and authentication forms SideShelf sends. It runs contracts in dependency order:

1. readiness and version verification;
2. login and initial tokens;
3. current-user and library reads;
4. item and media reads;
5. playback, streaming, and downloads;
6. progress and listening-session mutations;
7. bookmark mutations;
8. permission and error behavior;
9. restart and persistence; and
10. token refresh and rejection behavior.

Read-only tests may share an authenticated session. Mutating scenarios must start from a known fixture state or clean up and verify their own mutations. Tests that affect token rotation, session identity, bookmarks, progress, or permissions run serially.

The executor must not depend on object-property order, timestamps generated at runtime, database row order without an API ordering guarantee, server-generated IDs, absolute paths, or exact human-readable error messages unless SideShelf actually consumes them.

### 6. Validators and comparator

Validators express SideShelf's requirements, including:

- required field presence;
- value type;
- allowed nullability;
- enum membership;
- numeric and time-unit constraints;
- pagination invariants;
- URL usability;
- byte-range and download behavior;
- idempotency;
- mutation read-back;
- authorization boundaries;
- bounded token refresh; and
- restart persistence.

The comparator normalizes volatile fields before comparing baseline and candidate observations. It classifies each difference as:

- `compatible`;
- `review-required`; or
- `breaking`.

The comparator must never turn a validator failure into a compatible result merely because both baseline and candidate fail in the same way.

### 7. Reporter

Every run emits machine-readable JSON and a human-readable Markdown summary containing:

- run mode;
- SideShelf commit or release;
- contract-suite revision;
- fixture revision and backup checksum;
- requested Audiobookshelf tags;
- resolved image digests;
- running server versions;
- host architecture;
- start and finish timestamps;
- per-contract status and duration;
- normalized baseline/candidate differences;
- sanitized server warnings and errors;
- active waivers;
- cleanup result; and
- final decision.

Detailed run artifacts may remain outside Git when they contain large logs. Every promoted SideShelf release or Audiobookshelf upgrade must add a durable acceptance entry under `docs/testing/` that points to the retained evidence and records the exact digests and decision.

## Initial Contract Matrix

### P0: release-blocking core contracts

| Contract ID            | SideShelf dependency                        | Required behavior                                                           |
| ---------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `server.ping`          | `GET /ping`                                 | Bounded readiness and recognizable success                                  |
| `auth.login`           | `POST /login` with `x-return-tokens: true`  | Valid access token, refresh-token compatibility, and user identity          |
| `auth.refresh`         | `POST /auth/refresh` with `x-refresh-token` | Successful rotation, bounded retry, and no concurrent-refresh logout        |
| `user.me`              | `GET /api/me`                               | Identity, permissions, accessible libraries, progress, and bookmarks        |
| `libraries.list`       | `GET /api/libraries`                        | Both fixture libraries are visible to authorized users                      |
| `libraries.get`        | `GET /api/libraries/:id`                    | Required library identity, media type, settings, and folders                |
| `libraries.filterdata` | `GET /api/libraries/:id?include=filterdata` | Filter data remains available in the response shape SideShelf consumes      |
| `items.page`           | `GET /api/libraries/:id/items`              | `minified=1`, pagination, totals, and required minified metadata            |
| `items.added`          | `GET /api/libraries/:id/items`              | `sort=addedAt&desc=1` returns stable descending results                     |
| `items.get`            | `GET /api/items/:id`                        | Full book and podcast shapes include fields SideShelf persists              |
| `items.batch`          | `POST /api/items/batch/get`                 | Authorized requested items are returned and restricted items are not leaked |
| `play.start`           | `POST /api/items/:id/play`                  | Usable session identity, tracks, duration, MIME types, and content URLs     |
| `media.stream`         | playback content URL                        | Authenticated media bytes and byte-range behavior are usable                |
| `media.download`       | `GET /api/items/:id/file/:ino/download`     | Authorized complete download with valid byte count and contents             |
| `progress.read`        | `GET /api/me/progress/:itemId/:episodeId?`  | Book and episode progress use the expected identity and time units          |
| `progress.update`      | `PATCH /api/me/progress/:itemId`            | Mutation succeeds and exact semantic state is visible on read-back          |
| `session.local`        | `POST /api/session/local`                   | Stable submitted ID is accepted; duplicate replay is safely classifiable    |
| `session.sync`         | `POST /api/session/:id/sync`                | Current time and listened time persist without unit conversion              |
| `session.close`        | `POST /api/session/:id/close`               | Session closes once and final progress remains readable                     |
| `bookmark.create`      | `POST /api/me/item/:id/bookmark`            | Bookmark is created and response normalization remains possible             |
| `bookmark.rename`      | `PATCH /api/me/item/:id/bookmark`           | Title update is visible on `GET /api/me`                                    |
| `bookmark.delete`      | `DELETE /api/me/item/:id/bookmark/:time`    | Numeric-time deletion removes the intended bookmark                         |
| `permissions.core`     | all protected P0 routes                     | Restricted user receives the intended denial and no protected data          |

Any P0 failure results in `NO-GO`.

### P1: important resilience and fidelity contracts

| Contract ID           | SideShelf dependency              | Required behavior                                                          |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `cover.item`          | `HEAD/GET /api/items/:id/cover`   | Resolved cover is authenticated, non-empty, and image-compatible           |
| `image.author`        | `HEAD/GET /api/authors/:id/image` | Resolved author image is authenticated and non-empty                       |
| `auth.retry-once`     | `apiFetch` 401 flow               | One refresh and one request retry; no recursion or refresh storm           |
| `auth.reject`         | rejected refresh token            | 401/403 is terminal and distinguishable from transient 5xx/network failure |
| `items.multipage`     | full-library sync                 | All pages are fetched exactly once without omissions or duplicates         |
| `book.multifile`      | local and remote playback         | Track order, offsets, filenames, sizes, and durations remain coherent      |
| `chapters.bounds`     | player chapter model              | Chapter start/end values are ordered and within media duration             |
| `server.restart`      | persisted fixture state           | Progress, bookmarks, and closed sessions survive candidate restart         |
| `errors.classifiable` | `ApiResponseError`                | Status, optional `Retry-After`, and a safe body remain available           |
| `logs.clean`          | server logs                       | No crash, database migration, authorization, or unhandled-request error    |

A P1 failure blocks promotion unless an explicit waiver is approved.

### P2: reviewable optional contracts

P2 observations include:

- additive response fields;
- optional metadata fields SideShelf does not require;
- exact error wording when only the status is consumed;
- description sanitization differences;
- server capabilities SideShelf does not use;
- response-time measurements that remain within the hard timeout; and
- socket events, which SideShelf does not currently consume.

P2 differences are retained in the report but do not normally block promotion.

## Difference Classification

### Compatible

Examples:

- additive JSON fields;
- object-property reordering;
- documented optional values absent or `null` where SideShelf allows both;
- a different successful 2xx status explicitly allowed by the contract;
- different server-generated IDs that preserve identity relationships; or
- sanitized description text SideShelf treats as display content.

### Review required

Examples:

- a previously non-null field becoming nullable;
- content-type changes;
- a new authorization check;
- a different default sort;
- a different retryable status;
- a material performance change still within the hard timeout; or
- a response envelope change that existing SideShelf normalization may tolerate.

### Breaking

Examples:

- removed or moved route;
- rejected SideShelf request body or header;
- missing required field;
- incompatible field type or time unit;
- unusable playback or download URL;
- lost or misapplied progress, session, or bookmark mutation;
- permission bypass;
- unbounded refresh loop;
- server crash;
- failed database migration; or
- mutation that succeeds by status but fails read-back.

## Promotion Policy

### `GO`

All of the following are true:

- all P0 and P1 contracts pass;
- all `review-required` differences have a compatible disposition;
- no relevant server exception or migration error occurred;
- image tags resolved to recorded digests;
- version verification succeeded;
- the fixture checksum matched before each run; and
- all disposable resources were removed.

### `CONDITIONAL GO`

Allowed only for a P1 issue with a written waiver containing:

- affected contract and feature;
- user impact;
- why P0 behavior remains safe;
- mitigation or operational workaround;
- owner;
- expiration date or removal trigger; and
- evidence location.

P0 failures, data corruption, permission bypasses, failed migrations, and authentication loops are never waivable.

### `NO-GO`

Any of the following:

- P0 failure;
- unwaived P1 failure;
- unexplained server exception;
- failed or ambiguous database migration;
- corrupted or lost fixture state;
- permission regression;
- missing image digest or version mismatch;
- incomplete evidence; or
- failed cleanup that leaves the run's isolation uncertain.

## Error Handling and Isolation

- Readiness, contract, and cleanup operations have explicit timeouts.
- A readiness failure captures container health, recent sanitized logs, image digest, and version evidence before cleanup.
- A contract failure does not prevent independent read-only diagnostics, but dependent mutations are skipped and reported as blocked rather than failed.
- Server 5xx, malformed JSON, timeouts, connection failures, and process exits are distinct result categories.
- Secrets and tokens are redacted from request, response, and server-log artifacts.
- Test ports bind only to loopback.
- Containers run on isolated networks with no production service discovery.
- The runner refuses production-looking paths, non-test credentials, or a fixture checksum mismatch.
- Candidate migration always occurs on a disposable copy.
- No command may point destructive cleanup at a user-provided directory, the repository root, or a broad Docker resource set. Cleanup targets only run-scoped resource names generated by the orchestrator.

## Trigger and Retention Policy

### Before every SideShelf release

Run Mode A after the release candidate commit is frozen and before release promotion. Retain the Markdown decision, JSON summary, image digests, and logs for failures or waivers.

### Before every Audiobookshelf upgrade

Run Mode B against the exact baseline and candidate tags. Resolve and record image digests before approving the real upgrade. Repeat the test if the candidate tag's digest changes.

### Optional early warning

A manually triggered or scheduled probe may test the latest Audiobookshelf release before either release event. It is advisory until run against a frozen SideShelf revision and retained as promotion evidence.

The design does not require always-on containers or a continuously running compatibility environment.

## First Acceptance Run: Audiobookshelf 2.28.0 to 2.35.1

The first server-upgrade report will use:

- SideShelf contract suite from the currently installed app release;
- baseline server `2.28.0`;
- candidate server `2.35.1`;
- a synthetic fixture backup created by 2.28.0; and
- independent writable copies for baseline and candidate runs.

Release-note research has not identified a documented removal of a route SideShelf currently uses. It has identified the following mandatory watch areas:

- 2.29.0 changed token/HLS behavior and fixed an initial library load failure during token refresh.
- 2.31.0 increased default access-token and refresh-token lifetimes.
- 2.33.0 tightened listening-session, media-progress, and bookmark authorization; changed high-churn API caching; sanitized session device information; and fixed podcast progress behavior when an episode ID is absent.
- 2.34.0 enforced library and item access on batch item routes.
- 2.35.0 added an access-token refresh grace period.
- 2.35.1 fixed duplicate refresh tokens across sessions causing unexpected logout.

These changes make authentication, session identity, progress, bookmarks, batch reads, permissions, playback, and downloads the highest-priority observations. Release notes are triage evidence only. The upgrade does not receive `GO` until the executable gate passes.

## Acceptance Criteria for the Implemented Gate

The implementation is complete when:

1. A clean machine with the documented prerequisites can run both modes from one command each.
2. No Audiobookshelf test container needs to remain running between invocations.
3. The synthetic fixture contains every required entity and no production-derived data.
4. The contract coverage guard accounts for every SideShelf server route.
5. The required 2.28.0 app-release fixture and 2.28.0 server-upgrade fixture are reproducible and checksummed.
6. A deliberate incompatible response causes a targeted contract failure and `NO-GO`.
7. A deliberate additive field is classified as compatible.
8. A restricted user cannot access protected fixture content.
9. Candidate migration operates on a copy and the original fixture checksum remains unchanged.
10. Cancellation and failure remove only run-scoped containers, networks, and volumes.
11. Reports redact credentials and tokens.
12. Re-running the same revisions and image digests produces the same contract decision.
13. The initial 2.28.0 to 2.35.1 report is produced and reviewed before the real server upgrade.

## Proposed Repository Boundaries

The implementation plan should preserve these responsibilities:

- `api-compatibility/compatibility.json` — support policy and tested-version manifest.
- `api-compatibility/contracts/` — catalog, validators, and contract tests.
- `api-compatibility/fixtures/` — logical fixture definition, synthetic media, fixture maps, checksums, and sanitized backups.
- `api-compatibility/compose.yml` — isolated Audiobookshelf container definition.
- `api-compatibility/src/` — orchestration, execution, normalization, comparison, redaction, and reporting.
- `api-compatibility/__tests__/` — runner, validator, comparison, coverage-guard, cleanup, and report tests.
- `scripts/run-api-compatibility.sh` — stable local entry point.
- `docs/testing/api-compatibility.md` — operator runbook.
- `docs/testing/api-compatibility-acceptance.md` — durable promotion history.
- `.artifacts/api-compatibility/` — ignored detailed output for local and CI runs.

Exact language and package choices belong in the implementation plan. The implementation must favor existing repository tooling unless a new dependency materially improves container orchestration, validation, or report safety.

## Sources

- [Audiobookshelf API documentation](https://api.audiobookshelf.org/)
- [Audiobookshelf 2.28.0 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.28.0)
- [Audiobookshelf 2.29.0 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.29.0)
- [Audiobookshelf 2.30.0 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.30.0)
- [Audiobookshelf 2.31.0 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.31.0)
- [Audiobookshelf 2.32.0 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.32.0)
- [Audiobookshelf 2.33.0 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.33.0)
- [Audiobookshelf 2.33.1 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.33.1)
- [Audiobookshelf 2.33.2 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.33.2)
- [Audiobookshelf 2.34.0 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.34.0)
- [Audiobookshelf 2.35.0 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.35.0)
- [Audiobookshelf 2.35.1 release](https://github.com/advplyr/audiobookshelf/releases/tag/v2.35.1)
