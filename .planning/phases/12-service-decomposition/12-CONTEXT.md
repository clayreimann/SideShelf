# Phase 12: Service Decomposition - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Audit all services in `src/services/` for testability and complexity. Split any service whose internal logic cannot be tested in isolation with minimal mocking. Extract focused collaborators — preserving all public interfaces and singleton contracts. No user-facing changes.

**Original roadmap scope:** PlayerService + DownloadService.
**Expanded scope:** All services in `src/services/` are in scope for the audit. PlayerService, DownloadService, PlayerBackgroundService, and ProgressService are the primary candidates. Other services are expected to already be small and testable — validate and document.

**Split criterion:** "Can I test this one behavior in isolation with minimal mocking?" If no → split it. Size alone is not a reason to split.

</domain>

<decisions>
## Implementation Decisions

### Decomposition goal

- The purpose is **testability and complexity reduction**, not file size reduction
- A service should be split if and only if its behaviors cannot be tested in isolation without mocking unrelated dependencies
- Mixed responsibilities within single methods (DB + network + state in one method) is the secondary signal

### Scope — what gets audited

- **Primary candidates:** PlayerService, DownloadService, PlayerBackgroundService, ProgressService
- **Secondary:** All other files in `src/services/` — researcher validates these are already small and testable
- Researcher reads all service files and applies the testability acid test to determine which need splitting
- Number of plans is research-driven — one plan per service that warrants decomposition

### Services that pass the audit

- If a service passes the testability audit (no split needed), the plan must **explicitly document "no split needed" with reasoning** — not just skip it silently

### Collaborator instantiation

- Facade creates collaborators in its constructor (`new XCollaborator(facadeRef)`)
- Collaborators hold a reference to a **public facade API** — not the entire facade, but broader than just a few callbacks. Claude determines the right scope based on what collaborators actually need to call.
- Explicit TypeScript interfaces per collaborator (e.g., `ITrackLoadingCollaborator`) — enables mocking in facade tests

### File/directory structure

- Claude's Discretion: pick the structure that's cleanest for the codebase (subdirectory per service or flat in services/)

### Shared state ownership

- **All state lives in the facade** — collaborators do not own or retain mutable state
- Collaborators access facade state via **method parameters** — facade passes everything needed at call time, no retained reference reads
- Collaborators signal state changes via **return values** — facade applies the mutation after the call

### DownloadService: what stays in the facade

- **Lifecycle + Progress Tracking stay in the facade** — they share the `activeDownloads` Map too tightly to extract cleanly
- Only Status Queries and Repair/Reconciliation are extracted to collaborators
- Whether those are one or two collaborator files: Claude's Discretion based on actual coupling in the code

### PlayerService: collaborator grouping

- Roadmap defines 5 concern groups (track loading, playback control, progress restore, path repair, background reconnect)
- Claude decides whether those map 1:1 to files or some are combined — based on actual size and coupling in PlayerService.ts

### Execution order

- 12-01: PlayerService first — sets the collaborator pattern
- 12-02: DownloadService follows — applies same pattern
- Additional plans (12-03, etc.) added if researcher finds other services need splitting

### Claude's Discretion

- File and directory structure for collaborators
- Exact collaborator groupings within each service (merge or keep 1:1 from roadmap groups)
- Which specific methods stay in the facade vs get extracted
- How to handle overlap between existing facade tests and new collaborator tests
- How collaborators are mocked in facade tests (jest.mock vs constructor injection vs real collaborators)

</decisions>

<specifics>
## Specific Ideas

- "The goal of this phase is not to split files simply because they are large, it's to make them easily testible and to try and reduce complexity"
- Testability acid test: "Can I test this one behavior in isolation with minimal mocking?" — this is the primary split criterion
- Collaborator return-value pattern makes collaborators functionally pure and trivially testable without any facade setup

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 12-service-decomposition_
_Context gathered: 2026-03-03_
