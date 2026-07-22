# Project Decision Register

This register preserves decisions that future contributors should not have to rediscover. It summarizes durable rationale and points to the maintained implementation or design source. Historical task sequencing and superseded implementation proposals are intentionally omitted.

## Product and Releases

### Separate internal milestone history from public releases

- **Status:** Active
- **Decision:** Treat historical v1.0-v1.3 labels as internal engineering milestones and use the public numbering defined in the roadmap for release commitments.
- **Why:** Reusing one numbering scheme made completed internal work look like public release promises.
- **Consequence:** New public scope belongs in a release specification and [the roadmap](../ROADMAP.md), not in a revived internal phase sequence.
- **Source:** [SideShelf roadmap](../ROADMAP.md)

### Keep podcasts on RNTP for public 1.1

- **Status:** Active
- **Decision:** Deliver podcast support on the current React Native Track Player baseline before changing playback engines.
- **Why:** Podcast domain behavior can be validated independently of a high-risk native playback migration.
- **Consequence:** Public 1.1 work must preserve audiobook behavior and must not depend on Audio Browser.
- **Source:** [Public 1.1 podcast specification](../superpowers/specs/2026-07-17-public-v1.1-podcasts-design.md)

### Migrate through an adapter for public 1.2

- **Status:** Active
- **Decision:** Introduce Audio Browser behind the existing coordinator and progress boundaries rather than rewrite playback state management.
- **Why:** The coordinator encodes validated sequencing, recovery, and progress semantics that are independent of the native engine.
- **Consequence:** CarPlay and Android Auto browse support must arrive without bypassing coordinator ownership or regressing public 1.1.
- **Source:** [Public 1.2 Audio Browser and cars specification](../superpowers/specs/2026-07-17-public-v1.2-audio-browser-carplay-android-auto-design.md)

### Keep Google Cast outside the release path

- **Status:** Deferred
- **Decision:** Do not add Cast until demand and repeatable real-device validation justify a separate remote-playback architecture.
- **Why:** A Cast receiver owns playback independently and therefore needs distinct authentication, networking, queue, session, progress, and lifecycle handling.
- **Consequence:** Do not model Cast as another output picker or as a side effect of the Audio Browser migration.
- **Source:** [Google Cast investigation](../investigation/google-cast-support.md)

### Use stable server identity for multi-server support

- **Status:** Active design direction
- **Decision:** Model each Audiobookshelf instance with a SideShelf-owned `server_id`, keep aliases as trusted routes, and namespace remote entities explicitly within one shared database.
- **Why:** URLs change and raw remote IDs can collide; neither is safe as global identity. One database supports unified queries and shared migrations without hiding source ownership.
- **Consequence:** Identity inventory and single-server migration land before alias routing, independent synchronization, or management UI. Requests capture immutable server/account/route generations, and outbound data always returns to its owning source.
- **Source:** [Multi-server sync and server aliases](../plans/multi-server-sync-and-aliases.md)

## Playback Architecture

### The coordinator owns player state and transitions

- **Status:** Implemented
- **Decision:** UI and services dispatch intent; `PlayerStateCoordinator` serializes transitions, executes state changes, and publishes canonical state.
- **Why:** A single executor removes races and contradictory writes between UI, native callbacks, restoration, and service singletons.
- **Consequence:** UI must not call TrackPlayer directly, and business logic that determines playback state belongs in the coordinator rather than being duplicated in services.
- **Source:** [Player state-machine architecture](../architecture/player-state-machine.md)

### Keep the event bus as a leaf boundary

- **Status:** Implemented
- **Decision:** Dispatch player events through the dependency-light event bus and keep dispatch metadata separate from the discriminated `PlayerEvent` union.
- **Why:** The event bus breaks service/coordinator import cycles, while side-channel metadata carries source and one-shot intent without polluting every event variant.
- **Consequence:** New event sources may import the bus safely; they must not introduce service or store imports into it.
- **Source:** [Repository agent guidance](../../AGENTS.md)

### Retain a custom serialized FSM

- **Status:** Implemented
- **Decision:** Keep the production-validated custom transition matrix rather than replacing it with XState.
- **Why:** Serial processing and the explicit matrix already provide deterministic behavior and strong coverage; another state-machine runtime adds weight without a demonstrated capability gain.
- **Consequence:** State-topology changes require transition-matrix tests and evidence of a real limitation, not library preference.
- **Source:** [Player state-machine architecture](../architecture/player-state-machine.md)

### Observer mode was a rollout strategy, not permanent architecture

- **Status:** Superseded
- **Decision:** Preserve the rationale for the observer-first migration, but do not restore the removed `observerMode` flag.
- **Why:** Observer mode enabled low-risk production validation before execution ownership moved to the coordinator. Later cleanup removed the redundant rollback path after the migration stabilized.
- **Consequence:** Future rollback mechanisms must reflect current architecture; stale planning notes that claim an instant observer-mode switch are not authoritative.
- **Source:** [State-machine migration plan](../plans/state-machine-migration.md)

### Keep `playerSlice` as the React-facing read-only proxy

- **Status:** Implemented
- **Decision:** Retain Zustand integration for rendering, but only coordinator bridges may write canonical player state.
- **Why:** React selectors are valuable; competing write paths are not.
- **Consequence:** Components read through existing store hooks, and new playback actions dispatch intent instead of mutating the slice.
- **Source:** [Player state-machine architecture](../architecture/player-state-machine.md)

### Explicit seeks bypass smart rewind

- **Status:** Implemented
- **Decision:** Chapter taps, bookmark jumps, and other exact user-directed seeks carry `skipSmartRewind`; ordinary resume actions do not.
- **Why:** Rewinding after an intentional destination would violate the user's selected position.
- **Consequence:** Any new load-and-play action that represents an exact seek must propagate this intent through dispatch metadata.
- **Source:** [`DispatchMeta` and coordinator types](../../src/types/coordinator.ts)

### Queue reconstruction stays coordinator-owned

- **Status:** Implemented
- **Decision:** When native queue status is unknown or mismatched, the coordinator performs the rebuild inline before playback rather than delegating event ownership across collaborators.
- **Why:** Split ownership produced late events and made position restoration order difficult to reason about.
- **Consequence:** Queue-rebuild changes must preserve the loading guard that prevents native position zero from replacing a valid restored position.
- **Source:** [Coordinator boundary design](../superpowers/specs/2026-03-16-coordinator-boundary-cleanup-design.md)

### Decompose services for isolation, not line count

- **Status:** Active
- **Decision:** Split a service only when unrelated dependencies prevent a behavior from being tested in isolation; facades retain mutable state and collaborators receive explicit inputs.
- **Why:** Stateless collaborators reduce coupling without creating hidden singleton cycles or fragmented state ownership.
- **Consequence:** ProgressService or other future splits need a testability case and explicit boundaries, not an arbitrary file-size target.
- **Source:** [Repository agent guidance](../../AGENTS.md)

## Persistence and Synchronization

### Route all database access through helpers

- **Status:** Active
- **Decision:** UI and services use entity-specific helpers in `src/db/helpers/`; schema additions that are non-null include defaults.
- **Why:** Centralized marshaling, transactions, migrations, and test setup prevent inconsistent storage behavior.
- **Consequence:** Do not add inline Drizzle writes in services or components, and keep child-before-parent order in explicit cleanup paths.
- **Source:** [Repository agent guidance](../../AGENTS.md)

### Configure SQLite before Drizzle wraps the connection

- **Status:** Implemented
- **Decision:** Enable WAL and `synchronous=NORMAL` on the raw SQLite handle before constructing the Drizzle client.
- **Why:** These are connection-level settings; applying them at the correct boundary produced substantially better write throughput.
- **Consequence:** Connection initialization changes must retain pragma ordering and database-failure recovery behavior.
- **Source:** [Database client](../../src/db/client.ts)

### Do not assume foreign-key enforcement

- **Status:** Active
- **Decision:** Treat declared SQLite foreign keys as schema intent, not runtime cleanup, until both production and test clients deliberately enable and audit `PRAGMA foreign_keys`.
- **Why:** The clients currently run with foreign-key enforcement disabled, so cascades do not protect logout or migration paths.
- **Consequence:** `wipeUserData()` deletes children explicitly. Enabling foreign keys requires a standalone audit for latent violations and test/production parity.
- **Source:** [Durable progress synchronization](../plans/stale-token-progress-sync.md)

### Synchronize progress through a versioned transactional outbox

- **Status:** Implemented
- **Decision:** Coalesce local progress into versioned outbox rows and let one auth-aware worker own all durable delivery.
- **Why:** A mutable `is_synced` boolean cannot represent concurrent local updates, crash recovery, or progress retained during reauthentication.
- **Consequence:** Acknowledgement advances only the revision actually sent; newer revisions remain pending, and application lifecycle triggers converge on the same single-flight drain.
- **Source:** [Durable progress synchronization](../plans/stale-token-progress-sync.md)

### Use `/api/session/local` for every durable worker upload

- **Status:** Implemented
- **Decision:** The progress worker always sends absolute snapshots through `/api/session/local` using the stable local session UUID.
- **Why:** `/api/session/:id/sync` has additive semantics and can silently double-count when an ambiguous request is replayed.
- **Consequence:** Additive live-session synchronization must never enter a durable retry path.
- **Source:** [Durable progress synchronization](../plans/stale-token-progress-sync.md)

### Preserve local data through token expiry, clear it on explicit logout

- **Status:** Implemented
- **Decision:** Failed silent refresh enters a dismissible reauthentication flow without wiping downloads or local identity; explicit logout or server switch clears user-owned state and tables.
- **Why:** Authentication availability and user intent to remove an account are different lifecycle events.
- **Consequence:** New auth error handling must not route terminal refresh failure through destructive logout cleanup.
- **Source:** [Expired-token Home shelves design](../superpowers/specs/2026-07-18-expired-token-home-shelves-design.md)

### Cache first, then revalidate on navigation

- **Status:** Implemented
- **Decision:** Slice-backed screens show cached database data immediately and refresh in the background when navigated to, without a time-based staleness threshold.
- **Why:** Cold-start and offline behavior should not depend on a network round trip, while navigation remains an understandable refresh trigger.
- **Consequence:** Unknown initial state renders loading rather than an empty result; token expiry preserves cached slices.
- **Source:** [Store architecture guidance](../../AGENTS.md)

## Downloads and Storage

### Reconcile downloads without destroying listening progress

- **Status:** Implemented
- **Decision:** Missing files reset download state at file granularity while preserving media progress; active and paused transfers are skipped, and abandoned partial transfers are cleaned without automatic restart.
- **Why:** Filesystem state can drift independently of user listening state and active downloader intent.
- **Consequence:** Reconciliation must not delete media progress or race active transfers.
- **Source:** [Download path handling](../architecture/download-path-handling.md)

### Treat iCloud exclusion as idempotent best effort

- **Status:** Implemented
- **Decision:** Apply backup exclusion to completed, repaired, and existing downloads; individual failures warn and continue rather than blocking playback or startup.
- **Why:** Downloaded media is reproducible and should not consume backup storage, but exclusion failure is not data corruption.
- **Consequence:** Startup scanning remains non-blocking and native-module absence is guarded rather than fatal.
- **Source:** [Download path handling](../architecture/download-path-handling.md)

### Use mainline RNBD without a migration adapter

- **Status:** Implemented
- **Decision:** Call the mainline downloader API directly and rely on ordinary reconciliation for fork-era in-flight state.
- **Why:** Completed files were already valid, and the beta app did not justify a permanent adapter or one-off compatibility layer.
- **Consequence:** Preserve restart reattachment and repair tests; do not reintroduce the old fork without new evidence.
- **Source:** [RNBD fork investigation](../investigation/rnbd-fork-diff.md)

### Store normalized app-relative paths

- **Status:** Implemented
- **Decision:** Persist decoded app-relative `D:`/`C:` paths without `file://`, percent encoding, or container-specific absolute prefixes.
- **Why:** iOS container paths change and mixed encodings caused false missing-file and duplicate-path behavior.
- **Consequence:** Every path-writing helper normalizes at the boundary; readers resolve through the shared filesystem helpers.
- **Source:** [Download path handling](../architecture/download-path-handling.md)

### Reassociate only when ownership is known

- **Status:** Implemented
- **Decision:** Repair an orphan by using the library item identity already encoded by its directory; do not offer an arbitrary item picker.
- **Why:** Known ownership makes repair deterministic, while arbitrary association risks attaching media to the wrong item.
- **Consequence:** Unknown files without a trustworthy item identity remain delete-only.
- **Source:** [Orphan association helper](../../src/lib/orphanAssociation.ts)

## Navigation and UI

### Treat movable tabs as one route-scope system

- **Status:** Implemented
- **Decision:** A feature that can live at the top level or under More resolves list, detail, and item routes from the active route scope and reuses screen components through re-exports.
- **Why:** Hard-coded top-level routes escaped the More stack or made rows inert when tabs were hidden.
- **Consequence:** Navigation verification must cover real row presses through every descendant depth, not only route-file existence.
- **Source:** [More-scoped nested navigation design](../superpowers/specs/2026-07-19-more-scoped-nested-navigation-design.md)

### Persist playback display preferences through the settings boundary

- **Status:** Implemented
- **Decision:** Progress format, bookmark-title mode, chapter-bar labels, keep-awake choice, skip intervals, and smart rewind use `settingsSlice` plus `appSettings.ts` with `@app/` keys.
- **Why:** One initialization and persistence pattern avoids screen-local preference drift.
- **Consequence:** New playback preferences belong in the same boundary and require explicit defaults; `null` remains meaningful where it represents an unanswered first-use choice.
- **Source:** [Settings slice](../../src/stores/slices/settingsSlice.ts)

### Keep interactive children outside collapsed accessibility groups

- **Status:** Active
- **Decision:** Icon-only actions use `IconButton`, selection rows use `OptionRow`, and containers with interactive descendants are not collapsed into one accessible element.
- **Why:** VoiceOver otherwise swallows nested controls or exposes unlabeled actions.
- **Consequence:** Visible labels and accessibility labels must be internationalized together.
- **Source:** [VoiceOver accessibility implementation plan](../superpowers/plans/2026-07-18-voiceover-accessibility.md)

### Keep locale key sets identical

- **Status:** Active
- **Decision:** English and Spanish dictionaries expose matching flat keys and all user-visible strings go through the translation layer.
- **Why:** Type parity catches missing translations at build time and prevents silent English-only UI.
- **Consequence:** Every localization change updates both dictionaries; remaining gaps are tracked in [the backlog](../BACKLOG.md).
- **Source:** [Localization guide](../LOCALIZATION.md)

### Gate tree shaking with a build-time escape hatch

- **Status:** Implemented
- **Decision:** Keep tree shaking and `inlineRequires` behind committed `EXPO_TREE_SHAKING=true`; disabling the flag and rebuilding is the rollback.
- **Why:** The Expo, Hermes, new-architecture, React Compiler, and Reanimated interaction required a cheap release fallback.
- **Consequence:** Release verification must exercise animations, audio, downloads, and navigation when build-tool settings change.
- **Source:** [Metro configuration](../../metro.config.js)

## Quality and Diagnostics

### Trace branching async decisions, not high-frequency noise

- **Status:** Implemented
- **Decision:** Add structured spans to async paths whose branching cannot be reconstructed from logs, pass parent context explicitly across `await`, and exclude events above 1 Hz.
- **Why:** Hermes does not provide reliable implicit async trace context, while per-tick tracing would drown the useful causal chain.
- **Consequence:** Trace attributes capture accepted/rejected decisions and identifiers; tagged logs remain in place for ordinary operational messages.
- **Source:** [Span-tracing architecture](../architecture/span-tracing.md)

### Make trace dumps available in production builds

- **Status:** Implemented
- **Decision:** Rejection-triggered and manual trace dumps are stored locally and can be viewed, shared, or cleared from diagnostics UI.
- **Why:** Intermittent restoration and state-machine failures often appear only in TestFlight or real-device sessions.
- **Consequence:** Dump payloads must redact credentials and auto-dump I/O must never block the coordinator lock.
- **Source:** [Span-tracing architecture](../architecture/span-tracing.md)

### Structure Maestro around independent journeys

- **Status:** Implemented
- **Decision:** Keep reusable login/start-playback subflows and standalone library, playback, and download journeys with credentials supplied from gitignored local environment state.
- **Why:** Independently executable journeys are easier to diagnose and rerun than a monolithic end-to-end flow.
- **Consequence:** Add test IDs only for stable interaction contracts and keep secrets out of committed YAML.
- **Source:** [UI testing plan](../plans/ui-testing.md)

## Audit Notes

The deleted planning corpus also contained many completed UI measurements, method-placement choices, test-stub mechanics, and per-phase verification notes. Those were classified as completed when current code/tests or the linked maintained documents express the outcome. Generated task ordering, agent-specific commands, superseded alternatives, and stale claims contradicted by current code were classified as obsolete rather than copied into this register.
