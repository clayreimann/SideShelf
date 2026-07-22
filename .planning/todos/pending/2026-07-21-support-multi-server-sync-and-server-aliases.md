---
created: 2026-07-21T00:00:00.000Z
title: Support concurrent multi-server sync and multiple aliases per ABS server
area: architecture
files:
  - src/db/schema/
  - src/db/helpers/
  - src/db/migrations/
  - src/lib/secureStore.ts
  - src/lib/api/
  - src/services/ApiClientService.ts
  - src/services/DownloadService.ts
  - src/services/ProgressSyncWorker.ts
  - src/providers/AuthProvider.tsx
  - src/providers/ProgressSyncProvider.tsx
  - src/stores/
  - src/components/
  - src/app/(tabs)/more/settings.tsx
---

## Problem

SideShelf currently treats one base URL as both the configured ABS server and the server's identity. `ApiClientService` owns one mutable URL/token set, `AuthProvider` exposes one current account, the library store selects and synchronizes one library, and many SQLite tables use raw ABS IDs as globally unique primary keys. Changing the URL is consequently treated as changing servers and clears credentials and user data.

That model blocks two related use cases:

1. One ABS instance may be reachable through multiple addresses, especially a preferred local-DNS CNAME and a public CNAME. These are interchangeable routes to the same server and account, not separate data sources. SideShelf should fail over automatically and return to the preferred route when it is healthy.
2. A user may have multiple ABS servers, each with multiple accessible libraries. All servers and libraries should remain synchronized independently and contribute to one unified SideShelf library.

Raw ABS IDs cannot safely be assumed unique across servers. Without explicit server ownership, two servers can overwrite each other's users, libraries, items, media, progress, bookmarks, sessions, downloads, cached covers, or sync state. A slow response from one connection can also be applied after the active URL/account has changed.

This is a cross-cutting architecture program, not a small `baseUrl[]` change. Design and implementation planning must decompose it into migration-safe phases rather than attempt one monolithic patch.

## Approved product behavior

- Present one unified library across all configured servers.
- Discover and synchronize every library accessible to the configured account on each server.
- Let user configuration control which synchronized libraries appear in the unified UI; hiding a library does not stop its synchronization.
- Keep duplicate items from different servers or libraries as distinct sources. Allow a user to hide an unwanted duplicate locally without deleting it or suppressing synchronization.
- Show server/library provenance contextually: in item details and filters, and as a badge when duplicate titles or another ambiguity makes it useful. Do not add permanent source labels to every ordinary card.
- Support one configured ABS account per server in this scope. Different servers may use different user accounts. Keep the data model extensible enough that multiple accounts per server are not made impossible.
- Synchronize servers independently with a small global concurrency cap. An offline, slow, or reauthentication-required server must not block healthy servers.
- Give each server an ordered alias list. Fail over automatically, monitor the preferred alias, and fail back after it is healthy without flapping between routes.
- When removing a server, separate removal of the connection from deletion of its local data. Ask independently whether to retain or delete cached/history data and downloaded files.

## Architecture direction

Use a **server-scoped shared database**, not prefixed raw IDs or a separate database per server.

Add a stable, SideShelf-owned `server_id` for every configured ABS instance. A URL is a route and must never be the durable server identity. Server-owned records must carry explicit server ownership, and raw ABS identifiers must remain separately available for API calls. At minimum, model these responsibilities:

- configured server identity, display name, optional verified ABS instance identifier, and lifecycle state;
- ordered server aliases with normalized base URL, priority, trust/verification status, reachability, last success/failure, and failback health state;
- one account/credential reference and auth state per server, with secrets namespaced by `server_id` in secure storage;
- remote entities keyed so `(server_id, remote_id)` is unique even when two ABS servers emit the same ID;
- per-server and per-library synchronization cursors, status, last success, and actionable error state;
- per-library visibility configuration, defaulting visible while all accessible libraries continue to sync;
- local per-source item hiding for unwanted duplicates.

Do not use a synthetic namespaced ID as the only copy of the remote ID. Network boundaries must receive an explicit raw ABS ID, and database relationships must use a stable local identity that cannot be confused with an API identifier.

Audit every server-owned table and file path, not only `users`, `libraries`, and `library_items`. The inventory must include media metadata and children, joins, progress, bookmarks and pending bookmark operations, listening sessions and progress outbox rows, downloads, local cover/file caches, player persistence, home shelves, authors/series/genres/tags/narrators, and any AsyncStorage keys that currently assume one selected server/library.

## ABS instance identity and alias trust

Before relying on an ABS-provided identifier, verify it against the currently supported ABS server source and runtime responses. The published API documentation is explicitly stale and its `/login` and `/api/authorize` examples show `serverSettings.id` as the constant `server-settings`, not a unique server UUID. Do not mistake that value, a version, a user ID, a default library ID, hostname, certificate, or resolved IP address for durable instance identity.

If a current ABS endpoint exposes a stable installation UUID, persist it as verification evidence and require matching UUIDs when grouping aliases. If it does not, allow the user to explicitly trust that a new address reaches the same server. This fallback is intentional for split-horizon local/public DNS, where aliases may resolve to different IP addresses. Never silently merge two existing configured servers merely because their URLs or content appear similar.

Credentials may be sent to an alias only after UUID verification or explicit user trust. Alias management must make the trust state and most recent connection test visible.

## Migration requirements

Migrate an existing single-server install in place:

1. Create one local server record from the retained base URL and account.
2. Move the current URL into that server's first, preferred alias.
3. Namespace the credential keys and associate the existing user with the new server.
4. Backfill `server_id` and remote IDs through every server-owned row and persisted setting.
5. Preserve downloads, local file paths, playback restoration, progress, bookmarks, listening sessions, outbox state, visibility/sort preferences, and cached metadata without requiring a full re-download.
6. Rebuild SQLite tables where primary-key or foreign-key shape changes require it, with deterministic rollback/retry behavior.

All new non-null columns added to existing SQLite tables require safe defaults or a table-rebuild migration appropriate to existing rows. Coordinate with the pending foreign-key-enforcement audit: do not assume declared cascades currently execute, and use explicit child-first cleanup until enforcement is proven.

Migration fixtures must include colliding user, library, item, media, bookmark, and progress IDs across two imported servers. A collision must never overwrite, merge, or route data to the other server.

## Connection routing and failover

Replace the single mutable API configuration with server-scoped client contexts. Each context owns its aliases, credentials, auth generation, refresh single-flight, reachability, and request generation. A request captures one immutable server/account/route context; changing route health or reauthenticating must not mutate an in-flight request into a different identity.

Use the ordered alias list consistently for authentication, REST requests, cover retrieval, downloads, and streaming URL construction. Centralize route selection so services do not cache or concatenate an unrelated global base URL.

Fail over for route-specific transport failures such as DNS failure, connection refusal, timeout, or classified gateway unavailability. Do not fail over merely because of a 4xx response, token rejection, permission error, validation error, or ordinary missing resource. Record diagnostics by stable server and redacted alias; never log credentials.

Mutation replay requires extra care. Automatically retry a mutation on another alias only when the endpoint is idempotent, carries a stable idempotency key, or the client can prove that the first attempt was not accepted. When outcome is ambiguous, reconcile with the owning server instead of blindly duplicating bookmark, progress, session, or other writes.

Probe the preferred route with the least expensive safe health endpoint. Require a configurable success threshold and cooldown before failback, and add hysteresis/backoff after repeated failures. Failback affects new requests only; it must not restart or interrupt an active audio stream or file download. A failed preferred route must not be hammered while the app is backgrounded or offline.

## Multi-server and multi-library synchronization

Create a scheduler that can enqueue work for every configured server on initialization, foreground, restored connectivity, periodic refresh, and manual refresh. Enforce both:

- a small global cap on servers synchronizing concurrently; and
- per-server serialization/single-flight where ABS ordering or local writes require it.

Each server has independent auth, reachability, retry, cancellation, and diagnostics. A terminal auth failure pauses only that server and requests reauthentication for it. Other servers continue to sync and remain usable. Late results must validate their server/account generation before writing.

Within each server, discover all libraries accessible to the configured account and retain independent library cursors/status. Synchronize hidden and visible libraries alike. Queries for unified shelves, search, series, authors, downloads, and progress aggregate visible sources across servers while retaining deterministic source identity and stable sorting.

Outbound user data always returns to the source recorded on the entity:

- playback progress and listening sessions go only to the item-owning server/account;
- bookmarks and pending operations are partitioned and drained by server/account;
- downloads, covers, and streaming URLs resolve through the item-owning server's route context;
- server-originated reconciliation cannot overwrite a colliding item from another server.

If one server is unavailable, keep its last synchronized metadata and downloaded playback accessible. Status should be stale/offline rather than globally signed out or empty.

## User experience

Add server management to Settings with these capabilities:

- list configured servers with independent sync, reachability, and auth status;
- add, name, edit, reauthenticate, manually sync, and remove one server;
- add, normalize, reorder, test, trust, and remove aliases;
- identify the preferred and currently active route without exposing secrets;
- show discovered libraries and toggle only their unified-view visibility;
- filter the unified library by server and library;
- hide/unhide a particular duplicate source item locally;
- inspect per-server/library sync errors and retry without disrupting other servers.

Removing a server must present separate, explicit choices for its connection/credentials, cached metadata and local history, and downloaded media. Destructive choices must identify the affected server and estimated local data/download impact. Retained offline data must continue to show its source and disconnected status.

## Suggested delivery phases

Write separate reviewed specs and implementation plans for at least these phases:

1. **Identity inventory and migration foundation** — canonical server/account/entity identity, schema collision audit, migration/rollback fixtures, and existing-install backfill.
2. **Server-scoped auth and request routing** — credential namespacing, client registry, alias verification/trust, failover/failback, and generation safety.
3. **Independent sync orchestration** — per-server/per-library workers, global concurrency cap, retries, progress/bookmark partitioning, and diagnostics.
4. **Unified data queries and playback/download routing** — aggregate visible libraries while preserving provenance and offline behavior.
5. **Management and filtering UX** — servers, aliases, library visibility, duplicate hiding, status, reauth, and safe removal.
6. **Migration rollout and live acceptance** — upgrade rehearsal, performance/resource validation, physical-device testing, and rollback gates.

Do not begin with UI-only server switching or an array of base URLs. The identity/migration foundation must land before multiple servers can safely write to one database.

## Non-goals

- Do not merge progress, bookmarks, downloads, or playback state between duplicate titles on different sources.
- Do not attempt metadata-based duplicate collapsing in this scope.
- Do not support multiple simultaneously configured user accounts on one ABS server yet.
- Do not use hostname, resolved IP, certificate, server version, or library fingerprint as silent proof of server identity.
- Do not make library visibility disable synchronization.
- Do not let one server's logout, token expiry, removal, retry, or data wipe affect another server.
- Do not claim unlimited parallel synchronization; resource use must remain bounded on mobile.

## Verification and acceptance

Automated coverage must prove isolation and correct routing at the database helper, migration, secure-storage, API client, worker/scheduler, store, player, download, and UI-filter boundaries. Include at least:

- migration of a production-shaped single-server database with downloads and pending outbound work;
- two servers that intentionally return identical remote IDs at every major entity level;
- multiple libraries on one server, including a hidden library that still synchronizes;
- duplicate titles that remain separate and can be hidden/unhidden locally;
- credentials, token refresh, logout, explicit data wipe, and reauthentication isolated per server;
- one offline server while another completes inbound and outbound synchronization;
- global sync concurrency never exceeding its configured cap;
- route failover for transport failures, no failover for auth/validation failures, and failback only after the health threshold/cooldown;
- no blind replay of a mutation with an ambiguous first-attempt outcome;
- a late response from an old route or auth generation being discarded safely;
- progress, bookmarks, streams, covers, and downloads always using the owning server's raw IDs and route resolver;
- removing one server with every retain/delete combination while all other server data remains intact;
- app relaunch, offline launch, background/foreground, and restored-network behavior with several configured servers.

Live acceptance requires two real ABS servers, at least two libraries on one of them, and two trusted addresses for one server representing local and public DNS. On a physical device, verify unified browsing/search, independent refresh and reauth, alias failover and healthy failback, streaming, downloads, offline playback, progress/bookmarks, contextual provenance, visibility filters, duplicate hiding, and safe removal. Capture timing, request concurrency, database size, memory, battery/background impact, and rollback evidence before declaring the program complete.
