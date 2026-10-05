# Multi-Server Sync and Server Aliases

**Status:** Approved product and architecture direction; implementation not scheduled

## Purpose

SideShelf should support multiple Audiobookshelf servers and multiple trusted addresses for one server while presenting one unified library. This is a cross-cutting architecture program, not an array of base URLs or a UI-only server switcher. It must be delivered through separately reviewed, migration-safe phases.

## Problem

SideShelf currently treats one base URL as both connection configuration and durable server identity. `ApiClientService` owns one mutable URL/token set, `AuthProvider` exposes one current account, the library store selects one library, and many SQLite tables assume raw Audiobookshelf IDs are globally unique. Changing the URL is therefore treated as changing servers and clears credentials and user data.

That model blocks two related cases:

1. One Audiobookshelf instance may be reachable through several interchangeable addresses, such as preferred local and public DNS aliases. SideShelf should fail over automatically and return to the preferred route after it recovers.
2. A user may have several Audiobookshelf servers, each exposing several libraries. Each source should synchronize independently and contribute to one unified SideShelf library.

Raw remote IDs can collide across servers. Without explicit ownership, one source could overwrite another source's users, libraries, items, metadata, progress, bookmarks, sessions, downloads, covers, or sync state. Late responses can also be applied after a mutable global URL/account changes.

## Approved Product Behavior

- Present one unified library across all configured servers.
- Discover and synchronize every library accessible to each configured server account.
- Let users choose which synchronized libraries appear in the unified UI; hiding a library does not stop synchronization.
- Keep duplicate items from different servers or libraries as distinct sources. Users may hide an unwanted source locally without deleting it or suppressing synchronization.
- Show provenance contextually in item details and filters, and as a badge when duplicate titles or ambiguity make it useful. Do not label every ordinary card permanently.
- Support one configured Audiobookshelf account per server in this scope. Different servers may use different accounts; the model must not make future multiple-account support impossible.
- Synchronize servers independently under a small global concurrency cap. One offline, slow, or reauthentication-required server must not block healthy servers.
- Give each server an ordered alias list. Fail over automatically, monitor the preferred alias, and fail back after a stable recovery without route flapping.
- When removing a server, separate connection removal from deletion of cached/history data and downloaded files.

## Architecture Direction

Use one **server-scoped shared database**, not synthetic string prefixes as the only identity and not one SQLite database per server.

Add a stable SideShelf-owned `server_id` for every configured Audiobookshelf instance. A URL is a route, never durable server identity. Server-owned records carry explicit ownership, and raw remote IDs remain separately available for API calls.

Model at least:

- configured server identity, display name, optional verified instance identifier, and lifecycle state;
- ordered aliases with normalized URL, priority, trust/verification state, reachability, last success/failure, and failback health state;
- one account/credential reference and auth state per server, with secrets namespaced by `server_id`;
- remote entities keyed so `(server_id, remote_id)` is unique even when two servers emit the same remote ID;
- per-server and per-library synchronization cursors, status, last success, and actionable error state;
- per-library visibility, defaulting visible while every accessible library continues to sync;
- local per-source hiding for unwanted duplicate items.

Do not store a synthetic namespaced ID as the only copy of the remote ID. Network boundaries receive explicit raw Audiobookshelf IDs; database relationships use stable local identities that cannot be confused with API identifiers.

The identity inventory must cover every server-owned table and persisted path, including metadata children and joins, progress, bookmarks and pending operations, listening sessions and outbox rows, downloads, covers/file caches, player restoration, home shelves, authors, series, genres, tags, narrators, secure storage, and AsyncStorage keys that assume one selected source.

## Instance Identity and Alias Trust

Before relying on an Audiobookshelf-provided installation identifier, verify it against the currently supported server source and runtime responses. Historical API examples exposed `serverSettings.id` as the constant `server-settings`; that value is not proof of instance identity. A version, user ID, default library ID, hostname, certificate, or resolved IP address is also insufficient.

If a supported server endpoint exposes a stable installation UUID, persist it as verification evidence and require matching UUIDs when grouping aliases. Otherwise allow the user to explicitly trust that a new address reaches the same server. This fallback is necessary for split-horizon DNS, where local and public aliases may resolve differently.

Never silently merge two configured servers because their URLs or content appear similar. Credentials may be sent to an alias only after UUID verification or explicit trust, and alias management must expose trust state and the most recent connection result.

## Existing-Install Migration

Migrate a single-server installation in place:

1. Create one local server record from the retained base URL and account.
2. Move the URL into that server's preferred alias.
3. Namespace credential keys and associate the retained local user with the new server.
4. Backfill `server_id` and raw remote IDs through every server-owned row and persisted setting.
5. Preserve downloads, paths, playback restoration, progress, bookmarks, listening sessions, outbox state, visibility/sort preferences, and cached metadata without requiring a new download.
6. Rebuild tables where primary-key or foreign-key changes require it, with deterministic retry and rollback behavior.

New non-null columns require safe defaults or table rebuilds appropriate for existing rows. Coordinate with the [foreign-key audit backlog](../BACKLOG.md#audit-sqlite-foreign-key-enablement): declared cascades are not currently enforced, so migration and cleanup remain explicit and child first.

Migration fixtures must include colliding user, library, item, media, bookmark, and progress IDs across two imported servers. A collision must never overwrite, merge, or route data to the other source.

## Server-Scoped Clients and Routing

Replace the single mutable API configuration with server-scoped client contexts. Each context owns aliases, credentials, auth generation, refresh single-flight state, reachability, and request generation. A request captures one immutable server/account/route context; route-health or auth changes must not mutate an in-flight request into another identity.

Use the same ordered alias resolver for authentication, REST requests, cover retrieval, downloads, and streaming URLs. Services must not cache or concatenate an unrelated global base URL.

Fail over for route-specific transport failures such as DNS failure, connection refusal, timeout, or classified gateway unavailability. Do not fail over for ordinary 4xx responses, token rejection, permission errors, validation errors, or missing resources. Diagnostics identify the stable server and a redacted alias, never credentials.

Automatically replay a mutation on another alias only when the endpoint is idempotent, carries a stable idempotency key, or the client proves the first attempt was not accepted. Reconcile ambiguous outcomes with the owning server instead of duplicating bookmark, progress, session, or other writes.

Probe the preferred route through the least expensive safe endpoint. Require a success threshold and cooldown before failback, with hysteresis/backoff after repeated failures. Failback affects new requests only; it must not interrupt active streams or downloads. Do not hammer a failed preferred route while backgrounded or offline.

## Independent Synchronization

Create a scheduler that enqueues every configured server on initialization, foreground, restored connectivity, periodic refresh, and manual refresh. Enforce both a small global server-concurrency cap and per-server serialization/single-flight where ordering or local writes require it.

Each server has independent auth, reachability, retry, cancellation, and diagnostics. A terminal auth failure pauses only that server. Late results validate server/account generation before writing.

Within each server, discover every accessible library and retain independent cursors/status. Hidden and visible libraries synchronize alike. Unified shelves, search, series, authors, downloads, and progress aggregate visible sources while preserving deterministic source identity and sorting.

Outbound data always returns to the entity's recorded source:

- progress and listening sessions use the owning server/account;
- bookmarks and pending operations are partitioned by server/account;
- downloads, covers, and streams resolve through the owning server context;
- reconciliation cannot overwrite a colliding entity from another source.

If one server is unavailable, retain its last synchronized metadata and downloaded playback with a stale/offline status rather than making the entire app signed out or empty.

## Management and Unified-Library UX

Server management in Settings must support:

- independent sync, reachability, and auth status;
- adding, naming, editing, reauthenticating, manually syncing, and removing a server;
- adding, normalizing, reordering, testing, trusting, and removing aliases;
- identifying preferred and currently active routes without exposing secrets;
- showing discovered libraries and controlling unified-view visibility only;
- filtering by server and library;
- hiding and restoring a particular duplicate source item;
- inspecting and retrying source-specific errors without disrupting other servers.

Server removal presents independent choices for connection/credentials, cached metadata/history, and downloaded media. Destructive choices identify the server and estimated local impact. Retained offline data continues to show its source and disconnected status.

## Delivery Phases

Each phase requires its own reviewed specification and implementation plan:

1. **Identity inventory and migration foundation:** canonical server/account/entity identity, collision audit, migration/rollback fixtures, and existing-install backfill.
2. **Server-scoped auth and request routing:** credential namespacing, client registry, alias verification/trust, failover/failback, and generation safety.
3. **Independent sync orchestration:** per-server/library workers, global concurrency, retries, progress/bookmark partitioning, and diagnostics.
4. **Unified queries and playback/download routing:** aggregate visible libraries while preserving provenance and offline behavior.
5. **Management and filtering UX:** servers, aliases, visibility, duplicate hiding, status, reauth, and safe removal.
6. **Migration rollout and live acceptance:** upgrade rehearsal, performance/resource validation, physical-device testing, and rollback gates.

Do not begin with an array of URLs or UI-only server switching. Identity and migration foundations must land before multiple servers can safely share one database.

## Non-Goals

- Do not merge progress, bookmarks, downloads, or playback state between duplicate titles.
- Do not perform metadata-based duplicate collapsing in this scope.
- Do not support several simultaneously configured accounts on one server yet.
- Do not use hostname, IP, certificate, version, or library fingerprint as silent identity proof.
- Do not make library visibility disable synchronization.
- Do not let one server's logout, expiry, removal, retry, or wipe affect another server.
- Do not allow unbounded parallel synchronization on mobile.

## Verification and Acceptance

Automated coverage must prove isolation and routing at database-helper, migration, secure-storage, API-client, scheduler, store, player, download, and UI-filter boundaries. Include:

- migration of a production-shaped single-server database with downloads and pending outbound work;
- two servers returning identical remote IDs at every major entity level;
- several libraries on one server, including a hidden library that continues to sync;
- duplicate titles that remain distinct and can be hidden/restored locally;
- credentials, refresh, logout, wipe, and reauthentication isolated per server;
- one offline source while another completes inbound and outbound synchronization;
- enforcement of the global synchronization cap;
- failover only for transport failures and stable-threshold/cooldown failback;
- no blind replay after an ambiguous mutation;
- rejection of late responses from obsolete route/auth generations;
- source-correct progress, bookmarks, streams, covers, and downloads;
- every retain/delete combination during one-server removal without affecting others;
- relaunch, offline launch, background/foreground, and restored-network behavior with several sources.

Live acceptance requires two real Audiobookshelf servers, at least two libraries on one server, and local/public trusted aliases for one server. On a physical device verify unified browsing/search, independent refresh and reauth, alias failover and healthy failback, streaming, downloads, offline playback, progress/bookmarks, contextual provenance, visibility filters, duplicate hiding, and safe removal. Capture synchronization timing and concurrency, database size, memory, battery/background impact, and rollback evidence before declaring the program complete.
